/* ADM Portal — learner account helpers (pure functions; used by account.html, index.html and tests). */
(function (root) {
  "use strict";
  var ID_KEY = "adm_learner";      // {g,s,n} — who is logged in on this phone (not secret; games read it to pre-fill)
  var TOK_KEY = "adm_acct_tok";    // session token (secret). Never put in a URL.
  var WEAK = ["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321","0123","9876","1212","6969"];

  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function gradeNum(g) { return String(g || "").replace(/\D/g, ""); }
  var LOGIN_GRADES = ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
  var SEED_SECTIONS = { "Grade 7": ["Mabini"], "Grade 8": ["Rizal"], "Grade 9": ["Bonifacio"], "Grade 10": ["Jacinto"] };
  /** Grades always offered on login (7–12), plus any extra grade already on the class list. */
  function loginGrades(learners) {
    var seen = {}, out = [];
    function add(g) {
      g = String(g || "").trim();
      if (!g || seen[g]) return;
      seen[g] = 1; out.push(g);
    }
    LOGIN_GRADES.forEach(add);
    (learners || []).forEach(function (x) { if (x && x.g) add(x.g); });
    out.sort(function (a, b) { return Number(gradeNum(a) || 0) - Number(gradeNum(b) || 0); });
    return out;
  }
  /** Sections for a grade: seeded JHS sections plus any section on the class list for that grade. */
  function loginSections(learners, grade) {
    var g = String(grade || "").trim(), seen = {}, out = [];
    function add(s) {
      s = String(s || "").trim();
      if (!s || seen[s]) return;
      seen[s] = 1; out.push(s);
    }
    (SEED_SECTIONS[g] || []).forEach(add);
    (learners || []).forEach(function (x) { if (x && String(x.g || "").trim() === g) add(x.s); });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }
  function learnerKey(g, s, n) { return norm(g) + "|" + norm(s) + "|" + norm(n); }
  function pinProblem(pin) {
    pin = String(pin == null ? "" : pin);
    if (!/^\d{4}$/.test(pin)) return "Your PIN must be exactly 4 numbers.";
    if (WEAK.indexOf(pin) >= 0) return "That PIN is too easy to guess. Choose a different 4-digit PIN.";
    return "";
  }
  function pinPairProblem(a, b) {
    var p = pinProblem(a); if (p) return p;
    if (String(a) !== String(b)) return "The two PINs don't match. Type the same 4 numbers twice.";
    return "";
  }
  function safeStore(storage) {
    return {
      get: function (k) { try { return storage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { storage.setItem(k, v); return true; } catch (e) { return false; } },
      del: function (k) { try { storage.removeItem(k); } catch (e) {} }
    };
  }
  function readIdentity(storage) {
    var raw = safeStore(storage).get(ID_KEY), o = null;
    try { o = JSON.parse(raw || "null"); } catch (e) { o = null; }
    if (!o || typeof o.n !== "string" || !o.n || typeof o.g !== "string" || typeof o.s !== "string") return null;
    return { g: o.g, s: o.s, n: o.n };
  }
  function writeSession(storage, me, token) {
    var st = safeStore(storage);
    st.set(ID_KEY, JSON.stringify({ g: me.g, s: me.s, n: me.n, at: Date.now() }));
    if (token) st.set(TOK_KEY, token);
  }
  function readToken(storage) { var t = safeStore(storage).get(TOK_KEY) || ""; return /^[a-f0-9]{64}$/.test(t) ? t : ""; }
  function clearSession(storage) { var st = safeStore(storage); st.del(ID_KEY); st.del(TOK_KEY); }
  /** Find the logged-in learner on the class list (same grade/section/name), or null. */
  function matchLearner(learners, me) {
    if (!me) return null;
    var k = learnerKey(me.g, me.s, me.n);
    return (learners || []).filter(function (x) { return x && learnerKey(x.g, x.s, x.n) === k; })[0] || null;
  }
  /** Center-crop to a square and scale down so the photo is small (default 320 px). */
  function photoPlan(w, h, max) {
    max = max || 320; w = Number(w) || 0; h = Number(h) || 0;
    if (!w || !h) return null;
    var side = Math.min(w, h), out = Math.min(max, side);
    return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), sw: side, sh: side, w: out, h: out };
  }
  function dataUrlBytes(u) { var b = String(u || "").split(",")[1] || ""; return Math.floor(b.length * 3 / 4) - (/==$/.test(b) ? 2 : /=$/.test(b) ? 1 : 0); }
  function initials(n) { return String(n || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join("") || "?"; }
  function whenLabel(w) {
    var s = String(w || ""), z = /(Z|[+-]\d{2}:?\d{2})$/.test(s), m = z ? null : s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/), d;
    if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] ? +m[4] : 12) - 8, m[5] ? +m[5] : 0));
    else if (s) d = new Date(s);
    if (!d || isNaN(d.getTime())) return s;
    var opt = { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" };
    if (m && !m[4]) return d.toLocaleDateString("en-PH", opt);
    opt.hour = "numeric"; opt.minute = "2-digit";
    return d.toLocaleString("en-PH", opt);
  }
  function sortKey(w) { var s = String(w || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s.replace("T", " ") : (isNaN(Date.parse(s)) ? s : new Date(Date.parse(s) + 8 * 36e5).toISOString().replace("T", " ")); }
  function byNewest(a, b) { var x = sortKey(a.when), y = sortKey(b.when); return x < y ? 1 : x > y ? -1 : 0; }
  /** Group the server's history answer for the History page. Never carries answers (the server never sends them). */
  function groupHistory(h) {
    h = h || {};
    var tasks = (h.tasks || []).slice().sort(byNewest);
    var quizzes = (h.quizzes || []).map(function (q) {
      return { when: q.when, subject: q.subject, score: Number(q.score) || 0, total: Number(q.total) || 0, percent: q.percent || (q.total ? Math.round(100 * q.score / q.total) + "%" : "") };
    }).sort(byNewest);
    var games = {}, order = [];
    (h.games || []).forEach(function (g) {
      if (!games[g.game]) { games[g.game] = { game: g.game, best: 0, rounds: [] }; order.push(g.game); }
      games[g.game].rounds.push(g); games[g.game].best = Math.max(games[g.game].best, Number(g.score) || 0);
    });
    order.forEach(function (k) { games[k].rounds.sort(byNewest); });
    var duels = h.duels || {}, list = (duels.list || []).slice().sort(byNewest), sum = duels.summary || {};
    return {
      tasks: tasks.filter(function (t) { return t.kind !== "quizOutput"; }),
      quizOutputs: tasks.filter(function (t) { return t.kind === "quizOutput"; }),
      quizzes: quizzes,
      games: order.map(function (k) { return games[k]; }),
      duels: { list: list, wins: Number(sum.wins) || 0, losses: Number(sum.losses) || 0, draws: Number(sum.draws) || 0, duels: Number(sum.duels) || list.length },
      counts: { tasks: tasks.length, quizzes: quizzes.length, games: (h.games || []).length, duels: Number(sum.duels) || list.length }
    };
  }
  var api = { ID_KEY: ID_KEY, TOK_KEY: TOK_KEY, norm: norm, gradeNum: gradeNum, LOGIN_GRADES: LOGIN_GRADES, SEED_SECTIONS: SEED_SECTIONS,
    loginGrades: loginGrades, loginSections: loginSections, learnerKey: learnerKey, pinProblem: pinProblem, pinPairProblem: pinPairProblem,
    readIdentity: readIdentity, writeSession: writeSession, readToken: readToken, clearSession: clearSession, matchLearner: matchLearner,
    photoPlan: photoPlan, dataUrlBytes: dataUrlBytes, initials: initials, whenLabel: whenLabel, groupHistory: groupHistory };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ACCT = api;
})(typeof window !== "undefined" ? window : this);
