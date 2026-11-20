/* ADM Portal — DEMO backend for account.html?mock=1. Sample names and data only; saves only on this phone
   (localStorage keys adm_mock_*). Never talks to the real Apps Script, sheet or Drive. */
(function (root) {
  "use strict";
  var LEARNERS = [
    { g: "Grade 11", s: "ACADS", n: "Juan Dela Cruz", l: "Dela Cruz", f: "Juan" },
    { g: "Grade 11", s: "ACADS", n: "Maria Santos", l: "Santos", f: "Maria" },
    { g: "Grade 11", s: "ACADS", n: "Paolo Reyes", l: "Reyes", f: "Paolo" },
    { g: "Grade 12", s: "HUMSS", n: "Ana Bautista", l: "Bautista", f: "Ana" },
    { g: "Grade 12", s: "HUMSS", n: "Carlo Mendoza", l: "Mendoza", f: "Carlo" }
  ];
  var CODES = { "grade 11|acads": "ACADS7", "grade 12|humss": "HUMSS4" }; // DEMO codes only
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function key(g, s, n) { return norm(g) + "|" + norm(s) + "|" + norm(n); }
  function hash(s) { var x = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193) >>> 0; return x.toString(16); }
  function sample(L) {
    var g11 = /11/.test(L.g);
    var subjA = g11 ? "General Mathematics" : "Practical Research 2", subjB = g11 ? "Practical Research 1" : "Community Engagement, Solidarity and Citizenship (CESC)";
    return {
      tasks: [
        { when: "2026-11-19 16:42", subject: subjA, taskId: "DEMO-1", title: g11 ? "Draw-and-solve: z-scores with the z-table" : "Writing your research instrument", files: 3, kind: "task" },
        { when: "2026-11-13 10:15", subject: subjB, taskId: "DEMO-2", title: g11 ? "Research problem worksheet" : "Community needs map", files: 2, kind: "task" },
        { when: "2026-11-09 19:03", subject: subjA, taskId: "QUIZ-" + subjA, title: "Quiz Output", files: 1, kind: "quizOutput" }
      ],
      quizzes: [
        { when: "2026-11-19 20:10", subject: subjA + " — Quiz 5", score: 8, total: 10, percent: "80%" },
        { when: "2026-11-12 18:30", subject: subjB + " — Quiz 3", score: 9, total: 10, percent: "90%" },
        { when: "2026-11-09 17:45", subject: subjA + " — Quiz 3", score: 7, total: 10, percent: "70%" }
      ],
      games: [
        { game: "Integer Racer", round: "Nov 18", score: 1240, level: 4, when: "2026-11-18 14:20" },
        { game: "Integer Racer", round: "Nov 13", score: 980, level: 3, when: "2026-11-13 09:05" },
        { game: "Integer Archer", round: "Nov 18", score: 1510, level: 5, when: "2026-11-18 15:02" },
        { game: "Treasure Diver", round: "Nov 13", score: 760, level: 3, when: "2026-11-13 11:40" },
        { game: "Island Navigator", round: "Nov 18", score: 420, level: 2, when: "2026-11-18 16:30" }
      ],
      duels: { summary: { duels: 4, wins: 2, losses: 1, draws: 1 }, list: [
        { when: "2026-11-20T06:12:00.000Z", opponent: "Classmate A", oppGrade: g11 ? "11" : "12", mine: 7, theirs: 5, result: "win" },
        { when: "2026-11-20T05:58:00.000Z", opponent: "Classmate B", oppGrade: "10", mine: 4, theirs: 6, result: "loss" },
        { when: "2026-11-19T11:20:00.000Z", opponent: "Classmate C", oppGrade: g11 ? "11" : "12", mine: 5, theirs: 5, result: "draw" },
        { when: "2026-11-19T10:41:00.000Z", opponent: "Classmate D", oppGrade: "12", mine: 8, theirs: 3, result: "win" }
      ] }
    };
  }
  function create(storage, opts) {
    opts = opts || {};
    var delay = opts.delay == null ? 350 : opts.delay;
    var get = function (k) { try { return storage.getItem("adm_mock_" + k); } catch (e) { return null; } };
    var set = function (k, v) { try { storage.setItem("adm_mock_" + k, v); } catch (e) {} };
    var del = function (k) { try { storage.removeItem("adm_mock_" + k); } catch (e) {} };
    function learner(d) { var k = key(d.grade, d.section, d.name); return LEARNERS.filter(function (x) { return key(x.g, x.s, x.n) === k; })[0] || null; }
    function session(t) { var k = get("tok_" + hash(t || "")); if (!k) return null; var L = LEARNERS.filter(function (x) { return key(x.g, x.s, x.n) === k; })[0]; return L && get("pin_" + k) ? L : null; }
    function token(L) { var t = ""; for (var i = 0; i < 64; i++) t += "0123456789abcdef"[Math.floor(Math.random() * 16)]; set("tok_" + hash(t), key(L.g, L.s, L.n)); return t; }
    function weak(p) { return !/^\d{4}$/.test(String(p)) ? "Your PIN must be exactly 4 numbers." : (["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321","0123","9876","1212","6969"].indexOf(String(p)) >= 0 ? "That PIN is too easy to guess. Choose a different 4-digit PIN." : ""); }
    function handle(o) {
      var L, k, S;
      if (o.action === "config") return { ok: true, learners: LEARNERS, quizzes: [], tasks: [], now: Date.now() };
      if (o.action === "acctStatus") { L = learner(o); if (!L) return { ok: false, error: "Your name was not found on the class list. Ask Sir Raymart." }; var hp = !!get("pin_" + key(L.g, L.s, L.n)); return { ok: true, hasPin: hp, needCode: !hp }; }
      if (o.action === "acctSetPin") { L = learner(o); if (!L) return { ok: false, error: "Not on the list." }; var w = weak(o.pin); if (w) return { ok: false, error: w }; k = key(L.g, L.s, L.n);
        if (get("pin_" + k)) return { ok: false, exists: true, error: "This account already has a PIN. Enter your PIN, or ask Sir Raymart to reset it." };
        var cf = Number(get("cfail_" + k) || 0); if (cf >= 5) return { ok: false, locked: true, error: "Too many wrong class codes. Wait 15 minutes, then try again." };
        if (String(o.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "") !== CODES[norm(L.g) + "|" + norm(L.s)]) { set("cfail_" + k, String(cf + 1)); var cl = 4 - cf; return { ok: false, badCode: true, left: cl, error: cl > 0 ? "Wrong class code. " + cl + (cl === 1 ? " try" : " tries") + " left." : "Too many wrong class codes. Wait 15 minutes, then try again." }; }
        del("cfail_" + k);
        set("pin_" + k, hash(k + "|" + o.pin)); return { ok: true, token: token(L), me: { g: L.g, s: L.s, n: L.n } }; }
      if (o.action === "acctLogin") { L = learner(o); if (!L) return { ok: false, error: "Not on the list." }; k = key(L.g, L.s, L.n);
        var f = Number(get("fail_" + k) || 0); if (f >= 5) return { ok: false, locked: true, error: "Too many wrong PINs. Wait 15 minutes, then try again." };
        if (get("pin_" + k) !== hash(k + "|" + o.pin)) { set("fail_" + k, String(f + 1)); var left = 4 - f; return { ok: false, badPin: true, left: left, error: left > 0 ? "Wrong PIN. " + left + (left === 1 ? " try" : " tries") + " left." : "Too many wrong PINs. Wait 15 minutes, then try again." }; }
        del("fail_" + k); return { ok: true, token: token(L), me: { g: L.g, s: L.s, n: L.n } }; }
      if (o.action === "acctLogout") { del("tok_" + hash(o.token || "")); return { ok: true }; }
      if (o.action === "teacherAcctReset") { k = String(o.key || ""); del("pin_" + k); return { ok: true, teacher: true }; }
      S = session(o.token); if (!S) return { ok: false, relogin: true, error: "Please log in again." };
      k = key(S.g, S.s, S.n);
      if (o.action === "acctMe") return { ok: true, me: { g: S.g, s: S.s, n: S.n }, hasPhoto: !!get("photo_" + k) };
      if (o.action === "acctPhotoSet") { var m = String(o.image || "").match(/^data:image\/(jpeg|png|webp);base64,/); if (!m) return { ok: false, error: "Please choose a photo (JPG or PNG)." }; set("photo_" + k, o.image); return { ok: true }; }
      if (o.action === "acctPhotoGet") { var p = get("photo_" + k); if (!p) return { ok: true, none: true }; return { ok: true, mime: "image/jpeg", data: p.split(",")[1] }; }
      if (o.action === "acctHistory") { var h = sample(S); h.ok = true; h.me = { g: S.g, s: S.s, n: S.n }; return h; }
      return { ok: false, error: "Unknown action." };
    }
    return {
      learners: LEARNERS,
      call: function (o) { var r = handle(JSON.parse(JSON.stringify(o || {}))); return delay ? new Promise(function (ok) { setTimeout(function () { ok(r); }, delay); }) : Promise.resolve(r); }
    };
  }
  var api = { create: create, LEARNERS: LEARNERS, CODES: CODES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ACCT_MOCK = api;
})(typeof window !== "undefined" ? window : this);
