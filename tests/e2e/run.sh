#!/usr/bin/env bash
# Serves build/web and runs the browser e2e test against it.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 -m http.server 8080 --directory build/web >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1
node tests/e2e/game.e2e.mjs http://localhost:8080/index.html "${1:-e2e-screenshots}"
