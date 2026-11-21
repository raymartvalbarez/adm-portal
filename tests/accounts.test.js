// Learner accounts: Code_accounts.gs (with Code.gs) against in-memory Apps Script fakes, plus the page helpers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const A = require("../accounts-logic.js");
const MOCK = require("../accounts-mock.js");

function env(opts = {}) {
  const sheets = {}, files = [], props = {}, cache = {}, fetched = [], logs = [];
  const sheet = (name) => { const rows = []; return { rows, appendRow: (r) => rows.push(r.slice()), setFrozenRows() {}, getLastRow: () => rows.length, getMaxColumns: () => 20,
    getRange: (r, c, n = 1, w = 1) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map((x) => { const y = x.slice(c - 1, c - 1 + w); while (y.length < w) y.push(""); return y; }),
      setValue(v) { const x = rows[r - 1] || (rows[r - 1] = []); x[c - 1] = v; return this; }, setValues(v) { v.forEach((row, i) => row.forEach((val, j) => { const x = rows[r - 1 + i] || (rows[r - 1 + i] = []); x[c - 1 + j] = val; })); return this; } }) }; };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = sheet(n)) };
  const L = ss.insertSheet("Learners"); L.rows.push(["Grade", "Section", "Last", "First"], ["Grade 11", "ACADS", "Dela Cruz", "Juan"], ["Grade 11", "ACADS", "Santos", "Maria"], ["Grade 12", "HUMSS", "Bautista", "Ana"]);
  const scores = ss.insertSheet("ADM Quiz Scores"); scores.rows.push(["hdr"], ["2026-11-19 20:10:00", "Juan Dela Cruz", "Grade 11", "General Mathematics — Quiz 5", "ACADS", 8, 10, "80%", "TOPIC-SECRET", "ANSWERS-ABCD"], ["2026-11-19 20:11:00", "Maria Santos", "Grade 11", "General Mathematics — Quiz 5", "ACADS", 10, 10, "100%", "x", "y"]);
  const subs = ss.insertSheet("Task Submissions"); subs.rows.push(["hdr"], ["2026-11-19 16:42:00", "Juan Dela Cruz", "Grade 11", "General Mathematics", "ACADS", "GM-20261119", "z-scores task", 3, "https://drive/folder"], ["2026-11-09 19:03:00", "juan dela cruz", "Grade 11", "General Mathematics", "ACADS", "QUIZ-General Mathematics", "Quiz Output", 1, "https://drive/x"]);
  const before = Object.keys(sheets).sort();
  let fid = 0; const folders = {};
  const mkFolder = (name, parent) => { const f = { id: "FD" + ++fid, name, parent, files: [], sharing: null, isTrashed: () => false, getId() { return this.id; },
    setSharing(a, p) { this.sharing = a + "/" + p; },
    createFile(blob) { const x = { id: "FILE" + (files.length + 1), name: blob.name, type: blob.type, bytes: blob.bytes, folder: this.id, sharing: null, getId() { return this.id; }, setSharing(a, p) { this.sharing = a + "/" + p; }, setTrashed() { throw new Error("must not trash"); },
      getBlob() { return { getContentType: () => x.type, getBytes: () => x.bytes }; } }; files.push(x); this.files.push(x); return x; },
    getFoldersByName: () => ({ hasNext: () => false }), createFolder(n) { return mkFolder(n, this.id); } }; folders[f.id] = f; return f; };
  const rootF = mkFolder("ADM Outputs"); props.ROOT_ID = rootF.id;
  const exports = Object.assign({
    "bnhs-iracer-nov18-2026": { entries: { "scores/juan-dela-cruz-g11": { name: "Juan Dela Cruz", grade: "11", section: "ACADS", total: 1240, bestLevel: 4, ts: Date.parse("2026-11-18T06:20:00Z") }, "scores/juan-g12": { name: "Juan Dela Cruz", grade: "12", total: 9999 }, "scores/maria": { name: "Maria Santos", grade: "11", total: 50 } } },
    "bnhs-integerduel-nov2026": { entries: { "r-AAAAA": { a: { n: "Juan Dela Cruz", g: "11", p: 7 }, b: { n: "Maria Santos", g: "11", p: 5 }, w: "a", t: "2026-11-19T10:00:00.000Z" } } },
    "bnhs-integerduel-res-1": { entries: { "r-BBBBB": { a: { n: "Ana Bautista", g: "12", p: 6 }, b: { n: "juan dela cruz", g: "Grade 11", p: 4 }, w: "a", t: "2026-11-20T05:00:00.000Z" }, "r-CCCCC": { a: { n: "Juan Dela Cruz", g: "11", p: 5 }, b: { n: "Ana Bautista", g: "12", p: 5 }, w: "d", t: "2026-11-20T06:00:00.000Z" } } }
  }, opts.exports || {});
  let uuid = 0;
  const ctx = {
    SpreadsheetApp: { openById: () => ss },
    DriveApp: { getFolderById: (id) => { if (!folders[id]) throw new Error("no"); return folders[id]; }, getFileById: (id) => { const f = files.find((x) => x.id === id); if (!f) throw new Error("no"); return f; },
      createFolder: (n) => mkFolder(n, "MYDRIVE"), getFoldersByName: () => ({ hasNext: () => false }), Access: { PRIVATE: "PRIVATE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK" }, Permission: { NONE: "NONE", VIEW: "VIEW" } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: (k) => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    UrlFetchApp: { fetchAll: (reqs) => reqs.map((q) => { fetched.push(q.url); const ns = q.url.split("/export/")[1].split("?")[0]; const j = exports[ns];
      return { getResponseCode: () => (j ? 200 : 404), getContentText: () => (j ? JSON.stringify(j) : "") }; }) },
    Utilities: { formatDate: (d) => new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 16).replace("T", " "), base64Decode: (s) => [...Buffer.from(s, "base64")], base64Encode: (b) => Buffer.from(Uint8Array.from(b.map((x) => x & 255))).toString("base64"),
      newBlob: (bytes, type, name) => ({ bytes, type, name }), getUuid: () => crypto.createHash("md5").update("u" + ++uuid).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-"),
      computeDigest: (a, s) => [...crypto.createHash("sha256").update(String(s)).digest()].map((b) => (b > 127 ? b - 256 : b)), base64EncodeWebSafe: (b) => Buffer.from(b).toString("base64url"),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 1 } },
    Logger: { log: (x) => logs.push(String(x)) },
  };
  vm.createContext(ctx);
  vm.runInContext(read("Code.gs") + "\n" + read("Code_accounts.gs"), ctx);
  if (!opts.noCodes) vm.runInContext("acctProps_().setProperty('ACCT_CODE_'+acctSecId_('Grade 11','ACADS'),'ACADS7');acctProps_().setProperty('ACCT_CODE_'+acctSecId_('Grade 12','HUMSS'),'HUMSS4');", ctx);
  const post = (d) => ctx.doPost({ postData: { contents: JSON.stringify(d) } });
  const get = (parameter) => ctx.doGet({ parameter: parameter || {} });
  return { ctx, post, get, sheets, props, cache, files, folders, fetched, logs, before, rootF };
}
const JUAN = { grade: "Grade 11", section: "ACADS", name: "Juan Dela Cruz" };

test("accounts: first-time PIN creates the account; only a salted hash is stored, never the PIN", () => {
  const e = env();
  assert.deepEqual(e.post({ action: "acctStatus", ...JUAN }), { ok: true, hasPin: false, needCode: true });
  const r = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  assert.equal(r.ok, true); assert.match(r.token, /^[a-f0-9]{64}$/); assert.deepEqual(r.me, { g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz" });
  const all = JSON.stringify(e.props) + JSON.stringify(e.sheets) + e.logs.join("");
  assert.ok(!all.includes("4826"), "PIN must not be stored anywhere in plain text");
  assert.ok(!all.includes(r.token), "only the token hash is stored server-side");
  const pinProp = Object.keys(e.props).find((k) => k.startsWith("ACCT_PIN_"));
  assert.match(e.props[pinProp], /^v1:[a-f0-9]{32}:[a-f0-9]{64}$/);
  // New "Accounts" tab only; existing tabs untouched and no quiz row appended
  assert.deepEqual(Object.keys(e.sheets).sort(), [...e.before, "Accounts"].sort());
  assert.equal(e.sheets["ADM Quiz Scores"].rows.length, 3);
  const acc = e.sheets.Accounts.rows; assert.equal(acc[0][0], "Grade"); assert.equal(acc[1][2], "Juan Dela Cruz"); assert.ok(acc[1][4]);
  assert.equal(e.post({ action: "acctStatus", ...JUAN }).hasPin, true);
});

test("accounts: PIN rules, second claim refused, names must be on the class list", () => {
  const e = env();
  assert.match(e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "12a4" }).error, /exactly 4 numbers/);
  assert.match(e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "1234" }).error, /too easy/);
  assert.match(e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "00000" }).error, /exactly 4/);
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" }).ok, true);
  const again = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "7391" });
  assert.equal(again.ok, false); assert.equal(again.exists, true);
  assert.equal(e.post({ action: "acctLogin", ...JUAN, pin: "7391" }).ok, false);
  const stranger = e.post({ action: "acctSetPin", grade: "Grade 11", section: "ACADS", name: "Not Listed", pin: "4826", code: "ACADS7" });
  assert.equal(stranger.ok, false); assert.match(stranger.error, /class list/);
  // case/spacing differences still find the same learner
  assert.equal(e.post({ action: "acctStatus", grade: "grade 11", section: "acads", name: " juan  dela cruz " }).hasPin, true);
});

test("accounts: login, wrong-PIN lockout, session token and logout", () => {
  const e = env();
  e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  const ok = e.post({ action: "acctLogin", ...JUAN, pin: "4826" });
  assert.equal(ok.ok, true);
  assert.equal(e.post({ action: "acctMe", token: ok.token }).me.n, "Juan Dela Cruz");
  assert.equal(e.post({ action: "acctMe", token: "f".repeat(64) }).relogin, true);
  assert.equal(e.post({ action: "acctMe" }).relogin, true);
  e.post({ action: "acctLogout", token: ok.token });
  assert.equal(e.post({ action: "acctMe", token: ok.token }).relogin, true);
  for (let i = 0; i < 4; i++) { const w = e.post({ action: "acctLogin", ...JUAN, pin: "1111" }); assert.equal(w.badPin, true); assert.equal(w.left, 4 - i); }
  e.post({ action: "acctLogin", ...JUAN, pin: "1111" });
  const locked = e.post({ action: "acctLogin", ...JUAN, pin: "4826" });
  assert.equal(locked.ok, false); assert.equal(locked.locked, true);
  // other learners are not affected
  assert.equal(e.post({ action: "acctSetPin", grade: "Grade 11", section: "ACADS", name: "Maria Santos", pin: "5071", code: "acads7" }).ok, true);
});

test("accounts: history is the learner's own, grouped data, and never includes answers or topic breakdown", () => {
  const e = env();
  const { token } = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  const h = e.post({ action: "acctHistory", token });
  assert.equal(h.ok, true);
  assert.equal(h.quizzes.length, 1); assert.deepEqual(Object.keys(h.quizzes[0]).sort(), ["percent", "score", "subject", "total", "when"]);
  assert.equal(h.quizzes[0].score, 8);
  const txt = JSON.stringify(h);
  assert.ok(!txt.includes("ANSWERS-ABCD") && !txt.includes("TOPIC-SECRET"), "answers must never reach the learner");
  assert.ok(!txt.includes("Maria Santos") || h.duels.list.some((d) => d.opponent === "Maria Santos"), "other learners appear only as duel opponents");
  assert.ok(!txt.includes("drive/folder"), "Drive folder links are not sent");
  assert.deepEqual(h.tasks.map((t) => t.kind), ["task", "quizOutput"]);
  assert.equal(h.games.length, 1); assert.equal(h.games[0].score, 1240); assert.equal(h.games[0].game, "Integer Racer"); // grade-12 namesake excluded
  assert.deepEqual(h.duels.summary, { duels: 3, wins: 1, losses: 1, draws: 1 });
  assert.equal(h.duels.list[0].result, "draw");
  assert.ok(e.fetched.some((u) => u.includes("bnhs-integerduel-res-2")), "keeps reading result namespaces until an empty one");
  const g = A.groupHistory(h);
  assert.equal(g.tasks.length, 1); assert.equal(g.quizOutputs.length, 1); assert.equal(g.games[0].best, 1240); assert.equal(g.counts.duels, 3);
});

test("accounts: profile photo is private, in its own Drive folder outside the shared outputs folder", () => {
  const e = env();
  const { token } = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  const img = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes").toString("base64");
  assert.equal(e.post({ action: "acctPhotoSet", token: "0".repeat(64), image: img }).relogin, true);
  assert.equal(e.post({ action: "acctPhotoSet", token, image: "data:text/html;base64,PGI+" }).ok, false);
  assert.equal(e.post({ action: "acctPhotoSet", token, image: img }).ok, true);
  assert.equal(e.files.length, 1);
  const f = e.files[0], folder = e.folders[f.folder];
  assert.equal(folder.name, "ADM Learner Photos (private)"); assert.equal(folder.parent, "MYDRIVE"); assert.notEqual(folder.parent, e.rootF.id);
  assert.equal(f.sharing, "PRIVATE/NONE"); assert.equal(folder.sharing, "PRIVATE/NONE");
  const got = e.post({ action: "acctPhotoGet", token });
  assert.equal(Buffer.from(got.data, "base64").toString(), "fake-jpeg-bytes");
  assert.equal(e.post({ action: "acctMe", token }).hasPhoto, true);
  // a second photo replaces it on the profile; the old file is kept (nothing is deleted)
  e.post({ action: "acctPhotoSet", token, image: "data:image/jpeg;base64," + Buffer.from("second").toString("base64") });
  assert.equal(e.files.length, 2);
  assert.equal(Buffer.from(e.post({ action: "acctPhotoGet", token }).data, "base64").toString(), "second");
  const big = "data:image/jpeg;base64," + Buffer.alloc(400000).toString("base64");
  assert.match(e.post({ action: "acctPhotoSet", token, image: big }).error, /too big/);
});

test("Integer Duel board photos: only official board players, Drive folder stays private", () => {
  const e = env();
  const juanImg = "data:image/jpeg;base64," + Buffer.from("juan-photo").toString("base64");
  const anaImg = "data:image/png;base64," + Buffer.from("ana-photo").toString("base64");
  const pedroImg = "data:image/jpeg;base64," + Buffer.from("pedro-secret").toString("base64");
  const { token: jt } = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  assert.equal(e.post({ action: "acctPhotoSet", token: jt, image: juanImg }).ok, true);
  const { token: at } = e.post({ action: "acctSetPin", grade: "Grade 12", section: "HUMSS", name: "Ana Bautista", pin: "5071", code: "HUMSS4" });
  assert.equal(e.post({ action: "acctPhotoSet", token: at, image: anaImg }).ok, true);
  e.sheets.Learners.rows.push(["Grade 11", "ACADS", "Reyes", "Pedro"]);
  const { token: pt } = e.post({ action: "acctSetPin", grade: "Grade 11", section: "ACADS", name: "Pedro Reyes", pin: "8153", code: "ACADS7" });
  assert.equal(e.post({ action: "acctPhotoSet", token: pt, image: pedroImg }).ok, true);
  const r = e.get({ action: "duelBoardPhotos" });
  assert.equal(r.ok, true);
  const names = (r.photos || []).map((p) => p.n).sort();
  assert.deepEqual(names, ["Ana Bautista", "Juan Dela Cruz"]);
  assert.ok(!(r.photos || []).some((p) => p.n === "Pedro Reyes" || (p.data && Buffer.from(p.data, "base64").toString() === "pedro-secret")), "learners not on the official board are never returned");
  const juan = r.photos.find((p) => p.n === "Juan Dela Cruz");
  assert.equal(Buffer.from(juan.data, "base64").toString(), "juan-photo");
  assert.match(juan.mime, /image\/jpeg/);
  assert.equal(juan.s, "ACADS");
  assert.match(juan.id, /^u[0-9a-z]+$/);
  e.files.forEach((f) => assert.equal(f.sharing, "PRIVATE/NONE"));
  const folder = e.folders[e.files[0].folder];
  assert.equal(folder.name, "ADM Learner Photos (private)");
  assert.equal(folder.sharing, "PRIVATE/NONE");
  assert.equal(folder.parent, "MYDRIVE");
});

test("accounts: teacher can list and reset a PIN only with the teacher PIN; reset logs the learner out", () => {
  const e = env();
  e.post({ action: "teacherSetPin", pin: "246813", pin2: "246813" });
  const { token } = e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "4826" });
  const no = e.post({ action: "teacherAcctList", pin: "000000" });
  assert.equal(no.ok, false); assert.equal(no.teacher, true);
  const list = e.post({ action: "teacherAcctList", pin: "246813" });
  assert.equal(list.ok, true); assert.equal(list.accounts.length, 3);
  const juan = list.accounts.find((a) => a.n === "Juan Dela Cruz"); assert.equal(juan.hasPin, true);
  assert.ok(!JSON.stringify(list).match(/v1:|ACCT_PIN/), "hashes never leave the server");
  assert.equal(e.post({ action: "teacherAcctReset", pin: "000000", key: juan.key }).ok, false);
  assert.equal(e.post({ action: "acctMe", token }).ok, true);
  assert.equal(e.post({ action: "teacherAcctReset", pin: "246813", key: juan.key }).ok, true);
  assert.equal(e.post({ action: "acctMe", token }).relogin, true);
  assert.equal(e.post({ action: "acctStatus", ...JUAN }).hasPin, false);
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, code: "ACADS7", pin: "9182" }).ok, true);
  assert.ok(e.sheets.Accounts.rows[1][7], "reset time recorded");
});

test("accounts helpers: PIN checks, session storage, photo crop plan", () => {
  assert.equal(A.pinProblem("4826"), ""); assert.match(A.pinProblem("123"), /exactly 4/); assert.match(A.pinProblem("0000"), /too easy/);
  assert.match(A.pinPairProblem("4826", "4827"), /don't match/); assert.equal(A.pinPairProblem("4826", "4826"), "");
  const m = {}, st = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  assert.equal(A.readIdentity(st), null);
  A.writeSession(st, { g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz" }, "a".repeat(64));
  assert.deepEqual(A.readIdentity(st), { g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz" });
  assert.equal(A.readToken(st), "a".repeat(64));
  assert.ok(!m[A.ID_KEY].includes("aaaa"), "identity (read by games) never contains the token");
  assert.ok(A.matchLearner([{ g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz" }], A.readIdentity(st)));
  assert.equal(A.matchLearner([{ g: "Grade 12", s: "HUMSS", n: "Juan Dela Cruz" }], A.readIdentity(st)), null);
  A.clearSession(st); assert.equal(A.readToken(st), ""); assert.equal(A.readIdentity(st), null);
  assert.deepEqual(A.photoPlan(1200, 1600), { sx: 0, sy: 200, sw: 1200, sh: 1200, w: 320, h: 320 });
  assert.deepEqual(A.photoPlan(200, 100), { sx: 50, sy: 0, sw: 100, sh: 100, w: 100, h: 100 });
  assert.equal(A.initials("Juan Dela Cruz"), "JD");
  assert.equal(A.whenLabel("2026-11-19T07:05:00.000Z"), A.whenLabel("2026-11-19 15:05"));
});

test("accounts demo backend: create PIN, log in, photo, history, logout (sample names only)", async () => {
  const m = {}, st = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
  const b = MOCK.create(st, { delay: 0 });
  const c = await b.call({ action: "config" }); assert.equal(c.learners.length, 5);
  const who = { grade: "Grade 11", section: "ACADS", name: "Juan Dela Cruz" };
  assert.equal((await b.call({ action: "acctStatus", ...who })).hasPin, false);
  assert.equal((await b.call({ action: "acctSetPin", ...who, pin: "4826", code: "NOPE" })).badCode, true);
  const s = await b.call({ action: "acctSetPin", ...who, pin: "4826", code: MOCK.CODES["grade 11|acads"] }); assert.equal(s.ok, true);
  assert.equal((await b.call({ action: "acctLogin", ...who, pin: "0001" })).badPin, true);
  const l = await b.call({ action: "acctLogin", ...who, pin: "4826" }); assert.equal(l.ok, true);
  assert.equal((await b.call({ action: "acctPhotoSet", token: l.token, image: "data:image/jpeg;base64,AAAA" })).ok, true);
  const h = await b.call({ action: "acctHistory", token: l.token }); assert.ok(h.tasks.length && h.quizzes.length && h.games.length && h.duels.list.length);
  await b.call({ action: "acctLogout", token: l.token });
  assert.equal((await b.call({ action: "acctMe", token: l.token })).relogin, true);
  assert.ok(!Object.keys(m).some((k) => !k.startsWith("adm_mock_")), "demo data stays in its own keys");
});

test("account page: PIN fields are masked numeric, PIN/token only in POST bodies, demo backend only with ?mock=1", () => {
  const html = read("account.html"), js = read("account.js");
  for (const id of ["p0", "p1", "p2"]) assert.match(html, new RegExp('type="password" id="' + id + '" inputmode="numeric"[^>]*maxlength="4"'));
  assert.match(html, /name="viewport"[^>]*width=device-width/);
  assert.match(html, /mock=1[\s\S]*accounts-mock\.js/);
  assert.ok(!/^<script src="accounts-mock\.js/m.test(html), "the demo backend is never loaded by default");
  assert.ok(!/[?&](pin|token)=/.test(js), "no PIN or token in any URL");
  assert.match(js, /method:"POST"/);
  assert.match(js, /fetch\(API_URL\+"\?action=config"/); // the only GET
  assert.match(js, /photoPlan\(im\.naturalWidth,im\.naturalHeight,320\)/); // compressed on the phone
  assert.match(html, /Integer Duel leaderboard if you play/);
});

test("portal + games use the account name: index locks the pickers, games read only the identity", () => {
  const idx = read("index.html"), app = read("app.js"), idj = read("adm-identity.js"), teacher = read("teacher.html");
  assert.match(idx, /accounts-logic\.js\?v=20261121a[\s\S]*app\.js\?v=20261120a/);
  assert.match(idx, /href="account\.html"/);
  assert.match(app, /lockToAccount\(LS,gi,ss,ns\)/);
  assert.match(idj, /adm_learner/); assert.ok(!/adm_acct_tok/.test(idj), "games never read the session token");
  assert.match(teacher, /id="va"[^>]*>👤 Accounts/);
  assert.match(read("teacher.js"), /teacherAcctReset/);
  assert.match(read("Code.gs"), /ACCOUNT_ACTIONS_\[d\.action\]\) return out_\(account_\(d\)\)/);
});

test("class codes: first-time setup needs the section's code; wrong codes are rate-limited; logins don't need it", () => {
  const none = env({ noCodes: true });
  const r0 = none.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "ANYTHING" });
  assert.equal(r0.ok, false); assert.equal(r0.noCode, true);
  const e = env();
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, pin: "4826" }).badCode, true);
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "HUMSS4" }).badCode, true, "another section's code does not work");
  const w = e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "WRONG1" }); assert.equal(w.left, 2);
  e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "WRONG2" }); e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "WRONG3" });
  const locked = e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: "ACADS7" });
  assert.equal(locked.locked, true, "5 wrong codes lock even the right code");
  assert.equal(e.post({ action: "acctStatus", ...JUAN }).hasPin, false);
  // another learner of the same section is not locked; code is case/space-insensitive
  const ana = e.post({ action: "acctSetPin", grade: "Grade 12", section: "HUMSS", name: "Ana Bautista", pin: "5071", code: " humss4 " });
  assert.equal(ana.ok, true);
  assert.equal(e.post({ action: "acctLogin", grade: "Grade 12", section: "HUMSS", name: "Ana Bautista", pin: "5071" }).ok, true, "login needs no code");
  const all = JSON.stringify(e.sheets) + e.logs.join("");
  assert.ok(!all.includes("ACADS7") && !all.includes("HUMSS4"), "codes never in the sheet or logs");
});

test("class codes: teacher sees and regenerates codes only with the teacher PIN; old code stops working", () => {
  const e = env({ noCodes: true });
  e.post({ action: "teacherSetPin", pin: "246813", pin2: "246813" });
  const no = e.post({ action: "teacherAcctCodes", pin: "000000" }); assert.equal(no.ok, false); assert.ok(!no.codes);
  assert.equal(e.post({ action: "teacherAcctCodeNew", pin: "000000", grade: "Grade 11", section: "ACADS" }).ok, false);
  const list = e.post({ action: "teacherAcctCodes", pin: "246813" });
  assert.deepEqual(list.codes.map((c) => [c.g, c.s, c.code]), [
    ["Grade 7", "Mabini", ""], ["Grade 8", "Rizal", ""], ["Grade 9", "Bonifacio", ""], ["Grade 10", "Jacinto", ""],
    ["Grade 11", "ACADS", ""], ["Grade 12", "HUMSS", ""]
  ]);
  const a = e.post({ action: "teacherAcctCodeNew", pin: "246813", grade: "Grade 11", section: "ACADS" });
  assert.match(a.code, /^[A-HJKMNP-Z2-9]{6}$/);
  const after = e.post({ action: "teacherAcctCodes", pin: "246813" });
  assert.equal(after.codes.find((c) => c.g === "Grade 11" && c.s === "ACADS").code, a.code);
  const b = e.post({ action: "teacherAcctCodeNew", pin: "246813", grade: "Grade 11", section: "ACADS" });
  assert.notEqual(a.code, b.code);
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: a.code }).badCode, true);
  assert.equal(e.post({ action: "acctSetPin", ...JUAN, pin: "4826", code: b.code.toLowerCase() }).ok, true);
  assert.equal(e.post({ action: "acctStatus", grade: "Grade 12", section: "HUMSS", name: "Ana Bautista" }).needCode, true);
  assert.equal(e.post({ action: "acctSetPin", grade: "Grade 12", section: "HUMSS", name: "Ana Bautista", pin: "5071", code: b.code }).noCode, true, "HUMSS has no code yet");
  assert.ok(!/ACADS7|HUMSS4/.test(read("Code_accounts.gs") + read("Code.gs")), "no real codes in the repo");
  assert.ok(!/[?&]code=/.test(read("account.js") + read("teacher.js")), "codes never in a URL");
});

test("login grades 7–12 and seeded JHS sections appear even with no learners in that grade", () => {
  const only11 = [{ g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz" }];
  assert.deepEqual(A.loginGrades([]), ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"]);
  assert.deepEqual(A.loginGrades(only11), ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"]);
  assert.deepEqual(A.loginSections([], "Grade 7"), ["Mabini"]);
  assert.deepEqual(A.loginSections([], "Grade 8"), ["Rizal"]);
  assert.deepEqual(A.loginSections([], "Grade 9"), ["Bonifacio"]);
  assert.deepEqual(A.loginSections([], "Grade 10"), ["Jacinto"]);
  assert.deepEqual(A.loginSections(only11, "Grade 11"), ["ACADS"]);
  assert.deepEqual(A.loginSections(only11, "Grade 12"), []);
  const e = env({ noCodes: true });
  e.post({ action: "teacherSetPin", pin: "246813", pin2: "246813" });
  const r = e.post({ action: "teacherAcctCodeNew", pin: "246813", grade: "Grade 8", section: "Rizal" });
  assert.equal(r.ok, true);
  assert.match(r.code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(e.post({ action: "teacherAcctCodeNew", pin: "246813", grade: "Grade 8", section: "NotASection" }).ok, false);
});
