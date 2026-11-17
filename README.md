# SHS ADM Portal

Student portal for Bago National High School ADM (Alternative Delivery Mode). Live site: https://raymartvalbarez.github.io/adm-portal/

## Motivation episodes

Short motivational clips live in this repo (GitHub Pages) and appear on the **Motivation** tab, episode by episode. Students can rewatch freely. There are no sample videos in the repo until you add one.

### Add an episode

1. Save a short clip on the computer (phone recordings are fine).
2. From the repo root, run:

```bash
./scripts/add-episode.sh path/to/clip.mp4 "Episode title" "A short caption for learners."
```

3. The script compresses the clip with ffmpeg and writes:
   - `videos/epNN-480.mp4` — default, for cheap Android phones, slow data, and Messenger
   - `videos/epNN-720.mp4` — HD toggle
   - `videos/epNN.jpg` — tap-to-play poster
   - a new published row in `videos/episodes.json`
4. Commit those files and push to `main`. GitHub Pages will publish the episode.

You can also send the clip, title, and caption in chat and have the portal bot run this and publish it.

### Size and format limits

- Keep clips short. Aim for **under 20 MB** per file so they load on mobile data.
- Each file must stay **well under GitHub's 100 MB limit**. The script retries with tighter quality if a file is over 20 MB, and it refuses anything over about 95 MB.
- Encoding is **H.264** (`yuv420p`, **baseline** for 480p and **main** for 720p) with **AAC** audio and **`+faststart`**, at most 720p. The portal plays 480p first.

### Student playback

The player is built for cheap Android phones, Messenger's in-app browser, older Android WebView, and iOS Safari:

- Default 480p, with a **HD** toggle and a fallback `<source>`
- `playsinline` (and `webkit-playsinline`), **no muted autoplay**
- A clear **Tap to play** poster
- If the video errors or stalls: a **Download** link and the same **Open in Chrome** help used for PDFs
