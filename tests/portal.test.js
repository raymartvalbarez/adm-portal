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
  assert.match(html, /logic\.js\?v=20261111b/);
  assert.match(html, /data\.js\?v=20261110a/);
  assert.match(html, /app\.js\?v=20261111b/);
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
