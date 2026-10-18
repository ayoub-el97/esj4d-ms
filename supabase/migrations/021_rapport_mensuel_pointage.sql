-- =============================================================================
-- 021 — Rapport mensuel de pointage (grille du 8 au 7) et nouvelles fonctions
--
--  * Nouvelles fonctions : mécanicien, gardien, directeur, « autre fonction »
--    (libellé libre employees.job_title, pour les fonctions ajoutées plus tard).
--    Elles sont pointées sur la feuille Collecte (groupes dédiés).
--  * Réglage pointage_period_start_day (8 par défaut) : la période de pointage va du
--    8 d'un mois au 7 du mois suivant ; le mois affiché est celui du début (8/09 → « Septembre »).
--  * La grille est calculée en direct depuis le Pointage (aucune double saisie).
--    Une période peut être FINALISÉE : la grille (employés, codes, totaux) est figée
--    dans attendance_period_snapshots. Toute mise à jour ultérieure crée une nouvelle
--    version avec un motif obligatoire ; les versions précédentes sont conservées
--    (aucune modification ni suppression possible) et journalisées.
-- =============================================================================

alter type public.employee_position add value if not exists 'mecanicien';
alter type public.employee_position add value if not exists 'gardien';
alter type public.employee_position add value if not exists 'directeur';
alter type public.employee_position add value if not exists 'autre';

alter table public.employees add column if not exists job_title text not null default '';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite',
                      'mecanicien', 'gardien', 'directeur', 'autre') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);

insert into public.settings (key, value) values ('pointage_period_start_day', '8') on conflict (key) do nothing;

-- ---------- Versions finalisées de la grille mensuelle ---------------------------
create table if not exists public.attendance_period_snapshots (
  id            uuid primary key default gen_random_uuid(),
  period_month  text not null check (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revision      integer not null check (revision >= 1),
  period_start  date not null,
  period_end    date not null,
  data          jsonb not null,
  reason        text not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid not null default auth.uid() references auth.users (id),
  constraint attendance_period_snapshots_range_chk check (period_end >= period_start),
  -- Une mise à jour d'une période déjà finalisée exige un motif
  constraint attendance_period_snapshots_reason_chk check (revision = 1 or length(trim(reason)) >= 5),
  constraint attendance_period_snapshots_uniq unique (period_month, revision)
);

drop trigger if exists attendance_period_snapshots_audit on public.attendance_period_snapshots;
create trigger attendance_period_snapshots_audit after insert or update or delete on public.attendance_period_snapshots
  for each row execute function public.audit_trigger();

alter table public.attendance_period_snapshots enable row level security;
drop policy if exists "attendance_period_snapshots_select" on public.attendance_period_snapshots;
create policy "attendance_period_snapshots_select" on public.attendance_period_snapshots for select to authenticated
  using (public.can_view('pointage'));
drop policy if exists "attendance_period_snapshots_insert" on public.attendance_period_snapshots;
create policy "attendance_period_snapshots_insert" on public.attendance_period_snapshots for insert to authenticated
  with check (public.can_edit('pointage') and created_by = auth.uid());
-- Pas de politique UPDATE / DELETE : les versions finalisées sont conservées telles quelles.
