#!/bin/bash
# Open or close the four ADM games and the portal Games section.
# Does not rewrite git history: open/close is always a new revert-style commit.
#
#   scripts/games.sh open
#   scripts/games.sh close
#   scripts/games.sh open --push
#   scripts/games.sh close --date "Nov 18" --version 20261118a
#
# Does not touch quizzes, tasks, Motivation, Apps Script, or Sheets.
set -euo pipefail

usage() {
  echo "Usage: $0 open|close [--push] [--no-commit] [--date \"Nov 18\"] [--version 20261118a]" >&2
  exit 2
}

ACTION="${1:-}"
shift || true
case "$ACTION" in
  open|close) ;;
  *) usage ;;
esac

DO_PUSH=0
DO_COMMIT=1
DATE_LABEL=""
VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --push) DO_PUSH=1; shift ;;
    --no-commit) DO_COMMIT=0; shift ;;
    --date) DATE_LABEL="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

PORTAL="$(cd "$(dirname "$0")/.." && pwd)"
if [ -n "${ADM_GAMES_ROOT:-}" ]; then
  ROOT="$ADM_GAMES_ROOT"
elif [ -d "$PORTAL/../integer-racer/.git" ]; then
  ROOT="$(cd "$PORTAL/.." && pwd)"
else
  ROOT="/workspace"
fi

GAMES=(integer-racer integer-archer treasure-diver island-navigator)

if [ -z "$DATE_LABEL" ]; then
  DATE_LABEL="$(TZ=Asia/Manila date +%b\ %-d)"
fi
if [ -z "$VERSION" ]; then
  VERSION="$(TZ=Asia/Manila date +%Y%m%d)a"
fi

game_is_closed() {
  local dir="$1"
  grep -q "This game is closed" "$dir/index.html" 2>/dev/null \
    || grep -q 'const ADM_CLOSED = true' "$dir/game.js" 2>/dev/null
}

latest_commit() {
  local dir="$1" pattern="$2"
  git -C "$dir" log --format=%H --grep="$pattern" -1
}

bump_game_cache() {
  local dir="$1" ver="$2"
  python3 - "$dir/index.html" "$ver" << 'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
ver = sys.argv[2]
text = path.read_text()
new, n = re.subn(r"(game\.js\?v=)[0-9]{8}[a-z]", r"\g<1>" + ver, text, count=1)
if n != 1:
    raise SystemExit(f"Could not bump game.js cache version in {path}")
path.write_text(new)
PY
}

commit_game() {
  local dir="$1" message="$2"
  git -C "$dir" add -- index.html game.js
  if git -C "$dir" diff --cached --quiet; then
    echo "  no changes to commit in $(basename "$dir")"
    return 0
  fi
  git -C "$dir" commit -m "$message"
}

set_portal_games() {
  python3 - "$PORTAL" "$ACTION" "$DATE_LABEL" "$VERSION" << 'PY'
import pathlib, re, sys
portal, action, date_label, version = sys.argv[1:]
index_path = pathlib.Path(portal) / "index.html"
html = index_path.read_text()
m = re.search(r'(<section id="games">)(.*?)(</section>)', html, re.S)
if not m:
    raise SystemExit("Could not find the Games section in index.html")
section = m.group(0)
if action == "open":
    banner = (
        f'<div style="font-size:1.05rem">🎮 Games are open today, {date_label}</div>'
        '<p class="note" style="margin:8px 0 0">Integer Racer, Integer Archer, Treasure Diver, and Island Navigator are open to play. Leaderboards stay open, and all saved scores are kept. Still 1 try per game.</p>'
    )
    footer = "⚠️ Each learner gets only 1 try per game. Play carefully!"
    def play(game):
        return (
            f'<a class="pl" href="https://raymartvalbarez.github.io/{game}/?v={version}" target="_blank" rel="noopener">▶ Play</a>'
            f'<a class="lb" href="https://raymartvalbarez.github.io/{game}/leaderboard.html?v={version}" target="_blank" rel="noopener">🏆 Leaderboard</a>'
        )
else:
    banner = (
        '<div style="font-size:1.05rem">🔒 Games are closed</div>'
        '<p class="note" style="margin:8px 0 0">Integer Racer, Integer Archer, Treasure Diver, and Island Navigator are closed for now. Leaderboards are still open, and all saved scores are kept.</p>'
    )
    footer = "Leaderboards stay open. All earlier scores are saved."
    def play(game):
        return (
            '<span class="pl closed" aria-disabled="true">🔒 Closed</span>'
            f'<a class="lb" href="https://raymartvalbarez.github.io/{game}/leaderboard.html?v={version}" target="_blank" rel="noopener">🏆 Leaderboard</a>'
        )

section = re.sub(
    r'(<div class="card" id="gopen"[^>]*>).*?(</div>)(?=<div class="games")',
    r"\1" + banner + r"\2",
    section,
    count=1,
    flags=re.S,
)
for game in ("integer-racer", "integer-archer", "treasure-diver", "island-navigator"):
    pat = (
        r'<div class="gb">(?:'
        r'<span class="pl closed"[^>]*>🔒 Closed</span>|'
        r'<a class="pl" href="https://raymartvalbarez\.github\.io/' + re.escape(game) + r'/\?v=[^"]+"[^>]*>▶ Play</a>'
        r')'
        r'<a class="lb" href="https://raymartvalbarez\.github\.io/' + re.escape(game) + r'/leaderboard\.html\?v=[^"]+"[^>]*>🏆 Leaderboard</a>'
        r'</div>'
    )
    section, n = re.subn(pat, '<div class="gb">' + play(game) + '</div>', section, count=1)
    if n != 1:
        raise SystemExit(f"Could not update the Play/Closed control for {game}")
section, n = re.subn(
    r'(<p class="note">)[^<]*(</p></section>)',
    r"\1" + footer + r"\2",
    section,
    count=1,
)
if n != 1:
    raise SystemExit("Could not update the Games footer note")
index_path.write_text(html[:m.start()] + section + html[m.end():])
print(f"  portal Games section set to {action} (v={version})")
PY
}

open_game() {
  local name="$1" dir="$ROOT/$name"
  if [ ! -d "$dir/.git" ]; then
    echo "Missing game repo: $dir" >&2
    exit 1
  fi
  if ! game_is_closed "$dir"; then
    echo "  $name is already open"
    return 0
  fi
  if [ -n "$(git -C "$dir" status --porcelain -- index.html game.js)" ]; then
    echo "$name has uncommitted changes in index.html or game.js" >&2
    exit 1
  fi
  local sha
  sha="$(latest_commit "$dir" "^Close the game to new play")"
  if [ -z "$sha" ]; then
    echo "Could not find a close commit to revert in $name" >&2
    exit 1
  fi
  echo "  $name: reverting $sha and bumping cache to $VERSION"
  git -C "$dir" revert --no-commit "$sha"
  bump_game_cache "$dir" "$VERSION"
  if [ "$DO_COMMIT" -eq 1 ]; then
    commit_game "$dir" "$(cat <<MSG
Revert "Close the game to new play; keep the leaderboard and saved scores."

This reverts commit ${sha}. Bump game.js cache to ${VERSION} so phones load the playable page.
MSG
)"
  fi
}

close_game() {
  local name="$1" dir="$ROOT/$name"
  if [ ! -d "$dir/.git" ]; then
    echo "Missing game repo: $dir" >&2
    exit 1
  fi
  if game_is_closed "$dir"; then
    echo "  $name is already closed"
    return 0
  fi
  if [ -n "$(git -C "$dir" status --porcelain -- index.html game.js)" ]; then
    echo "$name has uncommitted changes in index.html or game.js" >&2
    exit 1
  fi
  local sha
  sha="$(latest_commit "$dir" "^Revert \"Close the game to new play")"
  if [ -z "$sha" ]; then
    sha="$(latest_commit "$dir" "^Reopen the game for play")"
  fi
  if [ -z "$sha" ]; then
    echo "Could not find a reopen commit to revert in $name. Close the game with a new close commit first." >&2
    exit 1
  fi
  echo "  $name: reverting $sha and bumping cache to $VERSION"
  git -C "$dir" revert --no-commit "$sha"
  bump_game_cache "$dir" "$VERSION"
  if [ "$DO_COMMIT" -eq 1 ]; then
    commit_game "$dir" "$(cat <<MSG
Close the game to new play; keep the leaderboard and saved scores.

Show a friendly closed message, hide the play form, and block new score
saves. Leaderboards stay open. MantleDB data is not deleted. Cache ${VERSION}.
MSG
)"
  fi
}

echo "Games $ACTION ($DATE_LABEL, cache $VERSION) from $ROOT"
for name in "${GAMES[@]}"; do
  if [ "$ACTION" = "open" ]; then
    open_game "$name"
  else
    close_game "$name"
  fi
done

set_portal_games

if [ "$DO_COMMIT" -eq 1 ]; then
  git -C "$PORTAL" add -- index.html tests/portal.test.js scripts/games.sh
  if git -C "$PORTAL" diff --cached --quiet; then
    echo "  no portal changes to commit"
  else
    if [ "$ACTION" = "open" ]; then
      git -C "$PORTAL" commit -m "Reopen all four games on the portal for ${DATE_LABEL}."
    else
      git -C "$PORTAL" commit -m "Mark all four games Closed on the portal; leave leaderboard links."
    fi
  fi
fi

if [ "$DO_PUSH" -eq 1 ]; then
  for name in "${GAMES[@]}"; do
    echo "  pushing $name"
    git -C "$ROOT/$name" push origin HEAD
  done
  echo "  pushing adm-portal"
  git -C "$PORTAL" push origin HEAD
fi

echo "Done. $ACTION complete."
