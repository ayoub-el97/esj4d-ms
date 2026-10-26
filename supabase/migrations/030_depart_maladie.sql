-- =============================================================================
-- 030 — Départ anticipé pour maladie
--
--  Cas normal (inchangé) : statut travaillé = journée standard de 8 h, même en partant avant la
--  fin prévue ; heures sup. automatiques au-delà de entrée + 8 h, + heures manuelles.
--
--  Cas exceptionnel, choisi explicitement (attendance.sick_departure) :
--   * statut obligatoirement « Absent maladie » ;
--   * 0 heure standard (ce n'est pas un jour travaillé) ;
--   * heures réellement travaillées avant le départ saisies UNIQUEMENT en heures sup. manuelles
--     (overtime_manual) ; aucune heure sup. automatique ;
--   * heure d'entrée, heure de départ, heures et commentaire (observation) conservés.
--  Les autres statuts non travaillés gardent leur règle : heures effacées.
--  Aucune ligne existante n'est modifiée.
-- =============================================================================

alter table public.attendance add column if not exists sick_departure boolean not null default false;
alter table public.attendance drop constraint if exists attendance_sick_departure_chk;
alter table public.attendance add constraint attendance_sick_departure_chk
  check (not sick_departure or status = 'absent_maladie');

create or replace function public.clear_times_when_not_worked()
returns trigger
language plpgsql
as $$
begin
  -- L'option ne vaut que pour « Absent maladie » (changement de statut : option retirée)
  if new.status::text <> 'absent_maladie' then
    new.sick_departure := false;
  end if;
  if new.status::text = 'absent_maladie' and new.sick_departure then
    -- Départ anticipé pour maladie : heures conservées, comptées seulement en heures sup. manuelles
    new.overtime_auto := 0;
  elsif new.status::text not in ('present', 'repos_travaille') then
    new.sick_departure := false;
    new.time_in := null;
    new.time_out := null;
    new.overtime_manual := 0;
    new.overtime_auto := 0;
  end if;
  return new;
end;
$$;
