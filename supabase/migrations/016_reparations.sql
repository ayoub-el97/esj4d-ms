-- =============================================================================
-- 016 — Problèmes et réparations des camions
--
--  * truck_repairs : un enregistrement par problème / réparation, toujours lié à un
--    camion existant (aucun doublon de camion). Jamais supprimé : une erreur se
--    corrige ou passe au statut « Annulé » (historique complet, même camion inactif).
--  * Dépense réelle (vue truck_repair_expenses), comptée UNE fois par réparation :
--      coût saisi > 0 ET date de réparation renseignée ET
--      ( statut En cours ou Réparé  OU  statut Annulé avec frais engagés cochés ).
--    En attente : jamais compté (coût non confirmé). Le mois de la dépense est celui
--    de la DATE DE RÉPARATION, pas celui du signalement.
--  * Photos (bucket privé « photos ») : entity_type « truck_repair », catégories
--    vehicule (camion), avant, apres, justificatif (reçus / factures).
--  * Droits : ceux du module « Rapport camions ». Journal : audit_log (création,
--    modifications du coût et du statut), lisible via repair_history().
-- =============================================================================

alter type public.photo_phase add value if not exists 'vehicule';
alter table public.trucks add column if not exists model text not null default '';

create table if not exists public.truck_repairs (
  id                   uuid primary key default gen_random_uuid(),
  truck_id             uuid not null references public.trucks (id) on delete restrict,
  reported_date        date not null,
  problem_description  text not null check (length(trim(problem_description)) > 0),
  problem_location     text not null default '',
  notes                text not null default '',
  repair_date          date,
  repair_description   text not null default '',
  status               text not null default 'en_attente' check (status in ('en_attente', 'en_cours', 'repare', 'annule')),
  cost                 numeric(12,2) check (cost >= 0),
  cancelled_expense    boolean not null default false,  -- Annulé mais frais réellement engagés
  repair_notes         text not null default '',
  created_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  -- Réparé : date de réparation et coût obligatoires (0 possible, ex. garantie)
  constraint truck_repairs_done_chk check (status <> 'repare' or (repair_date is not null and cost is not null)),
  constraint truck_repairs_dates_chk check (repair_date is null or repair_date >= reported_date)
);
create index if not exists truck_repairs_truck_idx on public.truck_repairs (truck_id, reported_date desc);
create index if not exists truck_repairs_repair_date_idx on public.truck_repairs (repair_date);
create index if not exists truck_repairs_status_idx on public.truck_repairs (status);

drop trigger if exists truck_repairs_set_audit on public.truck_repairs;
create trigger truck_repairs_set_audit before insert or update on public.truck_repairs
  for each row execute function public.set_audit_columns();
drop trigger if exists truck_repairs_audit on public.truck_repairs;
create trigger truck_repairs_audit after insert or update or delete on public.truck_repairs
  for each row execute function public.audit_trigger();

alter table public.truck_repairs enable row level security;
drop policy if exists "truck_repairs_select" on public.truck_repairs;
create policy "truck_repairs_select" on public.truck_repairs for select to authenticated using (public.can_view('rapport_camions'));
drop policy if exists "truck_repairs_insert" on public.truck_repairs;
create policy "truck_repairs_insert" on public.truck_repairs for insert to authenticated with check (public.can_edit('rapport_camions'));
drop policy if exists "truck_repairs_update" on public.truck_repairs;
create policy "truck_repairs_update" on public.truck_repairs for update to authenticated
  using (public.can_edit('rapport_camions')) with check (public.can_edit('rapport_camions'));
-- pas de politique DELETE : l'historique des réparations est conservé

-- ---------- Dépenses réelles (une ligne par réparation, jamais deux) ------------
create or replace view public.truck_repair_expenses with (security_invoker = true) as
select r.id as repair_id, r.truck_id, r.repair_date as expense_date, r.cost, r.status
  from public.truck_repairs r
 where r.cost is not null and r.cost > 0 and r.repair_date is not null
   and (r.status in ('en_cours', 'repare') or (r.status = 'annule' and r.cancelled_expense));
grant select on public.truck_repair_expenses to authenticated;

-- Dépenses par camion sur une période (date de réparation)
create or replace function public.repair_expenses_by_truck(p_from date, p_to date)
returns table (truck_id uuid, repairs integer, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select x.truck_id, count(*)::int, sum(x.cost)
    from public.truck_repair_expenses x
   where x.expense_date between p_from and p_to
   group by x.truck_id
   order by sum(x.cost) desc;
$$;
grant execute on function public.repair_expenses_by_truck(date, date) to authenticated;

-- Historique d'une réparation (journal d'audit), lisible par qui peut voir le module
create or replace function public.repair_history(p_repair uuid)
returns table (at timestamptz, action text, user_email text, old_status text, new_status text, old_cost numeric, new_cost numeric, changed text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('rapport_camions') then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.created_at, l.action, l.user_email,
         l.old_data ->> 'status', l.new_data ->> 'status',
         (l.old_data ->> 'cost')::numeric, (l.new_data ->> 'cost')::numeric,
         array(select k from jsonb_object_keys(coalesce(l.new_data, '{}'::jsonb)) k
                where k not in ('updated_at', 'updated_by', 'created_at', 'created_by')
                  and (l.old_data is null or l.old_data -> k is distinct from l.new_data -> k))
    from public.audit_log l
   where l.table_name = 'truck_repairs' and l.record_id = p_repair::text
   order by l.created_at;
end;
$$;
grant execute on function public.repair_history(uuid) to authenticated;

-- ---------- Photos : droits du module camions ---------------------------------
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    when 'fuel_entry'            then 'rapport_camions'::public.app_module
    when 'truck_repair'          then 'rapport_camions'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;
