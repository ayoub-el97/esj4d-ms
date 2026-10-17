-- =============================================================================
-- 006 — Profil de l'entreprise : logo, chefs d'équipe
-- =============================================================================

-- Chemin du logo dans le bucket public "branding" (vide = pas de logo)
insert into public.settings (key, value) values ('company_logo_path', '""')
on conflict (key) do nothing;

-- Le nom et le logo de la société s'affichent sur la page de connexion (avant authentification)
create policy "settings_select_public_branding" on public.settings
  for select to anon using (key in ('company_name', 'company_logo_path'));

-- Bucket public pour le logo (non sensible) ; écriture réservée aux administrateurs (permission "parametres")
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "storage_branding_select" on storage.objects for select to authenticated
  using (bucket_id = 'branding');
create policy "storage_branding_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.can_edit('parametres'));
create policy "storage_branding_update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.can_edit('parametres'));
create policy "storage_branding_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.can_edit('parametres'));

-- ---------- Chefs d'équipe ----------------------------------------------------
create table public.team_leads (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  team_type    public.team_type,                        -- null = les deux équipes
  phone        text not null default '',
  employee_id  uuid references public.employees (id),   -- facultatif : chef qui est aussi un employé
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id)
);

create trigger team_leads_set_audit before insert or update on public.team_leads
  for each row execute function public.set_audit_columns();
create trigger team_leads_audit after insert or update or delete on public.team_leads
  for each row execute function public.audit_trigger();

alter table public.team_leads enable row level security;
create policy "team_leads_select" on public.team_leads for select to authenticated using (true);
create policy "team_leads_write" on public.team_leads for all to authenticated
  using (public.can_edit('parametres')) with check (public.can_edit('parametres'));
