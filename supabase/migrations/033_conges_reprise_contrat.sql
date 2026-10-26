-- =============================================================================
-- 033 — Reprise des congés depuis les registres papier, contrat de la société
--
--  Employés :
--   * leave_tracking_start : « Date de début dans le système » (début du suivi des congés dans
--     l'application). Vide = date de début du projet (réglage project_start_date).
--   * leave_taken_before : « Congés déjà pris avant le système » (information, JAMAIS déduite :
--     ces jours sont déjà reflétés dans le solde initial des registres papier).
--   * Modifiables uniquement par l'administrateur (journalisés comme toute modification de fiche).
--  Solde initial : correction de catégorie « solde_initial » (table leave_adjustments existante :
--   date, utilisateur, motif, nombre de jours) — réservé à l'administrateur.
--  Solde restant = solde initial + congés acquis depuis le début du suivi
--                  − congés approuvés pris depuis le début du suivi + autres corrections.
--   * Acquisition : réglage leave_days_per_month (1,5 j/mois) ; désactivable (leave_accrual_enabled)
--     pendant la vérification des registres.
--   * Début de l'acquisition : date d'entrée si elle est postérieure au début du suivi (nouvel
--     employé) ; sinon début du suivi, seulement si l'employé est suivi (date d'entrée connue,
--     solde initial saisi, « déjà en poste » coché ou début du suivi renseigné). Jamais une date
--     supposée.
--   * Seuls les congés approuvés (pointage « Congé » ou demande acceptée) sont déduits, et seulement
--     à partir du début du suivi.
--  Contrat de la société : réglages company_contract_start / _end / _ref et contract_alert_days ;
--   rappels partagés générés dans « Rappels et alertes » (reminders.system_key).
--  Aucune donnée existante n'est modifiée : sans date de début du projet ni solde initial, les soldes
--  restent calculés comme avant.
-- =============================================================================

alter table public.employees add column if not exists leave_tracking_start date;
alter table public.employees add column if not exists leave_taken_before numeric(5,1) check (leave_taken_before is null or leave_taken_before >= 0);

-- Données sensibles de reprise : administrateur uniquement (l'éditeur SQL, sans utilisateur connecté, reste possible)
create or replace function public.employees_leave_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.leave_tracking_start is distinct from (case when tg_op = 'UPDATE' then old.leave_tracking_start end)
          or new.leave_taken_before is distinct from (case when tg_op = 'UPDATE' then old.leave_taken_before end)) then
    raise exception 'REPRISE_CONGES_ADMIN: seul un administrateur peut modifier les données de reprise des congés.';
  end if;
  return new;
end;
$$;
drop trigger if exists employees_leave_fields_guard on public.employees;
create trigger employees_leave_fields_guard before insert or update on public.employees
  for each row execute function public.employees_leave_fields_guard();

alter table public.leave_adjustments add column if not exists category text not null default 'correction';
alter table public.leave_adjustments drop constraint if exists leave_adjustments_category_chk;
alter table public.leave_adjustments add constraint leave_adjustments_category_chk
  check (category in ('correction', 'solde_initial') and (category = 'correction' or kind = 'conge'));

insert into public.settings (key, value) values
  ('leave_accrual_enabled', 'true'),
  ('company_contract_start', '""'),
  ('company_contract_end', '""'),
  ('company_contract_ref', '""'),
  ('contract_alert_days', '"90,60,30"')
on conflict (key) do nothing;

alter table public.reminders add column if not exists system_key text;
create unique index if not exists reminders_system_key_uniq on public.reminders (system_key) where system_key is not null;

-- ---------- Calcul des congés -------------------------------------------------------
create or replace function public.leave_tracking_start_of(p_tracking date)
returns date
language sql
stable
set search_path = public
as $$
  select coalesce(p_tracking, public.project_start());
$$;

-- Début de l'acquisition (null = aucun congé calculé)
create or replace function public.leave_accrual_from(p_hire date, p_tracking date, p_in_service boolean, p_has_initial boolean)
returns date
language sql
stable
set search_path = public
as $$
  select case
    when p_hire is not null then
      case when public.leave_tracking_start_of(p_tracking) is null then p_hire else greatest(p_hire, public.leave_tracking_start_of(p_tracking)) end
    when p_in_service or p_has_initial or p_tracking is not null then public.leave_tracking_start_of(p_tracking)
    else null
  end;
$$;

drop function if exists public.leave_balances(date);
create function public.leave_balances(p_as_of date default current_date)
returns table (
  employee_id     uuid,
  hire_date       date,
  months          integer,
  accrued         numeric,
  taken           numeric,
  planned         numeric,
  adjustments     numeric,
  balance         numeric,
  accrual_from    date,
  initial_balance numeric,
  tracking_start  date,
  taken_before    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_on boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'leave_accrual_enabled'), true);
begin
  perform public.assert_can_read_balances();
  return query
  with ini as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'solde_initial' group by la.employee_id
  ),
  adj as (
    select la.employee_id, sum(la.days) as n from public.leave_adjustments la
     where la.kind = 'conge' and la.category = 'correction' and la.created_at::date <= p_as_of group by la.employee_id
  ),
  st as (
    select e.id,
           public.leave_tracking_start_of(e.leave_tracking_start) as tr,
           public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start, ini.employee_id is not null) as s,
           coalesce(ini.n, 0) as initial
      from public.employees e left join ini on ini.employee_id = e.id
  ),
  tk as (
    select t.employee_id, count(*)::numeric as n
      from public.days_taken('conge', null, p_as_of) t
      join st on st.id = t.employee_id
     where st.tr is null or t.day >= st.tr      -- congés pris avant le suivi : déjà dans le solde initial
     group by t.employee_id
  ),
  pl as (
    select lr.employee_id, count(distinct d)::numeric as n
      from public.leave_requests lr, generate_series(greatest(lr.start_date, p_as_of + 1), lr.end_date, interval '1 day') d
     where lr.status = 'acceptee' and lr.end_date > p_as_of
     group by lr.employee_id
  )
  select e.id, e.hire_date,
         public.service_months(st.s, p_as_of),
         case when v_on then public.service_months(st.s, p_as_of) * v_rate else 0 end,
         coalesce(tk.n, 0), coalesce(pl.n, 0), coalesce(adj.n, 0),
         -- solde initial pris en compte à partir du début du suivi
         (case when st.tr is null or p_as_of >= st.tr then st.initial else 0 end)
           + (case when v_on then public.service_months(st.s, p_as_of) * v_rate else 0 end)
           - coalesce(tk.n, 0) + coalesce(adj.n, 0),
         st.s, st.initial, st.tr, e.leave_taken_before
    from public.employees e
    join st on st.id = e.id
    left join tk on tk.employee_id = e.id
    left join pl on pl.employee_id = e.id
    left join adj on adj.employee_id = e.id;
end;
$$;
grant execute on function public.leave_balances(date) to authenticated;

create or replace function public.leave_accrual_schedule(p_employee uuid, p_as_of date default current_date)
returns table (month_index integer, credit_date date, days numeric, cumulative numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rate numeric := coalesce((select value::numeric from public.settings where key = 'leave_days_per_month'), 1.5);
  v_on boolean := coalesce((select (value #>> '{}')::boolean from public.settings where key = 'leave_accrual_enabled'), true);
  v_start date;
begin
  perform public.assert_can_read_balances();
  if not v_on then
    return;   -- acquisition désactivée (vérification des registres en cours)
  end if;
  select public.leave_accrual_from(e.hire_date, e.leave_tracking_start, e.in_service_before_start,
           exists (select 1 from public.leave_adjustments la where la.employee_id = e.id and la.kind = 'conge' and la.category = 'solde_initial'))
    into v_start from public.employees e where e.id = p_employee;
  if v_start is null then
    return;
  end if;
  return query
  select n, (v_start + make_interval(months => n))::date, v_rate, n * v_rate
    from generate_series(1, public.service_months(v_start, p_as_of)) n;
end;
$$;

-- ---------- Contrat de la société : rappels automatiques -------------------------------
-- Rappels partagés « une seule fois » dans « Rappels et alertes », identifiés par system_key :
--   contrat:<date de fin>:<n>       n jours avant la fin (réglage contract_alert_days, ex. 90,60,30) ;
--   contrat:<date de fin>:expire    le lendemain de la date de fin (contrat expiré).
-- Un seuil déjà dépassé n'est pas recréé dans le passé : seul le plus proche est créé pour aujourd'hui.
-- Les rappels déjà terminés restent dans l'historique ; ceux d'une ancienne date de fin non terminés
-- sont retirés. Appelée à chaque enregistrement du profil de l'entreprise.
create or replace function public.sync_contract_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Casablanca')::date;
  v_uid uuid := coalesce(auth.uid(), (select p.id from public.profiles p where p.role = 'admin' order by p.created_at limit 1));
  v_txt text := nullif(trim(coalesce((select value #>> '{}' from public.settings where key = 'company_contract_end'), '')), '');
  v_ref text := trim(coalesce((select value #>> '{}' from public.settings where key = 'company_contract_ref'), ''));
  v_days int[];
  v_end date;
  v_fin text;
  v_keys text[] := '{}';
  v_passed int;
  n int;
begin
  if auth.uid() is not null and not public.can_edit('parametres') then
    raise exception 'ACCES_REFUSE: modification des paramètres non autorisée.';
  end if;
  select coalesce(array_agg(distinct trim(x)::int order by trim(x)::int desc), '{}') into v_days
    from unnest(string_to_array(coalesce((select value #>> '{}' from public.settings where key = 'contract_alert_days'), ''), ',')) x
   where trim(x) ~ '^[0-9]{1,3}$' and trim(x)::int between 1 and 730;

  if v_txt is not null and v_uid is not null then
    v_end := v_txt::date;
    v_fin := to_char(v_end, 'DD/MM/YYYY');
    foreach n in array v_days loop
      if v_end - n >= v_today then
        v_keys := v_keys || ('contrat:' || v_end || ':' || n);
        insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
        values ('Fin du contrat de la société le ' || v_fin || ' (dans ' || n || ' jours)',
                'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
                  || ' se termine le ' || v_fin || '. Préparez le renouvellement.',
                v_end - n, 0, true, 'once', case when n <= 30 then 'urgent' else 'important' end, v_uid,
                'contrat:' || v_end || ':' || n)
        on conflict (system_key) where system_key is not null do nothing;
      elsif v_end >= v_today then
        v_passed := n;   -- ordre décroissant : reste le seuil dépassé le plus proche
      end if;
    end loop;
    if v_passed is not null then
      v_keys := v_keys || ('contrat:' || v_end || ':' || v_passed);
      insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
      values ('Fin du contrat de la société le ' || v_fin || ' (moins de ' || v_passed || ' jours)',
              'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
                || ' se termine le ' || v_fin || '. Préparez le renouvellement.',
              v_today, 0, true, 'once', case when v_passed <= 30 then 'urgent' else 'important' end, v_uid,
              'contrat:' || v_end || ':' || v_passed)
      on conflict (system_key) where system_key is not null do nothing;
    end if;
    v_keys := v_keys || ('contrat:' || v_end || ':expire');
    insert into public.reminders (title, details, remind_date, notify_days_before, shared, frequency, priority, created_by, system_key)
    values ('Contrat de la société expiré (fin le ' || v_fin || ')',
            'Le contrat de la société' || case when v_ref <> '' then ' (réf. ' || v_ref || ')' else '' end
              || ' est arrivé à échéance le ' || v_fin || '. Renseignez la nouvelle date de fin dans Profil › Entreprise une fois renouvelé.',
            v_end + 1, 0, true, 'once', 'urgent', v_uid, 'contrat:' || v_end || ':expire')
    on conflict (system_key) where system_key is not null do nothing;
  end if;

  delete from public.reminders r
   where r.system_key like 'contrat:%' and not (r.system_key = any (v_keys))
     and r.done_at is null
     and not exists (select 1 from public.reminder_completions c where c.reminder_id = r.id);
  return cardinality(v_keys);
end;
$$;
revoke all on function public.sync_contract_reminders() from public;
grant execute on function public.sync_contract_reminders() to authenticated;
