-- =============================================================================
-- 008 — Remplaçants : chauffeur remplaçant, rippeur remplaçant
--
--  * Deux nouveaux postes (équipe Collecte) : chauffeur_remplacant, rippeur_remplacant.
--  * Chaque chauffeur peut avoir un chauffeur remplaçant attitré, chaque rippeur un
--    rippeur remplaçant attitré (colonne substitute_id). Le remplaçant couvre le
--    titulaire pendant ses jours de repos ; la feuille de présence le propose
--    automatiquement.
--  * Un même remplaçant peut couvrir plusieurs titulaires (jours de repos différents).
--
-- Les nouvelles valeurs d'énumération sont comparées en texte (position::text)
-- pour que ce script puisse s'exécuter en une seule transaction.
-- =============================================================================

alter type public.employee_position add value if not exists 'chauffeur_remplacant';
alter type public.employee_position add value if not exists 'rippeur_remplacant';

-- Équipe déduite du poste : les remplaçants appartiennent à la Collecte
alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

-- Remplaçant attitré
alter table public.employees add column if not exists substitute_id uuid references public.employees (id);
alter table public.employees drop constraint if exists employees_substitute_not_self;
alter table public.employees add constraint employees_substitute_not_self check (substitute_id is null or substitute_id <> id);
create index if not exists employees_substitute_idx on public.employees (substitute_id);

-- Le remplaçant doit avoir le bon poste : chauffeur -> chauffeur remplaçant, rippeur -> rippeur remplaçant
create or replace function public.check_employee_substitute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sub_position text;
begin
  if new.position::text not in ('chauffeur', 'rippeur') then
    new.substitute_id := null;
    return new;
  end if;
  if new.substitute_id is null then
    return new;
  end if;
  select position::text into v_sub_position from public.employees where id = new.substitute_id;
  if v_sub_position is distinct from (new.position::text || '_remplacant') then
    raise exception 'REMPLACANT_INVALIDE: le remplaçant d''un % doit avoir le poste « % remplaçant ».', new.position::text, new.position::text;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_check_substitute on public.employees;
create trigger employees_check_substitute before insert or update of position, substitute_id on public.employees
  for each row execute function public.check_employee_substitute();
