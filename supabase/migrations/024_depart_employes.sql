-- =============================================================================
-- 024 — Départ, désactivation et suppression des employés
--
--  * Départ (démission, fin de contrat, licenciement, autre) : l'employé est DÉSACTIVÉ,
--    jamais supprimé. departure_date = dernier jour de travail : il reste proposé sur les
--    feuilles de pointage des dates antérieures ou égales (saisie rétroactive) ; tout
--    l'historique (pointage, rapports, congés…) est conservé tel quel.
--  * Suppression définitive : uniquement par la fonction delete_employee (administrateur),
--    seulement si l'employé n'apparaît dans AUCUN enregistrement (vérification automatique
--    de toutes les tables liées), avec confirmation par le matricule. Les liens de
--    configuration (remplaçant attitré, équipe d'un rippeur, chef d'équipe) sont retirés ;
--    l'historique des jours de repos de la fiche part avec elle. Journalisé (audit_log).
--  * La suppression directe par l'API est fermée (plus de politique DELETE sur employees).
-- =============================================================================

alter table public.employees add column if not exists departure_date date;
alter table public.employees add column if not exists departure_reason text;
alter table public.employees add column if not exists departure_comment text not null default '';
alter table public.employees drop constraint if exists employees_departure_reason_chk;
alter table public.employees add constraint employees_departure_reason_chk
  check (departure_reason is null or departure_reason in ('demission', 'fin_contrat', 'licenciement', 'autre'));
alter table public.employees drop constraint if exists employees_departure_chk;
alter table public.employees add constraint employees_departure_chk
  check ((departure_date is null) = (departure_reason is null));

-- Écriture : création et modification seulement (la suppression passe par delete_employee)
drop policy if exists "employees_write" on public.employees;
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees for insert to authenticated with check (public.can_edit('employes'));
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees for update to authenticated
  using (public.can_edit('employes')) with check (public.can_edit('employes'));

-- ---------- Enregistrements qui font référence à un employé ----------------------------
-- Toutes les clés étrangères vers employees sont lues dans le catalogue (aucune table oubliée,
-- y compris les tables ajoutées plus tard). Exclus : liens de configuration et historique de la fiche.
create or replace function public.employee_dependencies(p_employee uuid)
returns table (table_name text, label text, records bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fk record;
  n bigint;
begin
  if not public.can_view('employes') then
    raise exception 'ACCES_REFUSE: consultation non autorisée.';
  end if;
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.employees'::regclass
       and c.conrelid::regclass::text not in ('employees', 'public.employees', 'team_leads', 'public.team_leads', 'employee_rest_day_history', 'public.employee_rest_day_history')
  loop
    execute format('select count(*) from %s where %I = $1', fk.tbl, fk.col) into n using p_employee;
    if n > 0 then
      table_name := regexp_replace(fk.tbl, '^public\.', '');
      label := case table_name
        when 'attendance' then 'Pointage'
        when 'attendance_leave_overrides' then 'Modifications autorisées sur congé'
        when 'cleaning_report_agents' then 'Rapports de nettoiement'
        when 'collection_reports' then 'Rapports de collecte (chauffeur)'
        when 'collection_report_rippers' then 'Rapports de collecte (équipier)'
        when 'truck_daily_reports' then 'Rapport camions'
        when 'fuel_entries' then 'Pleins de carburant'
        when 'leave_requests' then 'Demandes de congé'
        when 'leave_adjustments' then 'Corrections de solde de congé'
        when 'recovery_requests' then 'Demandes de récupération'
        when 'warnings' then 'Avertissements'
        when 'work_task_agents' then 'Programme de travail'
        when 'photos' then 'Photos'
        else table_name end;
      records := n;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function public.employee_dependencies(uuid) to authenticated;

-- ---------- Suppression définitive (administrateur, sans historique, confirmée) ----------
create or replace function public.delete_employee(p_employee uuid, p_confirm_matricule text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  deps text;
begin
  if not public.is_admin() then
    raise exception 'SUPPRESSION_REFUSEE: seul un administrateur peut supprimer définitivement un employé.';
  end if;
  select * into e from public.employees where id = p_employee for update;
  if not found then
    raise exception 'EMPLOYE_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm_matricule), '') <> e.matricule then
    raise exception 'CONFIRMATION_INVALIDE: saisissez le matricule exact pour confirmer.';
  end if;
  select string_agg(d.label || ' (' || d.records || ')', ', ') into deps from public.employee_dependencies(p_employee) d;
  if deps is not null then
    raise exception 'EMPLOYE_HISTORIQUE|%', deps;
  end if;
  -- Liens de configuration uniquement (aucun historique)
  update public.employees set substitute_id = null where substitute_id = p_employee;
  update public.employees set chauffeur_id = null where chauffeur_id = p_employee;
  update public.team_leads set employee_id = null where employee_id = p_employee;
  delete from public.employees where id = p_employee;   -- journalisé par employees_audit (DELETE, ancienne fiche)
end;
$$;
grant execute on function public.delete_employee(uuid, text) to authenticated;
