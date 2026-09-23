#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U pickle -d pickle -Fc > "backups/pickle-$STAMP.dump"
find backups -type f -name 'pickle-*.dump' -mtime +14 -delete
echo "backups/pickle-$STAMP.dump"
