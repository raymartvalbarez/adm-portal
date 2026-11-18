# Publish checklist: Nov 19–20 lesson + task + quiz (STAGED, not live)

Branch: `staging/nov19-20-lessons` (local only, not pushed). Nothing here is live until Raymart approves.
Private files (teacher keys, quiz answer letters, build scripts) are NOT in this repo: `/workspace/adm-private/nov19/`.

## What publishing involves (in this order)
1. **Merge the branch into `main` and push** (`./staging/nov19-20/publish.sh`). This adds:
   - 5 student PDFs in `handouts/` (student version only, no answers),
   - 5 quizzes in `data.js` (hashed keys only), `data.js?v=20261119a` cache bump in `index.html`, one test file.
   - Merging alone opens nothing: the quizzes show as "Closed" until their schedule rows exist, and the PDFs are not linked until the task rows exist.
   - The script runs the tests, pushes, then waits until all 5 PDF URLs return HTTP 200.
2. **Append 5 rows to the `Tasks` tab** of the ADM Scoresheet (`1jDWuO1j3M2ZSKXhmM2IE_oOMjBO878X6f09RMpCVW0M`), values from `sheet_rows.json` → `tasks_tab_rows` (or `tasks_rows.tsv`). Columns A–I: Task ID, Grade, Subject, Title, Instructions, Deadline (blank), Active=Y, PDF Link (Pages URL), Opens (blank). Append only; do not edit other rows.
3. **Append 5 rows to the `Quiz Schedule` tab**, values from `sheet_rows.json` → `quiz_schedule_tab_rows` (or `quiz_schedule_rows.tsv`). Columns A–E: Subject (must match the quiz name exactly), Grade, Open=Y, Deadline (blank), Notes.
4. **Verify**: `./staging/nov19-20/verify_live.sh` (signed-out `?action=config` shows the 5 new tasks and 5 open quizzes, no deadline) and open `?view=tasks` and `?view=quiz` on a phone-size browser: Nov 19 should be the default quiz date, each task shows a PDF button.
5. **Do not touch**: existing Tasks and Quiz Schedule rows, tab names, or the Apps Script deployment. No Apps Script change is needed.

## Roll back
- Close a quiz: set Open=N on its Quiz Schedule row. Hide a task: set Active=N. Both are row edits only.
- Code rollback: `git revert` the merge commit on `main`.

## Task IDs and quiz names
| Subject | Task ID | Quiz (Quiz Schedule "Subject") | data.js id |
|---|---|---|---|
| Gr.11 General Mathematics | G11-GM-20261119-ZAREA | General Mathematics — Quiz 4 (Nov 19) | gm4 |
| Gr.11 Practical Research 1 | G11-PR1-20261119-DATA | Practical Research 1 — Quiz 4 (Nov 19) | pr14 |
| Gr.12 Practical Research 2 | G12-PR2-20261119-WMEAN | Practical Research 2 — Quiz 4 (Nov 19) | pr24 |
| Gr.12 CESC | G12-CESC-20261119-EMPADV | Community Engagement, Solidarity and Citizenship (CESC) — Quiz 4 (Nov 19) | cesc4 |
| Gr.12 Entrepreneurship | G12-ENT-20261119-PRICE | Entrepreneurship — Quiz 4 (Nov 19) | ent4 |

No deadlines. One submission per learner (enforced by the portal's existing per-learner lock). Correct answers never appear in the student PDFs, `data.js` (hashes only), or the portal.
