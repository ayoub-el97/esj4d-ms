-- =============================================================================
-- 004 — Photos (stockage privé), rapports journaliers, rapport camions
-- =============================================================================

create type public.photo_phase as enum ('avant', 'apres', 'justificatif');

-- ---------- Photos (table générique, une ligne par image) ---------------------
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  storage_path   text not null unique,          -- chemin dans le bucket "photos"
  entity_type    text not null,                 -- cleaning_report_agent | collection_report | warning | green_waste | work_task
  entity_id      uuid not null,
  phase          public.photo_phase not null default 'avant',
  activity_date  date,
  employee_id    uuid references public.employees (id),
  location       text not null default '',
  caption        text not null default '',
  mime_type      text not null default 'image/jpeg',
  size_bytes     integer not null default 0,
  uploaded_by    uuid references auth.users (id),
  created_at     timestamptz not null default now()
);
create index photos_entity_idx on public.photos (entity_type, entity_id, phase);
create index photos_employee_idx on public.photos (employee_id, activity_date);

-- Module responsable d'un type d'entité (pour les droits)
create or replace function public.photo_module(p_entity text)
returns public.app_module
language sql
immutable
as $$
  select case p_entity
    when 'cleaning_report_agent' then 'rapport_journalier'::public.app_module
    when 'collection_report'     then 'rapport_journalier'::public.app_module
    when 'warning'               then 'avertissements'::public.app_module
    when 'green_waste'           then 'dechet_vert'::public.app_module
    when 'work_task'             then 'programme'::public.app_module
    else 'rapport_journalier'::public.app_module
  end;
$$;

create trigger photos_day_open before insert or update or delete on public.photos
  for each row execute function public.assert_day_open();
create trigger photos_audit after insert or delete on public.photos
  for each row execute function public.audit_trigger();

alter table public.photos enable row level security;
create policy "photos_select" on public.photos for select to authenticated
  using (public.can_view(public.photo_module(entity_type)));
create policy "photos_insert" on public.photos for insert to authenticated
  with check (public.can_edit(public.photo_module(entity_type)) and uploaded_by = auth.uid());
create policy "photos_delete" on public.photos for delete to authenticated
  using (public.can_edit(public.photo_module(entity_type)));

-- Bucket privé + règles d'accès (chemin : {entity_type}/{entity_id}/{uuid}.jpg)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "storage_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_view(public.photo_module(split_part(name, '/', 1))));
create policy "storage_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_edit(public.photo_module(split_part(name, '/', 1))));
create policy "storage_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_edit(public.photo_module(split_part(name, '/', 1))));

-- ---------- Rapport journalier — Nettoiement ----------------------------------
create table public.cleaning_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null unique,
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id)
);

create table public.cleaning_report_agents (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.cleaning_reports (id) on delete cascade,
  activity_date  date not null,
  employee_id    uuid not null references public.employees (id),
  location       text not null default '',
  comment        text not null default '',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (report_id, employee_id)
);
create index cleaning_agents_employee_idx on public.cleaning_report_agents (employee_id, activity_date);

-- ---------- Rapport journalier — Collecte -------------------------------------
create table public.collection_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  chauffeur_id   uuid references public.employees (id),
  sectors        text not null default '',
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (activity_date, truck_id)
);

create table public.collection_report_rippers (
  report_id    uuid not null references public.collection_reports (id) on delete cascade,
  employee_id  uuid not null references public.employees (id),
  primary key (report_id, employee_id)
);

-- ---------- Rapport camions (suivi journalier des véhicules) -------------------
create table public.truck_daily_reports (
  id             uuid primary key default gen_random_uuid(),
  activity_date  date not null,
  truck_id       uuid not null references public.trucks (id),
  chauffeur_id   uuid references public.employees (id),
  ticket1        text not null default '',
  tonnage1       numeric(8,2),
  ticket2        text not null default '',
  tonnage2       numeric(8,2),
  dumps_count    integer not null default 0,
  rippers_count  integer not null default 0,
  km             numeric(9,1),
  fuel           numeric(8,2),
  observations   text not null default '',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  unique (activity_date, truck_id)
);
create index truck_reports_truck_idx on public.truck_daily_reports (truck_id, activity_date desc);

-- ---------- Rapport journalier global — récapitulatif nettoiement --------------
create table public.cleaning_daily_summary (
  id                uuid primary key default gen_random_uuid(),
  activity_date     date not null,
  zone              text not null default '',
  planned_headcount integer not null default 0,
  work_duration     text not null default '',
  active_count      integer not null default 0,
  sick_count        integer not null default 0,
  paid_leave_count  integer not null default 0,
  absent_count      integer not null default 0,
  holiday_count     integer not null default 0,
  rest_count        integer not null default 0,
  total_count       integer not null default 0,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id)
);
create index cleaning_summary_date_idx on public.cleaning_daily_summary (activity_date);

-- ---------- Triggers (journée ouverte, audit) -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['cleaning_reports','cleaning_report_agents','collection_reports','truck_daily_reports','cleaning_daily_summary']
  loop
    execute format('create trigger %I_day_open before insert or update or delete on public.%I for each row execute function public.assert_day_open()', t, t);
    execute format('create trigger %I_set_audit before insert or update on public.%I for each row execute function public.set_audit_columns()', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- ---------- RLS ---------------------------------------------------------------
alter table public.cleaning_reports enable row level security;
alter table public.cleaning_report_agents enable row level security;
alter table public.collection_reports enable row level security;
alter table public.collection_report_rippers enable row level security;
alter table public.truck_daily_reports enable row level security;
alter table public.cleaning_daily_summary enable row level security;

create policy "cleaning_reports_select" on public.cleaning_reports for select to authenticated using (public.can_view('rapport_journalier'));
create policy "cleaning_reports_write" on public.cleaning_reports for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "cleaning_agents_select" on public.cleaning_report_agents for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "cleaning_agents_write" on public.cleaning_report_agents for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "collection_reports_select" on public.collection_reports for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "collection_reports_write" on public.collection_reports for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "collection_rippers_select" on public.collection_report_rippers for select to authenticated using (public.can_view('rapport_journalier') or public.can_view('rapports_travailleurs'));
create policy "collection_rippers_write" on public.collection_report_rippers for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
create policy "truck_reports_select" on public.truck_daily_reports for select to authenticated using (public.can_view('rapport_camions') or public.can_view('rapport_journalier'));
create policy "truck_reports_write" on public.truck_daily_reports for all to authenticated using (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_camions') or public.can_edit('rapport_journalier'));
create policy "cleaning_summary_select" on public.cleaning_daily_summary for select to authenticated using (public.can_view('rapport_journalier'));
create policy "cleaning_summary_write" on public.cleaning_daily_summary for all to authenticated using (public.can_edit('rapport_journalier')) with check (public.can_edit('rapport_journalier'));
