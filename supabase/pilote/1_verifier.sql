-- =============================================================================
-- Pilote — 1. VÉRIFICATION (lecture seule : ne modifie rien)
--
-- À exécuter dans Supabase › SQL Editor. Affiche :
--   * le nombre d'enregistrements de chaque table qui serait VIDÉE par 2_remise_a_zero.sql ;
--   * les tables CONSERVÉES (comptes, droits, réglages, jours fériés, chefs d'équipe) ;
--   * les données de démonstration (supabase/seed.sql) encore présentes.
-- Lisez le résultat avant de décider d'une remise à zéro.
-- =============================================================================

select t.categorie, t.libelle, t.nombre from (
  select 'À VIDER' as categorie, 'Employés' as libelle, (select count(*) from public.employees) as nombre, 1 as ordre
  union all select 'À VIDER', 'Camions', (select count(*) from public.trucks), 2
  union all select 'À VIDER', 'Lignes de pointage', (select count(*) from public.attendance), 3
  union all select 'À VIDER', 'Journées ouvertes / clôturées', (select count(*) from public.work_days), 4
  union all select 'À VIDER', 'Rapports de nettoiement', (select count(*) from public.cleaning_reports), 5
  union all select 'À VIDER', 'Rapports de collecte', (select count(*) from public.collection_reports), 6
  union all select 'À VIDER', 'Lignes du rapport camions', (select count(*) from public.truck_daily_reports), 7
  union all select 'À VIDER', 'Pleins de carburant', (select count(*) from public.fuel_entries), 8
  union all select 'À VIDER', 'Pannes et réparations', (select count(*) from public.truck_repairs), 9
  union all select 'À VIDER', 'Achats de matériel', (select count(*) from public.material_purchases), 10
  union all select 'À VIDER', 'Demandes de congé', (select count(*) from public.leave_requests), 11
  union all select 'À VIDER', 'Demandes de récupération', (select count(*) from public.recovery_requests), 12
  union all select 'À VIDER', 'Avertissements', (select count(*) from public.warnings), 13
  union all select 'À VIDER', 'Tâches du programme', (select count(*) from public.work_tasks), 14
  union all select 'À VIDER', 'Déchet vert', (select count(*) from public.green_waste_entries), 15
  union all select 'À VIDER', 'Rappels', (select count(*) from public.reminders), 16
  union all select 'À VIDER', 'Photos (fiches)', (select count(*) from public.photos), 17
  union all select 'À VIDER', 'Versions finalisées du rapport mensuel', (select count(*) from public.attendance_period_snapshots), 18
  union all select 'À VIDER', 'Journal des modifications', (select count(*) from public.audit_log), 19
  union all select 'CONSERVÉ', 'Comptes utilisateurs', (select count(*) from public.profiles), 20
  union all select 'CONSERVÉ', 'Droits par rôle', (select count(*) from public.role_permissions), 21
  union all select 'CONSERVÉ', 'Réglages et profil de l''entreprise', (select count(*) from public.settings), 22
  union all select 'CONSERVÉ', 'Jours fériés', (select count(*) from public.holidays), 23
  union all select 'CONSERVÉ', 'Chefs d''équipe (lien employé retiré)', (select count(*) from public.team_leads), 24
  union all select 'DÉMONSTRATION', 'Employés fictifs (C001…, R001…, B001…)',
    (select count(*) from public.employees where matricule in ('C001','C002','C003','R001','R002','R003','R004','R005','R006','CR01','RR01','B001','B002','B003','B004','B005')), 25
  union all select 'DÉMONSTRATION', 'Camions fictifs (77027-A-1, 77035-A-1, 77041-A-1)',
    (select count(*) from public.trucks where matricule in ('77027-A-1','77035-A-1','77041-A-1')), 26
) t order by t.ordre;

-- Nom de l'entreprise actuellement enregistré (conservé par la remise à zéro)
select key as reglage, value as valeur from public.settings
 where key in ('company_name', 'agency_name', 'company_logo_path', 'project_start_date', 'pointage_period_start_day')
 order by key;
