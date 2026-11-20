# Learner accounts — go-live checklist (STAGED, not live)

Branch `staging/learner-accounts` in adm-portal (+ the same branch name in integer-racer, integer-archer,
treasure-diver, island-navigator, integer-duel: one `<script>` tag each). Nothing here is live until merged.

## What it adds
- `account.html` / `account.js` — **My Account**: pick Grade → Section → Name from the Learners tab, create a
  4-digit PIN the first time (then enter it), profile picture (compressed on the phone to 320 px JPEG, ~30–90 KB),
  history grouped as Tasks (+ quiz outputs), Quizzes (score only), Games (each round + best), Integer Duel
  (wins/losses/draws + list), Log out.
- `accounts-logic.js` (helpers), `accounts-mock.js` (DEMO backend, only with `?mock=1`, sample names).
- Portal (`index.html`, `app.js`): 👤 My Account button; when logged in, Quiz and Tasks Grade/Section/Name are filled in and locked.
- Games: `adm-identity.js` fills in and locks Grade/Section/Name when logged in. Not logged in = unchanged.
- Teacher page: **👤 Accounts** tab: who has an account, last login, photo yes/no, **Reset PIN**.
- Apps Script: `Code_accounts.gs` (new file) + one routing line in `Code.gs` `doPost`.

## Privacy / security
- PIN: only a salted, 300-round SHA-256 hash in Script Properties (not the sheet). Never in a URL. 5 wrong → 15 min wait; 15 wrong in 6 h → 6 h wait.
- Session: random 64-hex token on the phone; server keeps only its hash; 120 days or until Log out / teacher reset.
- Photos: Drive folder **ADM Learner Photos (private)** in the teacher's own My Drive (not inside the shared outputs folder), files set to Private, served only to that learner's session. Never on leaderboards. Old photos are kept, never deleted.
- History never includes answers, topic breakdown or Drive links.

## Deploy steps (teacher's DepEd account, script.google.com/u/1, project "ADM Portal")
1. **+ File → Script**, name it `Code_accounts`, paste `Code_accounts.gs`.
2. In `Code.gs` `doPost`, add this line just above `if (TEACHER_ACTIONS_[d.action]) ...`:
   `if (typeof ACCOUNT_ACTIONS_ !== 'undefined' && ACCOUNT_ACTIONS_[d.action]) return out_(account_(d));`
   (or replace Code.gs with the branch copy, which only adds that line).
3. Run any function once in the editor if Google asks to re-authorize (new scope: Drive folder creation is already granted; UrlFetch already used by syncGameScores).
4. Deploy → Manage deployments → edit **ADM Portal v1** → **New version** → Deploy (same /exec URL; becomes Version 13).
5. Merge the portal branch, then the 5 game branches, push to `main`.
6. The **Accounts** tab and the private photo folder are created automatically on first use. No existing tab is renamed.

Rollback: redeploy Version 12 and revert the merge; Accounts tab, Script Properties and photos stay (nothing is deleted).
