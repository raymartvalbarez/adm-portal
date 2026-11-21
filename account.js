"use strict";
/* ADM Portal — My Account page. Login = class list name + the learner's own 4-digit PIN.
   PIN and session token go only in POST bodies (never in a URL). ?mock=1 uses the DEMO backend (sample data). */
(function(){
const $=id=>document.getElementById(id),A=window.ACCT;
const MOCK=!!window.ACCT_MOCK&&(!!window.ACCT_FORCE_MOCK||/(?:^|[?&])mock=1(?:&|$)/.test(location.search));
const LS=(()=>{try{localStorage.setItem("__t","1");localStorage.removeItem("__t");return localStorage}catch(e){const m={};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}}}})();
const mock=MOCK?window.ACCT_MOCK.create(LS):null;
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
// An old backend (before Code_accounts.gs) answers account actions with {ok:false,error:"missing"} and saves nothing.
async function call(o,tries){const j=await call0(o,tries);if(j&&j.ok===false&&j.error==="missing")return{ok:false,notReady:true,error:"Accounts are not open yet. Please wait for Sir Raymart's announcement."};return j}
async function call0(o,tries){if(mock)return mock.call(o);tries=tries||3;let last=null;
 for(let a=1;a<=tries;a++){try{const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(o)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(_){}if(j&&!j.busy)return j;last=j}
  catch(e){last={ok:false,net:true,error:"Couldn't reach the server. Check your signal and try again."}}
  if(a<tries)await new Promise(r=>setTimeout(r,2000*a))}
 return last||{ok:false,error:"The server is busy. Please try again in a minute."}}
async function config(){if(mock)return mock.call({action:"config"});const r=await fetch(API_URL+"?action=config",{cache:"no-store"});return r.json()}
function show(id){["loading","notready","vlogin","vpin","vprof"].forEach(x=>$(x).classList.toggle("hide",x!==id));window.scrollTo(0,0)}
function busy(b,on,txt){b.disabled=on;if(txt)b.textContent=txt}
let LEARNERS=[],PICK=null,HAS_PIN=false,HIST=null,HTAB="tasks";

// ---------- login ----------
function fillGrades(){const gs=A.loginGrades(LEARNERS);$("lg").innerHTML='<option value="">— Choose grade level —</option>'+gs.map(g=>'<option>'+esc(g)+'</option>').join("")}
function fillSecs(){const g=$("lg").value,ss=g?A.loginSections(LEARNERS,g):[];
 $("ls").innerHTML='<option value="">'+(g?"— Choose section —":"— Choose grade level first —")+'</option>'+ss.map(s=>'<option>'+esc(s)+'</option>').join("");$("ls").disabled=!g;if(ss.length===1)$("ls").value=ss[0];fillNames()}
function fillNames(){const g=$("lg").value,s=$("ls").value,ns=LEARNERS.filter(x=>x.g===g&&x.s===s).sort((a,b)=>(a.l||a.n).localeCompare(b.l||b.n));
 $("ln").innerHTML='<option value="">'+(s?"— Choose your name —":"— Choose section first —")+'</option>'+ns.map(x=>'<option value="'+esc(x.n)+'">'+esc(x.l&&x.f?x.l+", "+x.f:x.n)+'</option>').join("");$("ln").disabled=!s}
$("lg").onchange=fillSecs;$("ls").onchange=fillNames;
$("lnext").onclick=async()=>{const m=$("lmsg"),b=$("lnext");m.textContent="";
 const L=LEARNERS.find(x=>x.g===$("lg").value&&x.s===$("ls").value&&x.n===$("ln").value);
 if(!L){m.textContent="Choose your grade, section and name.";return}
 busy(b,true,"Checking…");const j=await call({action:"acctStatus",grade:L.g,section:L.s,name:L.n});busy(b,false,"Next");
 if(!j||!j.ok){m.textContent=(j&&j.error)||"Something went wrong. Try again.";return}
 PICK=L;HAS_PIN=!!j.hasPin;openPin()};
function openPin(){show("vpin");["p0","p1","p2","pc"].forEach(i=>$(i).value="");$("pmsg").textContent="";
 const first=PICK.f||PICK.n.split(" ")[0];
 $("ptitle").textContent=HAS_PIN?"Hi "+first+"! Enter your PIN":"Hi "+first+"! Create your PIN";
 $("pnote").textContent=HAS_PIN?PICK.n+" · "+PICK.g+" "+PICK.s:"First time? Type your class code, then choose 4 numbers that only you know. You will use this PIN every time you log in.";
 $("pnew").classList.toggle("hide",HAS_PIN);$("pold").classList.toggle("hide",!HAS_PIN);$("pgo").textContent=HAS_PIN?"Log in":"Create PIN and log in";
 setTimeout(()=>$(HAS_PIN?"p0":"pc").focus(),60)}
$("pc").addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8)});
["p0","p1","p2"].forEach(i=>$(i).addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,4)}));
$("p0").addEventListener("keydown",e=>{if(e.key==="Enter")$("pgo").click()});$("p2").addEventListener("keydown",e=>{if(e.key==="Enter")$("pgo").click()});
$("pback").onclick=()=>{PICK=null;show("vlogin")};
$("pgo").onclick=async()=>{const m=$("pmsg"),b=$("pgo"),label=b.textContent;m.textContent="";let j;
 if(HAS_PIN){const p=$("p0").value;if(!/^\d{4}$/.test(p)){m.textContent="Type your 4-digit PIN.";return}
  busy(b,true,"Checking…");j=await call({action:"acctLogin",grade:PICK.g,section:PICK.s,name:PICK.n,pin:p})}
 else{const code=$("pc").value.trim();if(!code){m.textContent="Type your class code from Sir Raymart.";return}
  const bad=A.pinPairProblem($("p1").value,$("p2").value);if(bad){m.textContent=bad;return}
  busy(b,true,"Saving…");j=await call({action:"acctSetPin",grade:PICK.g,section:PICK.s,name:PICK.n,pin:$("p1").value,code:code})}
 busy(b,false,label);["p0","p1","p2"].forEach(i=>$(i).value="");if(j&&j.ok)$("pc").value="";
 if(j&&j.exists){HAS_PIN=true;openPin();$("pmsg").textContent=j.error;return}
 if(!j||!j.ok||!j.token){m.textContent=(j&&j.error)||"Something went wrong. Try again.";return}
 A.writeSession(LS,j.me,j.token);openProfile(j.me)};

// ---------- profile ----------
function setAvatar(src,name){const av=$("av");if(src){av.innerHTML='<img alt="Profile picture">';av.firstChild.src=src;$("phlabel").textContent="Change profile picture"}else{av.textContent=A.initials(name);$("phlabel").textContent="Add profile picture"}}
async function openProfile(me){show("vprof");$("pname").textContent=me.n;$("pmeta").textContent=me.g+" · "+me.s;setAvatar("",me.n);$("phmsg").textContent="";
 ["ct","cq","cg","cd"].forEach(i=>$(i).textContent="–");$("hbox").innerHTML='<div class="wait">Loading your history…</div>';
 const tok=A.readToken(LS);
 call({action:"acctPhotoGet",token:tok}).then(p=>{if(p&&p.relogin)return relogin();if(p&&p.ok&&p.data)setAvatar("data:"+(p.mime||"image/jpeg")+";base64,"+p.data,me.n)}).catch(()=>{});
 const h=await call({action:"acctHistory",token:tok},2);
 if(h&&h.relogin)return relogin();
 if(!h||!h.ok){$("hbox").innerHTML='<div class="err">Could not load your history. Check your signal, then <a href="#" id="hre">try again</a>.</div>';const r=$("hre");if(r)r.onclick=e=>{e.preventDefault();openProfile(me)};return}
 HIST=A.groupHistory(h);HIST.gamesError=!!h.gamesError;
 $("ct").textContent=HIST.counts.tasks;$("cq").textContent=HIST.counts.quizzes;$("cg").textContent=HIST.counts.games;$("cd").textContent=HIST.counts.duels;renderHist()}
function relogin(){A.clearSession(LS);show("vlogin");$("lmsg").textContent="Please log in again."}
document.querySelectorAll("#hseg button").forEach(b=>b.onclick=()=>{HTAB=b.dataset.h;document.querySelectorAll("#hseg button").forEach(x=>x.classList.toggle("on",x===b));renderHist()});
const it=(ic,t,s,r)=>'<div class="item"><div class="ic">'+ic+'</div><div class="bd"><div class="t">'+t+'</div><div class="s">'+s+'</div></div>'+(r?'<div class="r">'+r+'</div>':"")+'</div>';
function pct(q){const p=q.total?Math.round(100*q.score/q.total):parseInt(q.percent,10)||0;return p}
function renderHist(){const H=HIST,box=$("hbox");if(!H)return;let h="";
 if(HTAB==="tasks"){
  h+=H.tasks.length?H.tasks.map(t=>it("📷",esc(t.title||t.taskId),esc(t.subject)+" · "+esc(A.whenLabel(t.when)),'<span class="pill ok">✓ '+t.files+' photo'+(t.files===1?"":"s")+'</span>')).join(""):'<div class="empty">No task submissions yet.</div>';
  if(H.quizOutputs.length)h+='<div class="sub">Quiz outputs</div>'+H.quizOutputs.map(t=>it("🧾",esc(t.subject),"Quiz output · "+esc(A.whenLabel(t.when)),'<span class="pill ok">✓ '+t.files+'</span>')).join("");
  h+='<p class="note">Your photos are saved for Sir Raymart. One submission per task.</p>'}
 else if(HTAB==="quizzes"){
  h+=H.quizzes.length?H.quizzes.map(q=>{const p=pct(q);return it("📝",esc(q.subject),esc(A.whenLabel(q.when)),'<div>'+q.score+' / '+q.total+'</div><span class="pill '+(p>=75?"ok":p>=50?"mid":"no")+'">'+p+'%</span>')}).join(""):'<div class="empty">No quiz scores yet.</div>';
  h+='<p class="note">Only your score is shown. Answers are not shown.</p>'}
 else if(HTAB==="games"){
  h+=H.games.length?H.games.map(g=>'<div class="sub">'+esc(g.game)+' · best '+g.best+'</div>'+g.rounds.map(r=>it("🎮",esc(r.round)+" round","Level "+(r.level||"–")+(r.when?" · "+esc(A.whenLabel(r.when)):""),String(r.score))).join("")).join(""):'<div class="empty">No game scores yet.</div>';
  if(H.gamesError)h+='<p class="err">Some game scores could not load right now. Try again later.</p>'}
 else{const D=H.duels;
  h+='<div class="stats" style="margin-top:0;grid-template-columns:repeat(3,1fr)"><div class="stat"><b>'+D.wins+'</b><span>Wins</span></div><div class="stat"><b>'+D.losses+'</b><span>Losses</span></div><div class="stat"><b>'+D.draws+'</b><span>Draws</span></div></div>';
  h+=D.list.length?D.list.map(d=>it("⚔️","vs "+esc(d.opponent)+(d.oppGrade?" (G"+esc(d.oppGrade)+")":""),esc(A.whenLabel(d.when))+" · pull "+d.mine+"–"+d.theirs,'<span class="pill '+(d.result==="win"?"ok":d.result==="loss"?"no":"mid")+'">'+(d.result==="win"?"Win":d.result==="loss"?"Loss":"Draw")+'</span>')).join(""):'<div class="empty">No duels yet.</div>'}
 box.innerHTML=h}

// ---------- photo (compressed on the phone, ~320 px JPEG) ----------
function loadImg(file){return new Promise((ok,no)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{ok(im);setTimeout(()=>URL.revokeObjectURL(u),1000)};im.onerror=()=>{URL.revokeObjectURL(u);no(new Error("img"))};im.src=u})}
async function compress(file){const im=await loadImg(file),P=A.photoPlan(im.naturalWidth,im.naturalHeight,320);if(!P)throw new Error("size");
 const c=document.createElement("canvas");c.width=P.w;c.height=P.h;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,P.w,P.h);x.drawImage(im,P.sx,P.sy,P.sw,P.sh,0,0,P.w,P.h);
 let q=.82,u=c.toDataURL("image/jpeg",q);while(A.dataUrlBytes(u)>90000&&q>.4){q-=.12;u=c.toDataURL("image/jpeg",q)}return u}
$("photo").onchange=async()=>{const f=$("photo").files&&$("photo").files[0],m=$("phmsg"),lab=$("phlabel");m.className="err";m.textContent="";if(!f)return;
 if(!/^image\//i.test(f.type||"")&&!/\.(jpe?g|png|webp|heic)$/i.test(f.name||"")){m.textContent="Please choose a photo.";return}
 lab.textContent="Saving photo…";let u;try{u=await compress(f)}catch(e){m.textContent="This photo can't be opened. Try another photo (JPG or PNG).";lab.textContent="Add profile picture";return}
 const j=await call({action:"acctPhotoSet",token:A.readToken(LS),image:u});$("photo").value="";
 if(j&&j.relogin)return relogin();
 if(!j||!j.ok){m.textContent=(j&&j.error)||"Could not save the photo. Try again.";lab.textContent="Change profile picture";return}
 const me=A.readIdentity(LS)||{};setAvatar(u,me.n);m.className="okmsg";m.textContent="✓ Photo saved."};

let OUTARM=0;
$("logout").onclick=async()=>{const b=$("logout");if(Date.now()-OUTARM>4000){OUTARM=Date.now();b.textContent="Tap again to log out";setTimeout(()=>{if(Date.now()-OUTARM>=4000)b.textContent="Log out on this phone"},4100);return}
 OUTARM=0;b.textContent="Log out on this phone";const t=A.readToken(LS);A.clearSession(LS);HIST=null;call({action:"acctLogout",token:t}).catch(()=>{});
 PICK=null;show("vlogin");$("lmsg").textContent=""};

// ---------- start ----------
async function start(){if(MOCK)$("demo").classList.remove("hide");
 if(!MOCK&&(typeof API_URL==="undefined"||!API_URL)){show("notready");return}
 let c=null;try{c=await config()}catch(e){c=null}
 if(!c||!c.ok){show("notready");$("notready").querySelector("h2").textContent="Can't reach the portal right now";$("notready").querySelector("p").textContent="Check your signal, then reload this page.";return}
 LEARNERS=(c.learners||[]).filter(x=>x&&x.g&&x.s&&x.n);fillGrades();fillSecs();
 const me=A.readIdentity(LS),tok=A.readToken(LS);
 if(me&&tok&&A.matchLearner(LEARNERS,me)){openProfile(me);return}
 if(me&&!tok)A.clearSession(LS);
 show("vlogin")}
start();
})();
