#!/bin/bash
# Wrapper for scripts/publish-uploads.js
# Usage: ADM_TEACHER_PIN=123456 scripts/publish-uploads.sh [--dry-run] [--commit]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/publish-uploads.js" "$@"
