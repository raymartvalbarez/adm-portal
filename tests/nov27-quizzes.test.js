const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const logic = require("../logic.js");

function loadSubj() {
  const src = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
  const fn = new Function(src + "; return SUBJ;");
  return fn();
}

const IDS = {
  gm5: "Grade 11",
  pr15: "Grade 11",
  pr25: "Grade 12",
  cesc5: "Grade 12",
  ent5: "Grade 12"
};

test("Nov 27 Week 11 quizzes: 20 hashed items, no answers in data.js", () => {
  const SUBJ = loadSubj();
  const names = new Set();
  for (const [sid, g] of Object.entries(IDS)) {
    const q = SUBJ[sid];
    assert.ok(q, sid);
    assert.equal(q.g, g);
    assert.equal(q.d, "2026-11-27");
    assert.equal(q.items.length, 20);
    assert.match(q.n, /— Quiz 5 \(Nov 27\)$/);
    assert.ok(q.n.length <= 80, q.n + " len " + q.n.length);
    names.add(q.n);
    q.items.forEach((it, i) => {
      assert.equal(it.c.length, 4, sid + " item " + i);
      assert.equal(new Set(it.c).size, 4, sid + " item " + i + " unique");
      assert.match(it.k, /^[0-9a-f]{8}$/);
      assert.equal(Object.prototype.hasOwnProperty.call(it, "answer"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(it, "k_plain"), false);
      let matches = 0;
      for (let v = 0; v < 4; v++) if (logic.answerKeyHash(sid, i, v) === it.k) matches++;
      assert.equal(matches, 1, sid + " item " + i);
    });
  }
  assert.equal(names.size, 5);
  const blob = JSON.stringify({
    gm5: SUBJ.gm5, pr15: SUBJ.pr15, pr25: SUBJ.pr25, cesc5: SUBJ.cesc5, ent5: SUBJ.ent5
  });
  for (const phrase of ["PRIVATE TEACHER", "teacher key", "answer_letter", "(correct)"]) {
    assert.equal(blob.toLowerCase().includes(phrase.toLowerCase()), false, phrase);
  }
  // earlier quizzes unchanged
  assert.equal(SUBJ.gm4.items.length, 10);
  assert.equal(SUBJ.ent4.d, "2026-11-19");
  assert.equal(SUBJ.gm.items.length, 80);
});
