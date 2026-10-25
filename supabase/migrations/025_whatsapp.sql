-- =============================================================================
-- 025 — Envoi des rapports par WhatsApp (API officielle WhatsApp Business Cloud de Meta)
--
--  * whatsapp_config (une seule ligne) : identifiants Meta, destinataires, modèle de message.
--    AUCUNE politique RLS : lisible et modifiable uniquement par le serveur (clé service_role),
--    après vérification du rôle administrateur. Le jeton d'accès n'est jamais renvoyé au navigateur.
--    (Les variables d'environnement WHATSAPP_ACCESS_TOKEN / WHATSAPP_APP_SECRET /
--    WHATSAPP_VERIFY_TOKEN de Vercel ont priorité sur les valeurs enregistrées ici.)
--  * whatsapp_messages : journal de chaque envoi (rapport, destinataire, expéditeur, date,
--    statut, identifiant WhatsApp, erreur, nouvelle tentative). Écrit par le serveur seulement ;
--    lisible par l'administrateur et par l'expéditeur.
--  * Nouveau droit « Envoi WhatsApp » (Paramètres › Permissions) : par défaut administrateur
--    et secrétaire ; il faut aussi le droit de consulter le rapport envoyé.
-- =============================================================================

alter type public.app_module add value if not exists 'whatsapp';

create or replace function public.module_default_permission(p_module text, p_role text, p_edit boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_module = 'achats' then
      case p_role when 'admin' then true when 'secretaire' then true when 'lecture' then not p_edit else false end
    when p_module = 'whatsapp' then
      case p_role when 'admin' then true when 'secretaire' then true else false end
    else false
  end;
$$;

create table if not exists public.whatsapp_config (
  id                  smallint primary key default 1 check (id = 1),
  api_version         text not null default 'v26.0',
  phone_number_id     text not null default '',
  waba_id             text not null default '',
  access_token        text not null default '',
  app_secret          text not null default '',
  verify_token        text not null default '',
  manager_name        text not null default '',
  manager_number      text not null default '',
  extra_recipients    jsonb not null default '[]'::jsonb,   -- [{ "name": "...", "number": "212..." }]
  default_message     text not null default '',
  attach_pdf          boolean not null default true,
  send_mode           text not null default 'modele' check (send_mode in ('modele', 'session')),
  template_name       text not null default '',
  template_lang       text not null default 'fr',
  group_enabled       boolean not null default false,
  group_id            text not null default '',
  group_subject       text not null default '',
  group_invite_link   text not null default '',
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id)
);
insert into public.whatsapp_config (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_config enable row level security;
-- Pas de politique : accès serveur uniquement (service_role).

create table if not exists public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  report_kind      text not null,
  report_params    jsonb not null default '{}'::jsonb,
  report_title     text not null,
  recipient_kind   text not null check (recipient_kind in ('directeur', 'destinataire', 'groupe', 'test')),
  recipient_label  text not null default '',
  recipient        text not null,                -- numéro (chiffres, format international) ou identifiant de groupe
  message_text     text not null default '',
  with_pdf         boolean not null default false,
  send_mode        text not null default 'modele',
  status           text not null default 'envoi_en_cours' check (status in ('envoi_en_cours', 'envoye', 'remis', 'lu', 'echec')),
  wa_message_id    text,
  error            text not null default '',
  dedupe_key       text not null,
  retry_of         uuid references public.whatsapp_messages (id),
  status_at        timestamptz,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users (id),
  updated_at       timestamptz not null default now()
);
create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index if not exists whatsapp_messages_dedupe_idx on public.whatsapp_messages (dedupe_key, created_at desc);
create unique index if not exists whatsapp_messages_wa_id_uniq on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;
-- Un seul envoi en cours à la fois pour un même rapport et un même destinataire (double clic)
create unique index if not exists whatsapp_messages_inflight_uniq on public.whatsapp_messages (dedupe_key) where status = 'envoi_en_cours';

alter table public.whatsapp_messages enable row level security;
drop policy if exists "whatsapp_messages_select" on public.whatsapp_messages;
create policy "whatsapp_messages_select" on public.whatsapp_messages for select to authenticated
  using (public.is_admin() or created_by = auth.uid());
-- Écriture : serveur uniquement (service_role), après vérification des droits.
