"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const logic = require("../logic.js");

const root = path.join(__dirname, "..");

function loadSubj() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), ctx);
  return ctx.SUBJ;
}

test("legacy task ids keep Nov 4 and Nov 5 groups", () => {
  assert.equal(logic.taskReleaseDate({ id: "G11-PR1-1" }), "2026-11-04");
  assert.equal(logic.taskReleaseDate({ id: "G12-CESC-1" }), "2026-11-04");
  assert.equal(logic.taskReleaseDate({ id: "G12-PR2-1" }), "2026-11-04");
  assert.equal(logic.taskReleaseDate({ id: "G12-ENT-1" }), "2026-11-04");
  assert.equal(logic.taskReleaseDate({ id: "G11-GM-2" }), "2026-11-05");
  assert.equal(logic.taskReleaseDate({ id: "G11-PR1-2" }), "2026-11-05");
  assert.equal(logic.taskReleaseDate({ id: "G12-PR2-2" }), "2026-11-05");
  assert.equal(logic.taskReleaseDate({ id: "G12-CESC-2" }), "2026-11-05");
  assert.equal(logic.taskReleaseDate({ id: "G12-ENT-2" }), "2026-11-05");
});

test("Nov 9 review ids group by YYYYMMDD and undated ids stay Other", () => {
  for (const id of [
    "G11-GM-20261109-REVIEW",
    "G11-PR1-20261109-REVIEW",
    "G12-PR2-20261109-REVIEW",
    "G12-CESC-20261109-REVIEW"
  ]) {
    assert.equal(logic.taskReleaseDate({ id }), "2026-11-09");
  }
  assert.equal(logic.taskReleaseDate({ id: "SAMPLE-1" }), "other");
  assert.equal(logic.taskReleaseDate({ id: "TEST-ADM" }), "other");
  assert.equal(logic.taskReleaseDate({ id: "G11-GM-20261340-REVIEW" }), "other");
  assert.equal(logic.taskReleaseDate({ id: "FUTURE-20261201-REVIEW" }), "2026-12-01");
});

test("release metadata overrides the id and a deadline is not a release date", () => {
  assert.equal(logic.taskReleaseDate({ id: "G11-PR1-1", release: "2026-12-15" }), "2026-12-15");
  assert.equal(logic.taskReleaseDate({ id: "PLAIN", date: "20261109" }), "2026-11-09");
  assert.equal(logic.taskReleaseDate({ id: "G11-GM-2", deadline: "2026-11-09 23:59" }), "2026-11-05");
  assert.equal(logic.taskReleaseDate({ id: "NEW-20261109-REVIEW", release: "2026-11-20" }), "2026-11-20");
});

test("default task date is the latest real date, with Other last", () => {
  const dates = ["2026-11-04", "other", "2026-11-09", "2026-11-05"];
  assert.equal(logic.defaultTaskDate(dates), "2026-11-09");
  const ordered = dates.slice().sort(logic.compareTaskDates);
  assert.deepEqual(ordered, ["2026-11-09", "2026-11-05", "2026-11-04", "other"]);
  assert.equal(logic.defaultTaskDate(["other"]), "other");
  assert.equal(logic.defaultTaskDate([]), "");
});

test("Nov 9 quizzes are new ids on the supported question path", () => {
  const SUBJ = loadSubj();
  const expect = {
    gm3: ["Grade 11", "General Mathematics — Quiz 3 (Nov 9)", 3],
    pr13: ["Grade 11", "Practical Research 1 — Quiz 3 (Nov 9)", 5],
    pr23: ["Grade 12", "Practical Research 2 — Quiz 3 (Nov 9)", 5],
    cesc3: ["Grade 12", "Community Engagement, Solidarity and Citizenship (CESC) — Quiz 3 (Nov 9)", 5]
  };
  assert.equal(SUBJ.ent3, undefined);
  const names = new Set();
  for (const [sid, spec] of Object.entries(expect)) {
    const q = SUBJ[sid];
    assert.ok(q, sid);
    assert.equal(q.g, spec[0]);
    assert.equal(q.n, spec[1]);
    assert.equal(q.d, "2026-11-09");
    assert.equal(q.items.length, spec[2]);
    assert.ok(q.n.length <= 80, q.n);
    names.add(q.n);
    q.items.forEach((it, i) => {
      assert.equal(it.c.length, 4, sid + " item " + i);
      assert.match(it.k, /^[0-9a-f]{8}$/);
      let matches = 0;
      for (let v = 0; v < 4; v++) if (logic.answerKeyHash(sid, i, v) === it.k) matches++;
      assert.equal(matches, 1, sid + " item " + i);
      assert.equal(Object.prototype.hasOwnProperty.call(it, "answer"), false);
    });
  }
  assert.equal(names.size, 4);
  for (const old of ["gm", "pr1", "cesc", "pr2", "ent", "gm2", "pr12", "cesc2", "pr22", "ent2"]) {
    assert.notEqual(SUBJ[old].d, "2026-11-09");
    assert.equal(names.has(SUBJ[old].n), false);
  }
  assert.equal(SUBJ.gm.items.length, 80);
  assert.equal(SUBJ.gm2.items[0].k, "7a66de6f");
  assert.equal(SUBJ.ent.d, "2026-11-03");
  assert.equal(SUBJ.ent2.d, "2026-11-04");
});

test("Nov 9 learner text does not carry private keys or solved written tasks", () => {
  const SUBJ = loadSubj();
  const blob = JSON.stringify({
    gm3: SUBJ.gm3, pr13: SUBJ.pr13, pr23: SUBJ.pr23, cesc3: SUBJ.cesc3
  });
  for (const phrase of [
    "PRIVATE",
    "teacher key",
    "Exploring the Study Routines of Grade 11 Learners at Bago National High School",
    "tan⁻¹(5/12)",
    "sin⁻¹(6/10)",
    "6/10",
    "5/12",
    "36.9",
    "Table A shows that tricycle riders are the largest group (40%)"
  ]) {
    assert.equal(blob.includes(phrase), false, phrase);
  }
  const pr2 = blob;
  assert.equal(pr2.includes("SAMPLE DATA, made up for practice"), true);
  assert.equal((pr2.match(/SAMPLE DATA, made up for practice/g) || []).length, 4);
});

test("section and name lists follow the live learner shape", () => {
  const roster = [
    { g: "Grade 11", s: "ACADS", n: "Learner One", l: "One", f: "Learner" },
    { g: "Grade  11", s: " ACADS ", n: "Learner Two", l: "Two", f: "Learner" },
    { g: "Grade 12", s: "HUMSS", n: "Learner Three", l: "Three", f: "Learner" }
  ];
  assert.deepEqual(logic.sectionsForGrade(roster, "Grade 11"), ["ACADS"]);
  assert.deepEqual(logic.sectionsForGrade(roster, "Grade 12"), ["HUMSS"]);
  assert.deepEqual(logic.sectionsForGrade(roster, ""), []);
  assert.equal(logic.namesForSection(roster, "Grade 11", "ACADS").length, 2);
  assert.equal(logic.namesForSection(roster, "Grade 12", "HUMSS").length, 1);
  assert.equal(logic.namesForSection(roster, "Grade 11", "HUMSS").length, 0);
  assert.equal(logic.namesForSection(roster, "Grade 12", "").length, 0);
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /sectionsForGrade\(LS,gi\.value\)/);
  assert.match(app, /namesForSection\(LS,gi\.value,ss\.value\)/);
  assert.match(app, /secs\.length===1\?secs\[0\]:""/);
});

test("games section and the tab bar still clears the page", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const gamesSh = fs.readFileSync(path.join(root, "scripts/games.sh"), "utf8");
  const open = /Games are open today/.test(html);
  const closed = /🔒 Games are closed/.test(html);
  assert.equal(open || closed, true);
  assert.equal(open && closed, false);
  assert.match(gamesSh, /open\|close/);
  assert.match(gamesSh, /integer-racer/);
  assert.match(gamesSh, /integer-archer/);
  assert.match(gamesSh, /treasure-diver/);
  assert.match(gamesSh, /island-navigator/);
  assert.match(gamesSh, /revert --no-commit/);
  if (open) {
    assert.match(html, /are open to play/);
    assert.match(html, /Still 1 try per game/);
    assert.equal((html.match(/▶ Play/g) || []).length, 4);
    assert.equal((html.match(/🔒 Closed/g) || []).length, 0);
    for (const game of ["integer-racer", "integer-archer", "treasure-diver", "island-navigator"]) {
      assert.match(html, new RegExp('href="https://raymartvalbarez\\.github\\.io/' + game + '/\\?v=\\d{8}[a-z]"'));
      assert.match(html, new RegExp("https://raymartvalbarez\\.github\\.io/" + game + "/leaderboard\\.html\\?v=\\d{8}[a-z]"));
    }
  } else {
    assert.match(html, /Leaderboards are still open, and all saved scores are kept/);
    assert.equal((html.match(/▶ Play/g) || []).length, 0);
    assert.equal((html.match(/🔒 Closed/g) || []).length, 4);
    for (const game of ["integer-racer", "integer-archer", "treasure-diver", "island-navigator"]) {
      assert.doesNotMatch(html, new RegExp('href="https://raymartvalbarez\\.github\\.io/' + game + '/\\?'));
      assert.match(html, new RegExp("https://raymartvalbarez\\.github\\.io/" + game + "/leaderboard\\.html\\?v=\\d{8}[a-z]"));
    }
  }
  assert.match(html, /--tab-bar:90px/);
  assert.match(html, /--tab-clear:48px/);
  assert.match(html, /padding-bottom:calc\(var\(--tab-bar\) \+ var\(--tab-clear\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /logic\.js\?v=20261118c/);
  assert.match(html, /data\.js\?v=20261119a/);
  assert.match(html, /app\.js\?v=20261118c/);
  assert.equal(app.includes("TDATE"), false);
  assert.match(app, /taskReleaseDate/);
  assert.match(app, /handoutCard/);
});

test("Week 9 handouts group on Nov 10 and do not ask for a submission", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8"), ctx);
  const note = "Download the PDF handout and study it. This is a lesson handout only. No photo submission needed.";
  const expect = [
    ["G11-GM-20261110-HANDOUT", "Grade 11", "General Mathematics", "handouts/GenMath_Week9_Handout.pdf"],
    ["G11-PR1-20261110-HANDOUT", "Grade 11", "Practical Research 1", "handouts/PR1_Week9_Handout.pdf"],
    ["G12-PR2-20261110-HANDOUT", "Grade 12", "Practical Research 2", "handouts/PR2_Week9_Handout.pdf"],
    ["G12-CESC-20261110-HANDOUT", "Grade 12", "Community Engagement, Solidarity and Citizenship (CESC)", "handouts/CESC_Week9_Handout.pdf"],
    ["G12-ENT-20261110-HANDOUT", "Grade 12", "Entrepreneurship", "handouts/Entrep_Week9_Handout.pdf"]
  ];
  assert.equal(ctx.HANDOUTS.length, 5);
  expect.forEach((row, i) => {
    const h = ctx.HANDOUTS[i];
    assert.equal(h.id, row[0]);
    assert.equal(h.grade, row[1]);
    assert.equal(h.subject, row[2]);
    assert.equal(h.file, row[3]);
    assert.equal(h.title, "Lesson Handout");
    assert.equal(h.kind, "handout");
    assert.equal(h.instructions, note);
    assert.equal(h.deadline, undefined);
    assert.equal(logic.taskReleaseDate(h), "2026-11-10");
    const pdf = fs.readFileSync(path.join(root, h.file));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  });
  const dates = [...new Set(ctx.HANDOUTS.map((h) => logic.taskReleaseDate(h)))];
  assert.deepEqual(dates, ["2026-11-10"]);
  assert.equal(logic.defaultTaskDate(["2026-11-09", "2026-11-10", "other"]), "2026-11-10");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /kind==="handout"/);
  assert.equal(app.includes("type:\"task\",taskId:t.id") || app.includes('type:"task"'), true);
});

test("single-section view is opt-in and hash alone does not change the browser portal", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /sv-mode/);
  assert.match(html, /id="svbar"/);
  assert.match(html, /html\.sv-quiz #tasks/);
  assert.match(html, /html\.sv-games #quiz/);
  assert.match(app, /resolvePortalView/);
  assert.match(app, /applySingleView/);
  assert.match(app, /SV==="handouts"/);
  const ua = logic.ADM_APP_UA;
  assert.equal(logic.resolvePortalView("", "", ""), "");
  assert.equal(logic.resolvePortalView("?foo=1", "#quiz", "Mozilla/5.0"), "");
  assert.equal(logic.resolvePortalView("", "#tasks", "Mozilla/5.0 (Windows NT 10.0; Chrome/130)"), "");
  assert.equal(logic.resolvePortalView("?view=quiz", "", "Mozilla/5.0"), "quiz");
  assert.equal(logic.resolvePortalView("?view=tasks", "#quiz", ""), "tasks");
  assert.equal(logic.resolvePortalView("?view=games", "", ""), "games");
  assert.equal(logic.resolvePortalView("?view=handouts", "", ""), "handouts");
  assert.equal(logic.resolvePortalView("?view=motivation", "", ""), "motivation");
  assert.equal(logic.resolvePortalView("?view=videos", "", ""), "motivation");
  assert.equal(logic.resolvePortalView("?view=task", "", ""), "tasks");
  assert.equal(logic.resolvePortalView("", "#view=quiz", ""), "quiz");
  assert.equal(logic.resolvePortalView("", "#view=games", "Mozilla/5.0"), "games");
  assert.equal(logic.resolvePortalView("", "#quiz", ua), "quiz");
  assert.equal(logic.resolvePortalView("", "#tasks", ua), "tasks");
  assert.equal(logic.resolvePortalView("", "#games", ua), "games");
  assert.equal(logic.resolvePortalView("", "#handouts", ua), "handouts");
  assert.equal(logic.resolvePortalView("", "#motivation", ua), "motivation");
  assert.equal(logic.resolvePortalView("", "#quiz", "BagoSHSADMStudent/1.5.0"), "quiz");
  assert.equal(logic.resolvePortalView("?view=bogus", "#quiz", ""), "");
  assert.equal(logic.portalViewTitle("games"), "Games");
  assert.equal(logic.portalViewTitle("motivation"), "Motivation");
  assert.equal(logic.isAdmAppUserAgent(ua), true);
  assert.equal(logic.isAdmAppUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/141.0.0.0 Mobile Safari/537.36"), false);
});

test("G12 PR2 Nov 12 activity id groups on Nov 12 and is the default date", () => {
  assert.equal(logic.taskReleaseDate({ id: "G12-PR2-20261112-SCR" }), "2026-11-12");
  const dates = ["2026-11-04", "other", "2026-11-09", "2026-11-10", "2026-11-12"];
  assert.equal(logic.defaultTaskDate(dates), "2026-11-12");
  assert.deepEqual(dates.slice().sort(logic.compareTaskDates), ["2026-11-12", "2026-11-10", "2026-11-09", "2026-11-04", "other"]);
});

test("task instructions can surface a PDF download without showing the raw URL", () => {
  const httpsUrl = "https://raymartvalbarez.github.io/adm-portal/handouts/Findings_SCR_Activity_Nov12.pdf";
  const instr = "Download the PDF activity and study Part A (sample). Answer Part B on paper: write the summary, conclusion and recommendations. Then upload clear photos of your output here. " + httpsUrl;
  assert.equal(logic.extractTaskPdf(instr), httpsUrl);
  const shown = logic.stripTaskPdfUrl(instr, httpsUrl);
  assert.equal(shown.includes("http"), false);
  assert.equal(shown.includes(".pdf"), false);
  assert.match(shown, /upload clear photos of your output here\./i);
  assert.equal(logic.extractTaskPdf("See handouts/Findings_SCR_Activity_Nov12.pdf please"), "handouts/Findings_SCR_Activity_Nov12.pdf");
  assert.equal(logic.extractTaskPdf("No file here"), "");
  assert.equal(logic.extractTaskPdf("https://example.com/notes.txt"), "");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /taskPdfLinks\(t\)/);
  assert.match(app, /taskPdfButtons\(pdf,t\)/);
  assert.match(app, /Open PDF/);
  assert.match(app, /Download PDF/);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /app\.js\?v=20261118c/);
  assert.match(html, /logic\.js\?v=20261118c/);
  const pdf = fs.readFileSync(path.join(root, "handouts/Findings_SCR_Activity_Nov12.pdf"));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const handouts = fs.readdirSync(path.join(root, "handouts"));
  assert.equal(handouts.some((n) => /teacher|key/i.test(n)), false);
});

test("uploads retry automatically when the backend is busy (lock timeout HTML page)", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app, /async function post\(o,opts\)/);
  assert.match(app, /JSON\.parse\(txt\)/);
  assert.match(app, /type:"task"[^\n]*check:\(\)=>chk\(nm,t\.id\)/);
  assert.match(app, /type:"quizOutput"[^\n]*check:\(\)=>chk\(nm,"QUIZ-"\+sub\)/);
});

test("photo picker validates photos at pick time, allows 1-5 across picks, and separates error messages", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /const MAXP=5/);
  assert.match(app, /This photo couldn't be read\. Retake it or choose it from Gallery\./);
  assert.match(app, /function picker\(card,inp\)/);
  // Only truly empty files are rejected; size/type from Android content URIs are not trusted.
  assert.doesNotMatch(app, /if\(!file\|\|!file\.size\)/);
  assert.match(app, /empty file \(0 bytes\)/);
  assert.match(app, /function sniff\(u\)/);
  assert.match(app, /MULTI=INAPP&&!APPV\?"":" multiple"/);
  assert.doesNotMatch(app, /accept="image\/\*" multiple/);
  assert.doesNotMatch(app, /Upload failed\. Check your internet and try again\./);
  assert.match(app, /querySelector\("button\.go"\)/);
});

test("Drive PDF links from the PDF Link column become view + download buttons; .pdf in instructions still works", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
  const view = "https://drive.google.com/file/d/" + id + "/view?usp=sharing";
  assert.equal(logic.driveFileId(view), id);
  assert.equal(logic.driveFileId("https://drive.google.com/open?id=" + id), id);
  assert.equal(logic.driveFileId("https://example.com/file/d/" + id), "");
  assert.deepEqual(logic.drivePdfLinks(view), { view: "https://drive.google.com/file/d/" + id + "/view", download: "https://drive.google.com/uc?export=download&id=" + id });
  const t = logic.taskPdfLinks({ id: "G11-GM-20261112-TEST", pdf: view, instructions: "Do it." });
  assert.equal(t.via, "taskPdf");
  assert.equal(t.taskId, "G11-GM-20261112-TEST");
  assert.equal(t.view, "https://drive.google.com/file/d/" + id + "/view");
  assert.equal(t.download, "https://drive.google.com/uc?export=download&id=" + id);
  assert.equal(t.strip, "");
  assert.equal(logic.taskPdfQuery("G11-GM-20261112-TEST"), "action=taskPdf&task=G11-GM-20261112-TEST");
  assert.equal(logic.taskPdfQuery("a b"), "action=taskPdf&task=a%20b");
  assert.equal(logic.taskPdfQuery(""), "");
  const old = "https://raymartvalbarez.github.io/adm-portal/handouts/Findings_SCR_Activity_Nov12.pdf";
  const t2 = logic.taskPdfLinks({ instructions: "Study it. " + old });
  assert.deepEqual(t2, { view: old, download: old, name: "Findings_SCR_Activity_Nov12.pdf", strip: old, via: "url" });
  const t3 = logic.taskPdfLinks({ pdf: old, instructions: "Do it." });
  assert.deepEqual(t3, { view: old, download: old, name: "Findings_SCR_Activity_Nov12.pdf", strip: "", via: "url" });
  assert.equal(logic.taskPdfLinks({ instructions: "No file" }), null);
  assert.equal(logic.taskPdfLinks({ pdf: "", instructions: "No file" }), null);
  assert.equal(logic.taskPdfLinks({ pdf: "javascript:alert(1)", instructions: "x" }), null);
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /taskPdfLinks\(t\)/);
  assert.match(app, /taskPdfButtons\(pdf,t\)/);
  assert.match(app, /action=taskPdf&task=/);
  assert.match(app, /function openInlinePdf/);
  assert.match(app, /getDocument\(\{data:/);
  assert.match(app, /pdfjs-dist@3\.11\.174\/legacy\/build\/pdf\.min\.js/);
  assert.match(app, /pdf\.worker\.min\.js/);
  assert.match(app, /function prefetchCardPdfs/);
  assert.match(app, /function wireDownloadLink/);
  assert.match(app, /createObjectURL/);
  assert.match(app, /function handoutCard/);
  assert.match(app, /data-pdf="open"/);
  assert.doesNotMatch(app, /window\.open\("about:blank"/);
});

test("teacher page is PIN-gated, linked discreetly from the student home footer, and has a back link", () => {
  const html = fs.readFileSync(path.join(root, "teacher.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "teacher.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(index, /<footer>[\s\S]*href="teacher\.html"[\s\S]*🔒 Teacher/);
  assert.match(index, /a\.tlink/);
  assert.equal(/teacher\.html/.test(app), false);
  assert.match(html, /<footer>[\s\S]*href="index\.html"[\s\S]*Back to student portal/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /noindex/);
  assert.match(html, /teacher\.js\?v=\d{8}[a-z]/);
  assert.match(html, /config\.js/);
  for (const id of ["g", "s", "rel", "ti", "ins", "pdf", "op", "cl", "pbtn", "tl", "pin", "np1", "notready"]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(html, /type="datetime-local" id="op"/);
  assert.match(html, /accept="\.pdf,application\/pdf"/);
  assert.match(html, /<input type="file" id="pdf" accept="\.pdf,application\/pdf">/);
  assert.match(html, /<label class="pdfbtn" for="pdf">/);
  assert.doesNotMatch(html, /#pdf\{[^}]*display:\s*none/);
  assert.doesNotMatch(html, /::file-selector-button\{display:block;width:100%/);
  assert.match(js, /function isPdfFile/);
  assert.match(js, /String\(f\.type\|\|""\)\.toLowerCase\(\)==="application\/pdf"/);
  assert.match(js, /Selected: /);
  assert.match(js, /Please choose a PDF of 10 MB or less/);
  assert.match(html, /teacher\.js\?v=20261117d/);
  for (const a of ["teacherStatus", "teacherSetPin", "teacherList", "teacherPost", "teacherToggle", "teacherUploads", "teacherUploadStart", "teacherUploadChunk", "teacherUploadFinish"]) assert.match(js, new RegExp(a));
  assert.match(js, /j\.teacher!==true/); // old backend -> "not set up yet"
  assert.match(js, /10\*1024\*1024/);
  assert.equal(/localStorage/.test(js), false); // PIN stays in this tab only
  assert.match(js, /"Community Engagement, Solidarity and Citizenship \(CESC\)"/);
  assert.match(js, /method:"POST"/);
  assert.equal(/\?action=teacher|action=teacher/.test(js.replace(/action:"teacher/g, "")), false); // never in a URL
});

test("in-app browsers get an Open in Chrome intent URL; Chrome and Safari do not", () => {
  const fbAndroid = "Mozilla/5.0 (Linux; Android 13; SM-A125F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/10.0.0.1.100;]";
  const messenger = "Mozilla/5.0 (Linux; Android 13; SM-A125F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/172.0.0.0;]";
  const instagram = "Mozilla/5.0 (Linux; Android 13; SM-A125F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36 Instagram 10.0.0.1.100 Android";
  const line = "Mozilla/5.0 (Linux; Android 13; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36 Line/13.0.0";
  const wvOnly = "Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36";
  const iosFb = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/10.0.0;]";
  const chromeAndroid = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const crios = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
  const desktopChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  for (const ua of [fbAndroid, messenger, instagram, line, wvOnly]) {
    assert.equal(logic.isInAppBrowser(ua), true, ua);
    assert.equal(logic.isAndroidUserAgent(ua), true, ua);
  }
  assert.equal(logic.isInAppBrowser(iosFb), true);
  assert.equal(logic.isAndroidUserAgent(iosFb), false);
  for (const ua of [chromeAndroid, safari, crios, desktopChrome, logic.ADM_APP_UA, "BagoSHSADMStudent/1.6.3", "BagoSHSADMTeacher/1.0", ""]) {
    assert.equal(logic.isInAppBrowser(ua), false, ua);
  }

  const href = "https://raymartvalbarez.github.io/adm-portal/teacher.html";
  assert.equal(
    logic.chromeIntentUrl(href),
    "intent://raymartvalbarez.github.io/adm-portal/teacher.html#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(href) + ";end"
  );
  const withQuery = "https://raymartvalbarez.github.io/adm-portal/?view=tasks";
  const qIntent = logic.chromeIntentUrl(withQuery);
  assert.equal(qIntent.startsWith("intent://raymartvalbarez.github.io/adm-portal/?view=tasks#Intent;scheme=https;package=com.android.chrome;"), true);
  assert.equal(qIntent.includes("S.browser_fallback_url=" + encodeURIComponent(withQuery)), true);
  const withHash = "https://raymartvalbarez.github.io/adm-portal/#tasks";
  const hIntent = logic.chromeIntentUrl(withHash);
  assert.equal(hIntent.startsWith("intent://raymartvalbarez.github.io/adm-portal/#Intent;"), true);
  assert.equal(hIntent.includes("#Intent;scheme=https;"), true);
  assert.equal(hIntent.includes(encodeURIComponent(withHash)), true);
  assert.equal(logic.chromeIntentUrl("javascript:alert(1)"), "");
  assert.equal(logic.chromeIntentUrl(""), "");

  const androidHelp = logic.inAppOpenInChrome(href, fbAndroid);
  assert.equal(androidHelp.show, true);
  assert.equal(androidHelp.android, true);
  assert.equal(androidHelp.intent, logic.chromeIntentUrl(href));
  assert.equal(androidHelp.title, "For PDFs and uploads to work, open this page in Chrome");
  assert.match(logic.inAppChromeHelpHtml(androidHelp), /Open in Chrome/);
  assert.match(logic.inAppChromeHelpHtml(androidHelp), /intent:\/\/raymartvalbarez\.github\.io\/adm-portal\/teacher\.html/);

  const iosHelp = logic.inAppOpenInChrome(href, iosFb);
  assert.equal(iosHelp.show, true);
  assert.equal(iosHelp.android, false);
  assert.equal(iosHelp.intent, "");
  assert.match(iosHelp.hint, /Open in browser/);
  assert.match(logic.inAppChromeHelpHtml(iosHelp), /Copy link/);
  assert.equal(logic.inAppOpenInChrome(href, chromeAndroid).show, false);
  assert.equal(logic.inAppOpenInChrome(href, safari).show, false);

  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const teacher = fs.readFileSync(path.join(root, "teacher.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const tjs = fs.readFileSync(path.join(root, "teacher.js"), "utf8");
  assert.match(index, /id="iabbar"/);
  assert.match(index, /position:sticky/);
  assert.match(teacher, /id="iabbar"/);
  assert.match(teacher, /logic\.js\?v=20261118c/);
  assert.match(teacher, /teacher\.js\?v=20261117d/);
  assert.match(index, /logic\.js\?v=20261118c/);
  assert.match(index, /app\.js\?v=20261118c/);
  assert.match(app, /fillInAppChromeBar/);
  assert.match(app, /attachInAppChromeHelp/);
  assert.match(app, /function iabErr/);
  assert.match(tjs, /fillInAppChromeBar/);
  assert.match(tjs, /attachInAppChromeHelp/);
  assert.doesNotMatch(tjs, /pdfhint/);
});

test("inline PDF viewer decodes base64, parses sources, and is wired in the portal", () => {
  const bytes = logic.b64ToUint8Array(Buffer.from("%PDF-1.4\n% test\n").toString("base64"));
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  assert.equal(logic.b64ToUint8Array("").length, 0);
  assert.deepEqual(logic.parsePdfSource("task:G12-ENT-20261112-PLAN"), { kind: "task", id: "G12-ENT-20261112-PLAN" });
  assert.deepEqual(logic.parsePdfSource("url:handouts/Entrep_Week9_Handout.pdf"), { kind: "url", url: "handouts/Entrep_Week9_Handout.pdf" });
  assert.equal(logic.parsePdfSource("url:javascript:alert(1)"), null);
  assert.equal(logic.parsePdfSource(""), null);
  assert.equal(logic.pdfSourceKey({ kind: "task", id: "T1" }), "task:T1");
  assert.equal(logic.isInlinePdfSource({ kind: "task", id: "T1" }), true);
  assert.equal(logic.isInlinePdfSource({ kind: "url", url: "handouts/Entrep_Week9_Handout.pdf" }), true);
  assert.equal(logic.isInlinePdfSource({ kind: "url", url: "https://raymartvalbarez.github.io/adm-portal/handouts/x.pdf" }), true);
  assert.equal(logic.isInlinePdfSource({ kind: "url", url: "https://evil.example/x.pdf" }), false);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="pdfview"/);
  assert.match(html, /id="pdfclose"/);
  assert.match(html, /id="pdfzfit"/);
  assert.match(html, />Fit width</);
  assert.match(html, /id="pdfpages"/);
  assert.match(html, /app\.js\?v=20261118c/);
  assert.match(html, /logic\.js\?v=20261118c/);
  assert.match(html, /body\.pdf-open nav\.tabs/);
  assert.match(app, /cdn\.jsdelivr\.net\/npm\/pdfjs-dist@3\.11\.174\/legacy\/build\/pdf\.min\.js/);
  assert.match(app, /getDocument\(\{data:/);
  assert.match(app, /function openInlinePdf/);
  assert.match(app, /function prefetchCardPdfs/);
  assert.match(app, /The PDF is ready\. Tap Download PDF again/);
  assert.match(app, /pdfSetZoom/);
  assert.match(app, /handoutCard/);
  assert.match(app, /data-pdfsrc="'\+a\+'/);
});

test("quiz pending helpers and save-accept rules", () => {
  assert.equal(logic.nameSlug("Charmae Mallo"), "charmae-mallo");
  assert.equal(logic.quizLockKey("pr23", "Charmae Mallo"), "adm_quiz_pr23_charmae-mallo");
  assert.equal(logic.quizLockKey("pr23"), "");
  assert.equal(logic.quizLockKey("pr23", ""), "");
  assert.equal(logic.quizLockKey("", "Charmae Mallo"), "");
  assert.equal(logic.quizPendingKey("pr23", "Charmae Mallo"), "adm_quiz_pending_pr23_charmae-mallo");
  assert.equal(logic.quizPendingKey("pr23", ""), "");
  assert.equal(logic.quizPendingKey("", "Charmae Mallo"), "");
  assert.equal(logic.quizSaveAccepted({ ok: true }), true);
  assert.equal(logic.quizSaveAccepted({ ok: false, recovered: true }), true);
  assert.equal(logic.quizSaveAccepted({ ok: false, dup: true, error: "already_submitted" }), true);
  assert.equal(logic.quizSaveAccepted({ ok: false, error: "already_submitted" }), true);
  assert.equal(logic.quizSaveAccepted({ ok: false, closed: true }), false);
  assert.equal(logic.quizSaveAccepted({ ok: false, error: "busy" }), false);
  assert.equal(logic.quizSaveAccepted(null), false);
  const rec = logic.quizPendingPayload({
    sid: "pr23",
    name: "Charmae Mallo",
    grade: "Grade 12",
    subject: "Practical Research 2 — Quiz 3 (Nov 9)",
    section: "HUMSS",
    score: 4,
    total: 5,
    percent: 80,
    topicBreakdown: "Chapter IV Tables: 4/5",
    answers: "ABCAD",
    at: 1731800000000
  });
  assert.equal(rec.sid, "pr23");
  assert.equal(rec.score, 4);
  assert.equal(rec.answers, "ABCAD");
  assert.equal(logic.quizPendingPayload('{"sid":"pr23"}'), null);
  assert.equal(logic.quizPendingPayload("not-json"), null);
});

test("quiz score lock is set only after a confirmed save and failed saves can be retried", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const logicJs = fs.readFileSync(path.join(root, "logic.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /app\.js\?v=20261118c/);
  assert.match(html, /logic\.js\?v=20261118c/);
  assert.match(logicJs, /adm_quiz_pending_/);
  assert.match(app, /function writePending/);
  assert.match(app, /function readPending/);
  assert.match(app, /function sendQuizScore/);
  assert.match(app, /function handleQuizSave/);
  assert.match(app, /Retry saving/);
  assert.match(app, /quizSaveAccepted/);
  assert.match(app, /quizPendingKey/);
  assert.match(app, /quizLockKey/);
  assert.match(app, /clearLegacyQuizLocks/);
  assert.match(app, /check:\(\)=>get\("action=check&name="/);
  assert.match(app, /function confirmQuizOnServer/);
  assert.match(app, /setQlock\(rec\.sid,rec\.name\)/);
  assert.match(app, /setQlock\(SID,nm\)/);
  assert.doesNotMatch(app, /store\("adm_quiz_"\+rec\.sid,1\)/);
  assert.doesNotMatch(app, /store\("adm_quiz_"\+SID,1\)/);
  assert.doesNotMatch(app, /store\("adm_quiz_"\+k\)/);
  assert.doesNotMatch(app, /store\("adm_quiz_"\+id\)/);
  assert.match(app, /Score not saved yet/);
  assert.match(app, /Your score is already graded/);
  assert.match(app, /\$\("nm"\).*addEventListener\("change"/);
  assert.match(app, /fillSubjects\(true\)/);
  assert.match(app, /if\(id&&nm\)confirmQuizOnServer\(id,nm\)/);
});

test("quiz locks are per learner and legacy phone-wide keys are dropped", () => {
  assert.equal(logic.quizListStatus(true, "", true, false), "Open");
  assert.equal(logic.quizListStatus(false, "", true, true), "Closed");
  assert.equal(logic.quizListStatus(true, "Charmae Mallo", true, false), "Already submitted");
  assert.equal(logic.quizListStatus(true, "Charmae Mallo", false, true), "Save pending");
  assert.equal(logic.quizListStatus(true, "Charmae Mallo", false, false), "Open");
  assert.equal(logic.quizListStatus(false, "Charmae Mallo", false, false), "Closed");
  assert.equal(logic.isLegacyQuizLockKey("adm_quiz_pr23"), true);
  assert.equal(logic.isLegacyQuizLockKey("adm_quiz_cesc3"), true);
  assert.equal(logic.isLegacyQuizLockKey("adm_quiz_pr23_charmae-mallo"), false);
  assert.equal(logic.isLegacyQuizLockKey("adm_quiz_pending_pr23_charmae-mallo"), false);
  assert.equal(logic.isLegacyQuizLockKey("adm_qout_charmae mallo_pr23"), false);
  assert.equal(logic.isLegacyQuizLockKey(""), false);
  const data = {
    "adm_quiz_pr23": "1",
    "adm_quiz_cesc3": "1",
    "adm_quiz_pr23_charmae-mallo": "1",
    "adm_quiz_pending_pr23_charmae-mallo": "{\"sid\":\"pr23\"}",
    "adm_qout_charmae mallo_pr23": "1"
  };
  const keys = () => Object.keys(data);
  const storage = {
    get length() { return keys().length; },
    key(i) { return keys()[i] || null; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    removeItem(k) { delete data[k]; }
  };
  assert.equal(logic.clearLegacyQuizLocks(storage), 2);
  assert.equal(data["adm_quiz_pr23"], undefined);
  assert.equal(data["adm_quiz_cesc3"], undefined);
  assert.equal(data["adm_quiz_pr23_charmae-mallo"], "1");
  assert.equal(data["adm_quiz_pending_pr23_charmae-mallo"], "{\"sid\":\"pr23\"}");
  assert.equal(data["adm_qout_charmae mallo_pr23"], "1");
});

test("task cards ignore leftover phone-wide locks and only lock the selected name", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /localStorage\.removeItem\("adm_task_"\+t\.id\)/);
  assert.match(app, /const nm=\$\("tnm"\)&&\$\("tnm"\)\.value\.trim\(\),done=!!\(nm&&store\(tkey\(t\.id\)\)\)/);
  assert.doesNotMatch(app, /store\("adm_task_"\+t\.id\)\|\|store\(tkey/);
  assert.match(app, /function tkey\(id\)\{return"adm_task_"\+norm\(\$\("tnm"\)\.value\)\+"_"\+id\}/);
  assert.match(app, /action=checkTask&name=/);
});


test("motivation manifest parsing keeps only published clips and lists them in order", () => {
  assert.deepEqual(logic.parseEpisodeManifest('{"episodes":[]}'), []);
  assert.deepEqual(logic.parseEpisodeManifest("[]"), []);
  assert.deepEqual(logic.parseEpisodeManifest("not-json"), []);
  assert.equal(logic.featuredEpisode([]), null);
  const parsed = logic.parseEpisodeManifest({
    episodes: [
      { ep: 2, title: "Second", caption: "Keep going", file: "videos/ep02-480.mp4", fileHd: "videos/ep02-720.mp4", poster: "videos/ep02.jpg", date: "2026-11-18", published: true },
      { ep: 1, title: "First", caption: "Start here", file: "videos/ep01-480.mp4", fileHd: "videos/ep01-720.mp4", poster: "videos/ep01.jpg", date: "2026-11-17", published: true },
      { ep: 3, title: "Draft", file: "videos/ep03-480.mp4", published: false },
      { ep: 4, title: "Missing file", published: true },
      { ep: 5, title: "Unsafe", file: "../secret.mp4", published: true },
      { ep: 6, title: "Remote", file: "https://example.com/x.mp4", published: true }
    ]
  });
  const pub = logic.publishedEpisodes(parsed);
  assert.equal(pub.length, 2);
  assert.equal(pub[0].ep, 1);
  assert.equal(pub[1].ep, 2);
  assert.equal(logic.featuredEpisode(parsed).ep, 2);
  assert.equal(logic.featuredEpisode(parsed).title, "Second");
  assert.deepEqual(logic.episodeSources(pub[0], "sd"), { primary: "videos/ep01-480.mp4", fallback: "videos/ep01-720.mp4" });
  assert.deepEqual(logic.episodeSources(pub[0], "hd"), { primary: "videos/ep01-720.mp4", fallback: "videos/ep01-480.mp4" });
  assert.equal(logic.safeMediaPath("videos/ep01-480.mp4"), "videos/ep01-480.mp4");
  assert.equal(logic.safeMediaPath("../secret.mp4"), "");
  assert.equal(logic.safeMediaPath("https://example.com/x.mp4"), "");
  assert.equal(logic.episodeWatchKey(2), "adm_ep_watched_2");
});

test("motivation tab keeps a coming-soon fallback and a phone-friendly player", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const script = fs.readFileSync(path.join(root, "scripts/add-episode.sh"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "videos/episodes.json"), "utf8"));
  assert.ok(Array.isArray(manifest.episodes));
  const pub = logic.publishedEpisodes(logic.parseEpisodeManifest(manifest));
  if (pub.length === 0) {
    assert.deepEqual(manifest, { episodes: [] });
    const videoFiles = fs.readdirSync(path.join(root, "videos")).filter((f) => /\.(mp4|m4v)$/i.test(f));
    assert.deepEqual(videoFiles, []);
  } else {
    pub.forEach((ep) => {
      assert.ok(Number(ep.ep) >= 1);
      assert.ok(String(ep.title || "").trim());
      assert.ok(fs.existsSync(path.join(root, ep.file)));
      if (ep.fileHd) assert.ok(fs.existsSync(path.join(root, ep.fileHd)));
      if (ep.poster) assert.ok(fs.existsSync(path.join(root, ep.poster)));
    });
  }
  assert.match(html, /id="motivation"/);
  assert.match(html, /id="tm"/);
  assert.match(html, /Episode 1 coming soon/);
  assert.match(html, /app\.js\?v=20261118c/);
  assert.match(html, /logic\.js\?v=20261118c/);
  assert.match(html, /html\.sv-motivation #motivation/);
  assert.match(app, /function loadMotivation/);
  assert.match(app, /Episode 1 coming soon/);
  assert.match(app, /playsinline/);
  assert.match(app, /webkit-playsinline/);
  assert.match(app, /preload="metadata"/);
  assert.match(app, /Tap to play/);
  assert.match(app, /Download episode/);
  assert.match(app, /open this page in Chrome/);
  assert.match(fs.readFileSync(path.join(root, "logic.js"), "utf8"), /Open in Chrome/);
  assert.match(app, /id="ephd"/);
  assert.match(app, /EPQ="sd"/);
  assert.doesNotMatch(app, /id="epvid"[^>]*\bautoplay\b/);
  assert.doesNotMatch(app, /id="epvid"[^>]*\bmuted\b/);
  assert.match(script, /profile:v "\$profile"/);
  assert.match(script, /854 baseline/);
  assert.match(script, /1280 main/);
  assert.match(script, /pix_fmt yuv420p/);
  assert.match(script, /movflags \+faststart/);
  assert.match(script, /-c:a aac/);
  assert.match(script, /480/);
  assert.match(script, /720/);
});


test("teacher page can upload a Motivation video in PIN-gated chunks", () => {
  const html = fs.readFileSync(path.join(root, "teacher.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "teacher.js"), "utf8");
  const script = fs.readFileSync(path.join(root, "scripts/publish-uploads.js"), "utf8");
  const wrapper = fs.readFileSync(path.join(root, "scripts/publish-uploads.sh"), "utf8");
  assert.match(html, /id="vm"/);
  assert.match(html, /id="vid"/);
  assert.match(html, /id="vti"/);
  assert.match(html, /id="vcap"/);
  assert.match(html, /id="vbtn"/);
  assert.match(html, /Upload a Motivation video/);
  assert.match(html, /accept="video\/\*,\.mp4,\.m4v,\.mov,\.webm,\.3gp"/);
  assert.match(html, /Maximum 40 MB/);
  assert.match(html, /teacher\.js\?v=20261117d/);
  assert.match(js, /teacherUploadStart/);
  assert.match(js, /teacherUploadChunk/);
  assert.match(js, /teacherUploadFinish/);
  assert.match(js, /40\*1024\*1024/);
  assert.match(js, /readSliceB64/);
  assert.equal(/localStorage/.test(js), false);
  assert.equal(/\?action=teacherUpload|action=teacherUpload/.test(js.replace(/action:"teacher/g, "")), false);
  assert.equal(logic.isTeacherVideoFile("talk.mp4", ""), true);
  assert.equal(logic.isTeacherVideoFile("notes.pdf", "application/pdf"), false);
  assert.equal(logic.isTeacherVideoFile("clip.MOV", "video/quicktime"), true);
  const plan = logic.videoUploadPlan(32, 1500000, 40 * 1024 * 1024);
  assert.equal(plan.ok, true); assert.equal(plan.chunks, 1);
  const big = logic.videoUploadPlan(41 * 1024 * 1024, 1500000, 40 * 1024 * 1024);
  assert.equal(big.ok, false); assert.equal(big.error, "too_large");
  const two = logic.videoUploadPlan(1500004, 1500000, 40 * 1024 * 1024);
  assert.equal(two.chunks, 2); assert.equal(two.parts[1].bytes, 4);
  assert.equal(logic.motivPartName(3), "part-003");
  assert.equal(require("../scripts/publish-uploads.js").parseConfig('const API_URL = "https://example.com/exec";'), "https://example.com/exec");
  assert.match(script, /ADM_TEACHER_PIN/);
  assert.match(script, /teacherUploadFile/);
  assert.match(script, /add-episode\.sh/);
  assert.doesNotMatch(script, /git push/);
  assert.match(wrapper, /publish-uploads\.js/);
});


test("episode heading does not repeat the Episode N prefix when the title already has it", () => {
  assert.equal(logic.episodeHeading(2, "Episode 2: The joker"), "Episode 2: The joker");
  assert.equal(logic.episodeHeading(1, "episode 1 - Intro of the Dragon"), "Episode 1: Intro of the Dragon");
  assert.equal(logic.episodeHeading(3, "Gambling Cards"), "Episode 3: Gambling Cards");
  assert.equal(logic.episodeHeading(4, ""), "Episode 4");
  assert.equal(logic.episodeHeading(3, "Episode 5: Other"), "Episode 3: Episode 5: Other");
  assert.equal(logic.episodeBaseTitle(2, "Episode 2: The joker"), "The joker");
  assert.equal(logic.episodeBaseTitle(3, "Gambling Cards"), "Gambling Cards");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app, /episodeHeading\(ep\.ep,ep\.title\)/);
  assert.match(app, /episodeBaseTitle\(e\.ep,e\.title\)/);
});
