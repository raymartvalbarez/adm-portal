/**
 * SHS ADM Portal — Bago National High School
 * One Apps Script web app for quiz scores, quiz schedule, tasks and photo uploads.
 * Deploy: Execute as = Me, Who has access = Anyone.
 * Never deletes files or rows. Only appends rows / creates folders.
 */
var SHEET_ID = '1jDWuO1j3M2ZSKXhmM2IE_oOMjBO878X6f09RMpCVW0M'; // existing scores spreadsheet
var ROOT_NAME = 'ADM Outputs — Bago NHS';
var ROOT_ID = '1rdj6MJ-qCkQ7Nf1D2jBeREmT9qjKvQbI'; // Drive folder already created
var TZ = 'Asia/Manila';
var TABS = {
  scores: ['ADM Quiz Scores', ['Timestamp (Manila)','Name','Grade Level','Subject','Section','Score','Total','Percent','Topic breakdown','Answers']],
  sched:  ['Quiz Schedule',   ['Subject','Grade','Open (Y/N)','Deadline (Manila, yyyy-mm-dd hh:mm)','Notes']],
  tasks:  ['Tasks',           ['Task ID','Grade','Subject','Title','Instructions','Deadline (Manila, yyyy-mm-dd hh:mm)','Active (Y/N)']],
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
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, w).getValues();
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
function tasks_(){
  return rows_('tasks').filter(function(r){ return r[0] && yes_(r[6]); }).map(function(r){
    return { id: String(r[0]), grade: String(r[1]), subject: String(r[2]), title: String(r[3]),
             instructions: String(r[4]), deadline: dl_(r[5]) };
  });
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
  if (p.action === 'check')  return out_({ exists: quizDone_(p.name, p.subject) });
  if (p.action === 'checkTask') return out_({ exists: taskDone_(p.name, p.task) });
  return out_({ ok: true, app: 'ADM Portal' });
}

function doPost(e){
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var d = JSON.parse(e.postData.contents);
    return out_(d.type === 'task' ? saveTask_(d) : d.type === 'quizOutput' ? saveQuizOutput_(d) : saveQuiz_(d));
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}

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
  var f = folder_(folder_(folder_(root_(), subject), folderName), section);
  var parts = name.replace(/,/g,' ').split(/\s+/).filter(String);
  var who = parts.length > 1 ? parts[parts.length-1] + '-' + parts.slice(0,-1).join('') : parts[0];
  var base = (section + '_' + who).replace(/[^A-Za-z0-9ñÑ\-_]+/g,'');
  imgs.forEach(function(b64, i){
    var bytes = Utilities.base64Decode(String(b64).replace(/^data:image\/\w+;base64,/, ''));
    f.createFile(Utilities.newBlob(bytes, 'image/jpeg', base + '_' + (i+1) + '.jpg'));
  });
  tab_('subs').appendRow([now_(), name, grade, subject, section, id, title, imgs.length, f.getUrl()]);
  return { ok: true, count: imgs.length };
}
