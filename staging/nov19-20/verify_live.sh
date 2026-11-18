#!/usr/bin/env bash
# Signed-out check of the live config after the sheet rows are added.
URL=$(grep -o 'https://script[^"]*' "$(dirname "$0")/../../config.js" | head -1)
curl -sL "$URL?action=config" | python3 -c '
import json,sys
j=json.load(sys.stdin)
want=["G11-GM-20261119-ZAREA","G11-PR1-20261119-DATA","G12-PR2-20261119-WMEAN","G12-CESC-20261119-EMPADV","G12-ENT-20261119-PRICE"]
have={t["id"]:t for t in j["tasks"]}
for w in want: print("task",w,"OK" if w in have and not have[w].get("deadline") else "MISSING/DEADLINE")
qs=[q for q in j["quizzes"] if "Quiz 4 (Nov 19)" in q["subject"]]
for q in qs: print("quiz",q["subject"],"open" if q["open"] and not q["deadline"] else "NOT OPEN")
print(len(qs),"of 5 quizzes found")'
