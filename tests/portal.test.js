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

test("portal closes Nov 6 play links and cache-busts changed assets", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(html, /Games are closed/);
  assert.equal(html.includes("Games open at 8:00 AM"), false);
  assert.equal(html.includes("data-k=\"pl\""), false);
  assert.equal(html.includes("glk"), false);
  assert.equal((html.match(/Play closed/g) || []).length, 3);
  for (const game of ["integer-racer", "integer-archer", "treasure-diver"]) {
    assert.match(html, new RegExp("https://raymartvalbarez\\.github\\.io/" + game + "/leaderboard\\.html"));
    assert.equal(html.includes("https://raymartvalbarez.github.io/" + game + "/\""), false);
    assert.equal(html.includes("https://raymartvalbarez.github.io/" + game + "\""), false);
  }
  assert.match(html, /--tab-bar:90px/);
  assert.match(html, /--tab-clear:48px/);
  assert.match(html, /padding-bottom:calc\(var\(--tab-bar\) \+ var\(--tab-clear\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.equal(html.includes("padding-bottom:calc(84px + env(safe-area-inset-bottom))"), false);
  assert.match(html, /logic\.js\?v=20261109b/);
  assert.match(html, /data\.js\?v=20261109a/);
  assert.match(html, /app\.js\?v=20261109b/);
  assert.match(html, /select option,select optgroup\{color:#17201b;background-color:#fff\}/);
  assert.equal(app.includes("TDATE"), false);
  assert.match(app, /taskReleaseDate/);
  assert.match(app, /defaultTaskDate/);
});
