#!/usr/bin/env sh
set -eu
[ "$#" -eq 1 ] || { echo "Usage: $0 backups/file.dump"; exit 1; }
cd "$(dirname "$0")/.."
FILE="$1"
test -f "$FILE" || { echo "Backup not found: $FILE"; exit 1; }
docker compose exec -T db pg_restore -U pickle -d pickle --clean --if-exists < "$FILE"
echo "Restore complete."
