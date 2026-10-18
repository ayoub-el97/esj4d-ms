-- =============================================================================
-- 022 — Immobilisation des camions (jours hors service) et alertes
--
--  * Statuts affichés : en_attente = « En panne », en_cours = « En réparation »,
--    repare = « Réparé », annule = « Annulé » (saisie erronée : jamais comptée).
--  * out_of_service_since : date à laquelle le camion est devenu indisponible
--    (null = problème signalé sans immobilisation). Les dossiers existants sont repris
--    avec leur date de signalement.
--  * Convention de calcul : jours calendaires, jour d'immobilisation ET jour de remise
--    en service inclus (panne et réparation le même jour = 1 jour). Panne ouverte :
--    jusqu'à aujourd'hui (fuseau Africa/Casablanca, calculé à l'affichage).
--  * Réparé : la durée finale est figée dans downtime_days (repair_date = remise en service).
--  * Correction d'un dossier déjà réparé (dates ou statut) : motif obligatoire
--    (correction_reason), conservé dans le journal d'audit.
--  * Seuils d'alerte (orange / rouge) dans les réglages, modifiables par l'administrateur.
-- =============================================================================

alter table public.truck_repairs add column if not exists out_of_service_since date;
alter table public.truck_repairs add column if not exists expected_return_date date;
alter table public.truck_repairs add column if not exists correction_reason text not null default '';

-- Reprise : les dossiers existants (hors annulés) sont considérés immobilisés dès le signalement,
-- sauf si la réparation est datée avant (saisie incohérente : on prend la date de réparation).
update public.truck_repairs
   set out_of_service_since = case when repair_date is not null and repair_date < reported_date then repair_date else reported_date end
 where out_of_service_since is null and status <> 'annule';

alter table public.truck_repairs drop constraint if exists truck_repairs_oos_dates_chk;
alter table public.truck_repairs add constraint truck_repairs_oos_dates_chk
  check (out_of_service_since is null or repair_date is null or status <> 'repare' or repair_date >= out_of_service_since);
alter table public.truck_repairs drop constraint if exists truck_repairs_expected_chk;
alter table public.truck_repairs add constraint truck_repairs_expected_chk
  check (expected_return_date is null or out_of_service_since is null or expected_return_date >= out_of_service_since);

-- Durée finale (jours calendaires inclus), figée quand le camion est réparé
alter table public.truck_repairs drop column if exists downtime_days;
alter table public.truck_repairs add column downtime_days integer
  generated always as (case when status = 'repare' and out_of_service_since is not null and repair_date is not null
                            then (repair_date - out_of_service_since) + 1 end) stored;

create index if not exists truck_repairs_oos_idx on public.truck_repairs (truck_id, out_of_service_since) where out_of_service_since is not null;

-- ---------- Correction d'un dossier réparé : motif obligatoire --------------------
create or replace function public.truck_repairs_correction_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'repare'
     and (new.status is distinct from old.status
          or new.repair_date is distinct from old.repair_date
          or new.out_of_service_since is distinct from old.out_of_service_since)
     and (length(trim(new.correction_reason)) < 5 or new.correction_reason is not distinct from old.correction_reason) then
    raise exception 'MOTIF_CORRECTION: indiquez le motif de la correction (dossier déjà réparé).';
  end if;
  return new;
end;
$$;
drop trigger if exists truck_repairs_correction on public.truck_repairs;
create trigger truck_repairs_correction before update on public.truck_repairs
  for each row execute function public.truck_repairs_correction_guard();

-- ---------- Seuils d'alerte ----------------------------------------------------------
insert into public.settings (key, value) values
  ('truck_alert_orange_days', '3'),
  ('truck_alert_red_days', '7'),
  ('truck_alert_orange_count', '3'),
  ('truck_alert_red_count', '5'),
  ('truck_alert_window_days', '30')
on conflict (key) do nothing;
