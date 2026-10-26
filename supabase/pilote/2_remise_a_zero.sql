-- =============================================================================
-- Pilote — 2. REMISE À ZÉRO (IRRÉVERSIBLE)
--
-- Vide : employés, camions et TOUTES les données d'exploitation (pointage, journées,
-- rapports, camions, carburant, pannes, achats, congés, récupérations, avertissements,
-- tâches, déchet vert, rappels, fiches photos, versions du rapport mensuel, journal).
-- CONSERVE : comptes utilisateurs, droits par rôle, réglages (nom, logo, période du 8 au 7,
-- seuils…), jours fériés, chefs d'équipe (leur lien vers un employé est retiré).
-- Ne supprime aucune table, aucune colonne, aucune fonction.
--
-- AVANT DE LANCER :
--   1. Exécutez 1_verifier.sql et lisez ce qui sera vidé.
--   2. SAUVEGARDE (si la base contient quoi que ce soit d'utile) :
--        - Ubuntu, dans le dossier du projet :
--            npx supabase db dump --data-only -f sauvegarde-avant-pilote.sql
--          (projet lié avec « npx supabase link » ; le mot de passe de la base est demandé) ;
--        - ou Supabase › Table Editor › chaque table › « Export to CSV ».
--      Gardez le fichier en lieu sûr (jamais dans GitHub).
--   3. Remplacez NON par OUI-REMISE-A-ZERO à la ligne « v_confirmation » ci-dessous, puis Run.
--   4. Ensuite : Supabase › Storage › photos › sélectionnez tous les dossiers › Delete
--      (les fichiers photo ne sont pas effacés par SQL).
--
-- Tout se fait en une seule instruction : en cas d'erreur, rien n'est modifié.
-- =============================================================================

do $$
declare
  v_confirmation text := 'NON';   -- ← remplacer par OUI-REMISE-A-ZERO pour confirmer
  v_counts jsonb;
begin
  if v_confirmation <> 'OUI-REMISE-A-ZERO' then
    raise exception 'Remise à zéro NON confirmée : remplacez NON par OUI-REMISE-A-ZERO (ligne v_confirmation) après avoir fait la sauvegarde.';
  end if;

  select jsonb_build_object(
    'employees', (select count(*) from public.employees),
    'trucks', (select count(*) from public.trucks),
    'attendance', (select count(*) from public.attendance),
    'work_days', (select count(*) from public.work_days),
    'photos', (select count(*) from public.photos),
    'truck_repairs', (select count(*) from public.truck_repairs),
    'material_purchases', (select count(*) from public.material_purchases),
    'leave_requests', (select count(*) from public.leave_requests)
  ) into v_counts;

  -- Chefs d'équipe conservés : seul le lien vers un employé est retiré
  update public.team_leads set employee_id = null where employee_id is not null;

  -- Données d'exploitation : vidées en une instruction, sans CASCADE (si une table conservée
  -- dépendait d'une de ces tables, Postgres refuserait et rien ne serait modifié).
  truncate table
    public.attendance_leave_overrides,
    public.attendance_period_snapshots,
    public.attendance_sheet_meta,
    public.attendance,
    public.cleaning_daily_summary,
    public.cleaning_report_agents,
    public.cleaning_reports,
    public.collection_report_rippers,
    public.collection_reports,
    public.employee_rest_day_history,
    public.fuel_entries,
    public.green_waste_entries,
    public.leave_adjustments,
    public.recovery_requests,
    public.leave_requests,
    public.material_purchase_payments,
    public.material_purchases,
    public.photos,
    public.reminder_completions,
    public.reminders,
    public.truck_daily_reports,
    public.truck_repairs,
    public.warnings,
    public.work_task_agents,
    public.work_tasks,
    public.work_days
  restart identity;

  -- Employés puis camions (référencés par les chefs d'équipe conservés : suppression ligne à ligne)
  delete from public.employees;
  delete from public.trucks;

  -- Journal des modifications des données de test, vidé en dernier
  truncate table public.audit_log restart identity;

  -- Trace de la remise à zéro (premier élément du nouveau journal)
  insert into public.audit_log (table_name, record_id, action, new_data, user_email)
  values ('pilote', 'remise-a-zero', 'DELETE', jsonb_build_object('supprime', v_counts, 'date', now()), 'SQL Editor');

  raise notice 'Remise à zéro effectuée : %', v_counts;
end $$;
