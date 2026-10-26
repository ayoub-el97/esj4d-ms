-- =============================================================================
-- 032 — Rappels récurrents (une fois, chaque jour, chaque semaine, jours choisis, chaque mois)
--
--  * reminders : fréquence, jours de la semaine (0 = dimanche … 6 = samedi), jour du mois,
--    heure (facultative), date de début (remind_date), date de fin, pause, priorité,
--    report (snoozed_until). Les rappels existants deviennent des rappels « une fois » (inchangés).
--  * reminder_completions : chaque occurrence terminée (date de l'occurrence, qui, quand).
--    Terminer une occurrence d'un rappel récurrent ne désactive jamais les suivantes.
--    Les rappels déjà marqués « faits » sont repris comme occurrence terminée.
--  * Les occurrences non terminées restent dues (« en retard ») jusqu'à ce qu'elles soient
--    terminées, même si l'application n'a pas été ouverte le jour prévu.
--  Fuseau : Africa/Casablanca (calcul effectué par l'application à l'ouverture).
-- =============================================================================

alter table public.reminders add column if not exists frequency text not null default 'once';
alter table public.reminders add column if not exists weekdays smallint[] not null default '{}';
alter table public.reminders add column if not exists month_day smallint;
alter table public.reminders add column if not exists remind_time time;
alter table public.reminders add column if not exists end_date date;
alter table public.reminders add column if not exists paused boolean not null default false;
alter table public.reminders add column if not exists priority text not null default 'normal';
alter table public.reminders add column if not exists snoozed_until date;

alter table public.reminders drop constraint if exists reminders_frequency_chk;
alter table public.reminders add constraint reminders_frequency_chk check (frequency in ('once', 'daily', 'weekly', 'weekdays', 'monthly'));
alter table public.reminders drop constraint if exists reminders_priority_chk;
alter table public.reminders add constraint reminders_priority_chk check (priority in ('normal', 'important', 'urgent'));
alter table public.reminders drop constraint if exists reminders_weekdays_chk;
alter table public.reminders add constraint reminders_weekdays_chk check (
  weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  and (frequency not in ('weekly', 'weekdays') or cardinality(weekdays) >= 1)
  and (frequency <> 'weekly' or cardinality(weekdays) = 1)
);
alter table public.reminders drop constraint if exists reminders_month_day_chk;
alter table public.reminders add constraint reminders_month_day_chk check ((month_day is null or month_day between 1 and 31) and (frequency <> 'monthly' or month_day is not null));
alter table public.reminders drop constraint if exists reminders_end_chk;
alter table public.reminders add constraint reminders_end_chk check (end_date is null or end_date >= remind_date);

-- ---------- Occurrences terminées ---------------------------------------------------
create table if not exists public.reminder_completions (
  id               uuid primary key default gen_random_uuid(),
  reminder_id      uuid not null references public.reminders (id) on delete cascade,
  occurrence_date  date not null,
  done_at          timestamptz not null default now(),
  done_by          uuid not null default auth.uid() references auth.users (id),
  constraint reminder_completions_uniq unique (reminder_id, occurrence_date)
);
create index if not exists reminder_completions_reminder_idx on public.reminder_completions (reminder_id, occurrence_date desc);

drop trigger if exists reminder_completions_audit on public.reminder_completions;
create trigger reminder_completions_audit after insert or update or delete on public.reminder_completions
  for each row execute function public.audit_trigger();

alter table public.reminder_completions enable row level security;
-- Visible / terminable par quiconque voit le rappel (le sien ou un rappel partagé)
drop policy if exists "reminder_completions_select" on public.reminder_completions;
create policy "reminder_completions_select" on public.reminder_completions for select to authenticated
  using (exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or r.shared)));
drop policy if exists "reminder_completions_insert" on public.reminder_completions;
create policy "reminder_completions_insert" on public.reminder_completions for insert to authenticated
  with check (done_by = auth.uid() and exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or r.shared)));
-- Annuler une occurrence terminée : celui qui l'a terminée, l'auteur du rappel, ou l'administrateur (rappel partagé)
drop policy if exists "reminder_completions_delete" on public.reminder_completions;
create policy "reminder_completions_delete" on public.reminder_completions for delete to authenticated
  using (done_by = auth.uid() or exists (select 1 from public.reminders r where r.id = reminder_id and (r.created_by = auth.uid() or (r.shared and public.is_admin()))));
grant select, insert, delete on public.reminder_completions to authenticated;

-- Reprise : rappels déjà « faits » → occurrence terminée (journal désactivé pour la reprise)
alter table public.reminder_completions disable trigger user;
insert into public.reminder_completions (reminder_id, occurrence_date, done_at, done_by)
select r.id, r.remind_date, r.done_at, coalesce(r.done_by, r.created_by)
  from public.reminders r
 where r.done_at is not null
on conflict (reminder_id, occurrence_date) do nothing;
alter table public.reminder_completions enable trigger user;
