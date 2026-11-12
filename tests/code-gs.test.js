// Runs Code.gs against small in-memory fakes of the Apps Script services.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const SRC = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");

function env(opts = {}) {
  const sheets = {}, files = [], log = [];
  let lockHeld = false, lockFree = opts.lockFree !== false;
  const sheet = (name) => {
    const rows = [];
    return { rows, appendRow: (r) => { log.push("append:" + name); rows.push(r); }, setFrozenRows() {}, getLastRow: () => rows.length,
      getRange: (r, c, n, w) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + w)), setFontWeight() {} }) };
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = sheet(n)) };
  let fid = 0; const folders = {};
  const mkFolder = (name) => { const f = { id: "F" + ++fid, name, kids: [], isTrashed: () => false, getId() { return this.id; }, getUrl() { return "https://drive/" + this.id; },
    getFoldersByName(n) { const hit = this.kids.filter((k) => k.name === n); return { hasNext: () => hit.length > 0, next: () => hit[0] }; },
    createFolder(n) { const k = mkFolder(n); this.kids.push(k); return k; },
    createFile(blob) { if (opts.failOnFile && files.length + 1 === opts.failOnFile) throw new Error("drive fail"); log.push("file:" + (lockHeld ? "locked" : "unlocked"));
      const x = { name: blob.name, trashed: false, setTrashed(v) { this.trashed = v; }, getUrl: () => "https://file/" + blob.name }; files.push(x); return x; } };
    folders[f.id] = f; return f; };
  const root = mkFolder("root"); const cache = {};
  const ctx = {
    SpreadsheetApp: { openById: () => ss },
    DriveApp: { getFolderById: (id) => { if (!folders[id]) throw new Error("no"); return folders[id]; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === "ROOT_ID" ? root.id : null), setProperty() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (!lockFree) return false; lockHeld = true; return true; }, releaseLock: () => { lockHeld = false; } }) },
    Utilities: { formatDate: () => "2026-11-12 11:00:00", base64Decode: (s) => Buffer.from(s, "base64"), newBlob: (b, t, n) => ({ name: n }),
      computeDigest: (a, s) => [...crypto.createHash("sha256").update(s).digest()], base64EncodeWebSafe: (b) => Buffer.from(b).toString("base64url"),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 1 } },
    Logger: { log() {} },
  };
  vm.createContext(ctx); vm.runInContext(SRC + "\nthis.ROOT_ID=ROOT_ID;", ctx);
  ctx.SHEET_ID = "x"; vm.runInContext("ROOT_ID=" + JSON.stringify(root.id), ctx);
  // one active task
  const tasks = ss.insertSheet("Tasks"); tasks.rows.push(["hdr"]); tasks.rows.push(["T1", "Grade 12", "PR2", "Task One", "", "2099-01-01 23:59", "Y"]);
  const post = (d) => ctx.doPost({ postData: { contents: JSON.stringify(d) } });
  return { ctx, post, files, log, sheets, setLock: (v) => { lockFree = v; } };
}
const task = (name) => ({ type: "task", taskId: "T1", name, section: "HUMSS", grade: "Grade 12", images: ["data:image/jpeg;base64,AAAA", "AAAA"] });

test("Code.gs: task upload saves photos outside the lock, then appends one row", () => {
  const e = env();
  assert.deepEqual(e.post(task("Juan Dela Cruz")), { ok: true, count: 2 });
  assert.deepEqual(e.log.filter((x) => x.startsWith("file")), ["file:unlocked", "file:unlocked"]);
  assert.equal(e.sheets["Task Submissions"].rows.length, 2); // header + 1
  assert.equal(e.files.filter((f) => !f.trashed).length, 2);
});

test("Code.gs: duplicate submission is rejected and keeps nothing", () => {
  const e = env();
  e.post(task("Juan Dela Cruz"));
  const r = e.post(task("juan  dela cruz"));
  assert.equal(r.dup, true); assert.equal(r.error, "already_submitted");
  // a duplicate that slips past the early check (race) is caught inside the lock and its photos trashed
  vm.runInContext("var __orig=taskDone_; taskDone_=function(n,t){ return (__c=(this.__c||0)+1, __c===1) ? false : __orig(n,t); }; var __c=0;", e.ctx);
  const r2 = e.post(task("Juan Dela Cruz"));
  assert.equal(r2.dup, true);
  assert.equal(e.sheets["Task Submissions"].rows.length, 2);
  assert.equal(e.files.filter((f) => !f.trashed).length, 2);
  assert.equal(e.files.filter((f) => f.trashed).length, 2);
});

test("Code.gs: lock timeout answers JSON busy and keeps nothing", () => {
  const e = env();
  e.post(task("Ana Reyes")); // warms the folder cache
  e.setLock(false);
  assert.deepEqual(e.post(task("Ben Cruz")), { ok: false, busy: true, error: "Server busy, please try again." });
  assert.equal(e.files.filter((f) => !f.trashed).length, 2);
  assert.equal(e.sheets["Task Submissions"].rows.length, 2);
  assert.equal(e.post({ type: "quiz", name: "A", subject: "PR2" }).busy, true);
});

test("Code.gs: a Drive error midway trashes the partial photos and returns JSON error", () => {
  const e = env({ failOnFile: 2 });
  const r = e.post(task("Carlo Santos"));
  assert.equal(r.ok, false); assert.match(r.error, /drive fail/);
  assert.equal(e.files.filter((f) => !f.trashed).length, 0);
  assert.equal(e.sheets["Task Submissions"].rows.length, 1); // header only, no row
});

test("Code.gs: GET actions still answer", () => {
  const e = env();
  assert.equal(e.ctx.doGet({ parameter: { action: "config" } }).ok, true);
  assert.equal(e.ctx.doGet({ parameter: { action: "checkTask", name: "x", task: "T1" } }).exists, false);
  assert.equal(e.ctx.doGet({ parameter: {} }).app, "ADM Portal");
});
