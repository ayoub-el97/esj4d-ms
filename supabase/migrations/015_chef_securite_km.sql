-- =============================================================================
-- 015 — Chef d'équipe et agents de sécurité pointés ; km départ / km fin
--
--  * Postes « chef_equipe » et « agent_securite » (équipe Collecte) : pointés sur la
--    feuille de la collecte (chef d'équipe en tête), mêmes règles que les autres.
--  * Rapport camions : kilométrage de départ et de fin ; km parcourus = fin − départ.
--
-- Nouvelles valeurs d'énumération comparées en texte (position::text) : le script
-- s'exécute en une seule transaction.
-- =============================================================================

alter type public.employee_position add value if not exists 'chef_equipe';
alter type public.employee_position add value if not exists 'agent_securite';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

alter table public.truck_daily_reports add column if not exists km_start numeric(9,1) check (km_start >= 0);
alter table public.truck_daily_reports add column if not exists km_end numeric(9,1) check (km_end >= 0);
alter table public.truck_daily_reports drop constraint if exists truck_reports_km_order_chk;
alter table public.truck_daily_reports add constraint truck_reports_km_order_chk check (km_start is null or km_end is null or km_end >= km_start);

-- km parcourus calculé automatiquement quand départ et fin sont saisis
create or replace function public.truck_report_km()
returns trigger
language plpgsql
as $$
begin
  if new.km_start is not null and new.km_end is not null then
    new.km := new.km_end - new.km_start;
  end if;
  return new;
end;
$$;
drop trigger if exists truck_reports_km on public.truck_daily_reports;
create trigger truck_reports_km before insert or update on public.truck_daily_reports
  for each row execute function public.truck_report_km();
