-- =============================================================================
-- 019 — Achats de matériel
--
--  * material_purchases : un achat = une ligne (jamais supprimée ; une erreur se corrige
--    ou l'achat est ANNULÉ avec un motif, ce qui le retire des totaux).
--    Montant total = quantité × prix unitaire (calculé par la base). Écart autorisé
--    uniquement par l'administrateur avec un motif (amount_adjusted + adjustment_reason).
--  * material_purchase_payments : les paiements (un ou plusieurs, à des dates
--    différentes). Payé = somme des paiements non annulés ; reste dû = total − payé ;
--    le total payé ne peut pas dépasser le montant de l'achat.
--  * Rapports : la VALEUR des achats se rattache à la date d'achat, les PAIEMENTS à leur
--    propre date (un achat payé plus tard ou en plusieurs fois apparaît correctement).
--  * Droits : nouveau module « achats ». La valeur d'énumération ajoutée ici n'est pas
--    utilisée dans ce script (exécution en une seule transaction) : les politiques
--    passent par can_view_module / can_edit_module (texte), avec des droits par défaut
--    tant qu'aucune ligne n'est enregistrée dans Paramètres › Permissions :
--    administrateur et secrétaire = lecture + modification ; lecture seule = lecture.
--  * Photos : entity_type « material_purchase » ; catégories materiel, justificatif
--    (reçus / factures), document (pièces complémentaires).
-- =============================================================================

alter type public.app_module add value if not exists 'achats';
alter type public.photo_phase add value if not exists 'materiel';
alter type public.photo_phase add value if not exists 'document';

-- ---------- Droits par nom de module (texte), avec valeurs par défaut ------------
create or replace function public.module_default_permission(p_module text, p_role text, p_edit boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_module = 'achats' then
      case p_role when 'admin' then true when 'secretaire' then true when 'lecture' then not p_edit else false end
    else false
  end;
$$;

create or replace function public.can_view_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or coalesce(
    (select rp.can_view from public.role_permissions rp where rp.role = public.user_role() and rp.module::text = p_module),
    public.module_default_permission(p_module, public.user_role()::text, false));
$$;

create or replace function public.can_edit_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or coalesce(
    (select rp.can_edit from public.role_permissions rp where rp.role = public.user_role() and rp.module::text = p_module),
    public.module_default_permission(p_module, public.user_role()::text, true));
$$;
grant execute on function public.can_view_module(text) to authenticated;
grant execute on function public.can_edit_module(text) to authenticated;

-- ---------- Achats ---------------------------------------------------------------
create table if not exists public.material_purchases (
  id                 uuid primary key default gen_random_uuid(),
  purchase_date      date not null,
  supplier_name      text not null check (length(trim(supplier_name)) > 0),
  supplier_contact   text not null default '',
  material_name      text not null check (length(trim(material_name)) > 0),
  category           text not null default 'autre' check (category in ('produits_nettoyage', 'outillage', 'equipement', 'pieces_rechange', 'vetements_protection', 'autre')),
  description        text not null default '',
  quantity           numeric(12,3) not null check (quantity > 0),
  unit               text not null default 'piece' check (unit in ('piece', 'boite', 'carton', 'kg', 'litre', 'metre', 'lot', 'autre')),
  unit_label         text not null default '',          -- précision si unité « autre »
  unit_price         numeric(12,2) not null check (unit_price >= 0),
  total_amount       numeric(14,2) not null default 0 check (total_amount >= 0),
  amount_adjusted    boolean not null default false,    -- total différent de quantité × prix (administrateur)
  adjustment_reason  text not null default '',
  payment_method     text not null default '',
  notes              text not null default '',
  cancelled          boolean not null default false,
  cancel_reason      text not null default '',
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id),
  constraint material_purchases_adjust_chk check (not amount_adjusted or length(trim(adjustment_reason)) > 0),
  constraint material_purchases_cancel_chk check (not cancelled or length(trim(cancel_reason)) > 0)
);
create index if not exists material_purchases_date_idx on public.material_purchases (purchase_date desc);
create index if not exists material_purchases_supplier_idx on public.material_purchases (lower(supplier_name));
create index if not exists material_purchases_category_idx on public.material_purchases (category);

create table if not exists public.material_purchase_payments (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references public.material_purchases (id) on delete restrict,
  payment_date   date not null,
  amount         numeric(14,2) not null check (amount > 0),
  method         text not null default '',
  note           text not null default '',
  cancelled      boolean not null default false,
  cancel_reason  text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  constraint purchase_payments_cancel_chk check (not cancelled or length(trim(cancel_reason)) > 0)
);
create index if not exists purchase_payments_purchase_idx on public.material_purchase_payments (purchase_id);
create index if not exists purchase_payments_date_idx on public.material_purchase_payments (payment_date);

-- Montant total calculé (sauf ajustement documenté par l'administrateur)
create or replace function public.material_purchase_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount_adjusted then
    if not public.is_admin() and (tg_op = 'INSERT' or not old.amount_adjusted or new.total_amount is distinct from old.total_amount) then
      raise exception 'AJUSTEMENT_RESERVE: seul l''administrateur peut ajuster le montant total d''un achat.';
    end if;
  else
    new.total_amount := round(new.quantity * new.unit_price, 2);
    new.adjustment_reason := '';
  end if;
  if new.cancelled and (tg_op = 'INSERT' or not old.cancelled) then
    new.cancelled_at := now();
  elsif not new.cancelled then
    new.cancelled_at := null;
    new.cancel_reason := '';
  end if;
  -- Le total ne peut pas descendre sous ce qui est déjà payé
  if tg_op = 'UPDATE' and new.total_amount < coalesce((select sum(p.amount) from public.material_purchase_payments p where p.purchase_id = new.id and not p.cancelled), 0) then
    raise exception 'PAIEMENT_SUPERIEUR: le montant total de l''achat ne peut pas être inférieur aux paiements déjà enregistrés.';
  end if;
  return new;
end;
$$;
drop trigger if exists material_purchases_total on public.material_purchases;
create trigger material_purchases_total before insert or update on public.material_purchases
  for each row execute function public.material_purchase_total();

-- Paiements : jamais au-delà du montant de l'achat, pas sur un achat annulé
create or replace function public.check_purchase_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_cancelled boolean;
  v_paid numeric;
begin
  select total_amount, cancelled into v_total, v_cancelled from public.material_purchases where id = new.purchase_id;
  if v_cancelled and not new.cancelled then
    raise exception 'ACHAT_ANNULE: impossible d''enregistrer un paiement sur un achat annulé.';
  end if;
  select coalesce(sum(p.amount), 0) into v_paid from public.material_purchase_payments p
   where p.purchase_id = new.purchase_id and not p.cancelled and p.id <> new.id;
  if not new.cancelled and v_paid + new.amount > v_total then
    raise exception 'PAIEMENT_SUPERIEUR: le total payé (% DH) dépasserait le montant de l''achat (% DH).', v_paid + new.amount, v_total;
  end if;
  if new.cancelled and tg_op = 'UPDATE' and not old.cancelled then
    null; -- annulation : conservée avec son motif
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_payments_check on public.material_purchase_payments;
create trigger purchase_payments_check before insert or update on public.material_purchase_payments
  for each row execute function public.check_purchase_payment();

do $$
declare t text;
begin
  foreach t in array array['material_purchases', 'material_purchase_payments']
  loop
    execute format('drop trigger if exists %I_set_audit on public.%I', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- Sécurité : lecture / modification selon le module « achats », jamais de suppression
alter table public.material_purchases enable row level security;
alter table public.material_purchase_payments enable row level security;
drop policy if exists "purchases_select" on public.material_purchases;
create policy "purchases_select" on public.material_purchases for select to authenticated using (public.can_view_module('achats'));
drop policy if exists "purchases_insert" on public.material_purchases;
create policy "purchases_insert" on public.material_purchases for insert to authenticated with check (public.can_edit_module('achats'));
drop policy if exists "purchases_update" on public.material_purchases;
create policy "purchases_update" on public.material_purchases for update to authenticated using (public.can_edit_module('achats')) with check (public.can_edit_module('achats'));
drop policy if exists "purchase_payments_select" on public.material_purchase_payments;
create policy "purchase_payments_select" on public.material_purchase_payments for select to authenticated using (public.can_view_module('achats'));
drop policy if exists "purchase_payments_insert" on public.material_purchase_payments;
create policy "purchase_payments_insert" on public.material_purchase_payments for insert to authenticated with check (public.can_edit_module('achats'));
drop policy if exists "purchase_payments_update" on public.material_purchase_payments;
create policy "purchase_payments_update" on public.material_purchase_payments for update to authenticated using (public.can_edit_module('achats')) with check (public.can_edit_module('achats'));

-- ---------- Vue de calcul : payé, reste dû, statut ------------------------------
create or replace view public.material_purchases_calc with (security_invoker = true) as
select p.*,
       coalesce(pay.paid, 0)::numeric(14,2) as amount_paid,
       (p.total_amount - coalesce(pay.paid, 0))::numeric(14,2) as amount_due,
       round(p.quantity * p.unit_price, 2) as computed_total,
       case
         when p.cancelled then 'annule'
         when coalesce(pay.paid, 0) >= p.total_amount then 'paye'
         when coalesce(pay.paid, 0) > 0 then 'partiel'
         else 'impaye'
       end as payment_status
  from public.material_purchases p
  left join (select purchase_id, sum(amount) paid from public.material_purchase_payments where not cancelled group by purchase_id) pay on pay.purchase_id = p.id;
grant select on public.material_purchases_calc to authenticated;

-- ---------- Photos : droits du module « achats » (comparaison texte) ----------------
create or replace function public.photo_can_view(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_entity = 'material_purchase' then public.can_view_module('achats') else public.can_view(public.photo_module(p_entity)) end;
$$;
create or replace function public.photo_can_edit(p_entity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_entity = 'material_purchase' then public.can_edit_module('achats') else public.can_edit(public.photo_module(p_entity)) end;
$$;
grant execute on function public.photo_can_view(text) to authenticated;
grant execute on function public.photo_can_edit(text) to authenticated;

drop policy if exists "photos_select" on public.photos;
create policy "photos_select" on public.photos for select to authenticated using (public.photo_can_view(entity_type));
drop policy if exists "photos_insert" on public.photos;
create policy "photos_insert" on public.photos for insert to authenticated with check (public.photo_can_edit(entity_type) and uploaded_by = auth.uid());
drop policy if exists "photos_delete" on public.photos;
create policy "photos_delete" on public.photos for delete to authenticated using (public.photo_can_edit(entity_type));

drop policy if exists "storage_photos_select" on storage.objects;
create policy "storage_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.photo_can_view(split_part(name, '/', 1)));
drop policy if exists "storage_photos_insert" on storage.objects;
create policy "storage_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.photo_can_edit(split_part(name, '/', 1)));
drop policy if exists "storage_photos_delete" on storage.objects;
create policy "storage_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.photo_can_edit(split_part(name, '/', 1)));

-- ---------- Journal : création / modifications d'un achat -------------------------
create or replace function public.record_audit_info(p_table text, p_ids uuid[])
returns table (
  record_id        uuid,
  created_at       timestamptz,
  created_by_email text,
  updated_at       timestamptz,
  updated_by_email text,
  photos_added     integer,
  photos_removed   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_module text;
  v_entity text;
begin
  select m, e into v_module, v_entity from (values
    ('collection_reports', 'rapport_journalier', 'collection_report'),
    ('cleaning_report_agents', 'rapport_journalier', 'cleaning_report_agent'),
    ('green_waste_entries', 'dechet_vert', 'green_waste'),
    ('work_tasks', 'programme', 'work_task'),
    ('warnings', 'avertissements', 'warning'),
    ('truck_daily_reports', 'rapport_camions', 'truck_report'),
    ('truck_repairs', 'rapport_camions', 'truck_repair'),
    ('fuel_entries', 'rapport_camions', 'fuel_entry'),
    ('material_purchases', 'achats', 'material_purchase')
  ) v(tbl, m, e) where v.tbl = p_table;
  if v_module is null then
    raise exception 'TABLE_INCONNUE: %', p_table;
  end if;
  if not public.can_view_module(v_module) and not (v_module <> 'achats' and public.can_view(v_module::public.app_module)) then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;

  return query
  select i.id,
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'INSERT' order by l.created_at limit 1),
         (select l.created_at from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select l.user_email from public.audit_log l where l.table_name = p_table and l.record_id = i.id::text and l.action = 'UPDATE' order by l.created_at desc limit 1),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'INSERT' and l.new_data ->> 'entity_type' = v_entity and l.new_data ->> 'entity_id' = i.id::text),
         (select count(*)::int from public.audit_log l where l.table_name = 'photos' and l.action = 'DELETE' and l.old_data ->> 'entity_type' = v_entity and l.old_data ->> 'entity_id' = i.id::text)
    from unnest(p_ids) as i(id);
end;
$$;

-- Historique détaillé d'un achat : quantité, prix, total, statut, paiements
create or replace function public.purchase_history(p_purchase uuid)
returns table (at timestamptz, tbl text, action text, user_email text, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_module('achats') then
    raise exception 'ACCES_REFUSE: historique non autorisé.';
  end if;
  return query
  select l.created_at, l.table_name, l.action, l.user_email, l.old_data, l.new_data
    from public.audit_log l
   where (l.table_name = 'material_purchases' and l.record_id = p_purchase::text)
      or (l.table_name = 'material_purchase_payments' and coalesce(l.new_data, l.old_data) ->> 'purchase_id' = p_purchase::text)
   order by l.created_at;
end;
$$;
grant execute on function public.purchase_history(uuid) to authenticated;
