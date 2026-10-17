-- =============================================================================
-- Données de démonstration (fictives). À exécuter une seule fois après les
-- migrations, dans l'éditeur SQL de Supabase ou via `npx supabase db push`.
-- Aucun mot de passe ici : les comptes se créent dans Authentication > Users
-- ou dans Paramètres > Comptes de l'application.
-- =============================================================================

-- Jours fériés (exemples à compléter dans Paramètres > Jours fériés)
insert into public.holidays (date, label) values
  (date_trunc('year', current_date)::date, 'Jour de l''An'),
  (date_trunc('year', current_date)::date + interval '4 months', 'Fête du Travail')
on conflict (date) do nothing;

-- Camions
insert into public.trucks (matricule, brand) values
  ('77027-A-1', 'BOM'),
  ('77035-A-1', 'BOM'),
  ('77041-A-1', 'BOM')
on conflict (matricule) do nothing;

-- Équipes de collecte : chauffeurs puis rippeurs rattachés
with c as (
  insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, truck_id, hire_date)
  values
    ('C001', 'Alami',   'Youssef', 'chauffeur', 'collecte', 0, (select id from public.trucks where matricule = '77027-A-1'), current_date - interval '2 years'),
    ('C002', 'Benani',  'Karim',   'chauffeur', 'collecte', 5, (select id from public.trucks where matricule = '77035-A-1'), current_date - interval '18 months'),
    ('C003', 'Idrissi', 'Hamid',   'chauffeur', 'collecte', 1, (select id from public.trucks where matricule = '77041-A-1'), current_date - interval '1 year')
  on conflict (matricule) do nothing
  returning id, matricule
)
insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, chauffeur_id, hire_date)
values
  ('R001', 'Tazi',    'Omar',    'rippeur', 'collecte', 0, (select id from c where matricule = 'C001'), current_date - interval '2 years'),
  ('R002', 'Fassi',   'Said',    'rippeur', 'collecte', 0, (select id from c where matricule = 'C001'), current_date - interval '1 year'),
  ('R003', 'Chraibi', 'Adil',    'rippeur', 'collecte', 5, (select id from c where matricule = 'C002'), current_date - interval '9 months'),
  ('R004', 'Lahlou',  'Rachid',  'rippeur', 'collecte', 5, (select id from c where matricule = 'C002'), current_date - interval '6 months'),
  ('R005', 'Berrada', 'Nabil',   'rippeur', 'collecte', 1, (select id from c where matricule = 'C003'), current_date - interval '3 months'),
  ('R006', 'Ouazzani','Mehdi',   'rippeur', 'collecte', null, null, current_date - interval '1 month')
on conflict (matricule) do nothing;

-- Remplaçants (migration 008) : un chauffeur remplaçant et un rippeur remplaçant,
-- attitrés aux titulaires pour leurs jours de repos
insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, hire_date) values
  ('CR01', 'Naciri', 'Hassan', 'chauffeur_remplacant', 'collecte', 3, current_date - interval '1 year'),
  ('RR01', 'Kettani', 'Yassine', 'rippeur_remplacant', 'collecte', 3, current_date - interval '1 year')
on conflict (matricule) do nothing;
update public.employees set substitute_id = (select id from public.employees where matricule = 'CR01')
 where position = 'chauffeur' and substitute_id is null;
update public.employees set substitute_id = (select id from public.employees where matricule = 'RR01')
 where position = 'rippeur' and substitute_id is null;

-- Équipe de nettoiement : balayeurs
insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, hire_date) values
  ('B001', 'El Amrani', 'Fatima',  'balayeur', 'nettoiement', 0, current_date - interval '3 years'),
  ('B002', 'Haddad',    'Khadija', 'balayeur', 'nettoiement', 0, current_date - interval '2 years'),
  ('B003', 'Mansouri',  'Ahmed',   'balayeur', 'nettoiement', 6, current_date - interval '1 year'),
  ('B004', 'Ziani',     'Mustapha','balayeur', 'nettoiement', 6, current_date - interval '8 months'),
  ('B005', 'Rahmani',   'Salma',   'balayeur', 'nettoiement', 5, current_date - interval '4 months')
on conflict (matricule) do nothing;
