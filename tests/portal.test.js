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

test("games stay open and the tab bar still clears the page", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /Open for ADM · Nov\. 10 games through Nov\. 13, 2026, 11:59 PM/);
  assert.match(html, /Still 1 try only/);
  assert.equal((html.match(/▶ Play/g) || []).length, 3);
  for (const game of ["integer-racer", "integer-archer", "treasure-diver"]) {
    assert.match(html, new RegExp('href="https://raymartvalbarez\\.github\\.io/' + game + '/"'));
    assert.match(html, new RegExp("https://raymartvalbarez\\.github\\.io/" + game + "/leaderboard\\.html"));
  }
  assert.match(html, /--tab-bar:90px/);
  assert.match(html, /--tab-clear:48px/);
  assert.match(html, /padding-bottom:calc\(var\(--tab-bar\) \+ var\(--tab-clear\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /logic\.js\?v=20261112d/);
  assert.match(html, /data\.js\?v=20261110a/);
  assert.match(html, /app\.js\?v=20261112i/);
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
  assert.equal(logic.resolvePortalView("?view=task", "", ""), "tasks");
  assert.equal(logic.resolvePortalView("", "#view=quiz", ""), "quiz");
  assert.equal(logic.resolvePortalView("", "#view=games", "Mozilla/5.0"), "games");
  assert.equal(logic.resolvePortalView("", "#quiz", ua), "quiz");
  assert.equal(logic.resolvePortalView("", "#tasks", ua), "tasks");
  assert.equal(logic.resolvePortalView("", "#games", ua), "games");
  assert.equal(logic.resolvePortalView("", "#handouts", ua), "handouts");
  assert.equal(logic.resolvePortalView("", "#quiz", "BagoSHSADMStudent/1.5.0"), "quiz");
  assert.equal(logic.resolvePortalView("?view=bogus", "#quiz", ""), "");
  assert.equal(logic.portalViewTitle("games"), "Games");
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
  assert.match(html, /app\.js\?v=20261112i/);
  assert.match(html, /logic\.js\?v=20261112d/);
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
  assert.match(app, /function openTaskPdf/);
  assert.match(app, /action=taskPdf&task=/);
  assert.match(app, /createObjectURL/);
  assert.match(app, /window\.open\("about:blank"/);
  assert.match(app, /triggerPdfDownload/);
  assert.match(app, /showPdfFallback/);
  // GitHub-hosted handouts still use ordinary Open/Download links, not the proxy
  assert.match(app, /function handoutCard/);
  assert.match(app, /href="'\+esc\(file\)\+'" target="_blank"/);
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
  assert.match(html, /teacher\.js\?v=20261112c/);
  for (const a of ["teacherStatus", "teacherSetPin", "teacherList", "teacherPost", "teacherToggle"]) assert.match(js, new RegExp(a));
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
  assert.match(teacher, /logic\.js\?v=20261112d/);
  assert.match(teacher, /teacher\.js\?v=20261112c/);
  assert.match(index, /logic\.js\?v=20261112d/);
  assert.match(index, /app\.js\?v=20261112i/);
  assert.match(app, /fillInAppChromeBar/);
  assert.match(app, /attachInAppChromeHelp/);
  assert.match(app, /function iabErr/);
  assert.match(tjs, /fillInAppChromeBar/);
  assert.match(tjs, /attachInAppChromeHelp/);
  assert.doesNotMatch(tjs, /pdfhint/);
});
