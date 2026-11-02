#!/usr/bin/env bash
# Proves the scanner catches planted secrets and public IPs, and stays quiet on clean files.
# The fake secrets are built at run time, so nothing secret-shaped is ever committed.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
SCAN=scripts/scan-secrets.sh
fail=0
expect() { # expect <0|1> <file> <label>
  if bash "$SCAN" "$2" >/dev/null 2>&1; then got=0; else got=1; fi
  if [[ "$got" == "$1" ]]; then echo "ok   $3"; else echo "FAIL $3 (exit $got, wanted $1)"; fail=1; fi
}
key="AI""za""$(printf 'S%.0s' {1..35})"
printf 'const k = "%s";\n' "$key" > "$T/google.ts"; expect 1 "$T/google.ts" "Google API key"
printf 'OPENAI="%s"\n' "sk-""proj-$(printf 'a%.0s' {1..40})" > "$T/openai.txt"; expect 1 "$T/openai.txt" "OpenAI key"
printf '%s\nabc\n' "-----BEGIN ""RSA PRIVATE KEY-----" > "$T/key.txt"; expect 1 "$T/key.txt" "private key block"
printf 'JWT_SECRET=%s\n' "q8Zp2kLm9Xv4Rt7Wn3Bc" > "$T/settings.conf"; expect 1 "$T/settings.conf" "assigned secret"
printf 'DATABASE_URL=postgresql://app:%s@db.internal/app\n' "Sup3rS3cretPw" > "$T/db.txt"; expect 1 "$T/db.txt" "database URL with password"
printf 'HOST=%s\n' "51.""91.12.34" > "$T/server.sh"; expect 1 "$T/server.sh" "public server IP"
touch "$T/.env"; expect 1 "$T/.env" ".env file"
cat > "$T/clean.ts" <<'CLEAN'
const host = '127.0.0.1';
const lan = '192.168.1.20';
const docs = '203.0.113.7';
const version = '1.2.3';
JWT_SECRET=
POSTGRES_PASSWORD=change-me
const url = `postgresql://jobsmith:${password}@127.0.0.1:5432/jobsmith`;
CLEAN
expect 0 "$T/clean.ts" "clean file stays quiet"
printf 'const ip = "%s"; // scan-secrets: allow\n' "93.""184.215.14" > "$T/allowed.ts"; expect 0 "$T/allowed.ts" "explicitly allowed line"
exit $fail
