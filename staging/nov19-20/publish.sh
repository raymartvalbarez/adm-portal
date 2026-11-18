#!/usr/bin/env bash
# STEP 1 of publishing the Nov 19-20 package. Run ONLY after Raymart approves.
# Merges the staging branch into main, runs the tests, pushes, and waits for the 5 PDFs to be live.
# Steps 2-3 (append rows to the Tasks and Quiz Schedule tabs) are done with the Sheets connector; see PUBLISH_CHECKLIST.md.
set -euo pipefail
cd "$(dirname "$0")/../.."
BR=staging/nov19-20-lessons
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || git checkout main
git pull --ff-only origin main
git merge --no-ff -m "Publish Nov 19-20 lesson + task + quiz package (5 subjects)." "$BR"
node --test tests/*.js
git push origin main
BASE=https://raymartvalbarez.github.io/adm-portal/handouts
FILES="GenMath PR1 PR2 CESC Entrep"
for i in $(seq 1 30); do
  ok=1
  for s in $FILES; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/${s}_Nov19-20_Lesson_Task_STUDENT.pdf"); [ "$code" = 200 ] || ok=0
  done
  [ $ok = 1 ] && { echo "All 5 PDFs are live."; exit 0; }
  sleep 10
done
echo "PDFs not live yet; check GitHub Pages." >&2; exit 1
