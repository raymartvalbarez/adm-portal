"use strict";
/* Task date grouping for the ADM portal.
   Legacy ids stay on their original dates. Newer ids carry YYYYMMDD.
   An explicit release field wins when the config sends one. */
var LEGACY_TASK_DATES = {
  "G11-PR1-1": "2026-11-04",
  "G12-CESC-1": "2026-11-04",
  "G12-PR2-1": "2026-11-04",
  "G12-ENT-1": "2026-11-04",
  "G11-GM-2": "2026-11-05",
  "G11-PR1-2": "2026-11-05",
  "G12-PR2-2": "2026-11-05",
  "G12-CESC-2": "2026-11-05",
  "G12-ENT-2": "2026-11-05"
};

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function validYmd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return y + "-" + pad2(m) + "-" + pad2(d);
}

function parseRelease(v) {
  if (v == null || v === "") return "";
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  return "";
}

function dateInId(id) {
  var s = String(id || "");
  var re = /(20\d{2})(\d{2})(\d{2})/g;
  var m, iso;
  while ((m = re.exec(s))) {
    iso = validYmd(+m[1], +m[2], +m[3]);
    if (iso) return iso;
  }
  return "";
}

function taskReleaseDate(t, legacy) {
  legacy = legacy || LEGACY_TASK_DATES;
  if (!t) return "other";
  var meta = parseRelease(t.release) || parseRelease(t.released) || parseRelease(t.releaseDate) || parseRelease(t.date);
  if (meta) return meta;
  var fromId = dateInId(t.id);
  if (fromId) return fromId;
  if (t.id && legacy[t.id]) return legacy[t.id];
  return "other";
}

function compareTaskDates(a, b) {
  if (a === b) return 0;
  if (a === "other") return 1;
  if (b === "other") return -1;
  return String(b).localeCompare(String(a));
}

function defaultTaskDate(dates) {
  var real = (dates || []).filter(function (d) { return d && d !== "other"; }).sort(function (a, b) {
    return String(b).localeCompare(String(a));
  });
  if (real.length) return real[0];
  return (dates || []).indexOf("other") >= 0 ? "other" : "";
}

function canonGrade(v) {
  var s = String(v == null ? "" : v).replace(/\s+/g, " ").trim().toLowerCase();
  var m = s.match(/^grade\s+(\d{1,2})$/);
  if (m) return "grade " + m[1];
  return s;
}

function sameGrade(a, b) {
  var x = canonGrade(a), y = canonGrade(b);
  return !!x && x === y;
}

function sectionsForGrade(learners, grade) {
  var seen = {}, out = [];
  (learners || []).forEach(function (row) {
    if (!row || !sameGrade(row.g, grade)) return;
    var sec = String(row.s || "").trim();
    if (!sec || seen[sec]) return;
    seen[sec] = 1;
    out.push(sec);
  });
  out.sort(function (a, b) { return a.localeCompare(b); });
  return out;
}

function namesForSection(learners, grade, section) {
  var sec = String(section || "").trim();
  if (!sec) return [];
  return (learners || []).filter(function (row) {
    return row && row.n && sameGrade(row.g, grade) && String(row.s || "").trim() === sec;
  }).slice().sort(function (a, b) {
    var ka = String((a.l || a.n) + " " + (a.f || "")).trim();
    var kb = String((b.l || b.n) + " " + (b.f || "")).trim();
    return ka.localeCompare(kb);
  });
}

function answerKeyHash(sid, index, choice) {
  var text = "bnhs|" + sid + "|" + index + "|" + choice + "|shs26";
  var x = 0x811c9dc5;
  var bytes = new TextEncoder().encode(text);
  for (var i = 0; i < bytes.length; i++) x = Math.imul(x ^ bytes[i], 0x01000193) >>> 0;
  return x.toString(16).padStart(8, "0");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LEGACY_TASK_DATES: LEGACY_TASK_DATES,
    taskReleaseDate: taskReleaseDate,
    compareTaskDates: compareTaskDates,
    defaultTaskDate: defaultTaskDate,
    answerKeyHash: answerKeyHash,
    parseRelease: parseRelease,
    canonGrade: canonGrade,
    sameGrade: sameGrade,
    sectionsForGrade: sectionsForGrade,
    namesForSection: namesForSection
  };
}
