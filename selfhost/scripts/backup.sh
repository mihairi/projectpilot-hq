#!/usr/bin/env bash
# Nightly-friendly backup of the whole local database into selfhost/backups/.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose exec -T db pg_dump -U postgres -Fc postgres > "backups/portal-$STAMP.dump"
echo "Wrote backups/portal-$STAMP.dump"
echo "Restore with: docker compose exec -T db pg_restore -U postgres -d postgres --clean < <file>"
