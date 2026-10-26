-- =============================================================================
-- Tests des règles métier (cahier des charges, section « Tests obligatoires »).
-- Exécution : scripts/test-db.sh (PostgreSQL jetable dans Docker, schémas Supabase simulés).
-- Chaque test lève une erreur en cas d'échec ; « OK » est affiché sinon.
-- =============================================================================
\set ON_ERROR_STOP on

-- Comptes de test : un administrateur et un lecteur
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local', '{"full_name":"Admin Test"}'),
  ('22222222-2222-2222-2222-222222222222', 'lecture@test.local', '{"full_name":"Lecteur","role":"lecture"}');
update public.profiles set role = 'admin' where email = 'admin@test.local';

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Employés de test (entrée le 15/10/2026, repos le dimanche = 0)
insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, hire_date)
values ('T-B1', 'Test', 'Balayeur', 'balayeur', 'nettoiement', 0, '2026-10-15'),
       ('T-B2', 'Test', 'Second', 'balayeur', 'nettoiement', 6, '2026-01-01');

create temporary table ids as
  select (select id from public.employees where matricule = 'T-B1') as b1,
         (select id from public.employees where matricule = 'T-B2') as b2;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Modifier le jour de repos : changement conservé avec utilisateur et date
-- ---------------------------------------------------------------------------
update public.employees set rest_day = 1 where id = (select b1 from ids);
do $$
declare r record;
begin
  select * into r from public.employee_rest_day_history where employee_id = (select b1 from ids) order by id desc limit 1;
  assert r.old_rest_day = 0 and r.new_rest_day = 1, 'historique du jour de repos incorrect';
  assert r.changed_by_email = 'admin@test.local', 'utilisateur non enregistré';
  assert (select rest_day from public.employees where id = (select b1 from ids)) = 1, 'jour de repos non conservé';
  assert (select count(*) from public.employee_rest_day_history where employee_id = (select b1 from ids)) = 2, 'création + modification attendues';
  raise notice 'OK 1  jour de repos modifié et historisé';
end $$;
update public.employees set rest_day = 0 where id = (select b1 from ids);

-- ---------------------------------------------------------------------------
-- 2-3. Jour de repos travaillé : un seul crédit, même si réenregistré ou doublé
-- ---------------------------------------------------------------------------
insert into public.attendance (activity_date, employee_id, status, time_in, time_out, overtime_manual, position, team_type)
select '2026-10-18', b1, 'repos_travaille', '06:00', '14:00', 2, 'balayeur', 'nettoiement' from ids;
do $$ begin
  assert (select count(*) from public.recovery_credits(null, '2026-12-31') where employee_id = (select b1 from ids)) = 1, 'un crédit attendu';
  raise notice 'OK 2  jour de repos travaillé = 1 crédit';
end $$;

-- Réenregistrement (même ligne mise à jour) + second service le même jour
insert into public.attendance (activity_date, employee_id, status, time_in, time_out, overtime_manual, position, team_type)
select '2026-10-18', b1, 'repos_travaille', '06:00', '15:00', 3, 'balayeur', 'nettoiement' from ids
on conflict (activity_date, employee_id, shift) do update set time_out = excluded.time_out, overtime_manual = excluded.overtime_manual;
insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, overtime_manual, position, team_type)
select '2026-10-18', b1, 2, 'repos_travaille', '18:00', '22:00', 1, 'balayeur', 'nettoiement' from ids;
do $$ begin
  assert (select count(*) from public.recovery_credits(null, '2026-12-31') where employee_id = (select b1 from ids)) = 1, 'crédit compté deux fois';
  raise notice 'OK 3  réenregistrement / second service : toujours 1 crédit';
end $$;

-- ---------------------------------------------------------------------------
-- 4-5. Rapports travailleurs : mois courant et mois choisi, sans double comptage
-- ---------------------------------------------------------------------------
insert into public.attendance (activity_date, employee_id, status, overtime_manual, position, team_type)
select d::date, b1, 'present', 1, 'balayeur', 'nettoiement' from ids, generate_series('2026-10-19'::date, '2026-10-21'::date, interval '1 day') d;
insert into public.attendance (activity_date, employee_id, status, overtime_manual, position, team_type)
select '2026-11-03', b1, 'present', 0.5, 'balayeur', 'nettoiement' from ids;
do $$
declare oct record; nov record; cur integer;
begin
  select * into oct from public.attendance_summary('2026-10-01', '2026-10-31') where employee_id = (select b1 from ids);
  -- 18/10 (repos travaillé, 2 services = 1 jour) + 19, 20, 21 = 4 jours
  assert oct.worked_days = 4, format('jours travaillés octobre = %s, attendu 4', oct.worked_days);
  assert oct.rest_days_worked = 1, format('repos travaillés = %s, attendu 1', oct.rest_days_worked);
  -- manuelles 3 + 1 + 3×1 = 7, + 1 automatique (06:00 → 15:00 = 9 h, soit 1 h au-delà de 8 h)
  assert oct.overtime_total = 8, format('HS = %s, attendu 8 (manuelles 7 + automatique 1)', oct.overtime_total);
  select * into nov from public.monthly_attendance('2026-11-01') where employee_id = (select b1 from ids);
  assert nov.worked_days = 1 and nov.overtime_total = 0.5, 'synthèse novembre incorrecte';
  select count(*) into cur from public.attendance_summary(date_trunc('month', current_date)::date, current_date);
  raise notice 'OK 4  rapports par mois (octobre, novembre, mois courant : % ligne(s))', cur;
  raise notice 'OK 5  jours travaillés, repos travaillés et HS exacts';
end $$;

-- ---------------------------------------------------------------------------
-- 6-7. Demande de congé + jour « Congé » au pointage : une seule déduction
-- ---------------------------------------------------------------------------
insert into public.leave_requests (employee_id, request_date, start_date, end_date, requested_days, reason, status)
select b2, '2026-10-01', '2026-10-05', '2026-10-06', 2, 'test', 'acceptee' from ids;
-- (migration 020) l'acceptation pointe automatiquement les 05 et 06/10 en « Congé »
do $$
declare b record;
begin
  assert (select count(*) from public.leave_requests where employee_id = (select b2 from ids)) = 1, 'demande absente de l''historique';
  assert (select count(*) from public.attendance where employee_id = (select b2 from ids) and activity_date in ('2026-10-05', '2026-10-06') and status::text = 'conge') = 2, 'congé accepté non reporté au pointage';
  select * into b from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids);
  -- 05/10 et 06/10 pointés Congé (+ demande) : 2 jours, jamais 4
  assert b.taken = 2, format('congés pris = %s, attendu 2', b.taken);
  raise notice 'OK 6  demande de congé dans l''historique';
  raise notice 'OK 7  congé pointé + demande : une seule déduction par jour';
end $$;

-- Pointage corrigé : le 06/10 l'employé est finalement venu travailler -> dérogation autorisée, plus de déduction ce jour-là
insert into public.attendance_leave_overrides (employee_id, activity_date, reason) select b2, '2026-10-06', 'Rappelé pour une urgence' from ids;
update public.attendance set status = 'present' where employee_id = (select b2 from ids) and activity_date = '2026-10-06';
do $$ begin
  assert (select taken from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids)) = 1, 'correction du pointage non prise en compte';
  assert exists (select 1 from public.audit_log where table_name = 'attendance' and action = 'INSERT'), 'correction non journalisée';
  raise notice 'OK 7b correction du pointage : solde recalculé et journalisé';
end $$;

-- Pointage « Congé » sans aucune demande : déduit automatiquement
insert into public.attendance (activity_date, employee_id, status, position, team_type)
select '2026-10-09', b2, 'conge', 'balayeur', 'nettoiement' from ids;
do $$ begin
  assert (select taken from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids)) = 2, 'congé pointé sans demande non déduit';
  raise notice 'OK 7c congé pointé sans demande : déduit une fois';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Acquisition : entrée le 15/10/2026 -> 1,5 jour le 15/11/2026, pas avant
-- ---------------------------------------------------------------------------
do $$
declare before_ numeric; on_ numeric; dec_ numeric;
begin
  select accrued into before_ from public.leave_balances('2026-11-14') where employee_id = (select b1 from ids);
  select accrued into on_ from public.leave_balances('2026-11-15') where employee_id = (select b1 from ids);
  select accrued into dec_ from public.leave_balances('2026-12-15') where employee_id = (select b1 from ids);
  assert before_ = 0, format('acquis au 14/11 = %s, attendu 0', before_);
  assert on_ = 1.5, format('acquis au 15/11 = %s, attendu 1,5', on_);
  assert dec_ = 3, format('acquis au 15/12 = %s, attendu 3', dec_);
  assert (select credit_date from public.leave_accrual_schedule((select b1 from ids), '2026-11-15') limit 1) = '2026-11-15', 'date du premier crédit incorrecte';
  assert public.service_months('2026-01-31', '2026-02-28') = 1 and public.service_months('2026-01-31', '2026-02-27') = 0, 'fin de mois mal gérée';
  raise notice 'OK 8  entrée 15/10/2026 : 0 au 14/11, 1,5 au 15/11, 3 au 15/12';
end $$;

-- ---------------------------------------------------------------------------
-- 9-10. Récupération : historique, en attente / refusée sans effet, une seule déduction
-- ---------------------------------------------------------------------------
insert into public.recovery_requests (employee_id, request_date, worked_rest_date, recovery_date, requested_days, comment)
select b1, '2026-10-19', '2026-10-18', '2026-10-25', 1, 'test' from ids;
do $$ begin
  assert (select count(*) from public.recovery_requests where employee_id = (select b1 from ids)) = 1, 'demande de récupération absente';
  assert (select balance from public.recovery_balances(null, '2026-10-31') where employee_id = (select b1 from ids)) = 1, 'une demande en attente ne doit pas réduire le solde';
  raise notice 'OK 9  demande de récupération dans l''historique';
end $$;

-- Crédit déjà utilisé par une demande non refusée : refus
do $$ begin
  insert into public.recovery_requests (employee_id, worked_rest_date, recovery_date) select b1, '2026-10-18', '2026-10-26' from ids;
  raise exception 'ÉCHEC : crédit utilisé deux fois';
exception when unique_violation then raise notice 'OK 9b un crédit ne sert qu''à une seule demande';
end $$;

-- Crédit inexistant (pas de repos travaillé à cette date) : refus
do $$ begin
  insert into public.recovery_requests (employee_id, worked_rest_date, recovery_date) select b1, '2026-10-19', '2026-10-27' from ids;
  raise exception 'ÉCHEC : crédit inexistant accepté';
exception when others then
  if sqlerrm like '%CREDIT_INVALIDE%' then raise notice 'OK 9c crédit inexistant refusé'; else raise; end if;
end $$;

-- Refusée : pas d'effet
update public.recovery_requests set status = 'refusee' where employee_id = (select b1 from ids);
do $$ begin
  assert (select balance from public.recovery_balances(null, '2026-10-31') where employee_id = (select b1 from ids)) = 1, 'une demande refusée ne doit pas réduire le solde';
end $$;
-- Acceptée puis pointée « Récupération » : une seule déduction
update public.recovery_requests set status = 'acceptee' where employee_id = (select b1 from ids);
insert into public.attendance (activity_date, employee_id, status, position, team_type)
select '2026-10-25', b1, 'recuperation', 'balayeur', 'nettoiement' from ids;
do $$
declare r record;
begin
  select * into r from public.recovery_balances(null, '2026-10-31') where employee_id = (select b1 from ids);
  assert r.taken_total = 1 and r.balance = 0, format('récupération prise %s, solde %s (attendu 1 et 0)', r.taken_total, r.balance);
  raise notice 'OK 10 en attente / refusée sans effet ; acceptée et pointée : une seule déduction';
end $$;

-- Exemple du rapport travailleurs : samedi travaillé puis récupéré une semaine plus tard
do $$
declare worked integer; taken integer; owed numeric;
begin
  select rest_days_worked into worked from public.attendance_summary('2026-10-01', '2026-10-31') where employee_id = (select b1 from ids);
  select count(*) into taken from public.days_taken('recuperation', '2026-10-01', '2026-10-31') where employee_id = (select b1 from ids);
  select balance into owed from public.recovery_balances('2026-10-01', '2026-10-31') where employee_id = (select b1 from ids);
  assert worked = 1 and taken = 1 and owed = 0, format('repos travaillés %s, récupérés %s, restant %s (attendu 1, 1, 0)', worked, taken, owed);
  assert (select balance from public.recovery_balances('2026-10-01', '2026-10-20') where employee_id = (select b1 from ids)) = 1, 'avant la récupération, 1 jour doit rester dû';
  raise notice 'OK 10c rapport travailleurs : 1 repos travaillé, 1 récupéré, 0 restant (1 dû avant la récupération)';
end $$;

-- Rapport travailleurs : total congés et congé restant à la fin de la période
do $$
declare b record;
begin
  -- T-B2 entré le 01/01/2026 : 9 mois complets au 31/10 = 13,5 jours ; pris en octobre = 2
  select * into b from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids);
  assert b.accrued = 13.5 and b.taken = 2 and b.balance = 11.5, format('acquis %s, pris %s, restant %s (attendu 13,5 / 2 / 11,5)', b.accrued, b.taken, b.balance);
  raise notice 'OK 10d total congés 13,5 − pris 2 = congé restant 11,5';
end $$;

-- Congé : demande en attente ou refusée sans effet sur le solde
insert into public.leave_requests (employee_id, start_date, end_date, requested_days, status)
select b2, '2026-10-12', '2026-10-13', 2, 'en_attente' from ids;
insert into public.leave_requests (employee_id, start_date, end_date, requested_days, status)
select b2, '2026-10-14', '2026-10-14', 1, 'refusee' from ids;
do $$ begin
  assert (select taken from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids)) = 2, 'demande en attente ou refusée déduite à tort';
  raise notice 'OK 10b congé en attente / refusé sans effet';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Remplaçants attitrés (migration 008)
-- ---------------------------------------------------------------------------
do $$
declare ch uuid; rp uuid; cr uuid; rr uuid;
begin
  select id into ch from public.employees where matricule = 'C001';
  select id into rp from public.employees where matricule = 'R001';
  select id into cr from public.employees where matricule = 'CR01';
  select id into rr from public.employees where matricule = 'RR01';
  assert cr is not null and rr is not null, 'remplaçants de démonstration absents';
  assert (select team_type from public.employees where id = cr) = 'collecte', 'un remplaçant appartient à la collecte';
  assert (select substitute_id from public.employees where id = ch) = cr, 'chauffeur : remplaçant attitré non enregistré';
  assert (select substitute_id from public.employees where id = rp) = rr, 'rippeur : remplaçant attitré non enregistré';
  -- un rippeur remplaçant ne peut pas remplacer un chauffeur
  begin
    update public.employees set substitute_id = rr where id = ch;
    raise exception 'ÉCHEC : rippeur remplaçant accepté pour un chauffeur';
  exception when others then
    if sqlerrm not like '%REMPLACANT_INVALIDE%' then raise; end if;
  end;
  -- un remplaçant n'a pas lui-même de remplaçant attitré
  update public.employees set substitute_id = cr where id = cr;
  assert (select substitute_id from public.employees where id = cr) is null, 'un remplaçant ne doit pas avoir de remplaçant';
  -- jour de repos modifiable pour un remplaçant aussi, et historisé
  update public.employees set rest_day = 4 where id = rr;
  assert (select new_rest_day from public.employee_rest_day_history where employee_id = rr order by id desc limit 1) = 4, 'repos du remplaçant non historisé';
  -- pointage d'un remplaçant qui couvre un titulaire
  insert into public.attendance (activity_date, employee_id, status, position, team_type, replacing_employee_id, chauffeur_id)
  values ('2026-10-20', cr, 'present', 'chauffeur_remplacant', 'collecte', ch, ch);
  assert (select worked_days from public.attendance_summary('2026-10-01', '2026-10-31') where employee_id = cr) = 1, 'jour du remplaçant non compté';
  raise notice 'OK 12 remplaçants : postes, contrôle du type, jour de repos et pointage';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Carburant : consommation par plein, synthèses semaine / mois, filtre chauffeur
-- ---------------------------------------------------------------------------
do $$
declare tr uuid; c1 uuid; c2 uuid; r record;
begin
  select id into tr from public.trucks where matricule = '77027-A-1';
  select id into c1 from public.employees where matricule = 'C001';
  select id into c2 from public.employees where matricule = 'C002';
  -- jeu. 01/10 : premier plein (pas de référence) ; dim. 04/10 : 120 L pour 400 km ; ven. 09/10 : 100 L pour 400 km
  insert into public.fuel_entries (activity_date, truck_id, driver_id, liters, cost, odometer_km) values
    ('2026-10-01', tr, c1, 100, 1200, 10000),
    ('2026-10-04', tr, c1, 120, 1440, 10400),
    ('2026-10-09', tr, c2, 100, 1250, 10800);
  assert (select l_per_100km from public.fuel_entries_calc where truck_id = tr and activity_date = '2026-10-01') is null, 'premier plein : pas de consommation calculable';
  assert (select l_per_100km from public.fuel_entries_calc where truck_id = tr and activity_date = '2026-10-04') = 30, 'plein 2 : 30 L/100 km attendu';
  assert (select distance_km from public.fuel_entries_calc where truck_id = tr and activity_date = '2026-10-09') = 400, 'plein 3 : 400 km attendus';
  assert (select price_per_liter from public.fuel_entries_calc where truck_id = tr and activity_date = '2026-10-09') = 12.5, 'prix au litre';

  select * into r from public.fuel_summary('month', '2026-10-01', '2026-10-31', tr) where period_start = '2026-10-01';
  assert r.fills = 3 and r.liters = 320 and r.cost = 3890 and r.distance_km = 800 and r.liters_measured = 220, 'synthèse mensuelle : totaux';
  assert r.l_per_100km = 27.5, format('synthèse mensuelle : 27,5 L/100 km attendus, obtenu %s', r.l_per_100km);

  select * into r from public.fuel_summary('week', '2026-10-01', '2026-10-31', tr) where period_start = '2026-09-28';
  assert r.fills = 2 and r.l_per_100km = 30, 'semaine du 28/09 : 2 pleins, 30 L/100 km';
  select * into r from public.fuel_summary('week', '2026-10-01', '2026-10-31', tr) where period_start = '2026-10-05';
  assert r.fills = 1 and r.l_per_100km = 25, 'semaine du 05/10 : 25 L/100 km';

  -- filtre chauffeur : la distance du plein reste calculée sur le camion
  select * into r from public.fuel_summary('month', null, null, null, c2);
  assert r.fills = 1 and r.l_per_100km = 25, 'filtre chauffeur C002';
  assert public.photo_module('fuel_entry') = 'rapport_camions', 'photos des pleins : droits du module camions';
  raise notice 'OK 13 carburant : L/100 km par plein, semaine, mois, filtre chauffeur';

  -- coûts par jour : une ligne par jour de plein
  assert (select count(*) from public.fuel_summary('day', '2026-10-01', '2026-10-31', tr)) = 3, 'coûts par jour : 3 jours';
  assert (select cost from public.fuel_summary('day', '2026-10-01', '2026-10-31', tr) where period_start = '2026-10-04') = 1440, 'coût du 04/10';
  assert (select sum(cost) from public.fuel_summary('month', '2026-10-01', '2026-10-31')) >= 3890, 'dépense mensuelle totale';
  raise notice 'OK 13b carburant : coûts par jour et dépense mensuelle';
end $$;

-- ---------------------------------------------------------------------------
-- 14. Rappels : personnels ou partagés
-- ---------------------------------------------------------------------------
do $$
declare me uuid := auth.uid();
begin
  assert me is not null, 'test 14 : utilisateur connecté requis';
  insert into public.reminders (title, remind_date, notify_days_before) values ('Visite technique 77027', current_date + 2, 3);
  insert into public.reminders (title, remind_date, shared) values ('Réunion mensuelle', current_date + 10, true);
  assert (select created_by from public.reminders where title = 'Visite technique 77027') = me, 'auteur du rappel enregistré automatiquement';
  begin
    insert into public.reminders (title, remind_date) values ('   ', current_date);
    raise exception 'ÉCHEC : rappel sans titre accepté';
  exception when check_violation then null;
  end;
  begin
    insert into public.reminders (title, remind_date, created_by) values ('Usurpation', current_date, '22222222-2222-2222-2222-222222222222');
    raise exception 'ÉCHEC : rappel créé au nom d''un autre utilisateur';
  exception when others then
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%foreign key%' then raise; end if;
  end;
  raise notice 'OK 14 rappels : auteur, titre obligatoire, pas de création au nom d''autrui';
end $$;

-- ---------------------------------------------------------------------------
-- 15. Jours fériés : travaillé = compte double + récupération à demander avant la
--     fin du mois, sinon à payer ; férié non travaillé = journée normale sans heures
-- ---------------------------------------------------------------------------
do $$
declare
  e uuid; f uuid;
  h_old date := (date_trunc('month', current_date) - interval '1 month')::date + 9;  -- férié du mois dernier
  h_now date := current_date;                                                       -- férié de ce mois
  month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  r record;
begin
  select id into e from public.employees where matricule = 'B004';
  select id into f from public.employees where matricule = 'B005';
  insert into public.holidays (date, label) values (h_old, 'Férié test A'), (h_now, 'Férié test B') on conflict (date) do nothing;
  insert into public.attendance (activity_date, employee_id, status, time_in, time_out, position, team_type) values
    (h_old, e, 'present', '07:00', '14:00', 'balayeur', 'nettoiement'),
    (h_now, e, 'present', '07:00', '14:00', 'balayeur', 'nettoiement'),
    (h_now, f, 'ferie',   '07:00', '14:00', 'balayeur', 'nettoiement')
  on conflict (activity_date, employee_id, shift) do update set status = excluded.status, time_in = excluded.time_in, time_out = excluded.time_out;

  -- Crédits : le férié du mois dernier non demandé est à payer, celui de ce mois est disponible
  select * into r from public.recovery_credits(null, current_date) c where c.employee_id = e and c.worked_rest_date = h_old;
  assert r.kind = 'ferie' and r.state = 'a_payer', format('férié non demandé à temps : attendu a_payer, obtenu %s/%s', r.kind, r.state);
  select * into r from public.recovery_credits(null, current_date) c where c.employee_id = e and c.worked_rest_date = h_now;
  assert r.state = 'disponible' and r.expires_on = month_end, 'férié de ce mois : disponible jusqu''à la fin du mois';
  -- Le solde à récupérer exclut le férié à payer
  assert (select credits_total from public.recovery_balances(null, current_date) where employee_id = e)
       = (select count(*) from public.recovery_credits(null, current_date) c where c.employee_id = e and c.state <> 'a_payer'), 'solde : férié à payer exclu';

  -- Demande hors délai refusée, demande dans le mois acceptée
  begin
    insert into public.recovery_requests (employee_id, request_date, worked_rest_date, recovery_date) values (e, current_date, h_old, current_date + 1);
    raise exception 'ÉCHEC : récupération d''un férié demandée après la fin du mois acceptée';
  exception when others then
    if sqlerrm not like '%FERIE_HORS_DELAI%' then raise; end if;
  end;
  insert into public.recovery_requests (employee_id, request_date, worked_rest_date, recovery_date) values (e, current_date, h_now, current_date + 1);
  assert (select state from public.recovery_credits(null, current_date) c where c.employee_id = e and c.worked_rest_date = h_now) = 'demande', 'férié demandé dans le mois';

  -- Comptage : férié travaillé compté double, férié non travaillé = journée normale sans heures
  select * into r from public.attendance_summary(h_now, h_now) s where s.employee_id = e;
  assert r.holidays_worked = 1 and r.double_days = 1 and r.worked_days = 1, 'férié travaillé : compte double';
  select * into r from public.attendance_summary(h_now, h_now) s where s.employee_id = f;
  assert r.worked_days = 1, 'férié non travaillé : compté comme journée normale';
  assert (select time_in is null and time_out is null from public.attendance where employee_id = f and activity_date = h_now), 'férié non travaillé : heures effacées';
  raise notice 'OK 15 jours fériés : double, récupération avant fin de mois, sinon à payer ; férié non travaillé sans heures';
end $$;

-- ---------------------------------------------------------------------------
-- 16. Mois de projet (début le 08/10/2026) et superviseur
-- ---------------------------------------------------------------------------
do $$
declare r record; sup uuid; e uuid;
begin
  -- Sans date de début : mois calendaire
  assert public.work_month_start('2026-10-20') = '2026-10-01' and public.work_month_end('2026-10-20') = '2026-10-31', 'mois calendaire par défaut';

  update public.settings set value = '"2026-10-08"' where key = 'project_start_date';
  assert public.work_month_start('2026-10-08') = '2026-10-08', 'début du 1er mois';
  assert public.work_month_end('2026-10-08') = '2026-11-07', 'fin du 1er mois';
  assert public.work_month_start('2026-11-07') = '2026-10-08', 'le 07/11 appartient encore au 1er mois';
  assert public.work_month_start('2026-11-08') = '2026-11-08', 'le 08/11 commence le 2e mois';
  select * into r from public.work_month_range('2026-10-01');
  assert r.month_start = '2026-10-08' and r.month_end = '2026-11-07', 'mois « octobre 2026 » = 08/10 → 07/11';

  -- Congés : un mois complet seulement au 08/11 pour un employé entré avant le projet
  insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, hire_date)
  values ('B099', 'Test', 'Projet', 'balayeur', 'nettoiement', 0, '2026-01-01') returning id into e;
  assert (select accrued from public.leave_balances('2026-11-07') where employee_id = e) = 0, 'pas de mois complet avant le 08/11';
  assert (select accrued from public.leave_balances('2026-11-08') where employee_id = e) = 1.5, '1,5 jour au 08/11';

  -- Rapport mensuel : le pointage du 05/11 compte dans le mois « octobre »
  insert into public.attendance (activity_date, employee_id, status, position, team_type) values ('2026-11-05', e, 'present', 'balayeur', 'nettoiement')
  on conflict (activity_date, employee_id, shift) do update set status = excluded.status;
  assert (select worked_days from public.monthly_attendance('2026-10-01') where employee_id = e) >= 1, 'pointage du 05/11 dans le mois d''octobre';

  -- Superviseur : poste de la collecte, pointé avec les mêmes règles
  insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day, hire_date)
  values ('S001', 'Bennani', 'Karim', 'superviseur', 'collecte', 0, '2026-10-08') returning id into sup;
  insert into public.attendance (activity_date, employee_id, status, position, team_type) values ('2026-10-21', sup, 'absent', 'superviseur', 'collecte');
  assert (select absences from public.attendance_summary('2026-10-01', '2026-10-31') where employee_id = sup) = 1, 'absence du superviseur comptée';
  begin
    insert into public.employees (matricule, last_name, first_name, position, team_type) values ('S002', 'X', 'Y', 'superviseur', 'nettoiement');
    raise exception 'ÉCHEC : superviseur hors collecte accepté';
  exception when check_violation then null;
  end;

  update public.settings set value = '""' where key = 'project_start_date';
  raise notice 'OK 16 mois de projet (08/10 → 07/11), congés au jour anniversaire, superviseur pointé';
end $$;

-- ---------------------------------------------------------------------------
-- 17. Chef d'équipe, agent de sécurité (collecte) ; km départ / fin
-- ---------------------------------------------------------------------------
do $$
declare ce uuid; ag uuid; tr uuid;
begin
  insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day) values ('CE01', 'Chef', 'Equipe', 'chef_equipe', 'collecte', 0) returning id into ce;
  insert into public.employees (matricule, last_name, first_name, position, team_type, rest_day) values ('AS01', 'Agent', 'Securite', 'agent_securite', 'collecte', 0) returning id into ag;
  insert into public.attendance (activity_date, employee_id, status, position, team_type) values
    ('2026-10-22', ce, 'present', 'chef_equipe', 'collecte'), ('2026-10-22', ag, 'absent_maladie', 'agent_securite', 'collecte');
  assert (select worked_days from public.attendance_summary('2026-10-22', '2026-10-22') where employee_id = ce) = 1, 'chef d''équipe pointé';
  assert (select sick_days from public.attendance_summary('2026-10-22', '2026-10-22') where employee_id = ag) = 1, 'agent de sécurité pointé';
  begin
    insert into public.employees (matricule, last_name, first_name, position, team_type) values ('AS02', 'X', 'Y', 'agent_securite', 'nettoiement');
    raise exception 'ÉCHEC : agent de sécurité hors collecte accepté';
  exception when check_violation then null;
  end;

  select id into tr from public.trucks where matricule = '77041-A-1';
  insert into public.truck_daily_reports (activity_date, truck_id, km_start, km_end) values ('2026-10-22', tr, 15200, 15287.5);
  assert (select km from public.truck_daily_reports where activity_date = '2026-10-22' and truck_id = tr) = 87.5, 'km parcourus = fin − départ';
  begin
    update public.truck_daily_reports set km_end = 15000 where activity_date = '2026-10-22' and truck_id = tr;
    raise exception 'ÉCHEC : km fin inférieur au km départ accepté';
  exception when check_violation then null;
  end;
  raise notice 'OK 17 chef d''équipe et agent de sécurité pointés ; km parcourus calculés';
end $$;

-- ---------------------------------------------------------------------------
-- 18. Réparations : dépenses réelles, mois de la réparation, aucun double comptage
-- ---------------------------------------------------------------------------
do $$
declare a uuid; b uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r record;
begin
  select id into a from public.trucks where matricule = '77027-A-1';
  select id into b from public.trucks where matricule = '77035-A-1';
  -- Réparé en octobre (signalé en septembre) : compte en octobre
  insert into public.truck_repairs (truck_id, reported_date, problem_description, repair_date, repair_description, status, cost)
  values (a, '2026-09-28', 'Fuite hydraulique', '2026-10-03', 'Flexible remplacé', 'repare', 1500) returning id into r1;
  -- En cours avec coût et date : compte
  insert into public.truck_repairs (truck_id, reported_date, problem_description, repair_date, status, cost)
  values (a, '2026-10-10', 'Freins', '2026-10-12', 'en_cours', 1000) returning id into r2;
  -- En attente avec coût estimé : ne compte pas
  insert into public.truck_repairs (truck_id, reported_date, problem_description, status, cost)
  values (b, '2026-10-11', 'Pneu', 'en_attente', 800) returning id into r3;
  -- Annulé sans frais : ne compte pas ; annulé avec frais engagés : compte
  insert into public.truck_repairs (truck_id, reported_date, problem_description, repair_date, status, cost)
  values (b, '2026-10-05', 'Diagnostic moteur', '2026-10-06', 'annule', 300) returning id into r4;
  insert into public.truck_repairs (truck_id, reported_date, problem_description, repair_date, status, cost, cancelled_expense)
  values (b, '2026-10-07', 'Dépannage', '2026-10-07', 'annule', 450, true) returning id into r5;

  select * into r from public.repair_expenses_by_truck('2026-10-01', '2026-10-31') x where x.truck_id = a;
  assert r.repairs = 2 and r.total = 2500, format('camion A octobre : 2 réparations, 2500 DH (obtenu %s / %s)', r.repairs, r.total);
  select * into r from public.repair_expenses_by_truck('2026-10-01', '2026-10-31') x where x.truck_id = b;
  assert r.repairs = 1 and r.total = 450, 'camion B : seul l''annulé avec frais compte';
  assert not exists (select 1 from public.repair_expenses_by_truck('2026-09-01', '2026-09-30')), 'rien en septembre (date de réparation, pas de signalement)';
  assert (select sum(total) from public.repair_expenses_by_truck('2026-10-01', '2026-10-31')) = 2950, 'total flotte octobre';

  -- Modification : le rapport suit ; passage en attente : retiré des dépenses
  update public.truck_repairs set cost = 1800 where id = r1;
  assert (select total from public.repair_expenses_by_truck('2026-10-01', '2026-10-31') x where x.truck_id = a) = 2800, 'coût modifié pris en compte';
  update public.truck_repairs set status = 'en_attente' where id = r2;
  assert (select repairs from public.repair_expenses_by_truck('2026-10-01', '2026-10-31') x where x.truck_id = a) = 1, 'en attente retiré';

  -- Réparé sans coût / date : refusé
  begin
    update public.truck_repairs set status = 'repare', cost = null where id = r3;
    raise exception 'ÉCHEC : réparé sans coût accepté';
  exception when check_violation then null;
  end;
  -- Pas de suppression ; historique (coût, statut) disponible
  delete from public.truck_repairs where id = r1;
  assert exists (select 1 from public.truck_repairs where id = r1), 'une réparation ne doit pas être supprimée';
  assert (select count(*) from public.repair_history(r1)) = 2, 'historique : création + modification du coût';
  assert (select old_cost = 1500 and new_cost = 1800 from public.repair_history(r1) h where h.action = 'UPDATE'), 'changement de coût journalisé';
  -- Camion inactif : historique conservé
  update public.trucks set is_active = false where id = b;
  assert (select count(*) from public.truck_repairs where truck_id = b) = 3, 'historique conservé pour un camion inactif';
  update public.trucks set is_active = true where id = b;
  assert public.photo_module('truck_repair') = 'rapport_camions', 'photos de réparation : droits camions';
  raise notice 'OK 18 réparations : dépenses réelles, mois de réparation, pas de doublon, historique';
end $$;

-- ---------------------------------------------------------------------------
-- 19. Rapport camions : Matin / Soir, vidages calculés, totaux sans doublon
-- ---------------------------------------------------------------------------
do $$
declare tr uuid; m1 uuid; m2 uuid; s1 uuid; r record;
begin
  select id into tr from public.trucks where matricule = '77027-A-1';
  -- 1 tonnage -> 1 vidage ; 2 -> 2 ; 3 -> 3 ; vide -> 0
  insert into public.truck_daily_reports (activity_date, truck_id, shift, line_no, loads) values
    ('2026-10-23', tr, 'matin', 1, '[{"ticket":"T1","tonnage":4.5}]') returning id into m1;
  assert (select dumps_count = 1 and tonnage_total = 4.5 from public.truck_daily_reports where id = m1), '1 tonnage = 1 vidage';
  update public.truck_daily_reports set loads = '[{"ticket":"T1","tonnage":4.5},{"ticket":"T2","tonnage":3.2}]' where id = m1;
  assert (select dumps_count = 2 and tonnage_total = 7.7 and ticket2 = 'T2' and tonnage2 = 3.2 from public.truck_daily_reports where id = m1), '2 tonnages = 2 vidages, colonnes 2e ticket alimentées';
  update public.truck_daily_reports set loads = '[{"ticket":"T1","tonnage":4.5},{"ticket":"T2","tonnage":3.2},{"ticket":"T3","tonnage":5.1}]' where id = m1;
  assert (select dumps_count = 3 and tonnage_total = 12.8 from public.truck_daily_reports where id = m1), '3 tonnages = 3 vidages, 12,8 t';
  insert into public.truck_daily_reports (activity_date, truck_id, shift, line_no, loads) values ('2026-10-23', tr, 'matin', 2, '[{"ticket":"","tonnage":null}]') returning id into m2;
  assert (select dumps_count = 0 and tonnage_total = 0 and loads = '[]'::jsonb from public.truck_daily_reports where id = m2), 'vidage vide ignoré : 0';
  -- Même camion le soir
  insert into public.truck_daily_reports (activity_date, truck_id, shift, line_no, loads) values ('2026-10-23', tr, 'soir', 1, '[{"ticket":"S1","tonnage":5.1}]') returning id into s1;
  select sum(tonnage_total) ton, sum(dumps_count) d, count(*) filter (where shift = 'soir') soir into r from public.truck_daily_reports where activity_date = '2026-10-23' and truck_id = tr;
  assert r.ton = 17.9 and r.d = 4 and r.soir = 1, 'total journée matin + soir';
  -- Une même ligne (date, camion, poste, n°) ne peut pas exister deux fois
  begin
    insert into public.truck_daily_reports (activity_date, truck_id, shift, line_no) values ('2026-10-23', tr, 'soir', 1);
    raise exception 'ÉCHEC : ligne en double acceptée';
  exception when unique_violation then null;
  end;
  -- Ancienne écriture (ticket1 / tonnage1) : la liste est reconstruite, les vidages 3+ conservés
  update public.truck_daily_reports set tonnage1 = 6 where id = m1;
  assert (select jsonb_array_length(loads) = 3 and tonnage_total = 14.3 and dumps_count = 3 from public.truck_daily_reports where id = m1), 'compatibilité anciennes colonnes';
  -- Correction manuelle (administrateur)
  update public.truck_daily_reports set dumps_override = true, dumps_count = 5 where id = s1;
  assert (select dumps_count from public.truck_daily_reports where id = s1) = 5, 'correction manuelle conservée';
  assert public.photo_module('truck_report') = 'rapport_camions', 'photos des lignes camion';
  raise notice 'OK 19 rapport camions : Matin / Soir, vidages et tonnage calculés, pas de doublon';
end $$;

-- ---------------------------------------------------------------------------
-- 20. Rapport de collecte : modifiable tant que la journée est ouverte,
--     photos conservées après clôture / réouverture, traçabilité
-- ---------------------------------------------------------------------------
do $$
declare d date := current_date - 3; tr uuid; rep uuid; ch uuid; r record;
begin
  select id into tr from public.trucks where matricule = '77041-A-1';
  select id into ch from public.employees where matricule = 'C003';
  -- 06:00 : création + photos avant
  insert into public.collection_reports (activity_date, truck_id, chauffeur_id, sectors) values (d, tr, ch, 'Secteur 3') returning id into rep;
  insert into public.photos (storage_path, entity_type, entity_id, phase, activity_date, uploaded_by)
  values ('collection_report/' || rep || '/a1.jpg', 'collection_report', rep, 'avant', d, auth.uid()),
         ('collection_report/' || rep || '/a2.jpg', 'collection_report', rep, 'avant', d, auth.uid());
  -- 10:00 : photos après + correction
  insert into public.photos (storage_path, entity_type, entity_id, phase, activity_date, uploaded_by)
  values ('collection_report/' || rep || '/p1.jpg', 'collection_report', rep, 'apres', d, auth.uid());
  update public.collection_reports set sectors = 'Secteur 3 et 4', observations = 'RAS', manual_team = true where id = rep;
  select * into r from public.record_audit_info('collection_reports', array[rep]);
  assert r.created_at is not null and r.updated_at is not null and r.photos_added = 3, format('traçabilité : création, modification, 3 photos (%s)', r.photos_added);

  -- Clôture : plus de modification ni d'ajout de photo
  perform public.close_day(d);
  begin
    update public.collection_reports set observations = 'X' where id = rep;
    raise exception 'ÉCHEC : rapport modifié après clôture';
  exception when others then
    if sqlerrm not like '%JOURNEE_CLOTUREE%' then raise; end if;
  end;
  begin
    insert into public.photos (storage_path, entity_type, entity_id, phase, activity_date, uploaded_by)
    values ('collection_report/' || rep || '/p2.jpg', 'collection_report', rep, 'apres', d, auth.uid());
    raise exception 'ÉCHEC : photo ajoutée après clôture';
  exception when others then
    if sqlerrm not like '%JOURNEE_CLOTUREE%' then raise; end if;
  end;
  assert (select count(*) from public.photos where entity_type = 'collection_report' and entity_id = rep) = 3, 'photos conservées après clôture';

  -- Réouverture avec motif : à nouveau modifiable, rien n'est perdu
  perform public.reopen_day(d, 'Photo après manquante');
  insert into public.photos (storage_path, entity_type, entity_id, phase, activity_date, uploaded_by)
  values ('collection_report/' || rep || '/p2.jpg', 'collection_report', rep, 'apres', d, auth.uid());
  update public.collection_reports set observations = 'RAS — complété' where id = rep;
  assert (select count(*) from public.photos where entity_type = 'collection_report' and entity_id = rep) = 4, 'photo ajoutée après réouverture';
  assert (select sectors from public.collection_reports where id = rep) = 'Secteur 3 et 4', 'données conservées après réouverture';
  assert exists (select 1 from public.audit_log where table_name = 'work_days' and action = 'REOPEN_DAY' and new_data ->> 'reason' = 'Photo après manquante'), 'réouverture journalisée avec motif';
  raise notice 'OK 20 collecte : modifiable jusqu''à la clôture, figée après, réouverture sans perte, traçabilité';
end $$;

-- ---------------------------------------------------------------------------
-- 21. Achats de matériel : calculs, paiements échelonnés, annulation, journal
-- ---------------------------------------------------------------------------
do $$
declare a uuid; b uuid; r record;
begin
  -- 10 boîtes × 150 DH = 1 500 DH ; payé 1 000 DH le jour même ; reste 500 DH
  insert into public.material_purchases (purchase_date, supplier_name, material_name, category, quantity, unit, unit_price)
  values ('2026-10-05', 'Droguerie Atlas', 'Produits de nettoyage', 'produits_nettoyage', 10, 'boite', 150) returning id into a;
  insert into public.material_purchase_payments (purchase_id, payment_date, amount) values (a, '2026-10-05', 1000);
  select * into r from public.material_purchases_calc where id = a;
  assert r.total_amount = 1500 and r.amount_paid = 1000 and r.amount_due = 500 and r.payment_status = 'partiel', 'total 1500, payé 1000, reste 500, partiel';
  -- Correction de la quantité : total recalculé, pas de doublon
  update public.material_purchases set quantity = 12 where id = a;
  assert (select total_amount from public.material_purchases where id = a) = 1800, 'quantité corrigée : 1800';
  assert (select count(*) from public.material_purchases where supplier_name = 'Droguerie Atlas') = 1, 'pas de doublon';
  -- Solde payé le mois suivant : la valeur reste en octobre, le paiement compte en novembre
  insert into public.material_purchase_payments (purchase_id, payment_date, amount) values (a, '2026-11-03', 800);
  assert (select payment_status from public.material_purchases_calc where id = a) = 'paye', 'soldé';
  assert (select sum(amount) from public.material_purchase_payments where payment_date between '2026-11-01' and '2026-11-30' and not cancelled) = 800, 'paiements de novembre séparés de la valeur d''octobre';
  -- Trop-perçu refusé
  begin
    insert into public.material_purchase_payments (purchase_id, payment_date, amount) values (a, '2026-11-04', 1);
    raise exception 'ÉCHEC : paiement au-delà du montant accepté';
  exception when others then
    if sqlerrm not like '%PAIEMENT_SUPERIEUR%' then raise; end if;
  end;
  -- Valeurs invalides refusées
  begin
    insert into public.material_purchases (purchase_date, supplier_name, material_name, quantity, unit_price) values ('2026-10-06', 'X', 'Y', -2, 10);
    raise exception 'ÉCHEC : quantité négative acceptée';
  exception when check_violation then null;
  end;
  -- Ajustement du total : administrateur avec motif
  insert into public.material_purchases (purchase_date, supplier_name, material_name, category, quantity, unit, unit_price, total_amount, amount_adjusted, adjustment_reason)
  values ('2026-10-07', 'Quincaillerie Nord', 'Pelles', 'outillage', 3, 'piece', 100, 280, true, 'Remise fournisseur') returning id into b;
  assert (select total_amount from public.material_purchases where id = b) = 280, 'ajustement documenté conservé';
  -- Annulation (jamais supprimé) : exclue des totaux
  update public.material_purchases set cancelled = true, cancel_reason = 'Commande en double' where id = b;
  assert (select payment_status from public.material_purchases_calc where id = b) = 'annule', 'achat annulé';
  delete from public.material_purchases where id = b;
  assert exists (select 1 from public.material_purchases where id = b), 'un achat ne doit pas être supprimé';
  -- Journal : création + modifications (quantité) + paiements
  assert (select count(*) from public.purchase_history(a)) >= 4, 'historique de l''achat et de ses paiements';
  assert public.photo_can_view('material_purchase'), 'photos des achats visibles par l''administrateur';
  raise notice 'OK 21 achats : total = quantité × prix, paiements échelonnés, reste dû, annulation, journal';
end $$;

-- ---------------------------------------------------------------------------
-- 22. Congé ↔ Pointage : application automatique, blocage, dérogation, recalcul
-- ---------------------------------------------------------------------------
do $$
declare e uuid; req uuid; req2 uuid; ov uuid; taken0 numeric; r record;
begin
  select id into e from public.employees where matricule = 'B003';
  -- Pointage déjà saisi le 21/11 (présent) avant la demande
  insert into public.attendance (activity_date, employee_id, status, position, team_type, time_in) values ('2026-11-21', e, 'present', 'balayeur', 'nettoiement', '07:00');
  taken0 := (select taken from public.leave_balances('2026-11-30') where employee_id = e);

  -- 1. En attente : pas de congé au pointage
  insert into public.leave_requests (employee_id, start_date, end_date, requested_days, status) values (e, '2026-11-20', '2026-11-22', 3, 'en_attente') returning id into req;
  assert (select count(*) from public.attendance where employee_id = e and status::text = 'conge' and activity_date between '2026-11-20' and '2026-11-22') = 0, '1. en attente : rien au pointage';

  -- 2. Acceptée : les 3 dates en « Congé », le pointage existant converti (ancien statut gardé)
  update public.leave_requests set status = 'acceptee' where id = req;
  assert (select count(*) from public.attendance where employee_id = e and status::text = 'conge' and activity_date between '2026-11-20' and '2026-11-22') = 3, '2. acceptée : 3 dates en congé';
  assert (select pre_leave_status from public.attendance where employee_id = e and activity_date = '2026-11-21') = 'present', '2. ancien statut conservé';
  assert (select taken from public.leave_balances('2026-11-30') where employee_id = e) = taken0 + 3, '7. 3 jours déduits, une seule fois';

  -- 3. Passer le 21/11 en Absent : refusé
  begin
    update public.attendance set status = 'absent' where employee_id = e and activity_date = '2026-11-21';
    raise exception 'ÉCHEC : statut modifié sur un congé approuvé';
  exception when others then
    if sqlerrm not like 'CONGE_APPROUVE|%' then raise; end if;
  end;
  -- Suppression de la ligne de congé : refusée aussi
  begin
    delete from public.attendance where employee_id = e and activity_date = '2026-11-20';
    raise exception 'ÉCHEC : ligne de congé supprimée';
  exception when others then
    if sqlerrm not like 'CONGE_APPROUVE|%' then raise; end if;
  end;

  -- 4-5. Dérogation autorisée (motif obligatoire), journalisée, puis changement accepté
  begin
    insert into public.attendance_leave_overrides (employee_id, activity_date, reason) values (e, '2026-11-21', 'ok');
    raise exception 'ÉCHEC : dérogation sans motif suffisant';
  exception when check_violation then null;
  end;
  insert into public.attendance_leave_overrides (employee_id, activity_date, leave_request_id, reason) values (e, '2026-11-21', req, 'Rappelé pour un événement exceptionnel') returning id into ov;
  update public.attendance set status = 'absent' where employee_id = e and activity_date = '2026-11-21';
  assert exists (select 1 from public.audit_log where table_name = 'attendance_leave_overrides' and record_id = ov::text and action = 'INSERT' and user_email is not null and new_data ->> 'reason' = 'Rappelé pour un événement exceptionnel'), '5. dérogation journalisée (qui, quand, motif)';
  -- Une nouvelle synchronisation ne revient pas sur la dérogation
  perform public.sync_leave_attendance(req);
  assert (select status::text from public.attendance where employee_id = e and activity_date = '2026-11-21') = 'absent', '4. dérogation respectée par la synchronisation';
  assert (select taken from public.leave_balances('2026-11-30') where employee_id = e) = taken0 + 2, '7. jour dérogé non déduit';
  -- Révocation : le congé s'applique de nouveau
  update public.attendance_leave_overrides set revoked = true where id = ov;
  assert (select status::text from public.attendance where employee_id = e and activity_date = '2026-11-21') = 'conge', 'révocation : retour au congé';

  -- 6. Annulation : congé automatique retiré, pointage d'origine restauré ; demande conservée
  update public.leave_requests set status = 'annulee' where id = req;
  assert (select count(*) from public.attendance where employee_id = e and activity_date in ('2026-11-20', '2026-11-22')) = 0, '6. lignes créées par le congé retirées';
  select * into r from public.attendance where employee_id = e and activity_date = '2026-11-21';
  assert r.status::text = 'present' and r.pre_leave_status is null and r.leave_request_id is null, '6. pointage d''origine restauré';
  assert exists (select 1 from public.leave_requests where id = req), '8. demande conservée';
  assert (select taken from public.leave_balances('2026-11-30') where employee_id = e) = taken0, '7. solde rétabli après annulation';

  -- Deux demandes : refuser l'une garde le congé couvert par l'autre
  update public.leave_requests set status = 'acceptee' where id = req;
  insert into public.leave_requests (employee_id, start_date, end_date, requested_days, status) values (e, '2026-11-22', '2026-11-23', 2, 'acceptee') returning id into req2;
  update public.leave_requests set status = 'refusee' where id = req;
  assert (select status::text from public.attendance where employee_id = e and activity_date = '2026-11-22') = 'conge', '6. date couverte par une autre demande acceptée : reste en congé';
  assert (select count(*) from public.attendance where employee_id = e and activity_date = '2026-11-20') = 0, '6. refus : 20/11 retiré';
  raise notice 'OK 22 congé ↔ pointage : automatique, blocage, dérogation motivée, recalcul, solde exact';
end $$;

-- ---------------------------------------------------------------------------
-- 11. Permissions et conservation des demandes
-- ---------------------------------------------------------------------------
delete from public.leave_requests where employee_id = (select b2 from ids);
do $$ begin
  assert (select count(*) from public.leave_requests where employee_id = (select b2 from ids)) = 3, 'une demande a été supprimée';
  raise notice 'OK 11 les demandes ne peuvent pas être supprimées';
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  insert into public.leave_requests (employee_id, start_date, end_date, requested_days) select b2, '2026-11-01', '2026-11-01', 1 from ids;
  raise exception 'ÉCHEC : le rôle lecture a pu créer une demande';
exception when others then
  if sqlerrm like '%row-level security%' then raise notice 'OK 11b lecture seule : création refusée'; else raise; end if;
end $$;
do $$ begin
  insert into public.leave_adjustments (employee_id, days, reason) select b2, 5, 'essai' from ids;
  raise exception 'ÉCHEC : correction de solde par un non-administrateur';
exception when others then
  if sqlerrm like '%row-level security%' then raise notice 'OK 11c correction de solde réservée à l''administrateur'; else raise; end if;
end $$;
-- La lecture des soldes reste possible en consultation
do $$ begin
  assert (select count(*) from public.leave_balances('2026-10-31')) > 0, 'consultation des soldes impossible';
  raise notice 'OK 11d lecture seule : consultation des soldes';
end $$;

-- Rappels vus par un autre utilisateur : le partagé oui, le personnel non
do $$ begin
  assert (select count(*) from public.reminders where title = 'Réunion mensuelle') = 1, 'rappel partagé invisible pour un autre utilisateur';
  assert (select count(*) from public.reminders where title = 'Visite technique 77027') = 0, 'rappel personnel visible par un autre utilisateur';
  delete from public.reminders where title = 'Réunion mensuelle';
  assert (select count(*) from public.reminders where title = 'Réunion mensuelle') = 1, 'rappel partagé supprimé par un non-administrateur';
  raise notice 'OK 14b rappels : personnel privé, partagé visible par tous, suppression réservée';
end $$;

-- Achats : droits par défaut du rôle lecture seule (voir oui, créer non)
do $$ begin
  assert public.can_view_module('achats') and not public.can_edit_module('achats'), 'lecture seule : achats visibles, non modifiables';
  assert (select count(*) from public.material_purchases_calc) >= 1, 'lecture seule : consultation des achats';
  begin
    insert into public.material_purchases (purchase_date, supplier_name, material_name, quantity, unit_price) values ('2026-10-08', 'X', 'Y', 1, 1);
    raise exception 'ÉCHEC : lecture seule a créé un achat';
  exception when others then
    if sqlerrm not like '%row-level security%' then raise; end if;
  end;
  raise notice 'OK 21b achats : droits par défaut (lecture seule = consultation)';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- 23. Heures sup. : fin prévue = entrée + 8 h, dépassement arrondi à l'heure supérieure, + manuel
-- ---------------------------------------------------------------------------
do $$
declare
  e uuid := (select id from public.employees where matricule = 'B001');
  r public.attendance;
  procedure_ok boolean;
begin
  insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, overtime_manual, position, team_type)
  values ('2026-11-20', e, 1, 'present', '06:00', '15:30', 1, 'balayeur', 'nettoiement') returning * into r;
  assert r.overtime_auto = 2 and r.overtime_manual = 1 and r.overtime_hours = 3, format('06:00→15:30 + 1 h manuelle : auto %s, total %s (attendu 2 + 1 = 3)', r.overtime_auto, r.overtime_hours);

  update public.attendance set time_out = '13:00' where id = r.id returning * into r;
  assert r.overtime_auto = 0 and r.overtime_hours = 1, 'sortie avant la fin prévue : 0 automatique, manuel conservé';
  update public.attendance set time_out = '14:00' where id = r.id returning * into r;
  assert r.overtime_auto = 0, 'sortie à la fin prévue : 0';
  update public.attendance set time_out = '14:30' where id = r.id returning * into r;
  assert r.overtime_auto = 1, '30 min → 1 h';
  update public.attendance set time_out = '15:15' where id = r.id returning * into r;
  assert r.overtime_auto = 2, '1 h 15 → 2 h';
  update public.attendance set time_out = '16:00' where id = r.id returning * into r;
  assert r.overtime_auto = 2 and r.overtime_hours = 3, '2 h → 2 h (+ 1 manuelle)';

  update public.attendance set overtime_manual = 2.5 where id = r.id returning * into r;
  assert r.overtime_auto = 2 and r.overtime_hours = 4.5, 'saisie manuelle modifiée seule : automatique inchangé, total additionné';
  update public.attendance set overtime_auto = 9 where id = r.id returning * into r;
  assert r.overtime_auto = 2, 'la part automatique ne peut pas être saisie à la main';

  update public.attendance set time_in = '07:00' where id = r.id returning * into r;
  assert r.overtime_auto = 1, 'entrée corrigée 07:00 (fin prévue 15:00, sortie 16:00) : 1 h';

  update public.attendance set time_in = '16:00', time_out = '23:00' where id = r.id returning * into r;
  assert r.overtime_auto = 0, '16:00 → 23:00 : journée complète, 0';
  update public.attendance set time_out = '00:30' where id = r.id returning * into r;
  assert r.overtime_auto = 1, format('16:00 → 00:30 (après minuit) : auto %s (attendu 1)', r.overtime_auto);
  update public.attendance set time_in = '18:00', time_out = '03:15' where id = r.id returning * into r;
  assert r.overtime_auto = 2, format('18:00 → 03:15 (fin prévue 02:00) : auto %s (attendu 2)', r.overtime_auto);

  update public.attendance set time_in = null where id = r.id returning * into r;
  assert r.overtime_auto = 0 and r.overtime_hours = 2.5, 'entrée manquante : seule la part manuelle';

  insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, position, team_type)
  values ('2026-11-20', e, 2, 'present', '15:00', '20:00', 'balayeur', 'nettoiement') returning * into r;
  assert r.overtime_auto = 0, '2e service de 5 h : 0';

  update public.attendance set status = 'absent' where employee_id = e and activity_date = '2026-11-20' and shift = 1 returning * into r;
  assert r.overtime_auto = 0 and r.overtime_manual = 0 and r.overtime_hours = 0, 'statut non travaillé : aucune heure sup.';
  delete from public.attendance where employee_id = e and activity_date = '2026-11-20';
  raise notice 'OK 23 heures sup. : entrée + 8 h, arrondi à l''heure supérieure, après minuit, manuel toujours ajouté';
end $$;

-- ---------------------------------------------------------------------------
-- 24. Départ anticipé pour maladie : Absent maladie, 0 h standard, heures en HS manuelles
-- ---------------------------------------------------------------------------
do $$
declare
  e uuid := (select id from public.employees where matricule = 'B002');
  r public.attendance;
  s record;
begin
  -- 06:00, 4 h de travail puis départ malade
  insert into public.attendance (activity_date, employee_id, shift, status, sick_departure, time_in, time_out, overtime_manual, observation, position, team_type)
  values ('2026-11-24', e, 1, 'absent_maladie', true, '06:00', '10:00', 4, 'Fièvre, renvoyé chez lui', 'balayeur', 'nettoiement') returning * into r;
  assert r.time_in = '06:00' and r.time_out = '10:00' and r.overtime_manual = 4 and r.overtime_auto = 0 and r.overtime_hours = 4 and r.observation = 'Fièvre, renvoyé chez lui',
    format('départ maladie : entrée %s, départ %s, manuel %s, auto %s', r.time_in, r.time_out, r.overtime_manual, r.overtime_auto);
  -- 16:00, 2 h
  insert into public.attendance (activity_date, employee_id, shift, status, sick_departure, time_in, time_out, overtime_manual, position, team_type)
  values ('2026-11-25', e, 1, 'absent_maladie', true, '16:00', '18:00', 2, 'balayeur', 'nettoiement') returning * into r;
  assert r.overtime_hours = 2 and r.overtime_auto = 0, '16:00 → 18:00 malade : 2 h manuelles';
  -- Journée normale finie tôt : 8 h standard, 0 automatique
  insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, position, team_type)
  values ('2026-11-26', e, 1, 'present', '06:00', '13:00', 'balayeur', 'nettoiement') returning * into r;
  assert r.overtime_hours = 0, 'présent 06:00 → 13:00 : aucune heure sup., journée normale';
  -- Absent maladie sans l'option : heures effacées (règle inchangée)
  insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, overtime_manual, position, team_type)
  values ('2026-11-27', e, 1, 'absent_maladie', '06:00', '09:00', 3, 'balayeur', 'nettoiement') returning * into r;
  assert r.time_in is null and r.overtime_hours = 0 and not r.sick_departure, 'absent maladie sans départ anticipé : aucune heure';
  -- L'option est retirée si le statut change
  update public.attendance set status = 'present' where employee_id = e and activity_date = '2026-11-24' returning * into r;
  assert not r.sick_departure, 'statut modifié : option départ anticipé retirée';
  update public.attendance set status = 'absent_maladie', sick_departure = true, time_in = '06:00', time_out = '10:00', overtime_manual = 4 where id = r.id;

  -- Synthèse : jours de maladie, pas de jour travaillé, heures comptées une fois (en HS)
  select * into s from public.attendance_summary('2026-11-24', '2026-11-27') where employee_id = e;
  assert s.worked_days = 1 and s.sick_days = 3 and s.overtime_total = 6, format('synthèse : travaillés %s (attendu 1), maladie %s (attendu 3), HS %s (attendu 6)', s.worked_days, s.sick_days, s.overtime_total);
  delete from public.attendance where employee_id = e and activity_date between '2026-11-24' and '2026-11-27';
  raise notice 'OK 24 départ anticipé pour maladie : Absent maladie, 0 h standard, heures en HS manuelles';
end $$;

\echo '=== TOUS LES TESTS SONT PASSÉS ==='
