/**
 * ADM Portal — Learner accounts (STAGED, Nov 20, 2026). Add this as a NEW script file in the same Apps Script
 * project as Code.gs. It shares Code.gs helpers (ss_, rows_, norm_, now_, txt_, withLock_, pinOk_, learners_).
 *
 * Login: the learner picks Grade + Section + Name from the Learners tab and sets their own 4-digit PIN the first
 * time; that first setup also needs their section's class code (set by the teacher on the Teacher page). Only a salted, iterated SHA-256 hash of the PIN is stored (Script Properties, never the sheet, never a URL).
 * Sessions: a random 64-hex token kept on the learner's phone, sent in the POST body only; the server keeps only
 * the token's hash. Teacher (with the teacher PIN) can list accounts and reset a learner's PIN.
 *
 * Photos (minors' personal data): saved in a PRIVATE Drive folder "ADM Learner Photos (private)" in the teacher's
 * own Drive (not inside the shared outputs folder) and never link-shared. Served to that learner's session, and as
 * small thumbnails on the public Integer Duel leaderboard only for learners who appear in official duel results.
 * Not shown on other game leaderboards. Old photos are never deleted (the newest one is used).
 *
 * Sheet: one NEW tab "Accounts" (created on first use, at the end). No existing tab is renamed or changed.
 * History is read-only: Task Submissions, ADM Quiz Scores (score only, never answers), game score exports and
 * Integer Duel results.
 */
var ACCT_TAB = 'Accounts';
var ACCT_HEAD = ['Grade', 'Section', 'Name', 'Account key', 'Created (Manila)', 'Last login (Manila)', 'Photo file id', 'PIN reset (Manila)', 'Photo updated (Manila)'];
var ACCT_PHOTO_FOLDER = 'ADM Learner Photos (private)';
var ACCT_SESSION_DAYS = 120;          // stays logged in on the phone for a school term unless they log out
var ACCT_MAX_TOKENS = 4;              // phones logged in at once per learner
var ACCT_MAX_FAILS = 5, ACCT_LOCK_SECS = 900;          // 5 wrong PINs -> wait 15 minutes
var ACCT_DAY_FAILS = 15, ACCT_DAY_SECS = 21600;        // 15 wrong PINs in 6 hours -> wait 6 hours
var ACCT_HASH_ROUNDS = 300;
var ACCT_PHOTO_MAX = 300000;          // bytes; the phone compresses to ~30-60 KB first
var ACCT_WEAK_PINS = { '0000':1,'1111':1,'2222':1,'3333':1,'4444':1,'5555':1,'6666':1,'7777':1,'8888':1,'9999':1,'1234':1,'4321':1,'0123':1,'9876':1,'1212':1,'6969':1 };
// Class codes: one per section, set by the teacher on the Teacher page. Needed ONLY to create an account (first PIN).
// Kept in Script Properties (ACCT_CODE_<id>), never in the sheet, the repo, a URL or the logs.
var ACCT_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
var ACCT_CODE_LEN = 6;
var ACCT_CODE_MAX_FAILS = 5, ACCT_CODE_LOCK_SECS = 900;       // per learner: 5 wrong codes -> wait 15 minutes
var ACCT_CODE_SEC_FAILS = 40, ACCT_CODE_SEC_SECS = 21600;     // per section: 40 wrong codes in 6 hours -> wait
var ACCOUNT_ACTIONS_ = { teacherAcctCodes: 1, teacherAcctCodeNew: 1, acctStatus: 1, acctSetPin: 1, acctLogin: 1, acctMe: 1, acctPhotoSet: 1, acctPhotoGet: 1, acctHistory: 1, acctLogout: 1, teacherAcctList: 1, teacherAcctReset: 1 };

// Game score exports (public, read-only). Keep in sync with the games' namespaces.
var ACCT_GAME_SOURCES = [
  { game: 'Integer Racer', round: 'Nov 10', ns: 'bnhs-iracer-nov10-2026' },
  { game: 'Integer Racer', round: 'Nov 13', ns: 'bnhs-iracer-nov13-2026' },
  { game: 'Integer Racer', round: 'Nov 18', ns: 'bnhs-iracer-nov18-2026' },
  { game: 'Integer Archer', round: 'Nov 10', ns: 'bnhs-iarcher-nov10-2026' },
  { game: 'Integer Archer', round: 'Nov 13', ns: 'bnhs-iarcher-nov13-2026' },
  { game: 'Integer Archer', round: 'Nov 18', ns: 'bnhs-iarcher-nov18-2026' },
  { game: 'Treasure Diver', round: 'Nov 10', ns: 'bnhs-tdiver-nov10-2026' },
  { game: 'Treasure Diver', round: 'Nov 13', ns: 'bnhs-tdiver-nov13-2026' },
  { game: 'Treasure Diver', round: 'Nov 18', ns: 'bnhs-tdiver-nov18-2026' },
  { game: 'Island Navigator', round: 'Nov 2026', ns: 'bnhs-inavigator-nov2026' },
  { game: 'Island Navigator', round: 'Nov 13', ns: 'bnhs-inavigator-nov13-2026' },
  { game: 'Island Navigator', round: 'Nov 18', ns: 'bnhs-inavigator-nov18-2026' }
];
var ACCT_DUEL_LEGACY = 'bnhs-integerduel-nov2026', ACCT_DUEL_RES = 'bnhs-integerduel-res-';
var ACCT_EXPORT = 'https://mantledb.sh/v2/export/';

function acctProps_(){ return PropertiesService.getScriptProperties(); }
function acctSha_(s){ return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function acctKey_(g, s, n){ return norm_(g) + '|' + norm_(s) + '|' + norm_(n); }
function acctId_(key){ return acctSha_('acct|' + key).slice(0, 32); }
function acctGradeNum_(g){ return String(g || '').replace(/\D/g, ''); }
function acctLearner_(d){
  var g = norm_(d && d.grade), s = norm_(d && d.section), n = norm_(d && d.name);
  if (!g || !s || !n) return null;
  var hit = learners_().filter(function(x){ return norm_(x.g) === g && norm_(x.s) === s && norm_(x.n) === n; })[0];
  if (!hit) return null;
  var key = acctKey_(hit.g, hit.s, hit.n);
  return { g: hit.g, s: hit.s, n: hit.n, key: key, id: acctId_(key) };
}
function acctPinHash_(salt, pin){
  var h = acctSha_(salt + '|' + pin);
  for (var i = 0; i < ACCT_HASH_ROUNDS; i++) h = acctSha_(salt + '|' + h);
  return h;
}
function acctSame_(a, b){
  a = String(a || ''); b = String(b || '');
  var diff = a.length ^ b.length;
  for (var k = 0; k < Math.min(a.length, b.length); k++) diff |= a.charCodeAt(k) ^ b.charCodeAt(k);
  return diff === 0 && a.length > 0;
}
function acctPinProblem_(pin){
  pin = String(pin == null ? '' : pin);
  if (!/^\d{4}$/.test(pin)) return 'Your PIN must be exactly 4 numbers.';
  if (ACCT_WEAK_PINS[pin]) return 'That PIN is too easy to guess. Choose a different 4-digit PIN.';
  return '';
}

// ---------- Accounts tab (new tab, appended at the end) ----------
function acctTab_(){
  var ss = ss_(), sh = ss.getSheetByName(ACCT_TAB);
  if (!sh) { sh = ss.insertSheet(ACCT_TAB); sh.appendRow(ACCT_HEAD); sh.setFrozenRows(1); }
  return sh;
}
function acctRows_(){
  var sh = acctTab_(), last = sh.getLastRow(), w = ACCT_HEAD.length;
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, w).getValues().map(function(r){ while (r.length < w) r.push(''); return r; });
}
function acctRowIndex_(key){
  var rows = acctRows_();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][3]) === key) return { row: i + 2, values: rows[i] };
  return null;
}
/** Set some columns (1-based col -> value) on the learner's row, creating the row if needed. Call inside the lock. */
function acctUpsert_(L, cols){
  var sh = acctTab_(), hit = acctRowIndex_(L.key);
  if (!hit) {
    var r = [L.g, L.s, L.n, L.key, '', '', '', '', ''];
    Object.keys(cols).forEach(function(c){ r[Number(c) - 1] = cols[c]; });
    sh.appendRow(r);
    return;
  }
  Object.keys(cols).forEach(function(c){ sh.getRange(hit.row, Number(c)).setValue(cols[c]); });
}

// ---------- sessions ----------
function acctIssueToken_(L){
  var p = acctProps_(), token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  var th = acctSha_('tok|' + token), exp = Date.now() + ACCT_SESSION_DAYS * 86400000;
  p.setProperty('ACCT_TOK_' + th, JSON.stringify({ id: L.id, key: L.key, exp: exp }));
  var list = []; try { list = JSON.parse(p.getProperty('ACCT_TOKS_' + L.id) || '[]'); } catch (e) {}
  list.push(th);
  while (list.length > ACCT_MAX_TOKENS) { try { p.deleteProperty('ACCT_TOK_' + list.shift()); } catch (e) {} }
  p.setProperty('ACCT_TOKS_' + L.id, JSON.stringify(list));
  return token;
}
function acctRevokeAll_(id){
  var p = acctProps_(), list = [];
  try { list = JSON.parse(p.getProperty('ACCT_TOKS_' + id) || '[]'); } catch (e) {}
  list.forEach(function(th){ try { p.deleteProperty('ACCT_TOK_' + th); } catch (e) {} });
  try { p.deleteProperty('ACCT_TOKS_' + id); } catch (e) {}
}
function acctSession_(token){
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  var p = acctProps_(), th = acctSha_('tok|' + token), raw = p.getProperty('ACCT_TOK_' + th);
  if (!raw) return null;
  var s = null; try { s = JSON.parse(raw); } catch (e) { return null; }
  if (!s || !s.key || Number(s.exp) < Date.now()) { try { p.deleteProperty('ACCT_TOK_' + th); } catch (e) {} return null; }
  if (!p.getProperty('ACCT_PIN_' + s.id)) return null; // PIN was reset by the teacher
  var L = learners_().filter(function(x){ return acctKey_(x.g, x.s, x.n) === s.key; })[0];
  if (!L) return null; // learner removed from the class list
  return { th: th, learner: { g: L.g, s: L.s, n: L.n, key: s.key, id: s.id } };
}
var ACCT_RELOGIN = { ok: false, relogin: true, error: 'Please log in again.' };

// ---------- learner actions ----------
function acctStatus_(d){
  var L = acctLearner_(d);
  if (!L) return { ok: false, error: 'Your name was not found on the class list. Ask Sir Raymart.' };
  var has = !!acctProps_().getProperty('ACCT_PIN_' + L.id);
  return { ok: true, hasPin: has, needCode: !has };
}
function acctSecId_(g, s){ return acctSha_('sec|' + norm_(g) + '|' + norm_(s)).slice(0, 24); }
function acctCodeNorm_(c){ return String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function acctNewCode_(){
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + '|' + Date.now(), Utilities.Charset.UTF_8), out = '';
  for (var i = 0; i < ACCT_CODE_LEN; i++) out += ACCT_CODE_CHARS.charAt((b[i] & 255) % ACCT_CODE_CHARS.length);
  return out;
}
/** Checks the section's class code for a first-time setup. Returns '' when OK, else an answer object. */
function acctCodeCheck_(L, code){
  var cache = CacheService.getScriptCache(), sid = acctSecId_(L.g, L.s);
  var fk = 'acct_cfail_' + L.id, sk = 'acct_csfail_' + sid;
  var fails = Number(cache.get(fk) || 0), sfails = Number(cache.get(sk) || 0);
  if (fails >= ACCT_CODE_MAX_FAILS) return { ok: false, locked: true, error: 'Too many wrong class codes. Wait 15 minutes, then try again.' };
  if (sfails >= ACCT_CODE_SEC_FAILS) return { ok: false, locked: true, error: 'Too many wrong class codes for your section. Try again later, or ask Sir Raymart.' };
  var want = acctProps_().getProperty('ACCT_CODE_' + sid);
  if (!want) return { ok: false, noCode: true, error: "Account setup isn't open for your section yet. Ask Sir Raymart for the class code." };
  if (!acctSame_(acctCodeNorm_(code), want)) {
    cache.put(fk, String(fails + 1), ACCT_CODE_LOCK_SECS); cache.put(sk, String(sfails + 1), ACCT_CODE_SEC_SECS);
    var left = ACCT_CODE_MAX_FAILS - fails - 1;
    return { ok: false, badCode: true, left: left, error: left > 0 ? 'Wrong class code. ' + left + (left === 1 ? ' try' : ' tries') + ' left.' : 'Too many wrong class codes. Wait 15 minutes, then try again.' };
  }
  cache.put(fk, '0', 1);
  return '';
}
function acctSetPin_(d){
  var L = acctLearner_(d);
  if (!L) return { ok: false, error: 'Your name was not found on the class list. Ask Sir Raymart.' };
  var bad = acctPinProblem_(d.pin); if (bad) return { ok: false, error: bad };
  if (acctProps_().getProperty('ACCT_PIN_' + L.id)) return { ok: false, exists: true, error: 'This account already has a PIN. Enter your PIN, or ask Sir Raymart to reset it.' };
  var cc = acctCodeCheck_(L, d.code); if (cc) return cc;
  var r = withLock_(20000, function(){
    var p = acctProps_();
    if (p.getProperty('ACCT_PIN_' + L.id)) return { ok: false, exists: true, error: 'This account already has a PIN. Enter your PIN, or ask Sir Raymart to reset it.' };
    var salt = Utilities.getUuid().replace(/-/g, '');
    p.setProperty('ACCT_PIN_' + L.id, 'v1:' + salt + ':' + acctPinHash_(salt, String(d.pin)));
    var hit = acctRowIndex_(L.key), t = now_();
    acctUpsert_(L, hit && hit.values[4] ? { 6: t } : { 5: t, 6: t });
    return { ok: true, token: acctIssueToken_(L), me: { g: L.g, s: L.s, n: L.n } };
  });
  return r || BUSY_;
}
function acctLogin_(d){
  var L = acctLearner_(d);
  if (!L) return { ok: false, error: 'Your name was not found on the class list. Ask Sir Raymart.' };
  var cache = CacheService.getScriptCache(), fk = 'acct_fail_' + L.id, dk = 'acct_dfail_' + L.id;
  var fails = Number(cache.get(fk) || 0), dfails = Number(cache.get(dk) || 0);
  if (dfails >= ACCT_DAY_FAILS) return { ok: false, locked: true, error: 'Too many wrong PINs. Try again later, or ask Sir Raymart to reset your PIN.' };
  if (fails >= ACCT_MAX_FAILS) return { ok: false, locked: true, error: 'Too many wrong PINs. Wait 15 minutes, then try again.' };
  var st = acctProps_().getProperty('ACCT_PIN_' + L.id);
  if (!st) return { ok: false, noPin: true, error: 'No PIN yet. Create your 4-digit PIN first.' };
  var parts = String(st).split(':'), pin = String(d.pin == null ? '' : d.pin);
  if (!/^\d{4}$/.test(pin) || !acctSame_(acctPinHash_(parts[1], pin), parts[2])) {
    cache.put(fk, String(fails + 1), ACCT_LOCK_SECS); cache.put(dk, String(dfails + 1), ACCT_DAY_SECS);
    var left = ACCT_MAX_FAILS - fails - 1;
    return { ok: false, badPin: true, left: left, error: left > 0 ? 'Wrong PIN. ' + left + (left === 1 ? ' try' : ' tries') + ' left.' : 'Too many wrong PINs. Wait 15 minutes, then try again.' };
  }
  cache.put(fk, '0', 1);
  var token = acctIssueToken_(L);
  withLock_(10000, function(){ acctUpsert_(L, { 6: now_() }); });
  return { ok: true, token: token, me: { g: L.g, s: L.s, n: L.n } };
}
function acctMe_(S){
  var hit = acctRowIndex_(S.learner.key);
  return { ok: true, me: { g: S.learner.g, s: S.learner.s, n: S.learner.n }, hasPhoto: !!(hit && hit.values[6]) };
}
function acctPhotoFolder_(){
  var p = acctProps_(), id = p.getProperty('ACCT_PHOTO_FOLDER_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  return withLock_(20000, function(){
    var again = p.getProperty('ACCT_PHOTO_FOLDER_ID');
    if (again && again !== id) { try { return DriveApp.getFolderById(again); } catch (e) {} }
    var f = DriveApp.createFolder(ACCT_PHOTO_FOLDER); // teacher's own My Drive, not inside any shared folder
    try { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
    p.setProperty('ACCT_PHOTO_FOLDER_ID', f.getId());
    return f;
  });
}
function acctPhotoSet_(S, d){
  var m = String(d.image || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) return { ok: false, error: 'Please choose a photo (JPG or PNG).' };
  var bytes = Utilities.base64Decode(m[2]);
  if (!bytes.length || bytes.length > ACCT_PHOTO_MAX) return { ok: false, error: 'The photo is too big. Please try another photo.' };
  var folder = acctPhotoFolder_(); if (!folder) return BUSY_;
  var L = S.learner, stamp = now_().replace(/[^0-9]/g, '');
  var file = folder.createFile(Utilities.newBlob(bytes, 'image/' + m[1], L.n + ' (' + L.s + ') ' + stamp + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])));
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) {}
  var ok = withLock_(15000, function(){ acctUpsert_(L, { 7: file.getId(), 9: now_() }); return true; });
  return ok ? { ok: true } : BUSY_; // a busy retry just adds one more private file; nothing is deleted
}
function acctPhotoGet_(S){
  var hit = acctRowIndex_(S.learner.key), id = hit && String(hit.values[6] || '');
  if (!id) return { ok: true, none: true };
  try {
    var f = DriveApp.getFileById(id), b = f.getBlob();
    return { ok: true, mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
  } catch (e) { return { ok: true, none: true }; }
}
function duelBoardPid_(n, g, s){
  var key = norm_(n) + '|' + acctGradeNum_(g) + '|' + norm_(s);
  var h = 2166136261;
  for (var i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  var t = (h >>> 0).toString(36);
  while (t.length < 7) t = '0' + t;
  return 'u' + t;
}
function duelBoardResults_(){
  var seen = {}, players = [];
  var read = function(j){
    var bag = (j && j.entries) || {}, n = 0;
    Object.keys(bag).forEach(function(k){
      var r = bag[k];
      if (k.indexOf('r-') !== 0 || !r || !r.a || !r.b) return;
      n++;
      ['a', 'b'].forEach(function(side){
        var me = r[side];
        if (!me || !me.n) return;
        var loose = norm_(me.n) + '|' + acctGradeNum_(me.g);
        var full = loose + '|' + norm_(me.s);
        if (seen[full]) return;
        seen[full] = 1;
        players.push({ n: String(me.n), g: String(me.g || ''), s: String(me.s || ''), loose: loose, full: full });
      });
    });
    return n;
  };
  var first = acctFetchJson_([ACCT_EXPORT + ACCT_DUEL_LEGACY]);
  read(first[ACCT_EXPORT + ACCT_DUEL_LEGACY]);
  for (var start = 1; start < 200; start += 5) {
    var urls = []; for (var i = start; i < start + 5; i++) urls.push(ACCT_EXPORT + ACCT_DUEL_RES + i);
    var got = acctFetchJson_(urls), stop = false;
    for (var k = 0; k < urls.length; k++) { if (!read(got[urls[k]])) { stop = true; break; } }
    if (stop) break;
  }
  return players;
}
function duelBoardThumb_(fileId){
  var cache = CacheService.getScriptCache(), ck = 'duelThumb:' + fileId;
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  try {
    var f = DriveApp.getFileById(fileId), b = f.getBlob();
    var mime = String(b.getContentType() || 'image/jpeg');
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) return null;
    var data = Utilities.base64Encode(b.getBytes());
    if (!data) return null;
    var thumb = { mime: mime, data: data };
    if (data.length < 90000) { try { cache.put(ck, JSON.stringify(thumb), 600); } catch (e) {} }
    return thumb;
  } catch (e) { return null; }
}
/** Public: small profile photos for learners who appear on the official Integer Duel leaderboard only.
 *  The Drive folder stays private. Learners not in official results are never returned. */
function duelBoardPhotos_(){
  var cache = CacheService.getScriptCache(), ck = 'duelBoardPhotos:v1';
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var players = duelBoardResults_();
  var byFull = {}, byLoose = {};
  learners_().forEach(function(x){
    var loose = norm_(x.n) + '|' + acctGradeNum_(x.g);
    var full = loose + '|' + norm_(x.s);
    var rec = { L: x };
    byFull[full] = rec;
    if (!byLoose[loose]) byLoose[loose] = rec;
    else byLoose[loose] = { ambig: true };
  });
  var sh = ss_().getSheetByName(ACCT_TAB), photoByKey = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, ACCT_HEAD.length).getValues().forEach(function(r){
      var key = String(r[3] || ''), id = String(r[6] || '');
      if (key && id) photoByKey[key] = id;
    });
  }
  var photos = [], used = {};
  players.forEach(function(p){
    var rec = byFull[p.full];
    if (!rec) {
      rec = byLoose[p.loose];
      if (rec && rec.ambig) rec = null;
    }
    if (!rec || !rec.L) return;
    var L = rec.L, fileId = photoByKey[acctKey_(L.g, L.s, L.n)];
    if (!fileId || used[fileId]) return;
    used[fileId] = 1;
    var thumb = duelBoardThumb_(fileId);
    if (!thumb) return;
    photos.push({ n: L.n, g: L.g, s: L.s, id: duelBoardPid_(L.n, L.g, L.s), mime: thumb.mime, data: thumb.data });
  });
  var out = { ok: true, photos: photos };
  try { var s = JSON.stringify(out); if (s.length < 95000) cache.put(ck, s, 180); } catch (e) {}
  return out;
}
function acctLogout_(d){
  var token = String(d.token || '');
  if (/^[a-f0-9]{64}$/.test(token)) { try { acctProps_().deleteProperty('ACCT_TOK_' + acctSha_('tok|' + token)); } catch (e) {} }
  return { ok: true };
}

// ---------- history (read-only) ----------
function acctFetchJson_(urls){
  var cache = CacheService.getScriptCache(), out = {}, need = [];
  urls.forEach(function(u){ var c = cache.get('ax:' + u); if (c != null) { try { out[u] = JSON.parse(c); } catch (e) { need.push(u); } } else need.push(u); });
  if (need.length) {
    var res = UrlFetchApp.fetchAll(need.map(function(u){ return { url: u + '?t=' + Date.now(), muteHttpExceptions: true, followRedirects: true }; }));
    res.forEach(function(r, i){
      var u = need[i], j = null, txt = '';
      try { if (r.getResponseCode() < 400) { txt = r.getContentText() || ''; j = JSON.parse(txt || '{}'); } } catch (e) { j = null; }
      out[u] = j;
      if (j && txt.length < 95000) { try { cache.put('ax:' + u, txt, 120); } catch (e) {} }
    });
  }
  return out;
}
function acctGames_(L){
  var n = norm_(L.n), g = acctGradeNum_(L.g), urls = ACCT_GAME_SOURCES.map(function(s){ return ACCT_EXPORT + s.ns; });
  var got = acctFetchJson_(urls), out = [];
  ACCT_GAME_SOURCES.forEach(function(src, i){
    var bag = (got[urls[i]] && got[urls[i]].entries) || {};
    Object.keys(bag).forEach(function(path){
      var e = bag[path];
      if (String(path).indexOf('scores/') !== 0 || !e || !e.name) return;
      if (norm_(e.name) !== n || (e.grade && acctGradeNum_(e.grade) !== g)) return;
      var ts = Number(e.ts);
      out.push({ game: src.game, round: src.round, score: Number(e.total) || 0, level: Number(e.bestLevel) || 0,
        when: isFinite(ts) && ts > 0 ? Utilities.formatDate(new Date(ts), TZ, 'yyyy-MM-dd HH:mm') : '' });
    });
  });
  return out;
}
function acctDuels_(L){
  var n = norm_(L.n), g = acctGradeNum_(L.g), list = [], seen = {}, nss = [ACCT_DUEL_LEGACY];
  var read = function(j){
    var bag = (j && j.entries) || {};
    Object.keys(bag).forEach(function(k){
      var r = bag[k];
      if (k.indexOf('r-') !== 0 || seen[k] || !r || !r.a || !r.b || !r.t) return;
      seen[k] = 1;
      ['a', 'b'].forEach(function(side){
        var me = r[side], op = r[side === 'a' ? 'b' : 'a'];
        if (!me || norm_(me.n) !== n || acctGradeNum_(me.g) !== g) return;
        list.push({ when: String(r.t), opponent: String(op.n || ''), oppGrade: acctGradeNum_(op.g), mine: Number(me.p) || 0, theirs: Number(op.p) || 0,
          result: r.w === 'd' ? 'draw' : (r.w === side ? 'win' : 'loss') });
      });
    });
    return Object.keys(bag).length;
  };
  var first = acctFetchJson_([ACCT_EXPORT + ACCT_DUEL_LEGACY]);
  read(first[ACCT_EXPORT + ACCT_DUEL_LEGACY]);
  for (var start = 1; start < 200; start += 5) {
    var urls = []; for (var i = start; i < start + 5; i++) urls.push(ACCT_EXPORT + ACCT_DUEL_RES + i);
    var got = acctFetchJson_(urls), stop = false;
    for (var k = 0; k < urls.length; k++) { if (!read(got[urls[k]])) { stop = true; break; } }
    if (stop) break;
  }
  list.sort(function(a, b){ return a.when < b.when ? 1 : -1; });
  var sum = { duels: list.length, wins: 0, losses: 0, draws: 0 };
  list.forEach(function(x){ sum[x.result === 'win' ? 'wins' : x.result === 'loss' ? 'losses' : 'draws']++; });
  return { summary: sum, list: list.slice(0, 100) };
}
function acctHistory_(S){
  var L = S.learner, n = norm_(L.n), g = acctGradeNum_(L.g);
  var mine = function(r){ return norm_(r[1]) === n && (!String(r[2] || '').trim() || acctGradeNum_(r[2]) === g); };
  var tasks = rows_('subs').filter(mine).map(function(r){
    var id = String(r[5] || '');
    return { when: txt_(r[0]), subject: String(r[3] || ''), taskId: id, title: String(r[6] || ''), files: Number(r[7]) || 0, kind: /^QUIZ-/i.test(id) ? 'quizOutput' : 'task' };
  });
  // Score only. Topic breakdown and answers are never sent to the learner.
  var quizzes = rows_('scores').filter(mine).map(function(r){
    return { when: txt_(r[0]), subject: String(r[3] || ''), score: Number(r[5]) || 0, total: Number(r[6]) || 0, percent: String(r[7] || '') };
  });
  var games = [], duels = { summary: { duels: 0, wins: 0, losses: 0, draws: 0 }, list: [] }, gamesError = false;
  try { games = acctGames_(L); } catch (e) { gamesError = true; }
  try { duels = acctDuels_(L); } catch (e) { gamesError = true; }
  return { ok: true, me: { g: L.g, s: L.s, n: L.n }, tasks: tasks, quizzes: quizzes, games: games, duels: duels, gamesError: gamesError };
}

// ---------- teacher actions (teacher PIN in the POST body) ----------
function teacherAcctList_(){
  var p = acctProps_(), rows = acctRows_(), byKey = {};
  rows.forEach(function(r){ byKey[String(r[3])] = r; });
  var list = learners_().map(function(x){
    var key = acctKey_(x.g, x.s, x.n), r = byKey[key] || [];
    return { g: x.g, s: x.s, n: x.n, key: key, hasPin: !!p.getProperty('ACCT_PIN_' + acctId_(key)), created: txt_(r[4]), lastLogin: txt_(r[5]), hasPhoto: !!r[6], reset: txt_(r[7]) };
  });
  return { ok: true, accounts: list };
}
function teacherAcctReset_(d){
  var key = String(d.key || ''), L = learners_().filter(function(x){ return acctKey_(x.g, x.s, x.n) === key; })[0];
  if (!L) return { ok: false, error: 'Learner not found.' };
  var Lx = { g: L.g, s: L.s, n: L.n, key: key, id: acctId_(key) };
  var r = withLock_(20000, function(){
    acctProps_().deleteProperty('ACCT_PIN_' + Lx.id);
    acctRevokeAll_(Lx.id);
    acctUpsert_(Lx, { 8: now_() });
    return { ok: true, name: L.n };
  });
  return r || BUSY_;
}

function acctSeedSections_(){
  return [
    { g: 'Grade 7', s: 'Mabini' },
    { g: 'Grade 8', s: 'Rizal' },
    { g: 'Grade 9', s: 'Bonifacio' },
    { g: 'Grade 10', s: 'Jacinto' }
  ];
}
function acctSections_(){
  var seen = {}, out = [];
  function add(x){
    if (!x || !x.g || !x.s) return;
    var k = norm_(x.g) + '|' + norm_(x.s);
    if (seen[k]) return;
    seen[k] = 1;
    out.push({ g: x.g, s: x.s });
  }
  acctSeedSections_().forEach(add);
  learners_().forEach(add);
  out.sort(function(a, b){
    var ga = Number(String(a.g).replace(/\D/g, '')) || 0, gb = Number(String(b.g).replace(/\D/g, '')) || 0;
    return ga !== gb ? ga - gb : String(a.s).localeCompare(String(b.s));
  });
  return out;
}
/** Teacher only (teacher PIN): current class code of every section. */
function teacherAcctCodes_(){
  var p = acctProps_();
  return { ok: true, codes: acctSections_().map(function(x){ return { g: x.g, s: x.s, code: p.getProperty('ACCT_CODE_' + acctSecId_(x.g, x.s)) || '' }; }) };
}
/** Teacher only: make a new class code for one section (the old one stops working). Accounts already made are not affected. */
function teacherAcctCodeNew_(d){
  var sec = acctSections_().filter(function(x){ return norm_(x.g) === norm_(d.grade) && norm_(x.s) === norm_(d.section); })[0];
  if (!sec) return { ok: false, error: 'Section not found.' };
  var code = acctNewCode_();
  acctProps_().setProperty('ACCT_CODE_' + acctSecId_(sec.g, sec.s), code);
  return { ok: true, g: sec.g, s: sec.s, code: code };
}

/** Router. Code.gs doPost calls this first for any action in ACCOUNT_ACTIONS_. */
function account_(d){
  if (/^teacher/.test(d.action)) {
    var chk = pinOk_(d.pin), r;
    if (!chk.ok) r = chk;
    else if (d.action === 'teacherAcctList') r = teacherAcctList_();
    else if (d.action === 'teacherAcctCodes') r = teacherAcctCodes_();
    else if (d.action === 'teacherAcctCodeNew') r = teacherAcctCodeNew_(d);
    else r = teacherAcctReset_(d);
    var o = { teacher: true }; Object.keys(r).forEach(function(k){ o[k] = r[k]; }); o.teacher = true;
    return o;
  }
  if (d.action === 'acctStatus') return acctStatus_(d);
  if (d.action === 'acctSetPin') return acctSetPin_(d);
  if (d.action === 'acctLogin') return acctLogin_(d);
  if (d.action === 'acctLogout') return acctLogout_(d);
  var S = acctSession_(d.token);
  if (!S) return ACCT_RELOGIN;
  if (d.action === 'acctMe') return acctMe_(S);
  if (d.action === 'acctPhotoSet') return acctPhotoSet_(S, d);
  if (d.action === 'acctPhotoGet') return acctPhotoGet_(S);
  if (d.action === 'acctHistory') return acctHistory_(S);
  return { ok: false, error: 'Unknown action.' };
}
