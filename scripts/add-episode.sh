#!/bin/bash
# Compress a short motivation clip and add it to the ADM Portal episode list.
# Usage: scripts/add-episode.sh <input-video> "<title>" "<caption>"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS="$ROOT/videos"
MANIFEST="$VIDEOS/episodes.json"
MAX_SOFT=20971520   # ~20 MB target
MAX_HARD=99614720   # stay under GitHub's 100 MB limit
INPUT="${1:-}"
TITLE="${2:-}"
CAPTION="${3:-}"

usage() {
  echo "Usage: $0 <input-video> \"<title>\" \"<caption>\"" >&2
  echo "Creates a 480p (default) and 720p (HD) H.264/AAC MP4, a poster JPG," >&2
  echo "and appends the next published episode to videos/episodes.json." >&2
  exit 2
}

if [ -z "$INPUT" ] || [ -z "$TITLE" ]; then
  usage
fi
if [ ! -f "$INPUT" ]; then
  echo "Input video not found: $INPUT" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required. Install it and try again." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to update episodes.json." >&2
  exit 1
fi

mkdir -p "$VIDEOS"
if [ ! -f "$MANIFEST" ]; then
  printf '%s\n' '{ "episodes": [] }' > "$MANIFEST"
fi

NEXT="$(python3 - "$MANIFEST" << 'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
eps = data if isinstance(data, list) else data.get("episodes") or []
nums = []
for e in eps:
    try:
        nums.append(int(e.get("ep") or 0))
    except (TypeError, ValueError):
        pass
print(max(nums) + 1 if nums else 1)
PY
)"

PAD="$(printf '%02d' "$NEXT")"
BASE="ep${PAD}"
OUT480="$VIDEOS/${BASE}-480.mp4"
OUT720="$VIDEOS/${BASE}-720.mp4"
POSTER="$VIDEOS/${BASE}.jpg"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Scale to a max height without upscaling, even dimensions, yuv420p.
# 480p uses H.264 baseline + AAC for cheap Androids, Messenger, and old WebView.
# 720p uses H.264 main. Both get +faststart so playback can start before the
# whole file downloads.
encode() {
  local dest="$1" height="$2" profile="$3" level="$4" crf="$5" aud="$6"
  local tmp="$TMPDIR/$(basename "$dest")"
  ffmpeg -y -i "$INPUT" \
    -vf "scale='min(${width_for:-854},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuv420p" \
    -c:v libx264 -profile:v "$profile" -level "$level" -pix_fmt yuv420p \
    -preset medium -crf "$crf" -movflags +faststart \
    -c:a aac -profile:a aac_low -b:a "$aud" -ac 2 -ar 44100 \
    -map_metadata -1 "$tmp"
  mv -f "$tmp" "$dest"
}

# width cap: 854 for 480p, 1280 for 720p
encode_with_retry() {
  local dest="$1" height="$2" width="$3" profile="$4" level="$5" aud="$6"
  local crf=23
  local size=0
  while [ "$crf" -le 30 ]; do
    width_for="$width"
    encode "$dest" "$height" "$profile" "$level" "$crf" "$aud"
    size="$(wc -c < "$dest")"
    if [ "$size" -le "$MAX_SOFT" ]; then
      echo "$(basename "$dest"): $((size/1024)) KB (crf $crf)"
      return 0
    fi
    echo "$(basename "$dest") is $((size/1024/1024)) MB (over 20 MB). Tightening quality (crf $crf -> $((crf+3)))." >&2
    crf=$((crf+3))
  done
  size="$(wc -c < "$dest")"
  if [ "$size" -gt "$MAX_HARD" ]; then
    echo "Refusing $(basename "$dest"): $((size/1024/1024)) MB is too large for GitHub." >&2
    rm -f "$dest"
    return 1
  fi
  echo "Warning: $(basename "$dest") is $((size/1024)) KB, above the 20 MB target but under the GitHub limit." >&2
}

echo "Encoding episode ${NEXT} from: $INPUT"
width_for=854
encode_with_retry "$OUT480" 480 854 baseline 3.0 96k
width_for=1280
encode_with_retry "$OUT720" 720 1280 main 3.1 128k

# Poster from an early frame (skip a short fade if present).
ffmpeg -y -ss 0.8 -i "$INPUT" -frames:v 1 \
  -vf "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1" \
  -q:v 5 "$TMPDIR/poster.jpg"
mv -f "$TMPDIR/poster.jpg" "$POSTER"

DATE="$(TZ=Asia/Manila date +%F)"
python3 - "$MANIFEST" "$NEXT" "$TITLE" "$CAPTION" "$DATE" \
  "videos/${BASE}-480.mp4" "videos/${BASE}-720.mp4" "videos/${BASE}.jpg" << 'PY'
import json, sys
path, ep, title, caption, date, file_sd, file_hd, poster = sys.argv[1:9]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
if isinstance(data, list):
    data = {"episodes": data}
eps = list(data.get("episodes") or [])
entry = {
    "ep": int(ep),
    "title": title,
    "caption": caption,
    "file": file_sd,
    "fileHd": file_hd,
    "poster": poster,
    "date": date,
    "published": True,
}
# Replace an existing row with the same episode number, otherwise append.
for i, row in enumerate(eps):
    try:
        n = int((row or {}).get("ep") or 0)
    except (TypeError, ValueError):
        n = 0
    if n == entry["ep"]:
        eps[i] = entry
        break
else:
    eps.append(entry)
data["episodes"] = eps
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("Added Episode %s (%s) to %s" % (ep, title, path))
PY

echo "Done. Default playback is 480p; the portal offers a HD toggle for the 720p file."
echo "Commit and push videos/ plus videos/episodes.json to publish."
