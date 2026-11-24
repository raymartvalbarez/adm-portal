# Open Integer Racer, Integer Archer, and Treasure Diver (Nov 25, 2026)

This is the playbook for the one-off 12:00 AM Asia/Manila routine on Wednesday, 25 November 2026. Everything below is already committed locally and must **not** be pushed before that time. Pushing tonight (24 November) would open the games early.

Do **not** run `scripts/games.sh`. That script opens or closes all four daily games, including Island Navigator, which must stay exactly as it is. Integer Duel is also already open and must not be edited.

Do **not** touch quizzes, tasks, Apps Script, or Sheets.

## 1. Confirm the date is 25 November in Manila

```bash
TZ=Asia/Manila date '+%Y-%m-%d %H:%M %Z'
```

The output must start with `2026-11-25`. If the date is still `2026-11-24`, **stop**. Do not push.

## 2. Local commits already prepared (push these; do not amend or rewrite history)

| Repo | Local SHA | Message |
| --- | --- | --- |
| integer-racer | `37471ed2a7a0c536f9a4584a3e955ed6e7f16fd1` | Start a fresh Nov. 25 round: new score namespace, Nov. 25 window and headers, 1 try per learner; keep Nov 18 and earlier scores read-only on the leaderboard. |
| integer-archer | `fc940dc24aa030cec6014b2bee97f677868b5d13` | (same message) |
| treasure-diver | `44fc6efc1c967173ecfd8a73f93176ed5bc56e95` | (same message) |
| adm-portal | _(filled in this same commit; confirm with `git -C /workspace/adm-portal rev-parse HEAD`)_ | Open Integer Racer, Integer Archer, and Treasure Diver on the portal for the Nov 25 round (cache 20261125a). |

Each repo should be exactly one commit ahead of `origin/main`. Confirm before pushing:

```bash
for r in integer-racer integer-archer treasure-diver adm-portal; do
  git -C /workspace/$r status -sb
  git -C /workspace/$r log -1 --oneline
done
```

## 3. Push, in this order (plain `git push origin HEAD` only)

```bash
git -C /workspace/integer-racer push origin HEAD
git -C /workspace/integer-archer push origin HEAD
git -C /workspace/treasure-diver push origin HEAD
git -C /workspace/adm-portal push origin HEAD
```

Never force-push (`--force`, `--force-with-lease`) and never amend after a successful push.

## 4. If a push is rejected

1. Stop. Do not force-push and do not rewrite history.
2. Run `git status -sb` and `git log --oneline -5 --decorate` in that repo.
3. If `origin/main` has moved, inspect the incoming commits with `git fetch origin && git log HEAD..origin/main`. Only then consider `git pull --rebase origin main` if those commits are clearly unrelated and safe to replay, then push again with a plain `git push origin HEAD`.
4. If the incoming commits also touch the Nov 25 round, the Games section, or anything unclear, stop and report the rejection and the incoming SHAs. Leave the live site as it is.

## 5. Wait for GitHub Pages

Give Pages a minute or two, then poll until the live files match the local commits (cache-bust with a fresh query):

```bash
curl -sL "https://raymartvalbarez.github.io/adm-portal/?t=$(date +%s)" | grep -E '▶ Play|🔒 Closed|20261125a|Open now:'
curl -sL "https://raymartvalbarez.github.io/integer-racer/game.js?v=20261125a" | grep -E "SESSION_ISO|API_NS|OPEN_FROM_MS|OPEN_UNTIL_MS"
curl -sL "https://raymartvalbarez.github.io/integer-archer/game.js?v=20261125a" | grep -E "SESSION_ISO|API_NS|OPEN_FROM_MS"
curl -sL "https://raymartvalbarez.github.io/treasure-diver/game.js?v=20261125a" | grep -E "SESSION_ISO|API_NS|OPEN_FROM_MS"
```

## 6. Verify live

- The portal Games banner says **Open now: Integer Racer, Integer Archer, Treasure Diver, Island Navigator, and Integer Duel**.
- Integer Racer, Integer Archer, and Treasure Diver each show **▶ Play** (links use `?v=20261125a`), not 🔒 Closed.
- Island Navigator still shows **▶ Play** with `?v=20261118b`. Integer Duel is unchanged (Play, Practice, Leaderboard; unlimited duels).
- Opening each of the three games shows **ADM Activity · Nov. 25, 2026**, a fresh `nov25` score namespace, a 25 November 2026 12:00 AM–11:59 PM Asia/Manila window, and **1 try per learner**. Earlier Nov 18 / 13 / 10 scores stay read-only on the leaderboard.
- `adm-identity.js` is still loaded so Grade/Section/Name stay filled and locked for logged-in learners.

If Pages is still serving the old files, wait and retry. Do not push a new cache-bust commit unless the new files never appear after several minutes.
