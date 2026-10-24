-- =============================================================================
-- 023 — Mise en route du pilote (aucune donnée ajoutée, aucune donnée supprimée)
--
--  * Coordonnées de l'entreprise (réglages) : adresse, téléphone, e-mail,
--    identifiants légaux (ICE, RC, IF…) — affichées dans les en-têtes des PDF.
--  * Employés : horaire habituel (texte libre, informatif ; aucun calcul n'en dépend).
--  * Camions : numéro interne (unique s'il est renseigné) et type de camion.
-- =============================================================================

insert into public.settings (key, value) values
  ('company_address', '""'),
  ('company_phone', '""'),
  ('company_email', '""'),
  ('company_legal', '""')
on conflict (key) do nothing;

alter table public.employees add column if not exists work_schedule text not null default '';

alter table public.trucks add column if not exists internal_number text not null default '';
alter table public.trucks add column if not exists truck_type text not null default '';
create unique index if not exists trucks_internal_number_uniq on public.trucks (lower(internal_number)) where internal_number <> '';
