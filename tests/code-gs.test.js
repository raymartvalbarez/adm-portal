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
      getRange: (r, c, n = 1, w = 1) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => { const y = x.slice(c - 1, c - 1 + w); while (y.length < w) y.push(""); return y; }), setFontWeight() {},
        setNumberFormat(f) { log.push("format:" + name + ":" + f); return this; },
        setValues(v) { log.push("write:" + name); v.forEach((row, i) => { const x = rows[r - 1 + i] || (rows[r - 1 + i] = []); row.forEach((val, j) => { x[c - 1 + j] = val; }); }); return this; },
        setValue(val) { this.setValues([[val]]); return this; } }) };
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = sheet(n)) };
  let fid = 0; const folders = {};
  const mkFolder = (name) => { const f = { id: "F" + ++fid, name, kids: [], isTrashed: () => false, getId() { return this.id; }, getUrl() { return "https://drive/" + this.id; },
    getFoldersByName(n) { const hit = this.kids.filter((k) => k.name === n); return { hasNext: () => hit.length > 0, next: () => hit[0] }; },
    createFolder(n) { const k = mkFolder(n); this.kids.push(k); return k; },
    createFile(blob) { if (opts.failOnFile && files.length + 1 === opts.failOnFile) throw new Error("drive fail"); log.push("file:" + (lockHeld ? "locked" : "unlocked"));
      const x = { name: blob.name, type: blob.type, bytes: Array.from(blob.bytes || []), trashed: false, sharing: null, id: "FILE" + (files.length + 1) + "abcdefghij",
        setTrashed(v) { this.trashed = v; }, getUrl: () => "https://file/" + blob.name, getId() { return this.id; }, getName() { return this.name; }, getMimeType() { return this.type; },
        getBlob() { return { getContentType: () => this.type, getBytes: () => this.bytes }; },
        setSharing(a, p) { if (opts.failSharing) throw new Error("sharing blocked"); this.sharing = a + "/" + p; } }; files.push(x); return x; } };
    folders[f.id] = f; return f; };
  const root = mkFolder("root"); const cache = {}; const props = { ROOT_ID: root.id }; let uuid = 0;
  const ctx = {
    SpreadsheetApp: { openById: () => ss },
    DriveApp: { getFolderById: (id) => { if (!folders[id]) throw new Error("no"); return folders[id]; }, getFileById: (id) => { const f = files.find((x) => x.id === id && !x.trashed); if (!f) throw new Error("no file"); return f; }, Access: { ANYONE_WITH_LINK: "ANYONE_WITH_LINK" }, Permission: { VIEW: "VIEW" } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (!lockFree) return false; lockHeld = true; return true; }, releaseLock: () => { lockHeld = false; } }) },
    Utilities: { formatDate: (d, tz, f) => (f === "yyyy-MM-dd HH:mm" ? "2026-11-12 11:00" : "2026-11-12 11:00:00"), base64Decode: (s) => [...Buffer.from(s, "base64")], base64Encode: (b) => Buffer.from(Uint8Array.from(b)).toString("base64"), newBlob: (b, t, n) => ({ name: n, type: t, bytes: b }),
      getUuid: () => crypto.createHash("md5").update(String(++uuid)).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-"),
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
  return { ctx, post, files, log, sheets, props, cache, root, setLock: (v) => { lockFree = v; } };
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

// ===== Teacher page actions =====
const PDF_B64 = Buffer.from("%PDF-1.4\n% test pdf\n").toString("base64");
const setPin = (e, pin = "246810") => e.post({ action: "teacherSetPin", pin });
const tpost = (extra = {}) => Object.assign({ action: "teacherPost", pin: "246810", grade: "Grade 11", subject: "General Mathematics",
  release: "2026-11-13", title: "GenMath Activity", instructions: "Answer items 1-3.", opens: "2026-11-12T08:00", close: "" }, extra);

test("Code.gs teacher: no PIN means every protected action is refused and nothing leaks", () => {
  const e = env();
  for (const action of ["teacherList", "teacherPost", "teacherToggle"]) {
    const r = e.post({ action });
    assert.equal(r.ok, false); assert.equal(r.teacher, true);
  }
  assert.deepEqual(e.post({ action: "teacherStatus" }), { ok: true, pinSet: false, teacher: true });
  // GET never runs teacher actions
  const g = e.ctx.doGet({ parameter: { action: "teacherList", pin: "246810" } });
  assert.equal(g.ok, false); assert.equal(g.tasks, undefined);
  assert.equal(e.sheets["Tasks"].rows.length, 2);
});

test("Code.gs teacher: PIN can be set once, is stored only as a salted hash, and is never returned", () => {
  const e = env();
  assert.equal(e.post({ action: "teacherSetPin", pin: "123" }).ok, false); // too short
  const r = setPin(e);
  assert.deepEqual(r, { ok: true, pinSet: true, teacher: true });
  const stored = e.props.TEACHER_PIN_HASH;
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]{64}$/);
  assert.equal(stored.includes("246810"), false);
  const again = setPin(e, "999999");
  assert.equal(again.ok, false); assert.equal(again.pinSet, true);
  assert.equal(e.props.TEACHER_PIN_HASH, stored);
  const st = e.post({ action: "teacherStatus" });
  assert.deepEqual(st, { ok: true, pinSet: true, teacher: true });
  const list = e.post({ action: "teacherList", pin: "246810" });
  assert.equal(JSON.stringify(list).includes(stored.split(":")[1]), false);
  assert.equal(JSON.stringify(list).includes("246810"), false);
});

test("Code.gs teacher: wrong PIN is refused and repeated failures lock the actions", () => {
  const e = env(); setPin(e);
  const bad = e.post({ action: "teacherList", pin: "000000" });
  assert.equal(bad.ok, false); assert.equal(bad.badPin, true); assert.equal(bad.tasks, undefined);
  for (let i = 0; i < 10; i++) e.post({ action: "teacherList", pin: "000000" });
  const locked = e.post({ action: "teacherList", pin: "246810" });
  assert.equal(locked.ok, false); assert.equal(locked.locked, true);
});

test("Code.gs teacher: teacherList returns every row with status, newest first", () => {
  const e = env(); setPin(e);
  e.sheets["Tasks"].rows.push(["OLD-1", "Grade 12", "PR2", "Closed one", "", "", "N"]);
  const r = e.post({ action: "teacherList", pin: "246810" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.tasks.map((t) => [t.id, t.status, t.active]), [["OLD-1", "closed", false], ["T1", "open", true]]);
  assert.equal(r.tasks[1].deadline, "2099-01-01 23:59");
});

test("Code.gs teacher: teacherPost uploads the PDF, shares it by link and appends a plain-text row at the end", () => {
  const e = env(); setPin(e);
  const r = e.post(tpost({ pdf: PDF_B64, pdfName: "Normal Curve.pdf", close: "2026-11-14T17:00" }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.id, /^G11-GM-20261113-[0-9A-F]{4}$/);
  const f = e.files[0];
  assert.equal(f.type, "application/pdf"); assert.equal(f.name, "Normal Curve.pdf");
  assert.equal(f.sharing, "ANYONE_WITH_LINK/VIEW");
  assert.equal(r.pdf, "https://drive.google.com/file/d/" + f.id + "/view?usp=sharing");
  const folder = e.root.kids.find((k) => k.name === "Task Handouts");
  assert.ok(folder, "Task Handouts folder");
  const rows = e.sheets["Tasks"].rows;
  assert.equal(rows.length, 3); // header + T1 + new row, nothing removed
  assert.deepEqual(rows[1].slice(0, 7), ["T1", "Grade 12", "PR2", "Task One", "", "2099-01-01 23:59", "Y"]);
  assert.deepEqual(rows[2], [r.id, "Grade 11", "General Mathematics", "GenMath Activity", "Answer items 1-3.", "2026-11-14 17:00", "Y", r.pdf, "2026-11-12 08:00"]);
  assert.equal(rows[0][0], "hdr"); assert.equal(rows[0][7], "PDF Link"); assert.match(rows[0][8], /^Opens/);
  assert.ok(e.log.includes("format:Tasks:@"));
});

test("Code.gs teacher: teacherPost validates subject, PDF and times; IDs are unique", () => {
  const e = env(); setPin(e);
  assert.equal(e.post(tpost({ subject: "Practical Research 2" })).ok, false); // PR2 is Grade 12
  assert.equal(e.post(tpost({ title: "" })).ok, false);
  assert.equal(e.post(tpost({ pdf: Buffer.from("hello").toString("base64") })).ok, false);
  assert.equal(e.post(tpost({ close: "2026-11-12T07:00" })).ok, false);
  assert.equal(e.files.length, 0);
  const codes = [["Grade 11", "Practical Research 1", "PR1"], ["Grade 12", "Practical Research 2", "PR2"],
    ["Grade 12", "Community Engagement, Solidarity and Citizenship (CESC)", "CESC"], ["Grade 12", "Entrepreneurship", "ENT"], ["Grade 11", "General Mathematics", "GM"]];
  const ids = codes.map(([grade, subject, code]) => { const r = e.post(tpost({ grade, subject })); assert.equal(r.ok, true); assert.ok(r.id.startsWith(grade.replace("Grade ", "G") + "-" + code + "-20261113-"), r.id); return r.id; });
  assert.equal(new Set(ids).size, ids.length);
  const noPdf = e.sheets["Tasks"].rows.at(-1);
  assert.equal(noPdf[5], ""); assert.equal(noPdf[7], "");
});

test("Code.gs teacher: blocked link sharing still posts but warns", () => {
  const e = env({ failSharing: true }); setPin(e);
  const r = e.post(tpost({ pdf: PDF_B64 }));
  assert.equal(r.ok, true); assert.match(r.warning, /Anyone with the link/);
});

test("Code.gs teacher: a busy lock trashes the uploaded PDF and adds no row", () => {
  const e = env(); setPin(e);
  e.setLock(false);
  const r = e.post(tpost({ pdf: PDF_B64 }));
  assert.equal(r.busy, true);
  assert.equal(e.sheets["Tasks"].rows.length, 2);
  assert.equal(e.files.every((f) => f.trashed), true);
});

test("Code.gs teacher: toggle sets Active Y/N only; config hides future and closed tasks and shows the PDF link", () => {
  const e = env(); setPin(e);
  const now = e.post(tpost({ opens: "2020-01-01T08:00", pdf: PDF_B64 }));
  const later = e.post(tpost({ opens: "2099-01-01T08:00" }));
  let cfg = e.ctx.doGet({ parameter: { action: "config" } });
  const ids = cfg.tasks.map((t) => t.id);
  assert.ok(ids.includes(now.id)); assert.equal(ids.includes(later.id), false);
  assert.equal(cfg.tasks.find((t) => t.id === now.id).pdf, now.pdf);
  assert.equal(cfg.tasks.find((t) => t.id === "T1").pdf, undefined);
  // students cannot upload to a task that is not open yet
  const early = e.post({ type: "task", taskId: later.id, name: "Ana Reyes", section: "ACADS", grade: "Grade 11", images: ["AAAA"] });
  assert.equal(early.ok, false);
  const t = e.post({ action: "teacherToggle", pin: "246810", id: now.id, active: false });
  assert.deepEqual(t, { ok: true, id: now.id, active: false, teacher: true });
  const row = e.sheets["Tasks"].rows.find((x) => x[0] === now.id);
  assert.equal(row[6], "N"); assert.equal(row[7], now.pdf);
  cfg = e.ctx.doGet({ parameter: { action: "config" } });
  assert.equal(cfg.tasks.some((x) => x.id === now.id), false);
  const closed = e.post({ type: "task", taskId: now.id, name: "Ana Reyes", section: "ACADS", grade: "Grade 11", images: ["AAAA"] });
  assert.equal(closed.ok, false);
  assert.equal(e.post({ action: "teacherToggle", pin: "246810", id: now.id, active: true }).active, true);
  assert.equal(e.post({ action: "teacherToggle", pin: "246810", id: "NOPE", active: true }).ok, false);
  assert.equal(e.post({ action: "teacherToggle", pin: "111111", id: now.id, active: false }).ok, false);
  assert.equal(e.sheets["Tasks"].rows.find((x) => x[0] === now.id)[6], "Y");
});

test("Code.gs teacher: a task past its close time stops accepting uploads", () => {
  const e = env(); setPin(e);
  const r = e.post(tpost({ opens: "2020-01-01T08:00", close: "2020-01-02T08:00" }));
  const up = e.post({ type: "task", taskId: r.id, name: "Ana Reyes", section: "ACADS", grade: "Grade 11", images: ["AAAA"] });
  assert.equal(up.ok, false);
  const list = e.post({ action: "teacherList", pin: "246810" });
  assert.equal(list.tasks.find((t) => t.id === r.id).status, "ended");
});

test("Code.gs taskPdf: serves the task's Drive PDF as JSON and never an arbitrary file id", () => {
  const e = env(); setPin(e);
  const posted = e.post(tpost({ opens: "2020-01-01T08:00", pdf: PDF_B64, pdfName: "Normal Curve.pdf" }));
  assert.equal(posted.ok, true);
  const later = e.post(tpost({ opens: "2099-01-01T08:00", pdf: PDF_B64, pdfName: "Future.pdf" }));
  assert.equal(later.ok, true);
  const noPdf = e.post(tpost({ opens: "2020-01-01T08:00" }));
  assert.equal(noPdf.ok, true);

  const ok = e.ctx.doGet({ parameter: { action: "taskPdf", task: posted.id } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.name, "Normal Curve.pdf");
  assert.equal(ok.mime, "application/pdf");
  assert.equal(ok.data, PDF_B64);
  assert.equal(Buffer.from(ok.data, "base64").subarray(0, 5).toString(), "%PDF-");

  // extra / unknown params must not select a different file
  const sneak = e.ctx.doGet({ parameter: { action: "taskPdf", task: posted.id, file: e.files[1].id, id: e.files[1].id, fileId: e.files[1].id } });
  assert.equal(sneak.data, PDF_B64);
  assert.equal(sneak.name, "Normal Curve.pdf");

  assert.equal(e.ctx.doGet({ parameter: { action: "taskPdf" } }).ok, false);
  assert.equal(e.ctx.doGet({ parameter: { action: "taskPdf", task: "NOPE" } }).ok, false);
  assert.equal(e.ctx.doGet({ parameter: { action: "taskPdf", task: "T1" } }).ok, false); // no PDF in column H
  assert.equal(e.ctx.doGet({ parameter: { action: "taskPdf", task: noPdf.id } }).ok, false);
  assert.match(e.ctx.doGet({ parameter: { action: "taskPdf", task: later.id } }).error, /not open yet/i);

  // closed (Active N) tasks are refused; column H is unchanged
  assert.equal(e.post({ action: "teacherToggle", pin: "246810", id: posted.id, active: false }).ok, true);
  const closed = e.ctx.doGet({ parameter: { action: "taskPdf", task: posted.id } });
  assert.equal(closed.ok, false);
  assert.match(closed.error, /not open/i);
  assert.equal(closed.data, undefined);

  // a client-supplied file id alone is never served
  const raw = e.ctx.doGet({ parameter: { action: "taskPdf", file: e.files[0].id, id: e.files[0].id } });
  assert.equal(raw.ok, false); assert.equal(raw.data, undefined);

  // existing GET actions still work
  assert.equal(e.ctx.doGet({ parameter: { action: "config" } }).ok, true);
  assert.equal(e.ctx.doGet({ parameter: { action: "checkTask", name: "x", task: "T1" } }).exists, false);
  assert.equal(e.ctx.doGet({ parameter: {} }).app, "ADM Portal");
});
