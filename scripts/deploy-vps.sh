#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
test -f .env || { echo "Missing .env"; exit 1; }
docker compose build --pull
docker compose up -d
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "Pickle Tour is healthy."
    exit 0
  fi
  sleep 2
done
docker compose logs --tail=200 app
exit 1
