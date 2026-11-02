#!/usr/bin/env bash
# Scans files for secrets and public IP addresses before they reach this public repository.
#   scripts/scan-secrets.sh            scan the files staged for commit (the pre-commit hook)
#   scripts/scan-secrets.sh --all      scan every tracked file (CI)
#   scripts/scan-secrets.sh FILE...    scan the given files
# Exit 1 when anything is found. A line can be allowed on purpose by adding the comment
# "scan-secrets: allow" to it (for example a well-known public test address in a unit test).
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/..)"

if [[ "${1:-}" == "--all" ]]; then
  mapfile -t FILES < <(git ls-files)
elif [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACMR)
fi

# Files that may never be committed at all.
BLOCKED_NAMES='(^|/)(\.env|\.env\.[^/]*|deploy\.env|id_rsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|.*\.key)$'
ALLOWED_NAMES='(^|/)(\.env\.example|deploy\.env\.example)$'

# Secret shapes (extended regex). Kept specific so the scan stays quiet on ordinary code.
SECRET_PATTERNS=(
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'AKIA[0-9A-Z]{16}'
  'AIza[0-9A-Za-z_-]{35}'
  'sk-ant-[A-Za-z0-9_-]{20,}'
  'sk-(proj-)?[A-Za-z0-9_-]{32,}'
  'gh[pousr]_[A-Za-z0-9]{36,}'
  'github_pat_[A-Za-z0-9_]{40,}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'sk_live_[A-Za-z0-9]{20,}'
  'postgres(ql)?://[^:/@[:space:]]+:[^@$[:space:]]{6,}@'
  'redis://[^:@/[:space:]]*:[^@$[:space:]]{6,}@'
  '^[[:space:]]*(export[[:space:]]+)?[A-Z0-9_]*(SECRET|PASSWORD|PASS|TOKEN|API_KEY|PRIVATE_KEY|ENCRYPTION_KEY)[A-Z0-9_]*=[^[:space:]$"'"'"'{<]{12,}'
)
# Obvious placeholder passwords in example connection strings.
PLACEHOLDER_PW=':(change-me|changeme|jobsmith|password|postgres|secret|example)@'
# Addresses that are fine anywhere: loopback, private, link-local, CGNAT, documentation, multicast and unspecified.
PRIVATE_IP='^(0\.|10\.|127\.|169\.254\.|192\.0\.0\.|192\.88\.99\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|198\.1[89]\.|22[4-9]\.|2[3-5][0-9]\.)'

found=0
report() { echo "✗ $1"; found=1; }

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  if [[ "$f" =~ $BLOCKED_NAMES && ! "$f" =~ $ALLOWED_NAMES ]]; then
    report "$f: this kind of file must never be committed"
    continue
  fi
  # Text files only.
  grep -Iq . "$f" 2>/dev/null || continue
  [[ "$f" == "pnpm-lock.yaml" ]] && continue
  for p in "${SECRET_PATTERNS[@]}"; do
    while IFS= read -r hit; do
      [[ "$hit" == *"scan-secrets: allow"* ]] && continue
      [[ "$p" == postgres* || "$p" == redis* ]] && [[ "$hit" =~ $PLACEHOLDER_PW ]] && continue
      report "$f:${hit%%:*}: looks like a secret (pattern: ${p:0:40})"
    done < <(grep -nE -- "$p" "$f" 2>/dev/null || true)
  done
  # Public IPv4 addresses (a server address in a public repo gives attackers a target).
  while IFS= read -r line; do
    n="${line%%:*}"
    text="${line#*:}"
    [[ "$text" == *"scan-secrets: allow"* ]] && continue
    for ip in $(grep -oE '(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)' <<<"$text" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}'); do
      valid=1
      IFS=. read -r a b c d <<<"$ip"
      for o in "$a" "$b" "$c" "$d"; do ((10#$o <= 255)) || valid=0; done
      ((valid)) || continue
      [[ "$ip" =~ $PRIVATE_IP ]] && continue
      report "$f:$n: public IP address $ip"
    done
  done < <(grep -nE '([0-9]{1,3}\.){3}[0-9]{1,3}' "$f" 2>/dev/null || true)
done

if ((found)); then
  echo
  echo "Secret scan failed. Remove the values above (use .env or deploy.env, which are gitignored)."
  echo "If a line is a deliberate, harmless example, add the comment: scan-secrets: allow"
  exit 1
fi
echo "✓ Secret scan: ${#FILES[@]} file(s) clean"
