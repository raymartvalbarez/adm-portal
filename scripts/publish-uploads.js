#!/usr/bin/env node
"use strict";
/**
 * Download Pending Motivation uploads from the ADM Portal Apps Script
 * (PIN in the POST body only), compress them with add-episode.sh, and
 * mark each row Published or Failed.
 *
 *   ADM_TEACHER_PIN=123456 node scripts/publish-uploads.js
 *   ADM_TEACHER_PIN=123456 node scripts/publish-uploads.js --dry-run
 *   ADM_TEACHER_PIN=123456 node scripts/publish-uploads.js --commit
 *
 * Never pass the PIN on the command line or in a GET URL. This script
 * does not push to GitHub; --commit only makes a local commit.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ADD = path.join(ROOT, "scripts", "add-episode.sh");

function parseConfig(src) {
  const m = String(src || "").match(/API_URL\s*=\s*"([^"]*)"/);
  return m ? m[1] : "";
}

function loadApiUrl() {
  if (process.env.ADM_API_URL) return process.env.ADM_API_URL;
  return parseConfig(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"));
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch (e) { throw new Error("The server did not return JSON."); }
  if (j && j.busy) throw new Error(j.error || "Server busy");
  return j;
}

async function withRetry(fn, tries) {
  let last;
  for (let i = 1; i <= (tries || 3); i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries) await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
  throw last;
}

async function downloadUpload(url, pin, rec, dest) {
  const total = Number(rec.chunks) || 0;
  if (total < 1) throw new Error("This upload has no chunks.");
  const out = fs.openSync(dest, "w");
  try {
    let size = 0;
    for (let i = 0; i < total; i++) {
      const j = await withRetry(() => postJson(url, { action: "teacherUploadFile", pin, id: rec.id, index: i }), 3);
      if (!j || !j.ok || !j.data) throw new Error((j && j.error) || ("Could not download part " + (i + 1)));
      const buf = Buffer.from(j.data, "base64");
      fs.writeSync(out, buf);
      size += buf.length;
    }
    if (rec.size && size !== Number(rec.size)) throw new Error("Downloaded " + size + " bytes, expected " + rec.size + ".");
    return size;
  } finally {
    fs.closeSync(out);
  }
}

function runAddEpisode(input, title, caption) {
  const r = spawnSync("bash", [ADD, input, title, caption || ""], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "add-episode.sh failed").trim());
  }
  const m = (r.stdout || "").match(/Added Episode (\d+)/i);
  return { episode: m ? m[1] : "", log: String(r.stdout || "").trim() };
}

function maybeCommit(rec, episode) {
  const msg = "Publish Motivation Episode " + episode + " (" + rec.id + ").";
  const add = spawnSync("git", ["add", "videos", "videos/episodes.json"], { cwd: ROOT, encoding: "utf8" });
  if (add.status !== 0) throw new Error((add.stderr || "git add failed").trim());
  const c = spawnSync("git", ["commit", "-m", msg], { cwd: ROOT, encoding: "utf8" });
  if (c.status !== 0) throw new Error((c.stderr || c.stdout || "git commit failed").trim());
  return msg;
}

async function main(argv) {
  const dry = argv.includes("--dry-run");
  const doCommit = argv.includes("--commit");
  const pin = String(process.env.ADM_TEACHER_PIN || "").trim();
  const url = loadApiUrl();
  if (!url) throw new Error("API_URL is missing. Set ADM_API_URL or fill config.js.");
  if (!pin) throw new Error("Set ADM_TEACHER_PIN to the teacher PIN (do not pass it as a flag).");
  const list = await postJson(url, { action: "teacherUploads", pin });
  if (!list || list.teacher !== true) throw new Error("The Apps Script backend does not yet support Motivation uploads. Deploy a New version first.");
  if (!list.ok) throw new Error(list.error || "Could not list uploads.");
  const pending = (list.uploads || []).filter((u) => u && u.status === "Pending");
  if (!pending.length) {
    console.log("No Pending Motivation uploads.");
    return { ok: true, pending: 0, published: 0 };
  }
  console.log("Found " + pending.length + " Pending upload(s).");
  let published = 0;
  const work = fs.mkdtempSync(path.join(require("os").tmpdir(), "adm-motiv-"));
  try {
    for (const rec of pending) {
      const dest = path.join(work, rec.id + "-" + (rec.name || "clip.mp4").replace(/[^\w.\-]+/g, "_"));
      console.log("Downloading " + rec.id + " (" + rec.title + ")…");
      if (dry) { console.log("  dry-run: would download " + rec.chunks + " part(s) and run add-episode.sh"); continue; }
      try {
        await downloadUpload(url, pin, rec, dest);
        const added = runAddEpisode(dest, rec.title, rec.caption || "");
        if (doCommit) maybeCommit(rec, added.episode);
        const set = await postJson(url, { action: "teacherUploadSetStatus", pin, id: rec.id, status: "Published", episode: added.episode, notes: "Published as Episode " + added.episode });
        if (!set || !set.ok) throw new Error((set && set.error) || "Could not mark Published.");
        console.log("  Published as Episode " + added.episode + (doCommit ? " (local commit only, not pushed)" : " (files ready; review and push)"));
        published++;
      } catch (err) {
        const msg = String(err && err.message || err);
        console.error("  Failed " + rec.id + ": " + msg);
        try { await postJson(url, { action: "teacherUploadSetStatus", pin, id: rec.id, status: "Failed", notes: msg.slice(0, 500) }); } catch (_) {}
      }
    }
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  }
  return { ok: true, pending: pending.length, published };
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { parseConfig, downloadUpload, runAddEpisode, main };
