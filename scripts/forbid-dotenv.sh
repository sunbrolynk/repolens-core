#!/usr/bin/env bash
# Block any real .env from being committed. Only .env.example is allowed.
# Defense-in-depth behind .gitignore: catches a forced `git add -f`.
set -euo pipefail

staged="$(git diff --cached --name-only --diff-filter=AM \
  | grep -E '(^|/)\.env(\.|$)' \
  | grep -vE '\.env\.example$' || true)"

if [ -n "$staged" ]; then
  echo "BLOCKED: refusing to commit env file(s):"
  echo "$staged"
  echo "Only .env.example may be committed."
  exit 1
fi
