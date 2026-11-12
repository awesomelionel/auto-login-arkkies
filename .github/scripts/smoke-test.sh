#!/usr/bin/env bash
# Checks a deployed Worker without an Arkkies login.
# WORKER_PUBLIC_URL overrides the default. Empty means the default.
set -euo pipefail

BASE="${WORKER_PUBLIC_URL:-https://gymtime.linotan.com}"
BASE="${BASE%/}"

case "$BASE" in
  https://*) ;;
  *)
    echo "WORKER_PUBLIC_URL must be an https URL."
    exit 1
    ;;
esac

echo "Smoke testing ${BASE}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
body="${workdir}/body"

# Retries cover the previous version still answering while the new one rolls out.
# A wrong status or body still fails the job after the last attempt.
try_check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  local kind="$4"
  local attempt code

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    code="000"
    if code="$(curl -sS --max-time 25 -o "$body" -w "%{http_code}" "$url")"; then
      :
    else
      code="000"
    fi

    if [[ "$code" == "$expect" ]]; then
      if [[ "$kind" == "html" ]]; then
        if grep -q "Arkkies Auto Login" "$body"; then
          echo "OK ${name} ${code}"
          return 0
        fi
        echo "Attempt ${attempt}: ${name} returned ${code} without the page."
      elif [[ "$kind" == "json" ]]; then
        if node --input-type=module -e 'import fs from "node:fs"; const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (data === null || typeof data !== "object" || Array.isArray(data)) process.exit(1);' "$body"; then
          echo "OK ${name} ${code}"
          return 0
        fi
        echo "Attempt ${attempt}: ${name} returned ${code} but the body was not a JSON object."
      else
        echo "OK ${name} ${code}"
        return 0
      fi
    else
      echo "Attempt ${attempt}: ${name} returned ${code}, expected ${expect}."
    fi
    sleep 5
  done

  echo "FAILED ${name} ${url}"
  exit 1
}

try_check "GET /" "${BASE}/" "200" "html"
try_check "GET /api/gyms" "${BASE}/api/gyms" "200" "json"
try_check "GET /api/status" "${BASE}/api/status" "405" "status"
echo "Smoke test passed."
