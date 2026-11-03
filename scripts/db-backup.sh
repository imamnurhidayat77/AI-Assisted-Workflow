#!/bin/sh
# Backup Postgres (data + skema) ke ./backups dengan cap waktu.
# Pakai DATABASE_URL dari apps/api/.env (atau env yang sudah di-export).
# Jalankan: npm run db:backup
set -eu
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ]; then
  # shellcheck disable=SC1091
  if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL tidak ditemukan (apps/api/.env / env)" >&2
  exit 1
fi
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/streetsmart-$STAMP.sql"
# DATABASE_URL menunjuk ke Neon — pg_dump bekerja langsung ke connection string.
pg_dump "$DATABASE_URL" > "$OUT"
echo "backup tersimpan: $OUT ($(wc -l < "$OUT") baris)"
