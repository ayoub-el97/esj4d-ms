-- =============================================================================
-- 036 — Rapport des absents : absences par employé, certificats médicaux, politique d'absences
--
--  Source : le pointage. Un jour d'absence = un employé et une date où au moins une ligne est
--  « Absent » ou « Absent maladie » et aucune ligne n'est travaillée (Présent, Jour de repos
--  travaillé). Compté une seule fois par jour, quelle que soit l'équipe (Nettoiement / Collecte)
--  ou le service. Repos, Congé payé, Récupération, Jour férié ne sont jamais des absences.
--  Classement d'un jour :
--   * par défaut : « Absent » → non justifiée ; « Absent maladie » → maladie ;
--   * certificat médical refusé (vérification par un utilisateur autorisé) → non justifiée ;
--   * révision explicite (absence_reviews) : non justifiée / maladie / justifiée (autre motif).
--  Un certificat téléversé ne justifie rien automatiquement : il passe « Reçu », la vérification
--  reste à faire. Les dates d'absence et le pointage ne sont jamais modifiés.
--  Politique (absences non justifiées, cumul) :
--   * 2e : engagement écrit relatif aux absences requis (À préparer → En attente de signature → Signé) ;
--   * plus de 4 (5e et suivantes) : décision du responsable requise (jamais de désactivation automatique).
--  Rappels partagés dans « Rappels et alertes » (reminders.system_key, sans doublon).
--  Droits : consultation = module Pointage ; saisies, certificats et documents = Pointage en
--  modification (documents médicaux privés : non visibles en simple consultation).
-- =============================================================================

-- ---------- Révision du classement d'un jour d'absence ----------------------------------
create table if not exists public.absence_reviews (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete restrict,
  activity_date   date not null,
  classification  text not null check (classification in ('non_justifiee', 'maladie', 'justifiee')),
  comment         text not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  unique (employee_id, activity_date)
);

-- ---------- Certificats médicaux (un épisode de maladie, un ou plusieurs jours) -----------
create table if not exists public.medical_certificates (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees (id) on delete restrict,
  start_date    date not null,
  end_date      date not null,
  submitted_on  date,                                   -- date de remise (distincte des dates d'absence)
  status        text not null default 'en_attente' check (status in ('en_attente', 'recu', 'a_verifier')),
  verification  text not null default 'non_verifiee' check (verification in ('non_verifiee', 'acceptee', 'refusee')),
  comment       text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint medical_certificates_dates_chk check (end_date >= start_date)
);
create index if not exists medical_certificates_employee_idx on public.medical_certificates (employee_id, start_date);

-- ---------- Engagement écrit et décisions du responsable --------------------------------
create table if not exists public.absence_actions (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees (id) on delete restrict,
  kind              text not null check (kind in ('engagement', 'decision')),
  unjustified_count integer not null default 0,         -- absences non justifiées au moment de l'action
  status            text check (status in ('a_preparer', 'en_attente_signature', 'signe')),
  signed_on         date,
  decision          text not null default '',
  decision_date     date,
  comment           text not null default '',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  constraint absence_actions_kind_chk check (
    (kind = 'engagement' and status is not null) or
    (kind = 'decision' and length(trim(decision)) > 0 and decision_date is not null))
);
create index if not exists absence_actions_employee_idx on public.absence_actions (employee_id, kind, created_at);

do $$
declare t text;
begin
  foreach t in array array['absence_reviews', 'medical_certificates', 'absence_actions'] loop
    execute format('drop trigger if exists %I_set_audit on public.%I', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view(''pointage''))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_edit(''pointage'')) with check (public.can_edit(''pointage''))', t || '_write', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Pièces jointes : certificats médicaux et engagements signés (privés) ----------
create or replace function public.photo_can_view(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_view_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    else public.can_view(public.photo_module(p_entity))
  end;
$$;
create or replace function public.photo_can_edit(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entity = 'material_purchase' then public.can_edit_module('achats')
    when p_entity in ('medical_certificate', 'absence_action') then public.can_edit('pointage')
    else public.can_edit(public.photo_module(p_entity))
  end;
$$;

-- Document ajouté à un certificat « En attente » : « Reçu » (date de remise = aujourd'hui si vide).
-- Jamais justifié automatiquement : la vérification reste à faire.
create or replace function public.medical_certificate_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'medical_certificate' then
    update public.medical_certificates
       set status = case when status = 'en_attente' then 'recu' else status end,
           submitted_on = coalesce(submitted_on, (now() at time zone 'Africa/Casablanca')::date)
     where id = new.entity_id;
  end if;
  return null;
end;
$$;
drop trigger if exists photos_medical_certificate_received on public.photos;
create trigger photos_medical_certificate_received after insert on public.photos
  for each row execute function public.medical_certificate_received();

-- ---------- Jours d'absence (dérivés du pointage) ---------------------------------------
create or replace function public.absence_days(p_from date default null, p_to date default null, p_employee uuid default null)
returns table (
  employee_id      uuid,
  activity_date    date,
  attendance_status text,
  classification   text,
  observation      text,
  review_comment   text,
  reviewed         boolean,
  certificate_id   uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with att as (
    select a.employee_id, a.activity_date,
           bool_or(a.status::text in ('present', 'repos_travaille')) as worked,
           bool_or(a.status::text = 'absent_maladie') as sick,
           bool_or(a.status::text = 'absent') as unjust,
           string_agg(nullif(trim(a.observation), ''), ' ; ' order by a.shift) as obs
      from public.attendance a
     where (p_from is null or a.activity_date >= p_from)
       and (p_to is null or a.activity_date <= p_to)
       and (p_employee is null or a.employee_id = p_employee)
     group by a.employee_id, a.activity_date
  )
  select att.employee_id, att.activity_date,
         case when att.sick then 'absent_maladie' else 'absent' end,
         coalesce(r.classification,
                  case when att.sick and c.verification = 'refusee' then 'non_justifiee'
                       when att.sick then 'maladie'
                       else 'non_justifiee' end),
         coalesce(att.obs, ''), coalesce(r.comment, ''), r.id is not null, c.id
    from att
    left join public.absence_reviews r on r.employee_id = att.employee_id and r.activity_date = att.activity_date
    left join lateral (
      select mc.id, mc.verification from public.medical_certificates mc
       where mc.employee_id = att.employee_id and att.activity_date between mc.start_date and mc.end_date
       order by mc.created_at desc limit 1
    ) c on true
   where not att.worked and (att.sick or att.unjust);
end;
$$;
grant execute on function public.absence_days(date, date, uuid) to authenticated;

-- ---------- Synthèse par employé et statut d'alerte ---------------------------------------
create or replace function public.absence_summary(p_from date default null, p_to date default null)
returns table (
  employee_id          uuid,
  total                integer,
  non_justifiee        integer,
  maladie              integer,
  justifiee            integer,
  unjustified_all      integer,
  certificates         integer,
  certificates_pending integer,
  engagement_status    text,
  engagement_id        uuid,
  decision_count       integer,
  alert                text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  with per as (
    select d.employee_id,
           count(*)::int as total,
           count(*) filter (where d.classification = 'non_justifiee')::int as nj,
           count(*) filter (where d.classification = 'maladie')::int as ml,
           count(*) filter (where d.classification = 'justifiee')::int as js
      from public.absence_days(p_from, p_to) d group by d.employee_id
  ),
  alltime as (
    select d.employee_id, count(*) filter (where d.classification = 'non_justifiee')::int as nj
      from public.absence_days(null, null) d group by d.employee_id
  ),
  certs as (
    select mc.employee_id,
           count(*) filter (where mc.status in ('recu', 'a_verifier'))::int as submitted,
           count(*) filter (where mc.status in ('en_attente', 'a_verifier') or (mc.status = 'recu' and mc.verification = 'non_verifiee'))::int as pending
      from public.medical_certificates mc
     where (p_to is null or mc.start_date <= p_to) and (p_from is null or mc.end_date >= p_from)
     group by mc.employee_id
  ),
  eng as (
    select distinct on (x.employee_id) x.employee_id, x.status, x.id
      from public.absence_actions x where x.kind = 'engagement'
     order by x.employee_id, x.created_at desc
  ),
  dec as (
    select x.employee_id, max(x.unjustified_count)::int as cnt
      from public.absence_actions x where x.kind = 'decision' group by x.employee_id
  )
  select e.id,
         coalesce(per.total, 0), coalesce(per.nj, 0), coalesce(per.ml, 0), coalesce(per.js, 0),
         coalesce(alltime.nj, 0),
         coalesce(certs.submitted, 0), coalesce(certs.pending, 0),
         eng.status, eng.id, dec.cnt,
         case
           when coalesce(alltime.nj, 0) > 4 and coalesce(dec.cnt, 0) < coalesce(alltime.nj, 0) then 'decision_requise'
           when coalesce(alltime.nj, 0) >= 2 and coalesce(eng.status, '') <> 'signe' then 'engagement_requis'
           when coalesce(alltime.nj, 0) > 4 then 'decision_enregistree'
           when coalesce(alltime.nj, 0) >= 2 then 'engagement_signe'
           else 'aucune'
         end
    from public.employees e
    left join per on per.employee_id = e.id
    left join alltime on alltime.employee_id = e.id
    left join certs on certs.employee_id = e.id
    left join eng on eng.employee_id = e.id
    left join dec on dec.employee_id = e.id;
end;
$$;
grant execute on function public.absence_summary(date, date) to authenticated;

-- ---------- Rappels partagés (sans doublon) ------------------------------------------------
--  absence:engagement:<employé>            engagement écrit requis (2e absence non justifiée)
--  absence:decision:<employé>:<nombre>     décision requise (5e absence non justifiée ou plus)
--  Un rappel dont la situation est réglée (engagement signé, décision enregistrée, pointage
--  corrigé) est retiré s'il n'a pas été marqué terminé.
create or replace function public.sync_absence_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_keys text[] := '{}';
  s record;
  v_key text;
  v_name text;
begin
  if auth.uid() is not null and not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  if v_uid is null then
    return 0;
  end if;
  for s in select * from public.absence_summary(null, null) x where x.alert in ('engagement_requis', 'decision_requise') loop
    select last_name || ' ' || first_name into v_name from public.employees where id = s.employee_id;
    if s.alert = 'decision_requise' then
      v_key := 'absence:decision:' || s.employee_id || ':' || s.unjustified_all;
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Absences — ' || v_name || ' : plus de quatre absences non justifiées : décision du responsable requise',
              s.unjustified_all || ' absences non justifiées enregistrées. Consultez l''historique dans Pointage › Rapport des absents et enregistrez la décision.',
              v_today, 0, true, 'once', 'urgent', v_uid, v_key)
      on conflict (system_key) where system_key is not null do nothing;
    else
      v_key := 'absence:engagement:' || s.employee_id;
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Absences — ' || v_name || ' : deuxième absence non justifiée : engagement écrit requis',
              'Préparez l''engagement écrit relatif aux absences (Pointage › Rapport des absents), faites-le signer et enregistrez le document signé.',
              v_today, 0, true, 'once', 'important', v_uid, v_key)
      on conflict (system_key) where system_key is not null do nothing;
    end if;
    v_keys := v_keys || v_key;
  end loop;
  delete from public.reminders r
   where r.system_key like 'absence:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_absence_alerts() from public;
grant execute on function public.sync_absence_alerts() to authenticated;

-- ---------- Historique des modifications (journal d'audit) d'un employé ----------------------
create or replace function public.absence_audit(p_employee uuid)
returns table (at timestamptz, tbl text, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  select l.created_at, l.table_name, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name in ('absence_reviews', 'medical_certificates', 'absence_actions')
     and coalesce(l.new_data, l.old_data) ->> 'employee_id' = p_employee::text
   order by l.created_at desc
   limit 200;
end;
$$;
grant execute on function public.absence_audit(uuid) to authenticated;
