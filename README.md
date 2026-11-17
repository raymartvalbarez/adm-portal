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


## Upload from the Teacher page

Raymart can upload a Motivation clip himself from the Teacher page (unlock with the teacher PIN). The clip is sent in chunks to Apps Script and stored in a private Drive folder named **ADM Motivation Uploads**. A new sheet tab, **Motivation Uploads**, tracks each file as Uploading, Pending, Published, or Failed. Existing tabs are never renamed.

The clip is not live on the student tab until it is published:

```bash
ADM_TEACHER_PIN=your-pin node scripts/publish-uploads.js
```

Add `--dry-run` to only list Pending rows, or `--commit` to make a local git commit (this script never pushes). The PIN must come from the environment, never from a URL.

### Limits

- Maximum upload size: **40 MB** (source clip, before compression)
- Chunk size: 1,500,000 bytes (~2 MB as base64), so a 20 MB clip is about 14 parts
- On typical 4G mobile data (~3 Mbps), a 20 MB clip takes about **1–2 minutes**; a 40 MB clip about **2–4 minutes**. On a slow connection it can take longer. Keep the Teacher page open until it finishes.
- Published files still aim for under 20 MB (480p + 720p) as described above.

### Apps Script deployment (required before the upload button works)

In the DepEd Google account (`script.google.com/u/1`), open the existing **ADM Portal** project:

1. Replace the project's `Code.gs` with the `Code.gs` from this repo (or paste the new Motivation upload functions and the updated `TABS` / `TEACHER_ACTIONS_` / `teacher_()` routing).
2. Deploy → Manage deployments → edit the existing **ADM Portal v1** deployment → **New version** → Deploy.
3. Do not create a second deployment, and do not change the `/exec` URL.
4. The **Motivation Uploads** tab is created automatically on the first upload. Do not rename existing tabs.
