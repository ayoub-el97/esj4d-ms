-- =============================================================================
-- 038 — Contrats de la société : création, clôture, archives, export, suppression définitive
--
--  * company_contracts : contrats successifs de la société (un seul profil de société).
--    Statuts : brouillon, actif, termine, archive. Période d'un contrat = date de début →
--    date de clôture effective (sinon date de fin).
--  * Rattachement aux enregistrements PAR LES DATES : un rapport, un pointage, un achat… appartient
--    au contrat dont la période contient sa date. Aucun enregistrement existant n'est modifié.
--  * Contrat clôturé (terminé / archivé) : les enregistrements datés de sa période (pointage,
--    rapports, photos…) sont protégés comme une journée clôturée, sauf si un contrat actif ou en
--    brouillon couvre aussi la date. Consultation et export restent possibles.
--  * Rappels « Rappels et alertes » par contrat actif : n jours avant la fin (alert_days), le jour
--    de la fin, puis après l'échéance s'il n'est ni clôturé ni renouvelé (sans doublon).
--  * Suppression définitive (administrateur, contrat terminé ou archivé, période ne chevauchant
--    aucun autre contrat, référence retapée) : supprime le contrat et toutes les données
--    d'exploitation datées de sa période (liste exacte : contract_deletion_preview). Les fiches
--    employés et camions, les demandes de congés / récupération, les corrections de solde, les
--    jours fériés et les engagements / décisions d'absence ne sont pas supprimés. Les fichiers
--    du stockage sont retirés par l'application (chemins renvoyés). L'événement est journalisé.
-- =============================================================================

create table if not exists public.company_contracts (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null check (length(trim(reference)) > 0),
  description   text not null default '',
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'actif' check (status in ('brouillon', 'actif', 'termine', 'archive')),
  closed_on     date,
  closure_note  text not null default '',
  alert_days    text not null default '90,60,30',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  constraint company_contracts_dates_chk check (end_date >= start_date),
  constraint company_contracts_closed_chk check (closed_on is null or closed_on >= start_date)
);
create index if not exists company_contracts_dates_idx on public.company_contracts (start_date, end_date);

drop trigger if exists company_contracts_set_audit on public.company_contracts;
create trigger company_contracts_set_audit before insert or update on public.company_contracts
  for each row execute function public.set_audit_columns();
drop trigger if exists company_contracts_audit on public.company_contracts;
create trigger company_contracts_audit after insert or update or delete on public.company_contracts
  for each row execute function public.audit_trigger();

alter table public.company_contracts enable row level security;
drop policy if exists "company_contracts_select" on public.company_contracts;
create policy "company_contracts_select" on public.company_contracts for select to authenticated using (public.can_view('parametres'));
drop policy if exists "company_contracts_write" on public.company_contracts;
create policy "company_contracts_insert" on public.company_contracts for insert to authenticated with check (public.can_edit('parametres'));
drop policy if exists "company_contracts_update" on public.company_contracts;
create policy "company_contracts_update" on public.company_contracts for update to authenticated using (public.can_edit('parametres')) with check (public.can_edit('parametres'));
-- Pas de suppression directe : uniquement par delete_contract_permanently (administrateur)
grant select, insert, update on public.company_contracts to authenticated;

-- Reprise du contrat saisi dans le profil de l'entreprise (migration 033)
insert into public.company_contracts (reference, start_date, end_date, status, alert_days)
select coalesce(nullif(trim(r.value #>> '{}'), ''), 'Contrat ' || to_char((e.value #>> '{}')::date, 'YYYY')),
       coalesce(nullif(trim(s.value #>> '{}'), '')::date, least((e.value #>> '{}')::date, current_date)),
       (e.value #>> '{}')::date,
       'actif',
       coalesce(nullif(trim(a.value #>> '{}'), ''), '90,60,30')
  from public.settings e
  left join public.settings s on s.key = 'company_contract_start'
  left join public.settings r on r.key = 'company_contract_ref'
  left join public.settings a on a.key = 'contract_alert_days'
 where e.key = 'company_contract_end' and coalesce(e.value #>> '{}', '') ~ '^\d{4}-\d{2}-\d{2}$'
   and not exists (select 1 from public.company_contracts);

-- ---------- Pièces jointes du contrat (contrat signé…) ------------------------------------
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
    when p_entity = 'company_contract' then public.can_view('parametres')
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
    when p_entity = 'company_contract' then public.can_edit('parametres')
    else public.can_edit(public.photo_module(p_entity))
  end;
$$;

-- ---------- Période et protection des contrats clôturés -------------------------------------
create or replace function public.contract_period_end(c public.company_contracts)
returns date
language sql
immutable
as $$
  select coalesce(c.closed_on, c.end_date);
$$;

-- Contrat clôturé couvrant la date (et aucun contrat actif / en brouillon ne la couvre)
create or replace function public.locked_contract_for(p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.reference from public.company_contracts c
   where c.status in ('termine', 'archive') and p_date between c.start_date and coalesce(c.closed_on, c.end_date)
     and not exists (select 1 from public.company_contracts o
                      where o.status in ('brouillon', 'actif') and p_date between o.start_date and coalesce(o.closed_on, o.end_date))
   limit 1;
$$;

create or replace function public.assert_day_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old date;
  v_new date;
  v_ref text;
begin
  -- Suppression définitive d'un contrat (delete_contract_permanently) : contrôles levés
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := (to_jsonb(old) ->> 'activity_date')::date;
    if v_old is not null and public.is_day_closed(v_old) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_old, 'DD/MM/YYYY');
    end if;
    v_ref := case when v_old is not null then public.locked_contract_for(v_old) end;
    if v_ref is not null then
      raise exception 'CONTRAT_CLOTURE|%|%', v_ref, to_char(v_old, 'DD/MM/YYYY');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(new) ->> 'activity_date')::date;
    if v_new is not null and public.is_day_closed(v_new) then
      raise exception 'JOURNEE_CLOTUREE: la journée du % est clôturée, modification impossible.', to_char(v_new, 'DD/MM/YYYY');
    end if;
    v_ref := case when v_new is not null then public.locked_contract_for(v_new) end;
    if v_ref is not null then
      raise exception 'CONTRAT_CLOTURE|%|%', v_ref, to_char(v_new, 'DD/MM/YYYY');
    end if;
    return new;
  end if;
  return old;
end;
$$;

-- Congé approuvé : protection levée uniquement pendant la suppression définitive d'un contrat
create or replace function public.enforce_leave_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
  v_name text;
begin
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  if tg_op <> 'DELETE' and new.status::text = 'conge' then
    if new.leave_request_id is null then
      new.leave_request_id := public.approved_leave_for(new.employee_id, new.activity_date);
    end if;
    return new;
  end if;
  if public.approved_leave_for(v_row.employee_id, v_row.activity_date) is not null
     and not public.has_leave_override(v_row.employee_id, v_row.activity_date) then
    select last_name || ' ' || first_name into v_name from public.employees where id = v_row.employee_id;
    raise exception 'CONGE_APPROUVE|%|%', coalesce(v_name, '?'), to_char(v_row.activity_date, 'DD/MM/YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------- Rappels par contrat ---------------------------------------------------------
--  contrat:<id>:<n>       n jours avant la fin (seuil dépassé : le plus proche, daté d'aujourd'hui)
--  contrat:<id>:fin       le jour de la fin
--  contrat:<id>:expire    le lendemain de la fin (contrat ni clôturé ni renouvelé)
-- Les rappels non terminés des contrats clôturés, archivés ou modifiés (et ceux de l'ancien
-- format « contrat:<date>:… ») sont retirés.
create or replace function public.sync_contract_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_keys text[] := '{}';
  c record;
  v_days int[];
  v_passed int;
  v_fin text;
  v_lbl text;
  n int;
begin
  if auth.uid() is not null and not public.can_view('parametres') then
    raise exception 'ACCES_REFUSE: consultation des paramètres non autorisée.';
  end if;
  if v_uid is not null then
    for c in select * from public.company_contracts where status = 'actif' loop
      v_fin := to_char(c.end_date, 'DD/MM/YYYY');
      v_lbl := 'Contrat ' || c.reference;
      select coalesce(array_agg(distinct trim(x)::int order by trim(x)::int desc), '{}') into v_days
        from unnest(string_to_array(coalesce(c.alert_days, ''), ',')) x
       where trim(x) ~ '^[0-9]{1,3}$' and trim(x)::int between 1 and 730;
      v_passed := null;
      foreach n in array v_days loop
        if c.end_date - n >= v_today then
          v_keys := v_keys || ('contrat:' || c.id || ':' || n);
          insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
          values (v_lbl || ' : fin le ' || v_fin || ' (dans ' || n || ' jours)',
                  'Le contrat ' || c.reference || ' se termine le ' || v_fin || '. Préparez le renouvellement ou la clôture (Profil › Contrats).',
                  c.end_date - n, 0, true, 'once', case when n <= 30 then 'urgent' else 'important' end, v_uid, 'contrat:' || c.id || ':' || n)
          on conflict (system_key) where system_key is not null do nothing;
        elsif c.end_date >= v_today then
          v_passed := n;
        end if;
      end loop;
      if v_passed is not null then
        v_keys := v_keys || ('contrat:' || c.id || ':' || v_passed);
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values (v_lbl || ' : fin le ' || v_fin || ' (moins de ' || v_passed || ' jours)',
                'Le contrat ' || c.reference || ' se termine le ' || v_fin || '. Préparez le renouvellement ou la clôture (Profil › Contrats).',
                v_today, 0, true, 'once', case when v_passed <= 30 then 'urgent' else 'important' end, v_uid, 'contrat:' || c.id || ':' || v_passed)
        on conflict (system_key) where system_key is not null do nothing;
      end if;
      if c.end_date >= v_today then
        v_keys := v_keys || ('contrat:' || c.id || ':fin');
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values (v_lbl || ' : dernier jour du contrat (' || v_fin || ')',
                'Le contrat ' || c.reference || ' prend fin aujourd''hui. Clôturez-le ou ouvrez le nouveau contrat (Profil › Contrats).',
                c.end_date, 0, true, 'once', 'urgent', v_uid, 'contrat:' || c.id || ':fin')
        on conflict (system_key) where system_key is not null do nothing;
      end if;
      v_keys := v_keys || ('contrat:' || c.id || ':expire');
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values (v_lbl || ' expiré (fin le ' || v_fin || ')',
              'Le contrat ' || c.reference || ' est arrivé à échéance le ' || v_fin || ' sans être clôturé ni renouvelé. Clôturez-le ou ouvrez le nouveau contrat (Profil › Contrats).',
              c.end_date + 1, 0, true, 'once', 'urgent', v_uid, 'contrat:' || c.id || ':expire')
      on conflict (system_key) where system_key is not null do nothing;
    end loop;
  end if;
  delete from public.reminders r
   where r.system_key like 'contrat:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions rc where rc.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_contract_reminders() from public;
grant execute on function public.sync_contract_reminders() to authenticated;

-- ---------- Synthèse du contrat (PDF « rapport du contrat », archives) ----------------------
create or replace function public.contract_report_summary(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
  r jsonb;
begin
  if not public.can_view('parametres') then
    raise exception 'ACCES_REFUSE: consultation des paramètres non autorisée.';
  end if;
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return null;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  select jsonb_build_object(
    'from', f, 'to', t,
    'pointage_jours', (select count(distinct activity_date) from public.attendance where activity_date between f and t),
    'pointage_lignes', (select count(*) from public.attendance where activity_date between f and t),
    'pointage_premier', (select min(activity_date) from public.attendance where activity_date between f and t),
    'pointage_dernier', (select max(activity_date) from public.attendance where activity_date between f and t),
    'heures_sup', (select coalesce(sum(overtime_hours), 0) from public.attendance where activity_date between f and t),
    'absences', (select count(*) from (select distinct employee_id, activity_date from public.attendance where activity_date between f and t and status::text in ('absent', 'absent_maladie')) x),
    'journees_cloturees', (select count(*) from public.work_days where activity_date between f and t and status = 'closed'),
    'rapports_nettoiement', (select count(*) from public.cleaning_reports where activity_date between f and t),
    'rapports_collecte', (select count(*) from public.collection_reports where activity_date between f and t),
    'rapports_camions', (select count(*) from public.truck_daily_reports where activity_date between f and t),
    'tonnage', (select coalesce(sum(coalesce(tonnage_total, coalesce(tonnage1, 0) + coalesce(tonnage2, 0))), 0) from public.truck_daily_reports where activity_date between f and t),
    'vidages', (select coalesce(sum(dumps_count), 0) from public.truck_daily_reports where activity_date between f and t),
    'pleins', (select count(*) from public.fuel_entries where activity_date between f and t),
    'carburant_litres', (select coalesce(sum(liters), 0) from public.fuel_entries where activity_date between f and t),
    'carburant_cout', (select coalesce(sum(cost), 0) from public.fuel_entries where activity_date between f and t),
    'reparations', (select count(*) from public.truck_repairs where reported_date between f and t),
    'reparations_cout', (select coalesce(sum(cost), 0) from public.truck_repairs where reported_date between f and t),
    'achats', (select count(*) from public.material_purchases where purchase_date between f and t and not cancelled),
    'achats_total', (select coalesce(sum(total_amount), 0) from public.material_purchases where purchase_date between f and t and not cancelled),
    'dechet_vert', (select count(*) from public.green_waste_entries where activity_date between f and t),
    'taches', (select count(*) from public.work_tasks where planned_date between f and t),
    'avertissements', (select count(*) from public.warnings where incident_date between f and t),
    'conges_acceptes', (select count(*) from public.leave_requests where status::text = 'acceptee' and start_date <= t and end_date >= f),
    'certificats', (select count(*) from public.medical_certificates where start_date between f and t),
    'photos', (select count(*) from public.photos where activity_date between f and t)
  ) into r;
  return r;
end;
$$;
grant execute on function public.contract_report_summary(uuid) to authenticated;

-- ---------- Suppression définitive -----------------------------------------------------------
-- Enregistrements supprimés (catégorie, table, nombre) — lecture seule, avant confirmation
create or replace function public.contract_deletion_preview(p_id uuid)
returns table (category text, items bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE: suppression définitive réservée à l''administrateur.';
  end if;
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  return query
  select x.cat, x.n from (values
    ('Pointage (lignes)', (select count(*) from public.attendance where activity_date between f and t)),
    ('Journées (ouverture / clôture)', (select count(*) from public.work_days where activity_date between f and t)),
    ('Chefs d''équipe des feuilles', (select count(*) from public.attendance_sheet_meta where activity_date between f and t)),
    ('Affectations du jour', (select count(*) from public.daily_team_assignments where activity_date between f and t)),
    ('Autorisations sur congé approuvé', (select count(*) from public.attendance_leave_overrides where activity_date between f and t)),
    ('Rapports mensuels finalisés', (select count(*) from public.attendance_period_snapshots where period_start >= f and period_end <= t)),
    ('Classements d''absence corrigés', (select count(*) from public.absence_reviews where activity_date between f and t)),
    ('Certificats médicaux', (select count(*) from public.medical_certificates where start_date between f and t)),
    ('Rapports de nettoiement', (select count(*) from public.cleaning_reports where activity_date between f and t)),
    ('Récapitulatif nettoiement', (select count(*) from public.cleaning_daily_summary where activity_date between f and t)),
    ('Rapports de collecte', (select count(*) from public.collection_reports where activity_date between f and t)),
    ('Rapport camions (lignes)', (select count(*) from public.truck_daily_reports where activity_date between f and t)),
    ('Pleins de carburant', (select count(*) from public.fuel_entries where activity_date between f and t)),
    ('Réparations de camions', (select count(*) from public.truck_repairs where reported_date between f and t)),
    ('Achats', (select count(*) from public.material_purchases where purchase_date between f and t)),
    ('Déchet vert', (select count(*) from public.green_waste_entries where activity_date between f and t)),
    ('Programme de travail', (select count(*) from public.work_tasks where planned_date between f and t)),
    ('Avertissements', (select count(*) from public.warnings where incident_date between f and t)),
    ('Photos et pièces jointes', (select count(*) from public.photos p where p.activity_date between f and t
        or (p.entity_type = 'company_contract' and p.entity_id = p_id)
        or (p.entity_type = 'material_purchase' and p.entity_id in (select id from public.material_purchases where purchase_date between f and t))
        or (p.entity_type = 'truck_repair' and p.entity_id in (select id from public.truck_repairs where reported_date between f and t))
        or (p.entity_type = 'warning' and p.entity_id in (select id from public.warnings where incident_date between f and t))
        or (p.entity_type = 'work_task' and p.entity_id in (select id from public.work_tasks where planned_date between f and t))
        or (p.entity_type = 'medical_certificate' and p.entity_id in (select id from public.medical_certificates where start_date between f and t))))
  ) x(cat, n)
  where x.n > 0;
end;
$$;
grant execute on function public.contract_deletion_preview(uuid) to authenticated;

-- Raison du blocage de la suppression définitive (null = possible)
create or replace function public.contract_deletion_blocker(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  o text;
begin
  select * into c from public.company_contracts where id = p_id;
  if not found then
    return 'Contrat introuvable.';
  end if;
  if c.status not in ('termine', 'archive') then
    return 'Clôturez ou archivez d''abord le contrat.';
  end if;
  select string_agg(x.reference, ', ') into o from public.company_contracts x
   where x.id <> p_id and x.start_date <= coalesce(c.closed_on, c.end_date) and coalesce(x.closed_on, x.end_date) >= c.start_date;
  if o is not null then
    return 'La période chevauche un autre contrat (' || o || ') : les enregistrements ne sont pas séparables.';
  end if;
  return null;
end;
$$;
grant execute on function public.contract_deletion_blocker(uuid) to authenticated;

create or replace function public.delete_contract_permanently(p_id uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.company_contracts;
  f date;
  t date;
  v_block text;
  v_paths text[];
  v_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'ACCES_REFUSE: suppression définitive réservée à l''administrateur.';
  end if;
  select * into c from public.company_contracts where id = p_id for update;
  if not found then
    raise exception 'CONTRAT_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm), '') <> c.reference then
    raise exception 'CONFIRMATION_INVALIDE: retapez exactement la référence du contrat.';
  end if;
  v_block := public.contract_deletion_blocker(p_id);
  if v_block is not null then
    raise exception 'SUPPRESSION_BLOQUEE: %', v_block;
  end if;
  f := c.start_date;
  t := coalesce(c.closed_on, c.end_date);
  select coalesce(jsonb_object_agg(category, items), '{}'::jsonb) into v_counts from public.contract_deletion_preview(p_id);

  perform set_config('esj.suppression_contrat', 'on', true);
  perform set_config('esj.affectation_en_cours', 'on', true);

  -- Photos et pièces jointes (chemins renvoyés pour suppression des fichiers du stockage)
  with gone as (
    delete from public.photos p
     where p.activity_date between f and t
        or (p.entity_type = 'company_contract' and p.entity_id = p_id)
        or (p.entity_type = 'material_purchase' and p.entity_id in (select id from public.material_purchases where purchase_date between f and t))
        or (p.entity_type = 'truck_repair' and p.entity_id in (select id from public.truck_repairs where reported_date between f and t))
        or (p.entity_type = 'warning' and p.entity_id in (select id from public.warnings where incident_date between f and t))
        or (p.entity_type = 'work_task' and p.entity_id in (select id from public.work_tasks where planned_date between f and t))
        or (p.entity_type = 'medical_certificate' and p.entity_id in (select id from public.medical_certificates where start_date between f and t))
        or (p.entity_type in ('cleaning_report_agent') and p.entity_id in (select id from public.cleaning_report_agents where activity_date between f and t))
        or (p.entity_type in ('collection_report') and p.entity_id in (select id from public.collection_reports where activity_date between f and t))
        or (p.entity_type in ('green_waste') and p.entity_id in (select id from public.green_waste_entries where activity_date between f and t))
        or (p.entity_type in ('fuel_entry') and p.entity_id in (select id from public.fuel_entries where activity_date between f and t))
        or (p.entity_type in ('truck_report') and p.entity_id in (select id from public.truck_daily_reports where activity_date between f and t))
    returning p.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;

  delete from public.attendance_leave_overrides where activity_date between f and t;
  delete from public.attendance where activity_date between f and t;
  delete from public.attendance_sheet_meta where activity_date between f and t;
  delete from public.daily_team_assignments where activity_date between f and t;
  delete from public.attendance_period_snapshots where period_start >= f and period_end <= t;
  delete from public.absence_reviews where activity_date between f and t;
  delete from public.medical_certificates where start_date between f and t;
  delete from public.cleaning_reports where activity_date between f and t;          -- agents en cascade
  delete from public.cleaning_report_agents where activity_date between f and t;
  delete from public.cleaning_daily_summary where activity_date between f and t;
  delete from public.collection_reports where activity_date between f and t;        -- équipiers en cascade
  delete from public.truck_daily_reports where activity_date between f and t;
  delete from public.fuel_entries where activity_date between f and t;
  delete from public.truck_repairs where reported_date between f and t;
  delete from public.material_purchase_payments where purchase_id in (select id from public.material_purchases where purchase_date between f and t);
  delete from public.material_purchases where purchase_date between f and t;
  delete from public.green_waste_entries where activity_date between f and t;
  delete from public.work_tasks where planned_date between f and t;                 -- agents en cascade
  delete from public.warnings where incident_date between f and t;
  delete from public.work_days where activity_date between f and t;
  delete from public.reminders r where r.system_key like 'contrat:' || p_id || ':%'
     and not exists (select 1 from public.reminder_completions rc where rc.reminder_id = r.id);
  delete from public.company_contracts where id = p_id;

  insert into public.audit_log (table_name, record_id, action, new_data, user_id, user_email)
  values ('company_contracts', p_id::text, 'DELETE',
          jsonb_build_object('suppression_definitive', true, 'reference', c.reference, 'du', f, 'au', t, 'supprime', v_counts, 'fichiers', cardinality(v_paths)),
          auth.uid(), (select email from public.profiles where id = auth.uid()));

  perform set_config('esj.suppression_contrat', 'off', true);
  perform set_config('esj.affectation_en_cours', 'off', true);
  return jsonb_build_object('counts', v_counts, 'paths', to_jsonb(v_paths));
end;
$$;
revoke all on function public.delete_contract_permanently(uuid, text) from public;
grant execute on function public.delete_contract_permanently(uuid, text) to authenticated;
