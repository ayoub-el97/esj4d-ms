-- =============================================================================
-- 041 — Période de travail et horaires par défaut ; fonctions de bureau sans heures sup.
--
--  * employees.work_period : Matin, Après-midi, Milieu de journée, Nuit (facultatif). Sert à
--    préremplir l'heure d'entrée et de sortie dans le pointage (valeurs modifiables chaque jour,
--    jamais imposées ; les pointages enregistrés ne sont pas modifiés) :
--      - mécanicien, chef d'équipe : 06:00 – 14:00 (toujours) ;
--      - gardien : Matin 06:00 – 14:00, Milieu de journée 14:00 – 22:00, Nuit 22:00 – 06:00 (lendemain) ;
--      - autres : Matin 06:00 – 14:00, Après-midi 16:00 – 00:00 (lendemain).
--    Une sortie plus « petite » que l'entrée est le lendemain (calcul des heures et des heures sup.
--    existant, migration 028) : 16:00 – 00:00 = 8 h, 22:00 – 06:00 = 8 h.
--  * Directeur, Secrétaire, Responsable : repos le dimanche (jour de repos défini s'il était vide),
--    jours fériés non travaillés (statut « Jour férié » proposé, comme pour tous) et AUCUNE heure
--    supplémentaire (automatique et manuelle remises à 0, y compris en cas de travail exceptionnel).
--  Aucun pointage existant n'est modifié.
-- =============================================================================

alter table public.employees add column if not exists work_period text;
alter table public.employees drop constraint if exists employees_work_period_chk;
alter table public.employees add constraint employees_work_period_chk check (work_period is null or work_period in ('matin', 'apres_midi', 'milieu', 'nuit'));

update public.employees set rest_day = 0
 where position::text in ('directeur', 'secretaire', 'responsable') and rest_day is null;

-- Fonctions de bureau : jamais d'heures supplémentaires (après le calcul automatique)
create or replace function public.attendance_office_no_overtime()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.position::text in ('directeur', 'secretaire', 'responsable')
     or exists (select 1 from public.employees e where e.id = new.employee_id and e.position::text in ('directeur', 'secretaire', 'responsable')) then
    new.overtime_auto := 0;
    new.overtime_manual := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_zzz_office_no_overtime on public.attendance;
create trigger attendance_zzz_office_no_overtime before insert or update on public.attendance
  for each row execute function public.attendance_office_no_overtime();
