"use strict";
const $=id=>document.getElementById(id),L="ABCD";
let CFG=null,ITEMS=[],SID="",TICK=null;
function esc(s){return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
function H(t){let x=0x811c9dc5;for(const ch of new TextEncoder().encode(t)){x=Math.imul(x^ch,0x01000193)>>>0}return x.toString(16).padStart(8,"0")}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function fmt(ms){return new Date(ms).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Manila"})}
function left(ms){const m=Math.ceil((ms-Date.now())/60000);if(m<=0)return"closed";const d=Math.floor(m/1440),h=Math.floor(m%1440/60);return(d?d+"d ":"")+h+"h "+(m%60)+"m left"}
function get(q){const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);return fetch(API_URL+"?"+q,{cache:"no-store",signal:c.signal}).then(r=>r.json()).finally(()=>clearTimeout(t))}
function post(o){return fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(o)}).then(r=>r.json())}
function store(k,v){try{if(v===undefined)return localStorage.getItem(k)==="1";localStorage.setItem(k,"1")}catch(e){return false}}

// ---------- tabs ----------
function tab(w){$("tq").className=w==="quiz"?"on":"";$("tt").className=w==="tasks"?"on":"";$("sq").className=$("tq").className;$("st2").className=$("tt").className;$("quiz").style.display=w==="quiz"?"":"none";$("tasks").style.display=w==="tasks"?"":"none";try{location.hash=w}catch(e){}}
$("tq").onclick=()=>CFG&&tab("quiz");$("tt").onclick=()=>CFG&&tab("tasks");$("sq").onclick=$("tq").onclick;$("st2").onclick=$("tt").onclick;
function notOpen(){$("loading").style.display="none";$("notopen").style.display="block"}

// ---------- QUIZ ----------
function sched(id){const n=norm(SUBJ[id].n);return(CFG.quizzes||[]).find(q=>norm(q.subject)===n)}
function quizOpen(id){const s=sched(id);return !!(s&&s.open&&(!s.deadline||Date.now()<s.deadline))}
function dlab(d){return new Date(d+"T00:00:00+08:00").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric",timeZone:"Asia/Manila"})}
function sname(k){return SUBJ[k].n.replace(/\s*—\s*Quiz \d+.*$/,"")}
function qstat(k){return store("adm_quiz_"+k)?"Already submitted":quizOpen(k)?"Open":"Closed"}
function fillDates(){const ds=[...new Set(Object.values(SUBJ).map(s=>s.d))].sort().reverse(),op=ds.filter(d=>Object.keys(SUBJ).some(k=>SUBJ[k].d===d&&quizOpen(k)));
 $("qd").innerHTML=ds.map(d=>'<option value="'+d+'">'+dlab(d)+(op.includes(d)?" · Open":" · Closed")+'</option>').join("");$("qd").value=op[0]||ds[0]||""}
$("qd").onchange=()=>$("gr").onchange();
$("gr").onchange=()=>{const g=$("gr").value,dt=$("qd").value,ks=Object.keys(SUBJ).filter(k=>SUBJ[k].g===g&&SUBJ[k].d===dt);
 $("sj").innerHTML='<option value="">'+(!g?"— Choose grade level first —":ks.length?"— Choose subject —":"No quiz on this date")+'</option>'+ks.map(k=>{const st=qstat(k);return'<option value="'+k+'"'+(st==="Closed"?" disabled":"")+'>'+esc(sname(k))+' — '+(st==="Open"?"🟢 Open":st==="Closed"?"🔒 Closed":"✅ Already submitted")+'</option>'}).join("");$("sj").disabled=!ks.length;load("")};
$("sj").onchange=()=>{load($("sj").value);if(SID&&store("adm_quiz_"+SID))lockOut()};
function load(id){SID=id;ITEMS=id?SUBJ[id].items:[];$("result").innerHTML="";$("msg").textContent="";$("bar").style.display=id?"block":"none";$("submit").style.display="block";$("qs").style.display="";
 $("info").textContent=id?ITEMS.length+" items · "+new Set(ITEMS.map(x=>x.t)).size+" topics":"Choose your grade level and subject to start.";
 let h="",cur="";ITEMS.forEach((it,i)=>{if(it.t!==cur){cur=it.t;h+='<h2 class="sec">'+esc(cur)+'</h2>'}
 h+='<div class="card" id="c'+i+'"><p class="q"><span class="qn">'+(i+1)+'</span>'+esc(it.q)+'</p>'+it.c.map((c,j)=>'<label class="opt"><input type="radio" name="q'+i+'" value="'+j+'"><span class="lt">'+L[j]+'</span><span>'+esc(c)+'</span></label>').join("")+'</div>'});$("qs").innerHTML=h;prog();tick()}
function prog(){const p=$("prog"),n=ITEMS.length;if(!SID||!n||!$("qs").innerHTML){p.style.display="none";return}p.style.display="block";
 const a=document.querySelectorAll("#qs input:checked").length;$("progt").textContent=a+" / "+n+" answered";$("progf").style.width=Math.round(a/n*100)+"%"}
$("qs").addEventListener("change",e=>{const t=e.target;if(!t||t.type!=="radio")return;document.querySelectorAll('input[name="'+t.name+'"]').forEach(r=>r.parentNode.classList.toggle("sel",r.checked));const c=t.closest(".card");if(c)c.classList.add("done");prog()});
function hcd(){const h=$("hcd");if(!CFG){h.style.display="none";return}const ds=(CFG.quizzes||[]).filter(q=>q.open&&q.deadline&&q.deadline>Date.now()).map(q=>q.deadline);if(!ds.length){h.style.display="none";return}
 const d=Math.min(...ds);h.style.display="block";h.textContent="⏰ Quizzes close "+fmt(d)+" · "+left(d)}
setInterval(hcd,15000);
function tick(){const cd=$("cd"),s=SID&&sched(SID);hcd();if(!s||!s.deadline){cd.style.display="none";return}
 if(Date.now()>=s.deadline&&!$("result").innerHTML){$("qs").innerHTML="";$("bar").style.display="none";cd.textContent="This quiz closed at "+fmt(s.deadline)+".";cd.style.display="block";return}
 cd.style.display="block";cd.textContent="Closes "+fmt(s.deadline)+" · ⏰ "+left(s.deadline)}
setInterval(tick,15000);
function lockOut(){$("qs").innerHTML="";$("prog").style.display="none";$("bar").style.display="none";$("info").textContent="You already submitted this subject. Only one submission per subject, no retake."}
$("submit").onclick=()=>{const nm=$("nm").value.trim(),sc=$("sec").value.trim(),msg=$("msg"),bt=$("submit");
 if(!nm||!sc||!SID){msg.textContent="Please enter your name, grade level, subject and section first.";window.scrollTo(0,0);return}
 if(!quizOpen(SID)){tick();msg.textContent="This quiz is closed.";return}
 const un=ITEMS.filter((it,i)=>!document.querySelector("input[name=q"+i+"]:checked")).length;
 if(un&&!confirm(un+" item(s) unanswered. Submit anyway?"))return;
 msg.textContent="Checking…";bt.disabled=true;const sub=SUBJ[SID].n;
 get("action=check&name="+encodeURIComponent(nm)+"&subject="+encodeURIComponent(sub)).then(j=>!!(j&&j.exists)).catch(()=>false).then(dup=>{bt.disabled=false;
 if(dup){store("adm_quiz_"+SID,1);lockOut();return}msg.textContent="";store("adm_quiz_"+SID,1);finish(nm,sc,sub)})};
function finish(nm,sc,sub){let score=0,per={},ans="";
 ITEMS.forEach((it,i)=>{per[it.t]=per[it.t]||[0,0];per[it.t][1]++;const s=document.querySelector("input[name=q"+i+"]:checked"),v=s?+s.value:-1;ans+=v>=0?L[v]:"-";
  if(v>=0&&H("bnhs|"+SID+"|"+i+"|"+v+"|shs26")===it.k){score++;per[it.t][0]++}});
 $("qs").innerHTML="";$("qs").style.display="none";$("prog").style.display="none";$("bar").style.display="none";$("gr").disabled=$("sj").disabled=true;$("submit").style.display="none";
 const pct=Math.round(score/ITEMS.length*100),tb=Object.keys(per).map(k=>k+": "+per[k][0]+"/"+per[k][1]).join("; ");
 $("result").innerHTML='<div class="card score"><div class="cel">'+(pct>=75?"🎉🏆🎉":pct>=50?"👏✨":"💪📚")+'</div><div class="msg">'+(pct>=75?"Great job!":pct>=50?"Well done!":"Keep going, you can do it!")+'</div><div class="note">SHS ADM PORTAL — BAGO NHS · RESULT</div><div class="row"><b style="font-size:1rem;display:inline">'+esc(sub)+'</b></div><b>'+score+' / '+ITEMS.length+'</b><div class="row">'+pct+'%</div><div class="row"><b style="font-size:1.1rem;display:inline">'+esc(nm)+'</b></div><div class="row">'+esc($("gr").value)+' · Section: '+esc(sc)+'</div><div class="row">'+fmt(Date.now())+'</div><table>'+Object.keys(per).map(k=>'<tr><td>'+esc(k)+'</td><td>'+per[k][0]+' / '+per[k][1]+'</td></tr>').join("")+'</table><p class="note" id="st">Saving score…</p></div>';
 window.scrollTo(0,0);$("cd").style.display="none";
 post({type:"quiz",name:nm,grade:$("gr").value,subject:sub,section:sc,score:score,total:ITEMS.length,percent:pct,topicBreakdown:tb,answers:ans})
 .then(j=>{$("st").innerHTML=j.ok?"<b class='ok'>✓ Score saved</b>":j.dup?"<b class='err'>You already submitted this subject before. Only the first submission counts.</b>":j.closed?"<b class='err'>Quiz closed. Score not recorded.</b>":"<b class='err'>Couldn't save — please screenshot this card.</b>"})
 .catch(()=>{$("st").innerHTML="<b class='err'>Couldn't save — please screenshot this card and send it to your teacher.</b>"});
 quizUpload(nm,sc,$("gr").value,sub)}
function quizUpload(nm,sc,g,sub){const k="adm_qout_"+norm(nm)+"_"+SID,c=document.createElement("div");c.className="card task";$("result").appendChild(c);
 if(store(k)){c.innerHTML='<h3>📸 Upload your output</h3><p class="ok"><b>✓ You already uploaded your output for this subject.</b></p>';return}
 c.innerHTML='<h3>📸 Upload your output</h3><div class="ins">Upload 1–5 photos: a screenshot of your score card and a photo of yourself doing the activity.</div><div class="note" style="text-align:left">'+esc(nm)+' · '+esc(g)+' · '+esc(sub)+' · Section: '+esc(sc)+'</div><label class="f">📷 Take a photo or choose from gallery</label><input type="file" accept="image/*" multiple><div class="thumbs"></div><div class="err"></div><button id="qup">Upload output</button>';
 const inp=c.querySelector("input"),er=c.querySelector(".err"),bt=c.querySelector("button");
 inp.onchange=()=>{const th=c.querySelector(".thumbs");th.innerHTML="";[...inp.files].slice(0,5).forEach(f=>{const im=new Image();im.src=URL.createObjectURL(f);th.appendChild(im)});er.textContent=inp.files.length>5?"Only the first 5 photos will be sent.":""};
 bt.onclick=async()=>{const files=[...inp.files].slice(0,5);if(!files.length){er.textContent="Please choose at least 1 photo.";return}
  if(!confirm("Upload "+files.length+" photo(s)? You can only upload once."))return;bt.disabled=true;er.textContent="";bt.textContent="Preparing photos…";
  try{const imgs=[];for(const f of files)imgs.push(await shrink(f));bt.textContent="Uploading… please wait, don't close this page";
   const j=await post({type:"quizOutput",name:nm,section:sc,grade:g,subject:sub,images:imgs});
   if(j.ok||j.dup){store(k,1);c.innerHTML='<h3>📸 Upload your output</h3><div class="card score" style="box-shadow:none"><div class="note">SHS ADM PORTAL · OUTPUT RECEIPT</div><b style="font-size:1.4rem">'+(j.ok?"✓ Uploaded":"Already uploaded")+'</b><div class="row">'+esc(nm)+' · '+esc(sc)+'</div><div class="row">'+esc(sub)+'</div><div class="row">'+(j.ok?j.count+" photo(s) received · ":"")+fmt(Date.now())+'</div>'+(j.dup?'<p class="note">Only one upload per subject.</p>':'')+'</div>';return}
   er.textContent="Upload failed: "+(j.error||"please try again.")}catch(e){er.textContent="Upload failed. Check your internet and try again."}
  bt.disabled=false;bt.textContent="Upload output"}}


// ---------- TASKS ----------
function openTasks(){return(CFG.tasks||[]).filter(t=>!t.deadline||Date.now()<t.deadline)}
$("tgr").onchange=()=>{const g=$("tgr").value,subs=[...new Set(openTasks().filter(t=>norm(t.grade)===norm(g)||norm(t.grade)==="all").map(t=>t.subject))];
 $("tsj").innerHTML='<option value="">'+(!g?"— Choose grade level first —":subs.length?"— Choose subject —":"No tasks right now")+'</option>'+subs.map(s=>'<option>'+esc(s)+'</option>').join("");$("tsj").disabled=!subs.length;showTasks()};
$("tsj").onchange=showTasks;
function showTasks(){const g=$("tgr").value,s=$("tsj").value,box=$("tlist");if(!s){box.innerHTML="";return}
 const ts=openTasks().filter(t=>(norm(t.grade)===norm(g)||norm(t.grade)==="all")&&t.subject===s);
 if(!ts.length){box.innerHTML='<div class="closed" style="font-size:1rem">No tasks for this subject right now.</div>';return}
 box.innerHTML=ts.map((t,i)=>{const done=store("adm_task_"+t.id);return'<div class="card task" id="tk'+i+'"><h3>'+esc(t.title)+'</h3>'+(t.deadline?'<div class="dl">Deadline: '+fmt(t.deadline)+' · '+left(t.deadline)+'</div>':'')+'<div class="ins">'+esc(t.instructions)+'</div>'+
 (done?'<p class="ok"><b>✓ You already submitted this task.</b></p>':'<label class="f">📷 Photos of your work (1–5)</label><input type="file" accept="image/*" multiple data-i="'+i+'"><div class="thumbs"></div><div class="err"></div><button data-i="'+i+'">Submit task</button>')+'</div>'}).join("");
 box.querySelectorAll("input[type=file]").forEach(inp=>inp.onchange=()=>{const th=inp.nextElementSibling;th.innerHTML="";[...inp.files].slice(0,5).forEach(f=>{const im=new Image();im.src=URL.createObjectURL(f);th.appendChild(im)});
  inp.parentNode.querySelector(".err").textContent=inp.files.length>5?"Only the first 5 photos will be sent.":""});
 box.querySelectorAll("button").forEach(b=>b.onclick=()=>sendTask(ts[+b.dataset.i],b.parentNode))}
function shrink(file){return new Promise((ok,no)=>{const im=new Image(),u=URL.createObjectURL(file);im.onload=()=>{const M=1600,r=Math.min(1,M/Math.max(im.width,im.height)),c=document.createElement("canvas");
 c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);c.getContext("2d").drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL("image/jpeg",0.7).split(",")[1])};im.onerror=()=>no(new Error("bad image"));im.src=u})}
async function sendTask(t,card){const nm=$("tnm").value.trim(),sc=$("tsec").value.trim(),er=card.querySelector(".err"),bt=card.querySelector("button"),files=[...card.querySelector("input[type=file]").files].slice(0,5);
 if(!nm||!sc){er.textContent="Please enter your name and section at the top first.";window.scrollTo(0,0);return}
 if(!files.length){er.textContent="Please choose at least 1 photo.";return}
 if(!confirm("Submit "+files.length+" photo(s) for \""+t.title+"\"? You can only submit once."))return;
 bt.disabled=true;er.textContent="";bt.textContent="Preparing photos…";
 try{const imgs=[];for(const f of files)imgs.push(await shrink(f));bt.textContent="Uploading… please wait, don't close this page";
  const j=await post({type:"task",taskId:t.id,name:nm,section:sc,grade:$("tgr").value,images:imgs});
  if(j.ok||j.dup){store("adm_task_"+t.id,1);card.innerHTML='<h3>'+esc(t.title)+'</h3><div class="card score" style="box-shadow:none"><div class="note">SHS ADM PORTAL · TASK RECEIPT</div><b style="font-size:1.4rem">'+(j.ok?"✓ Submitted":"Already submitted")+'</b><div class="row">'+esc(nm)+' · '+esc(sc)+'</div><div class="row">'+esc(t.subject)+'</div><div class="row">'+(j.ok?j.count+" photo(s) received · ":"")+fmt(Date.now())+'</div>'+(j.dup?'<p class="note">Only one submission per task.</p>':'')+'</div>';return}
  er.textContent=j.closed?"This task is already closed.":"Upload failed: "+(j.error||"please try again.")}
 catch(e){er.textContent="Upload failed. Check your internet and try again."}
 bt.disabled=false;bt.textContent="Submit task"}

// ---------- start ----------
if(!API_URL)notOpen();else get("action=config").then(j=>{if(!j||!j.ok)throw 0;CFG=j;$("loading").style.display="none";fillDates();hcd();load("");tab(location.hash==="#tasks"?"tasks":"quiz")}).catch(notOpen);
