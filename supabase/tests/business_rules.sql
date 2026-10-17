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
insert into public.attendance (activity_date, employee_id, status, time_in, time_out, overtime_hours, position, team_type)
select '2026-10-18', b1, 'repos_travaille', '06:00', '14:00', 2, 'balayeur', 'nettoiement' from ids;
do $$ begin
  assert (select count(*) from public.recovery_credits(null, '2026-12-31') where employee_id = (select b1 from ids)) = 1, 'un crédit attendu';
  raise notice 'OK 2  jour de repos travaillé = 1 crédit';
end $$;

-- Réenregistrement (même ligne mise à jour) + second service le même jour
insert into public.attendance (activity_date, employee_id, status, time_in, time_out, overtime_hours, position, team_type)
select '2026-10-18', b1, 'repos_travaille', '06:00', '15:00', 3, 'balayeur', 'nettoiement' from ids
on conflict (activity_date, employee_id, shift) do update set time_out = excluded.time_out, overtime_hours = excluded.overtime_hours;
insert into public.attendance (activity_date, employee_id, shift, status, time_in, time_out, overtime_hours, position, team_type)
select '2026-10-18', b1, 2, 'repos_travaille', '18:00', '22:00', 1, 'balayeur', 'nettoiement' from ids;
do $$ begin
  assert (select count(*) from public.recovery_credits(null, '2026-12-31') where employee_id = (select b1 from ids)) = 1, 'crédit compté deux fois';
  raise notice 'OK 3  réenregistrement / second service : toujours 1 crédit';
end $$;

-- ---------------------------------------------------------------------------
-- 4-5. Rapports travailleurs : mois courant et mois choisi, sans double comptage
-- ---------------------------------------------------------------------------
insert into public.attendance (activity_date, employee_id, status, overtime_hours, position, team_type)
select d::date, b1, 'present', 1, 'balayeur', 'nettoiement' from ids, generate_series('2026-10-19'::date, '2026-10-21'::date, interval '1 day') d;
insert into public.attendance (activity_date, employee_id, status, overtime_hours, position, team_type)
select '2026-11-03', b1, 'present', 0.5, 'balayeur', 'nettoiement' from ids;
do $$
declare oct record; nov record; cur integer;
begin
  select * into oct from public.attendance_summary('2026-10-01', '2026-10-31') where employee_id = (select b1 from ids);
  -- 18/10 (repos travaillé, 2 services = 1 jour) + 19, 20, 21 = 4 jours
  assert oct.worked_days = 4, format('jours travaillés octobre = %s, attendu 4', oct.worked_days);
  assert oct.rest_days_worked = 1, format('repos travaillés = %s, attendu 1', oct.rest_days_worked);
  assert oct.overtime_total = 7, format('HS = %s, attendu 7 (3 + 1 + 3×1)', oct.overtime_total);
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
insert into public.attendance (activity_date, employee_id, status, position, team_type)
select '2026-10-05', b2, 'conge', 'balayeur', 'nettoiement' from ids;
do $$
declare b record;
begin
  assert (select count(*) from public.leave_requests where employee_id = (select b2 from ids)) = 1, 'demande absente de l''historique';
  select * into b from public.leave_balances('2026-10-31') where employee_id = (select b2 from ids);
  -- 05/10 pointé Congé (+ demande) = 1 ; 06/10 non pointé mais demande acceptée = 1 ; total 2, pas 3
  assert b.taken = 2, format('congés pris = %s, attendu 2', b.taken);
  raise notice 'OK 6  demande de congé dans l''historique';
  raise notice 'OK 7  congé pointé + demande : une seule déduction par jour';
end $$;

-- Pointage corrigé : le 06/10 l'employé est finalement venu travailler -> plus de déduction ce jour-là
insert into public.attendance (activity_date, employee_id, status, position, team_type)
select '2026-10-06', b2, 'present', 'balayeur', 'nettoiement' from ids;
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

reset role;
\echo '=== TOUS LES TESTS SONT PASSÉS ==='
