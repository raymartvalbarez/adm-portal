const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "data.js"), "utf8") + ";this.SUBJ=SUBJ;", ctx);
const IDS = { gm4: "Grade 11", pr14: "Grade 11", pr24: "Grade 12", cesc4: "Grade 12", ent4: "Grade 12" };
test("Nov 19 lesson quizzes: 10 items, 4 distinct choices, hashed keys only, dated Nov 19", () => {
  for (const [id, g] of Object.entries(IDS)) {
    const q = ctx.SUBJ[id];
    assert.ok(q, id); assert.equal(q.g, g); assert.equal(q.d, "2026-11-19"); assert.match(q.n, /— Quiz 4 \(Nov 19\)$/);
    assert.equal(q.items.length, 10);
    for (const it of q.items) {
      assert.deepEqual(Object.keys(it).sort(), ["c", "k", "q", "t"]);
      assert.equal(it.c.length, 4); assert.equal(new Set(it.c).size, 4); assert.match(it.k, /^[0-9a-f]{8}$/);
    }
  }
});
test("staged sheet rows: five task rows (no deadline) and five quiz rows match SUBJ names, and the PDFs exist", () => {
  const rows = JSON.parse(fs.readFileSync(path.join(root, "staging/nov19-20/sheet_rows.json"), "utf8"));
  assert.equal(rows.tasks_tab_rows.length, 5); assert.equal(rows.quiz_schedule_tab_rows.length, 5);
  const ids = new Set();
  for (const r of rows.tasks_tab_rows) {
    assert.equal(r.length, 9); assert.equal(r[5], ""); assert.equal(r[6], "Y"); assert.ok(!ids.has(r[0])); ids.add(r[0]);
    const f = r[7].replace("https://raymartvalbarez.github.io/adm-portal/", ""); assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  const names = Object.keys(IDS).map(k => ctx.SUBJ[k].n);
  assert.deepEqual(rows.quiz_schedule_tab_rows.map(r => r[0]).sort(), names.sort());
  for (const r of rows.quiz_schedule_tab_rows) assert.equal(r[3], "");
});
test("no private files in the repo", () => {
  const all = require("child_process").execSync("git ls-files -co --exclude-standard", { cwd: root }).toString();
  assert.doesNotMatch(all, /TEACHER_KEY|quiz_keys|PRIVATE/i);
});
