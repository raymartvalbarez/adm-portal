/**
 * SHS ADM Portal — Bago National High School
 * One Apps Script web app for quiz scores, quiz schedule, tasks and photo uploads.
 * Deploy: Execute as = Me, Who has access = Anyone.
 * Never deletes rows. Only appends rows / creates folders and photo files. The only thing it ever trashes is
 * the photos it saved a moment earlier in the SAME request, when that request turns out to be a duplicate or
 * the server is busy (so a retry starts clean).
 *
 * Concurrency (Nov 12, 2026): photos are decoded and saved to Drive WITHOUT holding the script lock, so many
 * students can upload at the same time. The lock is only held briefly (a) to find/create the Drive folder chain
 * (cached, so usually skipped) and (b) to re-check "already submitted" and append the sheet row.
 */
var SHEET_ID = '1jDWuO1j3M2ZSKXhmM2IE_oOMjBO878X6f09RMpCVW0M'; // existing scores spreadsheet
var ROOT_NAME = 'ADM Outputs — Bago NHS';
var ROOT_ID = '1rdj6MJ-qCkQ7Nf1D2jBeREmT9qjKvQbI'; // Drive folder already created
var TZ = 'Asia/Manila';
var TABS = {
  scores: ['ADM Quiz Scores', ['Timestamp (Manila)','Name','Grade Level','Subject','Section','Score','Total','Percent','Topic breakdown','Answers']],
  sched:  ['Quiz Schedule',   ['Subject','Grade','Open (Y/N)','Deadline (Manila, yyyy-mm-dd hh:mm)','Notes']],
  // Columns H and I were added Nov 12, 2026 for the Teacher page (appended at the END; A-G never move).
  tasks:  ['Tasks',           ['Task ID','Grade','Subject','Title','Instructions','Deadline (Manila, yyyy-mm-dd hh:mm)','Active (Y/N)','PDF Link','Opens (Manila, yyyy-mm-dd hh:mm)']],
  subs:   ['Task Submissions',['Timestamp (Manila)','Name','Grade Level','Subject','Section','Task ID','Task Title','File count','Drive folder link']]
};

function ss_(){ return SpreadsheetApp.openById(SHEET_ID); }
function tab_(key){
  var t = TABS[key], ss = ss_(), sh = ss.getSheetByName(t[0]);
  if (!sh) { sh = ss.insertSheet(t[0]); sh.appendRow(t[1]); sh.setFrozenRows(1); }
  return sh;
}
function rows_(key){
  var sh = tab_(key), last = sh.getLastRow(), w = TABS[key][1].length;
  if (last < 2) return [];
  var mc = typeof sh.getMaxColumns === 'function' ? Math.min(w, sh.getMaxColumns()) : w; // tab may be narrower than the header list
  return sh.getRange(2, 1, last - 1, mc).getValues().map(function(r){ while (r.length < w) r.push(''); return r; });
}
function norm_(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function out_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function yes_(v){ return /^y/i.test(String(v||'').trim()) || v === true; }
function dl_(v){ // Date cell or "yyyy-mm-dd hh:mm" text -> ms (Manila) or null
  if (v instanceof Date) return v.getTime();
  var m = String(v||'').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2]-1, +m[3], (m[4]?+m[4]:23) - 8, m[5]?+m[5]:59);
}
function now_(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function quizDone_(name, subject){
  var n = norm_(name), s = norm_(subject);
  var hit = function(r){ return norm_(r[1]) === n && norm_(r[3]) === s; };
  if (rows_('scores').some(hit)) return true;
  var old = ss_().getSheetByName('Scores'); // legacy Nov 3 tab
  if (!old || old.getLastRow() < 2) return false;
  return old.getRange(2, 1, old.getLastRow() - 1, 4).getValues().some(hit);
}
function taskDone_(name, taskId){ // normalized name (lower, trimmed, punctuation->space) + Task ID
  var n = norm_(name), t = norm_(taskId);
  return rows_('subs').some(function(r){ return norm_(r[1]) === n && norm_(r[5]) === t; });
}
function schedule_(){
  return rows_('sched').filter(function(r){ return r[0]; }).map(function(r){
    return { subject: String(r[0]), grade: String(r[1]), open: yes_(r[2]), deadline: dl_(r[3]) };
  });
}
function tasks_(){ // active tasks students can see: Active = Y and the open time (column I, optional) has passed
  var now = Date.now();
  return rows_('tasks').filter(function(r){ var o = dl_(r[8]); return r[0] && yes_(r[6]) && !(o && now < o); }).map(function(r){
    var t = { id: String(r[0]), grade: String(r[1]), subject: String(r[2]), title: String(r[3]),
              instructions: String(r[4]), deadline: dl_(r[5]) };
    if (r[7]) t.pdf = String(r[7]);
    return t;
  });
}
// Drive file id from a Tasks column H URL. Empty for non-Drive values. Never reads a client-supplied file id.
function driveId_(url){
  var s = String(url == null ? '' : url).trim();
  if (!/^https:\/\/(?:drive|docs)\.google\.com\//i.test(s)) return '';
  var m = s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}
function sheetPdfIds_(){
  var ids = {};
  rows_('tasks').forEach(function(r){ var id = driveId_(r[7]); if (id) ids[id] = 1; });
  return ids;
}
/** Public GET ?action=taskPdf&task=TaskID — only an Active task whose open time has passed, and only a file id that appears in Tasks column H. */
function taskPdfGet_(taskId){
  var id = String(taskId || '').trim();
  if (!id) return { ok: false, error: 'Task is missing.' };
  var hit = null;
  rows_('tasks').forEach(function(r){ if (String(r[0]) === id) hit = r; });
  if (!hit) return { ok: false, error: 'Task not found.' };
  if (!yes_(hit[6])) return { ok: false, error: 'This task is not open.' };
  var opens = dl_(hit[8]);
  if (opens && Date.now() < opens) return { ok: false, error: 'This task is not open yet.' };
  var fileId = driveId_(hit[7]);
  if (!fileId || !sheetPdfIds_()[fileId]) return { ok: false, error: 'This task has no PDF.' };
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    if (!bytes || !bytes.length) return { ok: false, error: "Couldn't open the PDF. Please try again, or tell your teacher." };
    var mime = blob.getContentType() || file.getMimeType && file.getMimeType() || 'application/pdf';
    var head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    if (head === '%PDF-') mime = 'application/pdf';
    var name = String((file.getName && file.getName()) || 'task.pdf');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    return { ok: true, name: name, mime: mime, data: Utilities.base64Encode(bytes) };
  } catch (err) {
    return { ok: false, error: "Couldn't open the PDF. Please try again, or tell your teacher." };
  }
}
function folder_(parent, name){
  name = String(name||'Untitled').replace(/[\\\/:*?"<>|]+/g,'-').trim().slice(0,100) || 'Untitled';
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function root_(){
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('ROOT_ID') || ROOT_ID;
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(ROOT_NAME), f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  p.setProperty('ROOT_ID', f.getId());
  return f;
}

/** Run once from the editor (optional): creates tabs + Drive root and asks for permissions. */
function setup(){ Object.keys(TABS).forEach(tab_); Logger.log(root_().getUrl()); }

// Learner list for the portal name dropdown (Learners tab: A Grade, B Section, C Last, D First).
function learners_(){
  var sh = ss_().getSheetByName('Learners'); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map(function(r){
    var g = String(r[0]||'').trim(), s = String(r[1]||'').trim(), l = String(r[2]||'').trim(), f = String(r[3]||'').trim();
    return (g && s && (l || f)) ? { g: g, s: s, n: (f + ' ' + l).trim(), l: l, f: f } : null;
  }).filter(function(x){ return x; });
}
function doGet(e){
  var p = (e && e.parameter) || {};
  if (p.action === 'config') return out_({ ok: true, quizzes: schedule_(), tasks: tasks_(), learners: learners_(), now: Date.now() });
  if (p.action === 'taskPdf') return out_(taskPdfGet_(p.task)); // public: serves the task's own Drive PDF as JSON {ok,name,mime,data}
  if (p.action === 'check')  return out_({ exists: quizDone_(p.name, p.subject) });
  if (p.action === 'checkTask') return out_({ exists: taskDone_(p.name, p.task) });
  if (p.action === 'nsedCheck') return out_({ exists: nsedDone_(p.name), deadline: nsedDeadline_(), nsedFolder: nsedRoot_().getUrl() });
  if (/^teacher/i.test(String(p.action || ''))) return out_({ ok: false, teacher: true, error: 'Teacher actions are POST only and need the PIN.' });
  if (p.action === 'nsedInfo') return out_({ ok: true, nsedFolder: nsedRoot_().getUrl(), deadline: nsedDeadline_(), now: Date.now() });
  return out_({ ok: true, app: 'ADM Portal' });
}

var BUSY_ = { ok: false, busy: true, error: 'Server busy, please try again.' };
/** Runs fn() while holding the script lock. Returns null if the lock could not be taken within ms. */
function withLock_(ms, fn){
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ms)) return null;
  try { return fn(); } finally { lock.releaseLock(); }
}

function doPost(e){
  // Lock timeouts answer with JSON {busy:true} (never an HTML error page) so the portal retries automatically.
  // Nothing is kept when busy: photos saved by a busy request are trashed before answering.
  try {
    var d = JSON.parse(e.postData.contents);
    if (TEACHER_ACTIONS_[d.action]) return out_(teacher_(d));
    var r = d.action === 'nsed' ? saveNsed_(d)
          : d.type === 'task' ? saveTask_(d)
          : d.type === 'quizOutput' ? saveQuizOutput_(d)
          : withLock_(28000, function(){ return saveQuiz_(d); }); // quiz score = sheet only, already quick
    return out_(r || BUSY_);
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

/** Folder chain parent/a/b/c, cached by id so concurrent requests normally skip the lock entirely.
 *  Creating a missing folder happens under a short lock so two students never create twin folders. */
function folderPath_(parentFn, names){
  var key = 'fp:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, names.join('\u0001'), Utilities.Charset.UTF_8));
  var cache = CacheService.getScriptCache(), id = cache.get(key);
  if (id) { try { var c = DriveApp.getFolderById(id); if (!c.isTrashed()) return c; } catch (e) {} }
  var f = withLock_(20000, function(){
    var x = parentFn(); names.forEach(function(n){ x = folder_(x, n); }); return x;
  });
  if (f) cache.put(key, f.getId(), 21600);
  return f;
}
/** Decode + save photos (no lock). Returns the File objects; on any error trashes what was already saved. */
function writePhotos_(f, base, imgs){
  var files = [];
  try {
    imgs.forEach(function(b64, i){
      var bytes = Utilities.base64Decode(String(b64).replace(/^data:image\/\w+;base64,/, ''));
      files.push(f.createFile(Utilities.newBlob(bytes, 'image/jpeg', base + '_' + (i+1) + '.jpg')));
    });
  } catch (err) { trash_(files); throw err; }
  return files;
}
function trash_(files){ (files || []).forEach(function(x){ try { x.setTrashed(true); } catch (e) {} }); }

function saveQuiz_(d){
  var subject = String(d.subject||'').slice(0,80), name = String(d.name||'').slice(0,80);
  if (!name || !subject) return { ok: false, error: 'missing' };
  var s = schedule_().filter(function(q){ return norm_(q.subject) === norm_(subject); })[0];
  if (!s || !s.open || (s.deadline && Date.now() > s.deadline + 120000)) return { ok: false, closed: true };
  if (quizDone_(name, subject)) return { ok: false, dup: true, error: 'already_submitted' };
  tab_('scores').appendRow([now_(), name, String(d.grade||'').slice(0,20), subject, String(d.section||'').slice(0,60),
    Number(d.score)||0, Number(d.total)||0, (Number(d.percent)||0)+'%',
    String(d.topicBreakdown||'').slice(0,500), String(d.answers||'').slice(0,200)]);
  return { ok: true };
}

function saveTask_(d){
  var name = String(d.name||'').trim().slice(0,80), section = String(d.section||'').trim().slice(0,60);
  var t = tasks_().filter(function(x){ return x.id === String(d.taskId); })[0];
  if (!t) return { ok: false, error: 'Task not found or not active.' };
  if (t.deadline && Date.now() > t.deadline + 300000) return { ok: false, closed: true };
  if (!name || !section) return { ok: false, error: 'Name and section are required.' };
  var imgs = (d.images || []).slice(0, 5);
  if (!imgs.length) return { ok: false, error: 'No photos received.' };
  if (taskDone_(name, t.id)) return { ok: false, dup: true, error: 'already_submitted' };
  return savePhotos_(name, section, t.grade, t.subject, t.id, t.title, t.title, imgs);
}

/** Photos uploaded from the quiz score card: <Subject>/Quiz Outputs/<Section>. Task ID = QUIZ-<Subject>. */
function saveQuizOutput_(d){
  var name = String(d.name||'').trim().slice(0,80), section = String(d.section||'').trim().slice(0,60);
  var subject = String(d.subject||'').slice(0,80), id = 'QUIZ-' + subject;
  if (!name || !section || !subject) return { ok: false, error: 'Name, section and subject are required.' };
  if (!quizDone_(name, subject)) return { ok: false, error: 'No quiz score found for this name and subject yet. Please try again in a minute.' };
  var imgs = (d.images || []).slice(0, 5);
  if (!imgs.length) return { ok: false, error: 'No photos received.' };
  if (taskDone_(name, id)) return { ok: false, dup: true, error: 'already_submitted' };
  return savePhotos_(name, section, String(d.grade||'').slice(0,20), subject, id, 'Quiz Outputs', 'Quiz Output', imgs);
}

function savePhotos_(name, section, grade, subject, id, folderName, title, imgs){
  var f = folderPath_(root_, [subject, folderName, section]);
  if (!f) return BUSY_;
  var parts = name.replace(/,/g,' ').split(/\s+/).filter(String);
  var who = parts.length > 1 ? parts[parts.length-1] + '-' + parts.slice(0,-1).join('') : parts[0];
  var base = (section + '_' + who).replace(/[^A-Za-z0-9ñÑ\-_]+/g,'');
  var files = writePhotos_(f, base, imgs);            // slow part, runs in parallel for many students
  var r = withLock_(28000, function(){                 // quick: re-check duplicate + append row
    if (taskDone_(name, id)) return { ok: false, dup: true, error: 'already_submitted' };
    tab_('subs').appendRow([now_(), name, grade, subject, section, id, title, imgs.length, f.getUrl()]);
    return { ok: true, count: imgs.length };
  });
  if (!r || !r.ok) trash_(files);                     // busy or duplicate: keep nothing from this request
  return r || BUSY_;
}

// ===== 4th Quarter NSED 2026 — Duck, Cover and Hold photo portal =====
var NSED_FOLDER = '4th NSED 2026 — Duck Cover Hold';
var NSED_DEFAULT_DEADLINE = '2026-11-05 12:00'; // Manila; Script Property NSED_DEADLINE overrides
var NSED_TAB = 'NSED Submissions';
var NSED_HEAD = ['Timestamp','Grade','Section','Name','Photo Count','File Links','Folder Link'];
function nsedRoot_(){ return folder_(root_(), NSED_FOLDER); }
function nsedTab_(){
  var ss = ss_(), sh = ss.getSheetByName(NSED_TAB);
  if (!sh) { sh = ss.insertSheet(NSED_TAB); sh.appendRow(NSED_HEAD); sh.getRange(1,1,1,NSED_HEAD.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
function nsedDeadline_(){ return dl_(PropertiesService.getScriptProperties().getProperty('NSED_DEADLINE') || NSED_DEFAULT_DEADLINE); } // optional "yyyy-mm-dd hh:mm" Manila
function nsedDone_(name){
  var n = norm_(name); if (!n) return false;
  var sh = nsedTab_(); if (sh.getLastRow() < 2) return false;
  return sh.getRange(2, 4, sh.getLastRow() - 1, 1).getValues().some(function(r){ return norm_(r[0]) === n; });
}
function saveNsed_(d){
  var name = String(d.name||'').trim().slice(0,80), grade = String(d.grade||'').trim().slice(0,20), section = String(d.section||'').trim().slice(0,60);
  if (!name || !grade || !section) return { ok: false, error: 'Grade, section and name are required.' };
  var dl = nsedDeadline_(); if (dl && Date.now() > dl + 120000) return { ok: false, closed: true };
  var imgs = (d.photos || []).slice(0, 5);
  if (!imgs.length) return { ok: false, error: 'No photos received.' };
  if (nsedDone_(name)) return { ok: false, dup: true, error: 'already_submitted' };
  var hit = learners_().filter(function(x){ return norm_(x.n) === norm_(name); })[0];
  var who = hit ? ((hit.l || '') + '_' + (hit.f || '')) : name;
  var base = (section + '_' + who).replace(/\s+/g,'').replace(/[^A-Za-z0-9ñÑ\-_]+/g,'');
  var f = folderPath_(root_, [NSED_FOLDER, grade + ' - ' + section]);
  if (!f) return BUSY_;
  var files = writePhotos_(f, base, imgs);
  var links = files.map(function(x){ return x.getUrl(); });
  var r = withLock_(28000, function(){
    if (nsedDone_(name)) return { ok: false, dup: true, error: 'already_submitted' };
    nsedTab_().appendRow([now_(), grade, section, name, imgs.length, links.join('\n'), f.getUrl()]);
    return { ok: true, count: imgs.length, folderUrl: f.getUrl() };
  });
  if (!r || !r.ok) trash_(files);
  return r || BUSY_;
}

// ===== Teacher page (teacher.html): post tasks with an optional PDF, list tasks, open/close them =====
// All teacher actions are POST only (the PIN never goes in a URL) and every answer carries teacher:true so the
// page can tell a new backend from an old one. The PIN is stored only as a salted SHA-256 hash in the Script
// Property TEACHER_PIN_HASH ("salt:hex"). It is never returned. teacherSetPin works only while no PIN is set.
// To reset a forgotten PIN: Apps Script editor > Project Settings > Script Properties > delete TEACHER_PIN_HASH.
var TEACHER_ACTIONS_ = { teacherStatus: 1, teacherSetPin: 1, teacherList: 1, teacherPost: 1, teacherToggle: 1 };
var HANDOUT_FOLDER = 'Task Handouts';
var MAX_PDF_BYTES = 10 * 1024 * 1024;
var PIN_MAX_FAILS = 10, PIN_LOCK_SECS = 900;
var TEACHER_SUBJECTS = { // exact Subject strings used in the Tasks tab -> code for the Task ID
  'Grade 11': { 'General Mathematics': 'GM', 'Practical Research 1': 'PR1' },
  'Grade 12': { 'Practical Research 2': 'PR2', 'Community Engagement, Solidarity and Citizenship (CESC)': 'CESC', 'Entrepreneurship': 'ENT' }
};

function hex_(bytes){ return bytes.map(function(b){ return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function pinHash_(salt, pin){ return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin, Utilities.Charset.UTF_8)); }
function pinStored_(){ return PropertiesService.getScriptProperties().getProperty('TEACHER_PIN_HASH') || ''; }
function pinOk_(pin){
  var cache = CacheService.getScriptCache(), fails = Number(cache.get('tpin_fail') || 0);
  if (fails >= PIN_MAX_FAILS) return { ok: false, locked: true, error: 'Too many wrong PINs. Wait 15 minutes, then try again.' };
  var st = pinStored_();
  if (!st) return { ok: false, noPin: true, error: 'No teacher PIN is set yet.' };
  var i = st.indexOf(':'), salt = st.slice(0, i), want = st.slice(i + 1), got = pinHash_(salt, String(pin || ''));
  var diff = got.length ^ want.length;
  for (var k = 0; k < Math.min(got.length, want.length); k++) diff |= got.charCodeAt(k) ^ want.charCodeAt(k);
  if (!pin || diff) { cache.put('tpin_fail', String(fails + 1), PIN_LOCK_SECS); return { ok: false, badPin: true, error: 'Wrong PIN.' }; }
  return { ok: true };
}
function teacher_(d){
  var r;
  if (d.action === 'teacherStatus') r = { ok: true, pinSet: !!pinStored_() };
  else if (d.action === 'teacherSetPin') r = teacherSetPin_(d);
  else {
    var a = pinOk_(d.pin);
    if (!a.ok) r = a;
    else if (d.action === 'teacherList') r = teacherList_();
    else if (d.action === 'teacherPost') r = teacherPost_(d);
    else if (d.action === 'teacherToggle') r = teacherToggle_(d);
  }
  r = r || BUSY_;
  var o = {}; for (var k in r) o[k] = r[k]; o.teacher = true;
  return o;
}
function teacherSetPin_(d){
  var pin = String(d.pin || '');
  if (!/^\d{6,12}$/.test(pin)) return { ok: false, error: 'Use a PIN of 6 to 12 digits.' };
  return withLock_(20000, function(){
    if (pinStored_()) return { ok: false, pinSet: true, error: 'A teacher PIN is already set. It cannot be changed from the portal.' };
    var salt = Utilities.getUuid().replace(/-/g, '');
    PropertiesService.getScriptProperties().setProperty('TEACHER_PIN_HASH', salt + ':' + pinHash_(salt, pin));
    return { ok: true, pinSet: true };
  });
}
function txt_(v){ return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : String(v == null ? '' : v).trim(); }
function teacherList_(){
  var now = Date.now();
  var list = rows_('tasks').filter(function(r){ return r[0]; }).map(function(r){
    var dl = dl_(r[5]), op = dl_(r[8]), act = yes_(r[6]);
    var status = !act ? 'closed' : (dl && now > dl) ? 'ended' : (op && now < op) ? 'scheduled' : 'open';
    return { id: String(r[0]), grade: String(r[1]), subject: String(r[2]), title: String(r[3]),
             active: act, deadline: txt_(r[5]), opens: txt_(r[8]), pdf: String(r[7] || ''), status: status };
  });
  return { ok: true, tasks: list.reverse(), now: now }; // newest rows first
}
function ymd_(v){ var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[1] + m[2] + m[3] : ''; }
function dt_(v){ // "yyyy-mm-ddThh:mm" or "yyyy-mm-dd hh:mm" -> "yyyy-mm-dd hh:mm" (Manila) or ''
  var m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] : '';
}
function handoutFolder_(){ return folderPath_(root_, [HANDOUT_FOLDER]); }
function ensureTaskCols_(sh){
  var w = TABS.tasks[1].length;
  if (typeof sh.getMaxColumns === 'function' && sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  var head = sh.getRange(1, 1, 1, w).getValues()[0];
  for (var c = 7; c < w; c++) if (!String(head[c] || '').trim()) sh.getRange(1, c + 1).setValue(TABS.tasks[1][c]);
}
function teacherPost_(d){
  var grade = String(d.grade || '').trim(), subject = String(d.subject || '').trim();
  var code = TEACHER_SUBJECTS[grade] && TEACHER_SUBJECTS[grade][subject];
  if (!code) return { ok: false, error: 'Choose a grade and one of its subjects.' };
  var day = ymd_(d.release); if (!day) return { ok: false, error: 'Release date is missing.' };
  var title = String(d.title || '').trim().slice(0, 150), ins = String(d.instructions || '').trim().slice(0, 6000);
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!ins) return { ok: false, error: 'Instructions are required.' };
  var opens = dt_(d.opens) || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var close = d.close ? dt_(d.close) : '';
  if (d.close && !close) return { ok: false, error: 'Close date-time is not valid.' };
  if (close && dl_(close) <= dl_(opens)) return { ok: false, error: 'Close time must be after the open time.' };
  var file = null, pdf = '', warn = '';
  if (d.pdf) {
    var bytes = Utilities.base64Decode(String(d.pdf).replace(/^data:[^,]*,/, ''));
    if (!bytes.length || bytes.length > MAX_PDF_BYTES) return { ok: false, error: 'The PDF must be 10 MB or smaller.' };
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-') return { ok: false, error: 'That file is not a PDF.' };
    var f = handoutFolder_(); if (!f) return BUSY_;
    var name = (String(d.pdfName || title).replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9ñÑ\-_ ]+/g, '').trim().slice(0, 80) || 'Task') + '.pdf';
    file = f.createFile(Utilities.newBlob(bytes, 'application/pdf', name)); // slow part, outside the lock
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { warn = 'The PDF was saved, but Drive would not share it as "Anyone with the link". Students may not be able to open it. (' + e + ')'; }
    pdf = 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing';
  }
  var r = withLock_(28000, function(){
    var sh = tab_('tasks'); ensureTaskCols_(sh);
    var ids = {}; rows_('tasks').forEach(function(x){ ids[String(x[0])] = 1; });
    var base = grade.replace(/\D/g, '').replace(/^/, 'G') + '-' + code + '-' + day + '-', id = '';
    for (var n = 0; n < 50 && (!id || ids[id]); n++) id = base + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    if (ids[id]) return { ok: false, error: 'Could not make a unique Task ID. Please try again.' };
    var row = [id, grade, subject, title, ins, close, 'Y', pdf, opens];
    var rg = sh.getRange(sh.getLastRow() + 1, 1, 1, row.length);
    rg.setNumberFormat('@'); rg.setValues([row]); // plain text: dates stay "yyyy-mm-dd hh:mm", "=" is never a formula
    return { ok: true, id: id, pdf: pdf, opens: opens, deadline: close };
  });
  if (!r || !r.ok) trash_(file ? [file] : []);
  if (r && r.ok && warn) r.warning = warn;
  return r || BUSY_;
}
function teacherToggle_(d){
  var id = String(d.id || '').trim(), on = d.active === true || d.active === 'Y';
  if (!id) return { ok: false, error: 'Task ID is missing.' };
  return withLock_(20000, function(){
    var rs = rows_('tasks');
    for (var i = 0; i < rs.length; i++) if (String(rs[i][0]) === id) {
      tab_('tasks').getRange(i + 2, 7).setValue(on ? 'Y' : 'N');
      return { ok: true, id: id, active: on };
    }
    return { ok: false, error: 'Task not found.' };
  });
}

/**
 * Game Scores tab — a read-only sync of Integer Archer, Integer Racer,
 * Treasure Diver, and Island Navigator leaderboards from MantleDB
 * (Nov 10–12 namespaces and the Nov 13 namespaces).
 * Never renames, reorders, or deletes other tabs. Creates "Game Scores"
 * only if it is missing, and only at the end of the workbook.
 */
var GAME_SCORES_TAB = 'Game Scores';
var GAME_SCORES_HEADERS = ['Date (Asia/Manila)', 'Game', 'Grade', 'Section', 'Name', 'Score', 'Best Level'];
var GAME_SOURCES = [
  { name: 'Integer Archer', url: 'https://mantledb.sh/v2/export/bnhs-iarcher-nov10-2026', max: 5000 },
  { name: 'Integer Archer', url: 'https://mantledb.sh/v2/export/bnhs-iarcher-nov13-2026', max: 5000 },
  { name: 'Integer Racer', url: 'https://mantledb.sh/v2/export/bnhs-iracer-nov10-2026', max: 5000 },
  { name: 'Integer Racer', url: 'https://mantledb.sh/v2/export/bnhs-iracer-nov13-2026', max: 5000 },
  { name: 'Treasure Diver', url: 'https://mantledb.sh/v2/export/bnhs-tdiver-nov10-2026', max: 5000 },
  { name: 'Treasure Diver', url: 'https://mantledb.sh/v2/export/bnhs-tdiver-nov13-2026', max: 5000 },
  { name: 'Island Navigator', url: 'https://mantledb.sh/v2/export/bnhs-inavigator-nov2026', max: 1500 },
  { name: 'Island Navigator', url: 'https://mantledb.sh/v2/export/bnhs-inavigator-nov13-2026', max: 1500 }
];

function gameScoresSheet_(){
  var ss = ss_(), sh = ss.getSheetByName(GAME_SCORES_TAB);
  if (!sh) sh = ss.insertSheet(GAME_SCORES_TAB); // added at the end; other tabs are left alone
  return sh;
}

function fetchGameEntries_(src){
  var rows = [];
  try {
    var res = UrlFetchApp.fetch(src.url + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() >= 400) return rows;
    var j = JSON.parse(res.getContentText() || '{}');
    var bag = (j && j.entries) || {};
    Object.keys(bag).forEach(function(path){
      var e = bag[path];
      if (String(path).indexOf('scores/') !== 0 || !e || !e.name) return;
      var total = Number(e.total) || 0;
      if (total > src.max) return;
      var ts = Number(e.ts);
      var when = (isFinite(ts) && ts > 0) ? Utilities.formatDate(new Date(ts), TZ, 'yyyy-MM-dd HH:mm:ss') : '';
      rows.push([when, src.name, String(e.grade || ''), String(e.section || ''), String(e.name || ''), total, Number(e.bestLevel) || 0]);
    });
  } catch (err) {}
  return rows;
}

function syncGameScores(){
  var rows = [];
  GAME_SOURCES.forEach(function(src){ rows = rows.concat(fetchGameEntries_(src)); });
  rows.sort(function(a, b){
    if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1; // date desc; blank dates last
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    if (a[5] !== b[5]) return b[5] - a[5];
    return String(a[4]).localeCompare(String(b[4]));
  });
  var sh = gameScoresSheet_();
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 9).clearContent();
  sh.getRange(1, 1, 1, GAME_SCORES_HEADERS.length).setValues([GAME_SCORES_HEADERS]);
  if (rows.length) sh.getRange(2, 1, rows.length, GAME_SCORES_HEADERS.length).setValues(rows);
  sh.getRange(1, 9).setValue('Last synced (Asia/Manila): ' + now_());
  sh.setFrozenRows(1);
  try {
    var f = sh.getFilter();
    if (f) f.remove();
    sh.getRange(1, 1, Math.max(rows.length + 1, 2), GAME_SCORES_HEADERS.length).createFilter();
  } catch (err) {}
  return { ok: true, rows: rows.length, tab: GAME_SCORES_TAB };
}

/** Run this once from the Apps Script editor after deploying, to refresh the tab every 10 minutes. */
function installGameScoresTrigger(){
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncGameScores') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('syncGameScores').timeBased().everyMinutes(10).create();
  var r = syncGameScores();
  r.trigger = 'every 10 minutes';
  return r;
}
