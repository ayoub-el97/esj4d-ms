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

reset role;
\echo '=== TOUS LES TESTS SONT PASSÉS ==='
