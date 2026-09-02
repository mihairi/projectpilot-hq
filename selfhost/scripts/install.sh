#!/usr/bin/env bash
# One-shot local installation: start the stack, then load the application schema.
#   ./selfhost/scripts/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(dirname "$HERE")"
cd "$HERE"

[ -f .env ] || { echo "Missing selfhost/.env — copy .env.example and fill it in."; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

echo "==> Starting database, auth and data API"
docker compose --env-file .env up -d

echo "==> Waiting for the database"
for _ in $(seq 1 60); do
  docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Waiting for the auth service to create its own tables"
for _ in $(seq 1 60); do
  curl -sf "http://localhost:${GATEWAY_PORT:-8000}/auth/v1/health" >/dev/null 2>&1 && break
  sleep 2
done

echo "==> Applying application migrations (in order)"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$f"
done

echo "==> Granting the auth service ownership of its schema"
docker compose exec -T db psql -U postgres -d postgres -c \
  "grant all on schema auth to supabase_auth_admin; grant all on all tables in schema auth to supabase_auth_admin;"

echo
echo "Done. API gateway: http://localhost:${GATEWAY_PORT:-8000}"
echo "Next: fill .env.local in the project root, then 'bun install && bun run build && bun run start'."
