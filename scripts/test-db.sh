#!/usr/bin/env bash
# Teste les migrations et les règles métier sur un PostgreSQL 16 jetable (Docker requis).
# Usage (depuis la racine du projet) :  bash scripts/test-db.sh
# Les schémas Supabase « auth » et « storage » sont simulés au minimum nécessaire.
set -u
cd "$(dirname "$0")/.." || exit 2

if ! docker ps >/dev/null 2>&1; then
  echo "Docker n'est pas disponible : démarrez Docker Desktop puis relancez."
  exit 2
fi

NAME=esj4d-pgtest
docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16 >/dev/null || exit 2
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
PSQL="docker exec -i $NAME psql -U postgres -v ON_ERROR_STOP=1 -q"

echo "=== Schémas Supabase simulés"
$PSQL <<'EOF'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on storage.buckets to authenticated;
EOF

echo "=== Migrations (une seule transaction, comme l'éditeur SQL de Supabase)"
ls supabase/migrations/*.sql
cat supabase/migrations/*.sql | $PSQL --single-transaction || { echo "ÉCHEC DES MIGRATIONS"; exit 1; }
$PSQL <<'EOF'
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
EOF

echo "=== Données de démonstration"
$PSQL < supabase/seed.sql || { echo "ÉCHEC DU SEED"; exit 1; }

echo "=== Tests des règles métier"
$PSQL < supabase/tests/business_rules.sql 2>&1 | sed 's/^psql:<stdin>:[0-9]*: //'
exit "${PIPESTATUS[0]}"
