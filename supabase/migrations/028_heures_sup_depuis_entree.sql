-- =============================================================================
-- 028 — Heures sup. automatiques calculées depuis l'heure d'entrée réelle
--
--  Règles de l'entreprise (remplacent l'heure de fin normale unique de la migration 027) :
--   * Journée standard : 8 heures à partir de l'heure d'entrée enregistrée.
--     Fin prévue = entrée + 8 h (06:00 → 14:00 ; 16:00 → 00:00 le lendemain ; 18:00 → 02:00).
--   * Sortie avant ou à la fin prévue : journée complète, 0 heure sup. automatique (rien n'est déduit).
--   * Sortie après la fin prévue : dépassement arrondi à l'heure entière supérieure
--     (30 min → 1 h ; 1 h 15 → 2 h ; 2 h → 2 h), y compris après minuit
--     (sortie plus « petite » que l'entrée = lendemain).
--   * Entrée ou sortie manquante, statut non travaillé : 0.
--   * Heures manuelles : inchangées, toujours ajoutées (total = automatique + manuel).
--  Historique : les lignes existantes ne sont PAS recalculées ; la nouvelle règle s'applique à toute
--  ligne créée, et à toute ligne dont l'heure d'entrée, de sortie ou le statut est modifié.
-- =============================================================================

create or replace function public.auto_overtime(p_time_in time, p_time_out time, p_status text)
returns numeric
language sql
immutable
as $$
  select case
    when p_time_in is null or p_time_out is null or p_status not in ('present', 'repos_travaille') then 0
    else greatest(0, ceil(
      (extract(epoch from (p_time_out - p_time_in)) + case when p_time_out < p_time_in then 86400 else 0 end - 8 * 3600) / 3600.0
    ))
  end::numeric;
$$;

create or replace function public.attendance_overtime_auto()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.time_in is distinct from old.time_in
     or new.time_out is distinct from old.time_out
     or new.status is distinct from old.status then
    new.overtime_auto := least(24, public.auto_overtime(new.time_in, new.time_out, new.status::text));
  else
    new.overtime_auto := old.overtime_auto;   -- inchangé (ex. seule la saisie manuelle a été modifiée)
  end if;
  return new;
end;
$$;

-- Ancienne règle (heure de fin unique) retirée
drop function if exists public.auto_overtime(time, time, text, integer);
drop function if exists public.normal_end_time();
delete from public.settings where key = 'normal_end_time';
