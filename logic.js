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


var PORTAL_VIEWS = { quiz: "Quiz", tasks: "Tasks", games: "Games", handouts: "Handouts" };
var ADM_APP_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function canonView(v) {
  v = String(v || "").toLowerCase().trim();
  if (v === "task") v = "tasks";
  if (v === "game") v = "games";
  if (v === "handout") v = "handouts";
  return PORTAL_VIEWS[v] ? v : "";
}

function isAdmAppUserAgent(ua) {
  var s = String(ua || "");
  if (s.indexOf(ADM_APP_UA) !== -1) return true;
  if (/BagoSHSADM(Student|Teacher)/i.test(s)) return true;
  return false;
}

function portalViewTitle(v) {
  return PORTAL_VIEWS[canonView(v)] || "";
}

function resolvePortalView(search, hash, userAgent) {
  search = String(search || "");
  if (search.charAt(0) === "?") search = search.slice(1);
  hash = String(hash || "");
  if (hash.charAt(0) === "#") hash = hash.slice(1);
  var m = /(?:^|[?&])view=([^&]*)/.exec(search);
  if (m) {
    var q = canonView(decodeURI(m[1]));
    if (q) return q;
  }
  m = /(?:^|[?&])view=([^&]*)/.exec(hash);
  if (m) {
    var h = canonView(decodeURI(m[1]));
    if (h) return h;
  }
  var bare = hash.split(/[?&]/)[0];
  bare = canonView(bare);
  if (bare && isAdmAppUserAgent(userAgent)) return bare;
  return "";
}

function extractTaskPdf(text) {
  var s = String(text == null ? "" : text);
  var m = s.match(/https:\/\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?/i);
  if (m) return m[0];
  m = s.match(/(?:^|[\s"'<>(])((?:\.\/)?handouts\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?)/i);
  if (m) return m[1];
  return "";
}

function stripTaskPdfUrl(text, url) {
  var s = String(text == null ? "" : text);
  if (!url) return s;
  var escaped = String(url).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  s = s.replace(new RegExp("\\s*" + escaped + "\\s*", "gi"), " ");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* Drive file links (Teacher page uploads) -> view + direct download URLs. Returns null for non-Drive links. */
function driveFileId(url) {
  var s = String(url == null ? "" : url).trim();
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(s)) return "";
  var m = s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : "";
}

function drivePdfLinks(url) {
  var id = driveFileId(url);
  if (!id) return null;
  return {
    view: "https://drive.google.com/file/d/" + id + "/view",
    download: "https://drive.google.com/uc?export=download&id=" + id
  };
}

/* PDF buttons for a task: the PDF Link column (t.pdf) wins, else a .pdf URL inside the instructions.
   Drive files are served by the public ?action=taskPdf&task=ID endpoint (via: "taskPdf") so students
   never open a Drive URL that would ask them to sign in. Plain .pdf / handouts/ URLs stay direct (via: "url"). */
function taskPdfQuery(taskId) {
  var id = String(taskId == null ? "" : taskId).trim();
  if (!id) return "";
  return "action=taskPdf&task=" + encodeURIComponent(id);
}

function taskPdfLinks(t) {
  t = t || {};
  var col = String(t.pdf == null ? "" : t.pdf).trim();
  if (col) {
    var d = drivePdfLinks(col);
    if (d) return { view: d.view, download: d.download, name: "", strip: "", via: "taskPdf", taskId: String(t.id || "") };
    if (/^https:\/\//i.test(col) || /^(\.\/)?handouts\//i.test(col)) return { view: col, download: col, name: col.split("?")[0].split("/").pop(), strip: "", via: "url" };
  }
  var u = extractTaskPdf(t.instructions);
  if (!u) return null;
  var d2 = drivePdfLinks(u);
  if (d2) return { view: d2.view, download: d2.download, name: "", strip: u, via: "taskPdf", taskId: String(t.id || "") };
  return { view: u, download: u, name: String(u).split("?")[0].split("/").pop(), strip: u, via: "url" };
}

/* In-app browsers (Messenger, Facebook, Instagram, Line, Android WebView) block file pickers
   and blob PDF tabs. Detect them and build an Android Chrome intent URL, or a copy-link fallback. */
var IAB_TITLE = "For PDFs and uploads to work, open this page in Chrome";
var IAB_IOS_HINT = "Tap the ⋯ or ⋮ menu, then choose Open in browser or Open in Chrome.";

function isAndroidUserAgent(ua) {
  var s = String(ua || "");
  return /Android/i.test(s) && !/iPhone|iPad|iPod/i.test(s);
}

function isInAppBrowser(ua) {
  var s = String(ua || "");
  if (!s) return false;
  if (isAdmAppUserAgent(s)) return false;
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS|FBSS|\bMessenger\b/i.test(s)) return true;
  if (/Instagram/i.test(s)) return true;
  if (/\bLine\//i.test(s)) return true;
  if (/\bTwitter\b|TwitterAndroid/i.test(s)) return true;
  if (/; wv\)/i.test(s)) return true;
  return false;
}

function chromeIntentUrl(pageUrl) {
  var raw = String(pageUrl || "").trim();
  if (!raw) return "";
  var u;
  try { u = new URL(raw); } catch (e) { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  var hostPath = u.host + u.pathname + u.search;
  return "intent://" + hostPath + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(u.href) + ";end";
}

function inAppOpenInChrome(pageUrl, ua) {
  var href = String(pageUrl || "").trim();
  var show = isInAppBrowser(ua);
  var android = isAndroidUserAgent(ua);
  return {
    show: show,
    android: android,
    href: href,
    intent: (show && android && href) ? chromeIntentUrl(href) : "",
    title: IAB_TITLE,
    hint: (show && !android) ? IAB_IOS_HINT : ""
  };
}

function escAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inAppChromeHelpHtml(info) {
  info = info || {};
  var html = "<p>" + escAttr(info.title || IAB_TITLE) + "</p>";
  if (info.hint) html += "<p class=\"iabhint\">" + escAttr(info.hint) + "</p>";
  if (info.android && info.intent) {
    html += "<a class=\"iabgo\" href=\"" + escAttr(info.intent) + "\">Open in Chrome</a>";
  } else {
    html += "<button type=\"button\" class=\"iabgo\" data-iab=\"copy\">Copy link</button>";
  }
  return html;
}

function bindInAppChromeActions(el, info) {
  if (!el || !el.querySelector) return;
  var btn = el.querySelector("[data-iab=copy]");
  if (!btn) return;
  var href = (info && info.href) || "";
  btn.onclick = function () {
    function ok() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1600); }
    function fallback() {
      try {
        var inp = document.createElement("input");
        inp.value = href;
        inp.setAttribute("readonly", "");
        inp.style.position = "fixed";
        inp.style.left = "-999px";
        document.body.appendChild(inp);
        inp.select();
        document.execCommand("copy");
        inp.remove();
        ok();
      } catch (e) {
        if (typeof window !== "undefined" && window.prompt) window.prompt("Copy this link and open it in Chrome:", href);
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(ok).catch(fallback);
    } else fallback();
  };
}

function fillInAppChromeBar(el, pageUrl, ua) {
  var info = inAppOpenInChrome(pageUrl, ua);
  if (!el) return info;
  if (!info.show) {
    el.hidden = true;
    el.className = String(el.className || "").replace(/\bon\b/g, " ").replace(/\s+/g, " ").trim();
    el.innerHTML = "";
    return info;
  }
  el.hidden = false;
  if (!/\bon\b/.test(el.className || "")) el.className = (el.className ? el.className + " " : "") + "on";
  el.innerHTML = inAppChromeHelpHtml(info);
  bindInAppChromeActions(el, info);
  return info;
}

function attachInAppChromeHelp(el, pageUrl, ua) {
  if (typeof navigator !== "undefined") ua = ua || navigator.userAgent;
  if (typeof location !== "undefined") pageUrl = pageUrl || location.href;
  var info = inAppOpenInChrome(pageUrl, ua);
  if (!el || !info.show) return info;
  var box = el.querySelector ? el.querySelector(".iabhelp") : null;
  if (!box) {
    if (typeof document === "undefined" || !document.createElement) return info;
    box = document.createElement("div");
    box.className = "iabhelp";
    el.appendChild(box);
  }
  box.innerHTML = inAppChromeHelpHtml(info);
  bindInAppChromeActions(box, info);
  return info;
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
    namesForSection: namesForSection,
    PORTAL_VIEWS: PORTAL_VIEWS,
    ADM_APP_UA: ADM_APP_UA,
    canonView: canonView,
    isAdmAppUserAgent: isAdmAppUserAgent,
    portalViewTitle: portalViewTitle,
    resolvePortalView: resolvePortalView,
    extractTaskPdf: extractTaskPdf,
    stripTaskPdfUrl: stripTaskPdfUrl,
    driveFileId: driveFileId,
    drivePdfLinks: drivePdfLinks,
    taskPdfQuery: taskPdfQuery,
    taskPdfLinks: taskPdfLinks,
    IAB_TITLE: IAB_TITLE,
    isAndroidUserAgent: isAndroidUserAgent,
    isInAppBrowser: isInAppBrowser,
    chromeIntentUrl: chromeIntentUrl,
    inAppOpenInChrome: inAppOpenInChrome,
    inAppChromeHelpHtml: inAppChromeHelpHtml,
    fillInAppChromeBar: fillInAppChromeBar,
    attachInAppChromeHelp: attachInAppChromeHelp
  };
}
