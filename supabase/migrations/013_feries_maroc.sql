-- =============================================================================
-- 013 — Calendrier des jours fériés du Maroc (synchronisation)
--   sync_key  : identifiant du férié synchronisé (ex. « 2026:fitr:1 »), unique ;
--               vide pour un férié saisi à la main.
--   estimated : date estimée (fêtes religieuses, calendrier lunaire) à confirmer
--               à l'annonce officielle ; une resynchronisation ne modifie jamais
--               une date confirmée.
-- =============================================================================
alter table public.holidays add column if not exists estimated boolean not null default false;
alter table public.holidays add column if not exists sync_key text;
create unique index if not exists holidays_sync_key_uniq on public.holidays (sync_key) where sync_key is not null;
