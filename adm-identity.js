/* ADM Portal — shared learner identity for the games (same site: raymartvalbarez.github.io).
   When a learner is logged in to "My ADM Account" on this phone, the game's Grade / Section / Name pickers are
   filled in and locked to that learner, so names stay the same everywhere. Not logged in = game works as before.
   Reads only localStorage "adm_learner" ({g,s,n}); never reads or sends the PIN or the session token. */
(function () {
  "use strict";
  var me = null;
  try { me = JSON.parse(localStorage.getItem("adm_learner") || "null"); } catch (e) { me = null; }
  if (!me || typeof me.n !== "string" || !me.n || typeof me.g !== "string" || typeof me.s !== "string") return;
  var gnum = String(me.g).replace(/\D/g, "");
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function el(id) { return document.getElementById(id); }
  function fire(x) { try { x.dispatchEvent(new Event("change", { bubbles: true })); x.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} }
  function pick(sel, want, byNum) {
    if (!sel) return false;
    if (sel.tagName !== "SELECT") { if (norm(sel.value) !== norm(want)) { sel.value = want; fire(sel); } return true; }
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i], v = o.value || o.textContent;
      if (o.value && (byNum ? String(v).replace(/\D/g, "") === gnum : norm(v) === norm(want))) { if (sel.value !== o.value) { sel.value = o.value; fire(sel); } return true; }
    }
    return false;
  }
  var done = false, tries = 0;
  function note(anchor) {
    if (el("adm-id-note") || !anchor) return;
    var d = document.createElement("div"); d.id = "adm-id-note";
    d.style.cssText = "margin:8px 0;padding:8px 10px;border-radius:10px;background:#e7f5ec;color:#14532d;font-weight:700;font-size:.9rem;line-height:1.35";
    d.textContent = "🔒 Playing as " + me.n + " (" + me.g + " " + me.s + ") from your ADM account. ";
    var a = document.createElement("a"); a.href = "https://raymartvalbarez.github.io/adm-portal/account.html"; a.textContent = "Not you?"; a.style.color = "#166534";
    d.appendChild(a); anchor.parentNode.insertBefore(d, anchor.nextSibling);
  }
  function apply() {
    if (done) return;
    var g = el("inp-grade"), s = el("inp-section"), n = el("inp-name");
    if (!g || !s || !n) return;
    var ok = pick(g, me.g, true) && pick(s, me.s) && pick(n, me.n);
    if (!ok) return;
    done = true;
    [g, s, n].forEach(function (x) { x.disabled = true; if (x.tagName !== "SELECT") x.readOnly = true; });
    note(n);
    // Games enable their Play button on the name's change event; fire once more after locking.
    fire(n);
  }
  function tick() { apply(); if (!done && ++tries < 60) setTimeout(tick, 500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
})();
