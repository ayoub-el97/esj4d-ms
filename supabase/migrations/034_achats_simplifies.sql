-- =============================================================================
-- 034 — Achats simplifiés
--
--  Saisie : date d'achat, description, catégorie, montant total (DH) saisi directement,
--  photos des achats (phase « materiel ») et de la facture / du bon (phase « justificatif »).
--  * Quantité, unité, prix unitaire, fournisseur et matériel deviennent facultatifs
--    (colonnes conservées : les achats existants gardent toutes leurs informations).
--  * Le montant total n'est plus recalculé (quantité × prix) : il est enregistré tel que saisi.
--    Les montants déjà enregistrés ne changent pas.
--  * Catégorie : liste existante + nouvelles catégories (texte libre).
--  * Les paiements déjà enregistrés sont conservés (le total ne peut toujours pas descendre
--    sous ce qui a été payé).
--  Aucune donnée n'est supprimée ni modifiée.
-- =============================================================================

alter table public.material_purchases drop constraint if exists material_purchases_supplier_name_check;
alter table public.material_purchases drop constraint if exists material_purchases_material_name_check;
alter table public.material_purchases drop constraint if exists material_purchases_quantity_check;
alter table public.material_purchases drop constraint if exists material_purchases_unit_price_check;
alter table public.material_purchases drop constraint if exists material_purchases_category_check;

alter table public.material_purchases alter column supplier_name set default '';
alter table public.material_purchases alter column material_name set default '';
alter table public.material_purchases alter column quantity drop not null;
alter table public.material_purchases alter column unit_price drop not null;

alter table public.material_purchases drop constraint if exists material_purchases_quantity_chk;
alter table public.material_purchases add constraint material_purchases_quantity_chk check (quantity is null or quantity > 0);
alter table public.material_purchases drop constraint if exists material_purchases_unit_price_chk;
alter table public.material_purchases add constraint material_purchases_unit_price_chk check (unit_price is null or unit_price >= 0);
alter table public.material_purchases drop constraint if exists material_purchases_category_chk;
alter table public.material_purchases add constraint material_purchases_category_chk check (length(trim(category)) between 1 and 60);
-- Un achat doit être identifiable : description (nouveaux achats) ou matériel (anciens achats)
alter table public.material_purchases drop constraint if exists material_purchases_label_chk;
alter table public.material_purchases add constraint material_purchases_label_chk
  check (length(trim(description)) > 0 or length(trim(material_name)) > 0) not valid;

-- Montant total : saisi directement (plus de calcul quantité × prix)
create or replace function public.material_purchase_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.total_amount is null or new.total_amount < 0 then
    raise exception 'MONTANT_INVALIDE: le montant total doit être positif.';
  end if;
  if new.cancelled and (tg_op = 'INSERT' or not old.cancelled) then
    new.cancelled_at := now();
  elsif not new.cancelled then
    new.cancelled_at := null;
    new.cancel_reason := '';
  end if;
  -- Paiements déjà enregistrés (ancien suivi) : le total ne peut pas descendre en dessous
  if tg_op = 'UPDATE' and new.total_amount < coalesce((select sum(p.amount) from public.material_purchase_payments p where p.purchase_id = new.id and not p.cancelled), 0) then
    raise exception 'PAIEMENT_SUPERIEUR: le montant total de l''achat ne peut pas être inférieur aux paiements déjà enregistrés.';
  end if;
  return new;
end;
$$;
