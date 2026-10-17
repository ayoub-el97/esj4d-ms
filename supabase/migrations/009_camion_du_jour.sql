-- =============================================================================
-- 009 — Camion du jour dans le pointage
--
-- Les camions sont parfois échangés : le pointage enregistre, pour chaque
-- chauffeur (titulaire ou remplaçant), le camion réellement conduit ce jour-là.
-- Le rapport journalier de collecte et le rapport camions utilisent ce camion.
-- Le camion habituel reste défini dans la fiche du chauffeur (employees.truck_id).
-- =============================================================================

alter table public.attendance add column if not exists truck_id uuid references public.trucks (id);
create index if not exists attendance_truck_idx on public.attendance (activity_date, truck_id);

-- Rapport journalier nettoiement rempli automatiquement depuis le pointage :
--  * manual   : agent ajouté à la main au rapport (jamais retiré par la mise à jour automatique)
--  * excluded : agent retiré à la main du rapport (jamais réajouté par la mise à jour automatique)
-- Le pointage d'origine n'est jamais modifié par ces choix.
alter table public.cleaning_report_agents add column if not exists manual boolean not null default false;
alter table public.cleaning_report_agents add column if not exists excluded boolean not null default false;
