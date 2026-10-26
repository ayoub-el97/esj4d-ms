-- =============================================================================
-- Pilote — 3. RETIRER UNIQUEMENT LES DONNÉES DE DÉMONSTRATION
--
-- Ne touche PAS aux employés réels, à leurs pointages ni aux autres données.
-- Données de démonstration (supabase/seed.sql) reconnues par le matricule ET le nom :
--   employés C001… C003, R001… R006, CR01, RR01, B001… B005 (16 au total) ;
--   camions 77027-A-1, 77035-A-1, 77041-A-1 (marque BOM).
-- Un employé réel qui aurait un de ces matricules mais un autre nom n'est jamais supprimé.
--
-- ÉTAPE A (lecture seule) : exécutez uniquement la requête A et lisez la liste.
-- ÉTAPE B : remplacez NON par OUI-RETIRER-DEMO (ligne v_confirmation), puis exécutez le bloc B.
--   * enregistrements propres aux données de démo (leurs pointages, rapports, pleins…) : supprimés ;
--   * liens depuis des données réelles (ex. rippeur réel rattaché à un chauffeur de démo,
--     employé réel avec un camion de démo) : seulement retirés (mis à vide), la donnée réelle reste.
--   Tout se fait en une seule instruction : en cas d'erreur, rien n'est modifié.
-- =============================================================================

-- ---------- A. Ce qui serait retiré (lecture seule) ----------------------------------
with demo_emp(matricule, last_name, first_name) as (values
  ('C001','Alami','Youssef'), ('C002','Benani','Karim'), ('C003','Idrissi','Hamid'),
  ('R001','Tazi','Omar'), ('R002','Fassi','Said'), ('R003','Chraibi','Adil'), ('R004','Lahlou','Rachid'), ('R005','Berrada','Nabil'), ('R006','Ouazzani','Mehdi'),
  ('CR01','Naciri','Hassan'), ('RR01','Kettani','Yassine'),
  ('B001','El Amrani','Fatima'), ('B002','Haddad','Khadija'), ('B003','Mansouri','Ahmed'), ('B004','Ziani','Mustapha'), ('B005','Rahmani','Salma'))
select 'Employé de démo' as type, e.matricule, e.last_name || ' ' || e.first_name as nom,
       (select count(*) from public.attendance a where a.employee_id = e.id) as pointages,
       (select count(*) from public.cleaning_report_agents c where c.employee_id = e.id) as rapports_nettoiement,
       (select count(*) from public.leave_requests l where l.employee_id = e.id) as conges
  from public.employees e
  join demo_emp d on d.matricule = e.matricule and lower(d.last_name) = lower(e.last_name) and lower(d.first_name) = lower(e.first_name)
union all
select 'Camion de démo', t.matricule, t.brand,
       (select count(*) from public.truck_daily_reports r where r.truck_id = t.id),
       (select count(*) from public.fuel_entries f where f.truck_id = t.id),
       (select count(*) from public.employees x where x.truck_id = t.id)
  from public.trucks t
 where t.matricule in ('77027-A-1','77035-A-1','77041-A-1') and t.brand = 'BOM'
union all
select 'Employé conservé (matricule de démo, autre nom)', e.matricule, e.last_name || ' ' || e.first_name, null, null, null
  from public.employees e
 where e.matricule in ('C001','C002','C003','R001','R002','R003','R004','R005','R006','CR01','RR01','B001','B002','B003','B004','B005')
   and not exists (select 1 from demo_emp d where d.matricule = e.matricule and lower(d.last_name) = lower(e.last_name) and lower(d.first_name) = lower(e.first_name))
order by 1, 2;
-- Colonnes pour les camions : lignes rapport camions | pleins | employés qui l'ont comme camion attitré.

-- ---------- B. Retrait (après lecture de A) --------------------------------------------
do $$
declare
  v_confirmation text := 'NON';   -- ← remplacer par OUI-RETIRER-DEMO pour confirmer
  v_emp uuid[];
  v_trk uuid[];
  fk record;
  v_nullable boolean;
  v_target text;
  v_ids uuid[];
  n bigint;
  v_log jsonb := '{}'::jsonb;
begin
  if v_confirmation <> 'OUI-RETIRER-DEMO' then
    raise exception 'Retrait NON confirmé : remplacez NON par OUI-RETIRER-DEMO (ligne v_confirmation) après avoir lu le résultat de la requête A.';
  end if;

  select coalesce(array_agg(e.id), '{}') into v_emp
    from public.employees e
    join (values
      ('C001','Alami','Youssef'), ('C002','Benani','Karim'), ('C003','Idrissi','Hamid'),
      ('R001','Tazi','Omar'), ('R002','Fassi','Said'), ('R003','Chraibi','Adil'), ('R004','Lahlou','Rachid'), ('R005','Berrada','Nabil'), ('R006','Ouazzani','Mehdi'),
      ('CR01','Naciri','Hassan'), ('RR01','Kettani','Yassine'),
      ('B001','El Amrani','Fatima'), ('B002','Haddad','Khadija'), ('B003','Mansouri','Ahmed'), ('B004','Ziani','Mustapha'), ('B005','Rahmani','Salma')
    ) d(matricule, last_name, first_name) on d.matricule = e.matricule and lower(d.last_name) = lower(e.last_name) and lower(d.first_name) = lower(e.first_name);
  select coalesce(array_agg(t.id), '{}') into v_trk from public.trucks t where t.matricule in ('77027-A-1','77035-A-1','77041-A-1') and t.brand = 'BOM';

  -- Congés acceptés des employés de démo : annulés d'abord (la protection des congés libère leurs pointages)
  update public.leave_requests set status = 'annulee', decision_note = 'Retrait des données de démonstration'
   where employee_id = any (v_emp) and status::text = 'acceptee';

  -- Toutes les clés étrangères vers employees et trucks (lues dans le catalogue) :
  -- colonne facultative → lien retiré ; colonne obligatoire → la ligne appartient à la démo : supprimée.
  -- Plusieurs passes, pour supprimer les lignes enfants avant leurs parents.
  for pass in 1..4 loop
    for fk in
      select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull, c.confrelid::regclass::text as target
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid in ('public.employees'::regclass, 'public.trucks'::regclass)
    loop
      v_ids := case when fk.target in ('employees', 'public.employees') then v_emp else v_trk end;
      if cardinality(v_ids) = 0 then continue; end if;
      -- Liens entre fiches employés : toujours retirés (les fiches de démo sont supprimées à la fin)
      if fk.tbl in ('employees', 'public.employees') or not fk.notnull then
        execute format('update %s set %I = null where %I = any ($1)', fk.tbl, fk.col, fk.col) using v_ids;
      else
        begin
          execute format('delete from %s where %I = any ($1)', fk.tbl, fk.col) using v_ids;
          get diagnostics n = row_count;
          if n > 0 then v_log := v_log || jsonb_build_object(fk.tbl || '.' || fk.col, coalesce((v_log ->> (fk.tbl || '.' || fk.col))::bigint, 0) + n); end if;
        exception when foreign_key_violation then
          null;   -- des lignes enfants restent : supprimées à la passe suivante
        end;
      end if;
    end loop;
  end loop;

  delete from public.employees where id = any (v_emp);
  get diagnostics n = row_count;
  v_log := v_log || jsonb_build_object('employes_demo', n);
  delete from public.trucks where id = any (v_trk);
  get diagnostics n = row_count;
  v_log := v_log || jsonb_build_object('camions_demo', n);

  insert into public.audit_log (table_name, record_id, action, new_data, user_email)
  values ('pilote', 'retrait-demo', 'DELETE', jsonb_build_object('supprime', v_log, 'date', now()), 'SQL Editor');
  raise notice 'Données de démonstration retirées : %', v_log;
end $$;
