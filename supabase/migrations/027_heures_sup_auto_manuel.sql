-- =============================================================================
-- 027 — Heures supplémentaires : automatique + manuel (toujours additionnés)
--
--  * attendance.overtime_manual : heures saisies par le responsable (ancienne colonne « HS »,
--    valeurs existantes reprises telles quelles).
--  * attendance.overtime_auto : calculé par la base depuis l'heure de sortie réelle et l'heure de
--    fin normale de l'entreprise (réglage normal_end_time, « HH:MM », vide = calcul désactivé).
--    Règle de l'entreprise : chaque demi-heure entamée après l'heure de fin normale compte 0,5 h.
--    Seulement pour un statut travaillé (Présent, Repos travaillé) et le 1er service du jour.
--    Recalculé uniquement quand l'heure de sortie (ou le statut / le service) change : la saisie
--    manuelle n'est jamais modifiée, et un changement ultérieur de l'heure de fin normale ne
--    réécrit pas l'historique.
--  * attendance.overtime_hours devient le TOTAL = automatique + manuel (colonne calculée) : tous les
--    totaux existants (synthèse mensuelle, rapports travailleurs…) additionnent donc les deux.
--  * Lignes existantes : automatique = 0 (le réglage est vide à l'installation) → totaux inchangés.
-- =============================================================================

insert into public.settings (key, value) values ('normal_end_time', '""') on conflict (key) do nothing;

alter table public.attendance add column if not exists overtime_manual numeric(5,2) not null default 0;
alter table public.attendance add column if not exists overtime_auto numeric(5,2) not null default 0;

-- Reprise des heures déjà saisies (déclencheurs suspendus : journées clôturées et journal non concernés)
alter table public.attendance disable trigger user;
update public.attendance set overtime_manual = overtime_hours where overtime_manual = 0 and overtime_hours <> 0;
alter table public.attendance enable trigger user;

alter table public.attendance drop constraint if exists attendance_overtime_manual_chk;
alter table public.attendance add constraint attendance_overtime_manual_chk check (overtime_manual >= 0 and overtime_manual <= 24);
alter table public.attendance drop constraint if exists attendance_overtime_auto_chk;
alter table public.attendance add constraint attendance_overtime_auto_chk check (overtime_auto >= 0 and overtime_auto <= 24);

alter table public.attendance drop column overtime_hours;
alter table public.attendance add column overtime_hours numeric(6,2) generated always as (overtime_manual + overtime_auto) stored;

-- Heure de fin normale (réglage), null si non configurée
create or replace function public.normal_end_time()
returns time
language sql
stable
security definer
set search_path = public
as $$
  select case when (value #>> '{}') ~ '^\d{1,2}:\d{2}$' then (value #>> '{}')::time end
    from public.settings where key = 'normal_end_time';
$$;

-- Calcul : demi-heures entamées après l'heure de fin normale
create or replace function public.auto_overtime(p_time_out time, p_end time, p_status text, p_shift integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_time_out is null or p_end is null or p_shift <> 1 or p_status not in ('present', 'repos_travaille') or p_time_out <= p_end then 0
    else ceil(extract(epoch from (p_time_out - p_end)) / 1800.0) * 0.5
  end::numeric;
$$;

-- Statut non travaillé : pas d'heures (ni sortie, ni heures sup.)
create or replace function public.clear_times_when_not_worked()
returns trigger
language plpgsql
as $$
begin
  if new.status::text not in ('present', 'repos_travaille') then
    new.time_in := null;
    new.time_out := null;
    new.overtime_manual := 0;
    new.overtime_auto := 0;
  end if;
  return new;
end;
$$;

-- Composante automatique : calculée par la base, jamais saisie par le navigateur.
-- (Nom en « zz » : s'exécute après attendance_clear_times.)
create or replace function public.attendance_overtime_auto()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     or new.time_out is distinct from old.time_out
     or new.status is distinct from old.status
     or new.shift is distinct from old.shift then
    new.overtime_auto := least(24, public.auto_overtime(new.time_out, public.normal_end_time(), new.status::text, new.shift));
  else
    new.overtime_auto := old.overtime_auto;   -- inchangé (ex. seule la saisie manuelle a été modifiée)
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_zz_overtime_auto on public.attendance;
create trigger attendance_zz_overtime_auto before insert or update on public.attendance
  for each row execute function public.attendance_overtime_auto();
