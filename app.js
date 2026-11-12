"use strict";
const $=id=>document.getElementById(id),L="ABCD";
let CFG=null,ITEMS=[],SID="",TICK=null;
function esc(s){return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
function H(t){let x=0x811c9dc5;for(const ch of new TextEncoder().encode(t)){x=Math.imul(x^ch,0x01000193)>>>0}return x.toString(16).padStart(8,"0")}
function norm(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function fmt(ms){return new Date(ms).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Manila"})}
function left(ms){const m=Math.ceil((ms-Date.now())/60000);if(m<=0)return"closed";const d=Math.floor(m/1440),h=Math.floor(m%1440/60);return(d?d+"d ":"")+h+"h "+(m%60)+"m left"}
function get(q){const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);return fetch(API_URL+"?"+q,{cache:"no-store",signal:c.signal}).then(r=>r.json()).finally(()=>clearTimeout(t))}
// POST with automatic retry. When many students upload at once the Apps Script backend answers
// with an HTML "lock timeout" page instead of JSON (nothing was saved), so wait a few seconds and try again.
// opts.check(): returns true if the server already has this submission (stops duplicate uploads).
// opts.wait(n,max): shows "retrying" status to the student.
const BUSY="The server is busy because many classmates are uploading at the same time. Please wait 1 minute, then tap the button again.";
async function post(o,opts){opts=opts||{};const max=opts.tries||8,body=JSON.stringify(o);let lastNet=null;
 for(let a=1;a<=max;a++){
  try{const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:body});const txt=await r.text();
   let j=null;try{j=JSON.parse(txt)}catch(_){}lastNet=null;if(j&&!j.busy)return j}
  catch(e){lastNet=e}
  if(a===max)break;
  if(opts.check){try{if(await opts.check())return{ok:true,recovered:true,count:(o.images||[]).length}}catch(_){}}
  if(opts.wait)opts.wait(a+1,max);
  await new Promise(r=>setTimeout(r,3000+Math.random()*5000+a*2000))}
 if(lastNet)throw lastNet;return{ok:false,error:BUSY}}
const busyMsg=(bt)=>(n,m)=>{bt.textContent="Server busy, retrying automatically ("+n+"/"+m+")… don't close this page"};
function store(k,v){try{if(v===undefined)return localStorage.getItem(k)==="1";localStorage.setItem(k,"1")}catch(e){return false}}

// ---------- tabs ----------
const SV=(typeof resolvePortalView==="function")?resolvePortalView(location.search,location.hash,navigator.userAgent):"";
function applySingleView(){if(!SV)return;const title=(typeof portalViewTitle==="function"&&portalViewTitle(SV))||({quiz:"Quiz",tasks:"Tasks",games:"Games",handouts:"Handouts"}[SV]||"ADM");const bar=$("svbar"),el=$("svtitle");if(el)el.textContent=title;if(bar)bar.hidden=false;document.title=title+" — SHS ADM Portal · Bago NHS"}
function tab(w){if(SV==="games"){$("quiz").style.display="none";$("tasks").style.display="none";return}if(SV==="quiz")w="quiz";if(SV==="tasks"||SV==="handouts")w="tasks";$("tq").className=w==="quiz"?"on":"";$("tt").className=w==="tasks"?"on":"";$("sq").className=$("tq").className;$("st2").className=$("tt").className;$("quiz").style.display=w==="quiz"?"":"none";$("tasks").style.display=w==="tasks"?"":"none";if(!SV){try{location.hash=w}catch(e){}}}
$("tq").onclick=()=>CFG&&!SV&&tab("quiz");$("tt").onclick=()=>CFG&&!SV&&tab("tasks");$("sq").onclick=$("tq").onclick;$("st2").onclick=$("tt").onclick;
function notOpen(){$("loading").style.display="none";$("notopen").style.display="block"}
function iabErr(el,text){if(!el)return;if(text!=null)el.textContent=text;if(typeof attachInAppChromeHelp==="function")attachInAppChromeHelp(el)}
if(typeof fillInAppChromeBar==="function"&&$("iabbar"))try{fillInAppChromeBar($("iabbar"),location.href,navigator.userAgent)}catch(_){}

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
function lockOut(){$("qs").innerHTML="";$("prog").style.display="none";$("bar").style.display="none";$("info").textContent="You already submitted this. Only one submission is allowed."}
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
 post({type:"quiz",name:nm,grade:$("gr").value,subject:sub,section:sc,score:score,total:ITEMS.length,percent:pct,topicBreakdown:tb,answers:ans},{wait:(n,m)=>{const e=$("st");if(e)e.textContent="Server busy, saving again ("+n+"/"+m+")…"}})
 .then(j=>{$("st").innerHTML=j.ok?"<b class='ok'>✓ Score saved</b>":(j.dup||j.error==="already_submitted")?"<b class='err'>You already submitted this. Only one submission is allowed. Only the first submission counts.</b>":j.closed?"<b class='err'>Quiz closed. Score not recorded.</b>":"<b class='err'>Couldn't save — please screenshot this card.</b>"})
 .catch(()=>{$("st").innerHTML="<b class='err'>Couldn't save — please screenshot this card and send it to your teacher.</b>"});
 quizUpload(nm,sc,$("gr").value,sub)}
function quizUpload(nm,sc,g,sub){const k="adm_qout_"+norm(nm)+"_"+SID,c=document.createElement("div");c.className="card task";$("result").appendChild(c);
 if(store(k)){c.innerHTML='<h3>📸 Upload your output</h3><p class="ok"><b>✅ '+ONCE+'</b></p>';return}
 c.innerHTML='<h3>📸 Upload your output</h3><div class="ins">Upload 1–5 photos: a screenshot of your score card and a photo of yourself doing the activity.</div><div class="note" style="text-align:left">'+esc(nm)+' · '+esc(g)+' · '+esc(sub)+' · Section: '+esc(sc)+'</div><label class="f">📷 Add 1–5 photos (take a photo or choose from Gallery). You can add more one at a time.</label><input type="file" accept="image/*"'+MULTI+'><div class="pcount note" style="text-align:left"></div><div class="thumbs"></div><div class="err"></div><button id="qup" class="go">Upload output</button>';
 const inp=c.querySelector("input"),er=c.querySelector(".err"),bt=c.querySelector("button.go");picker(c,inp);
 bt.onclick=async()=>{if(c._busy){er.textContent=PREP;return}const files=c._P.slice(0,MAXP);if(!files.length){er.textContent="Please add at least 1 photo.";return}
  if(!confirm("Upload "+files.length+" photo(s)? You can only upload once."))return;bt.disabled=true;er.textContent="";bt.textContent="Checking…";
  if(await chk(nm,"QUIZ-"+sub)){store(k,1);c.innerHTML='<h3>📸 Upload your output</h3><p class="ok"><b>✅ '+ONCE+'</b></p>';return}
  try{const imgs=files;bt.textContent="Uploading… please wait, don't close this page";
   const j=await post({type:"quizOutput",name:nm,section:sc,grade:g,subject:sub,images:imgs},{check:()=>chk(nm,"QUIZ-"+sub),wait:busyMsg(bt)});
   if(j.ok||j.dup||j.error==="already_submitted"){j.dup=!j.ok;store(k,1);c.innerHTML='<h3>📸 Upload your output</h3><div class="card score" style="box-shadow:none"><div class="note">SHS ADM PORTAL · OUTPUT RECEIPT</div><b style="font-size:1.4rem">'+(j.ok?"✓ Uploaded":"Already uploaded")+'</b><div class="row">'+esc(nm)+' · '+esc(sc)+'</div><div class="row">'+esc(sub)+'</div><div class="row">'+(j.ok?j.count+" photo(s) received · ":"")+fmt(Date.now())+'</div>'+(j.dup?'<p class="note">'+ONCE+'</p>':'')+'</div>';return}
   iabErr(er,failMsg(j))}catch(e){iabErr(er,NETERR)}
  bt.disabled=false;bt.textContent="Upload output"}}


// ---------- TASKS ----------
function tdate(t){return taskReleaseDate(t)}
function liveTasks(){return(CFG.tasks||[]).filter(t=>!t.deadline||Date.now()<t.deadline)}
function handoutItems(){return (typeof HANDOUTS==="undefined"?[]:HANDOUTS).filter(h=>h&&h.file&&h.kind==="handout")}
function catalog(){const all=liveTasks().concat(handoutItems());return SV==="handouts"?all.filter(t=>t.kind==="handout"):all}
function openTasks(){const d=$("td").value;return catalog().filter(t=>!d||tdate(t)===d)}
function fillTDates(){const ds=[...new Set(catalog().map(tdate))].sort(compareTaskDates);const td=new Date(Date.now()+8*36e5).toISOString().slice(0,10);
 $("td").innerHTML=ds.length?ds.map(d=>'<option value="'+d+'">'+(d==="other"?"Other":dlab(d)+(d===td?" (today)":""))+'</option>').join(""):'<option value="">No open tasks</option>';$("td").value=defaultTaskDate(ds)}
$("td").onchange=()=>$("tgr").onchange();
$("tgr").onchange=()=>{const g=$("tgr").value,subs=[...new Set(openTasks().filter(t=>norm(t.grade)===norm(g)||norm(t.grade)==="all").map(t=>t.subject))];
 $("tsj").innerHTML='<option value="">'+(!g?"— Choose grade level first —":subs.length?"— Choose subject —":"No tasks right now")+'</option>'+subs.map(s=>'<option>'+esc(s)+'</option>').join("");$("tsj").disabled=!subs.length;showTasks()};
$("tsj").onchange=showTasks;
function handoutCard(t){const file=String(t.file||""),name=file.split("/").pop(),src="url:"+file;return'<div class="card task handout"><div class="dl">Lesson Handout</div><h3>'+esc(t.title)+'</h3><div class="ins">'+esc(t.instructions)+'</div>'+pdfActionButtons(src,name)+'</div>'}
function pdfActionButtons(src,name){const a=esc(src),n=esc(name||"task.pdf");return'<button type="button" class="pdfact" data-pdf="open" data-pdfsrc="'+a+'">Open PDF</button><a class="pdf pdfdl" data-pdf="dl" data-pdfsrc="'+a+'" href="#" download="'+n+'">Download PDF</a><p class="note pdfmsg" style="text-align:left;margin-top:8px"></p>'}
function taskPdfButtons(p,t){if(!p)return"";if(typeof p==="string")p={view:p,download:p,name:String(p).split("?")[0].split("/").pop()};
 const id=String((t&&t.id)||p.taskId||"").trim();
 let src="";
 if((p.via==="taskPdf"||(typeof driveFileId==="function"&&driveFileId((t&&t.pdf)||p.view||"")))&&id)src="task:"+id;
 else if(p.via==="url"||p.view){const u=p.view||p.download||"";const parsed=typeof parsePdfSource==="function"?parsePdfSource("url:"+u):{kind:"url",url:u};if(typeof isInlinePdfSource==="function"?isInlinePdfSource(parsed):u)src="url:"+u}
 if(src)return pdfActionButtons(src,p.name);
 return'<a class="pdf" href="'+esc(p.view)+'" target="_blank" rel="noopener">Open PDF</a><a class="pdf" href="'+esc(p.download)+'"'+(p.name?' download="'+esc(p.name)+'"':' target="_blank" rel="noopener"')+'>Download PDF</a>'}
function b64ToBytes(b64){if(typeof b64ToUint8Array==="function")return b64ToUint8Array(b64);const clean=String(b64||"").replace(/\s+/g,""),bin=atob(clean),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
function safePdfName(n){n=String(n||"task.pdf").replace(/[/\\?%*:|"<>]/g,"").trim()||"task.pdf";if(!/\.pdf$/i.test(n))n+=".pdf";return n}
const PDFJS_SRC="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js";
const PDFJS_WORKER="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";
const PDFJS_SRC_FB="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_FB="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const PDF_CACHE={};
function pdfKey(src){return typeof pdfSourceKey==="function"?pdfSourceKey(src):(src&&src.kind==="task"?"task:"+src.id:"url:"+(src&&src.url||""))}
function storePdfRec(k,bytes,name,mime){const rec={bytes:bytes,name:safePdfName(name),mime:mime||"application/pdf",blob:new Blob([bytes],{type:mime||"application/pdf"})};PDF_CACHE[k]=rec;return rec}
function loadPdfBytes(src){const k=pdfKey(src);if(!k)return Promise.reject(new Error("Task is missing."));if(PDF_CACHE[k]&&PDF_CACHE[k].bytes)return Promise.resolve(PDF_CACHE[k]);if(PDF_CACHE[k]&&PDF_CACHE[k].wait)return PDF_CACHE[k].wait;
 const p=(async()=>{
  if(src.kind==="task"){
   const q=typeof taskPdfQuery==="function"?taskPdfQuery(src.id):("action=taskPdf&task="+encodeURIComponent(src.id));
   const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),60000);
   let j=null;
   try{const r=await fetch(API_URL+"?"+q,{cache:"no-store",signal:ac.signal});const txt=await r.text();try{j=JSON.parse(txt)}catch(_){}}
   finally{clearTimeout(tm)}
   if(!j||!j.data){const stale=j&&j.ok&&j.app&&!j.data;throw new Error(stale?"The PDF is not ready on the server yet. Please tell your teacher, then try again.":(j&&j.error)||"Couldn't open the PDF. Check your internet and try again.")}
   return storePdfRec(k,b64ToBytes(j.data),j.name,j.mime||"application/pdf");
  }
  const url=src.url;if(!url||/^\s*javascript:/i.test(url))throw new Error("Couldn't open the PDF.");
  const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),60000);
  try{const r=await fetch(url,{cache:"force-cache",signal:ac.signal});if(!r.ok)throw new Error("Couldn't open the PDF. Check your internet and try again.");
   const buf=new Uint8Array(await r.arrayBuffer());
   return storePdfRec(k,buf,src.name||String(url).split("?")[0].split("/").pop(),"application/pdf");
  }finally{clearTimeout(tm)}
 })();
 PDF_CACHE[k]={wait:p};
 return p.then(rec=>rec).catch(e=>{if(PDF_CACHE[k]&&PDF_CACHE[k].wait)delete PDF_CACHE[k];throw e})}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement("script");s.src=src;s.async=true;s.onload=()=>ok();s.onerror=()=>no(new Error("Couldn't load the PDF viewer."));document.head.appendChild(s)})}
async function loadPdfJs(){if(window.pdfjsLib)return window.pdfjsLib;if(loadPdfJs._p)return loadPdfJs._p;
 loadPdfJs._p=(async()=>{let worker=PDFJS_WORKER;try{await loadScript(PDFJS_SRC)}catch(_){await loadScript(PDFJS_SRC_FB);worker=PDFJS_WORKER_FB}
  const lib=window.pdfjsLib;if(!lib)throw new Error("Couldn't load the PDF viewer.");lib.GlobalWorkerOptions.workerSrc=worker;return lib})();
 try{return await loadPdfJs._p}catch(e){loadPdfJs._p=null;throw e}}
async function openPdfDoc(bytes){const lib=await loadPdfJs();try{return await lib.getDocument({data:bytes.slice()}).promise}catch(e){try{lib.disableWorker=true}catch(_){}return await lib.getDocument({data:bytes.slice(),disableWorker:true}).promise}}
function wireDownloadLink(root,rec){if(!root||!rec)return;(root.querySelectorAll?root.querySelectorAll("a.pdfdl, a.pdfdla"):[]).forEach(a=>{if(a._blobUrl){try{URL.revokeObjectURL(a._blobUrl)}catch(_){}}const url=URL.createObjectURL(rec.blob);a._blobUrl=url;a.href=url;a.setAttribute("download",rec.name);a.download=rec.name})}
function cardMsg(card,text,err){const msg=card&&card.querySelector(".pdfmsg");if(!msg)return;msg.textContent=text||"";msg.className="note pdfmsg"+(err?" err":"");msg.style.textAlign="left"}
function prefetchCardPdfs(root){(root||document).querySelectorAll("[data-pdfsrc]").forEach(el=>{const src=typeof parsePdfSource==="function"?parsePdfSource(el.getAttribute("data-pdfsrc")):null;if(!src)return;loadPdfBytes(src).then(rec=>wireDownloadLink(el.closest(".card")||el.parentNode,rec)).catch(()=>{})})}
let PV={open:false,z:1,pdf:null,rendering:false};
function pdfSetZoom(z){PV.z=Math.max(0.6,Math.min(3,z));const box=$("pdfzoom");if(!box)return;if("zoom" in box.style){box.style.zoom=String(PV.z);box.style.transform="";box.style.width=""}else{box.style.zoom="";box.style.transformOrigin="top left";box.style.transform="scale("+PV.z+")";box.style.width=(100/PV.z)+"%"}}
function pdfClose(){if(!PV.open)return;PV.open=false;const v=$("pdfview");if(v){v.hidden=true;v.classList.remove("on")}document.body.classList.remove("pdf-open");$("pdfpages")&&($("pdfpages").innerHTML="");if(PV.pdf){try{PV.pdf.destroy()}catch(_){}}PV.pdf=null;if(PV.pop){PV.pop=false;try{if(history.state&&history.state.pdfview)history.back()}catch(_){}}}
async function pdfRenderPages(pdf){const stage=$("pdfstage"),hold=$("pdfpages");if(!stage||!hold)return;hold.innerHTML="";const cssW=Math.max(280,stage.clientWidth||window.innerWidth||320),dpr=Math.min(2,window.devicePixelRatio||1);
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);if(!PV.open)return;const base=page.getViewport({scale:1}),scale=(cssW/base.width)*dpr,vp=page.getViewport({scale});const c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;c.style.width="100%";c.style.height="auto";hold.appendChild(c);await page.render({canvasContext:c.getContext("2d",{alpha:false}),viewport:vp}).promise}
 pdfUpdatePage();}
function pdfUpdatePage(){const stage=$("pdfstage"),hold=$("pdfpages"),lab=$("pdfpg");if(!stage||!hold||!lab)return;const cs=[...hold.querySelectorAll("canvas")];if(!cs.length){lab.textContent="";return}const top=stage.getBoundingClientRect().top+Math.min(80,stage.clientHeight*0.25);let n=1;cs.forEach((c,i)=>{if(c.getBoundingClientRect().top<=top)n=i+1});lab.textContent=n+" / "+cs.length}
async function openInlinePdf(src,btn,title){const card=btn&&(btn.closest(".card")||btn.parentNode);if(!src){cardMsg(card,"Task is missing.",true);return}
 const v=$("pdfview"),wait=$("pdfwait"),err=$("pdferr"),hold=$("pdfpages");if(!v)return;
 const prev=btn&&btn.textContent;if(btn&&btn.tagName==="BUTTON"){btn.disabled=true;btn.textContent="Loading PDF…"}
 cardMsg(card,"Loading the PDF… please wait.");
 v.hidden=false;v.classList.add("on");document.body.classList.add("pdf-open");PV.open=true;PV.z=1;pdfSetZoom(1);
 if(hold)hold.innerHTML="";if(wait)wait.style.display="";if(err){err.style.display="none";err.textContent=""}
 $("pdfptitle").textContent=title||(card&&card.querySelector("h3")&&card.querySelector("h3").textContent)||"PDF";
 $("pdfpg").textContent="";
 try{if(!PV.pop){try{history.pushState({pdfview:1},"",location.href);PV.pop=true}catch(_){}}
  const rec=await loadPdfBytes(src);wireDownloadLink(card,rec);wireDownloadLink(v,rec);
  cardMsg(card,"");
  const pdf=await openPdfDoc(rec.bytes);if(!PV.open){try{pdf.destroy()}catch(_){}return}PV.pdf=pdf;
  if(wait)wait.style.display="none";
  await pdfRenderPages(pdf);
 }catch(e){
  if(wait)wait.style.display="none";
  const abort=e&&(e.name==="AbortError"||/abort/i.test(String(e&&e.message||e)));
  const text=abort?"The PDF is taking too long. Check your internet and try again.":(e&&e.message)||"Couldn't open the PDF. Check your internet and try again.";
  if(err){err.style.display="block";err.textContent=text}cardMsg(card,text,true);
  if(typeof attachInAppChromeHelp==="function"){attachInAppChromeHelp(err||card);if(card)attachInAppChromeHelp(card)}
 }
 if(btn&&btn.tagName==="BUTTON"){btn.disabled=false;btn.textContent=prev||"Open PDF"}
}
function bindTaskPdfButtons(root){
 const box=root||document;
 box.querySelectorAll("[data-pdf=open]").forEach(b=>{if(b._pdfBound)return;b._pdfBound=true;b.addEventListener("click",ev=>{ev.preventDefault();const src=typeof parsePdfSource==="function"?parsePdfSource(b.getAttribute("data-pdfsrc")):null;if(src)openInlinePdf(src,b)})});
 box.querySelectorAll("a.pdfdl").forEach(a=>{if(a._pdfBound)return;a._pdfBound=true;a.addEventListener("click",ev=>{const href=a.getAttribute("href")||"";if(href&&href!=="#")return;ev.preventDefault();const card=a.closest(".card")||a.parentNode,src=typeof parsePdfSource==="function"?parsePdfSource(a.getAttribute("data-pdfsrc")):null;if(!src)return;cardMsg(card,"Preparing the PDF… please wait, then tap Download PDF again.");loadPdfBytes(src).then(rec=>{wireDownloadLink(card,rec);cardMsg(card,"The PDF is ready. Tap Download PDF again.")}).catch(e=>{cardMsg(card,(e&&e.message)||"Couldn't open the PDF. Check your internet and try again.",true);if(typeof attachInAppChromeHelp==="function")attachInAppChromeHelp(card)})})});
 prefetchCardPdfs(box);
}
(function setupPdfViewer(){
 const v=$("pdfview"); if(!v)return;
 const close=$("pdfclose"), zm=$("pdfzm"), zp=$("pdfzp"), zf=$("pdfzfit"), stage=$("pdfstage");
 if(close)close.onclick=()=>pdfClose();
 if(zm)zm.onclick=()=>pdfSetZoom(PV.z-0.25);
 if(zp)zp.onclick=()=>pdfSetZoom(PV.z+0.25);
 if(zf)zf.onclick=()=>pdfSetZoom(1);
 if(stage)stage.addEventListener("scroll",pdfUpdatePage,{passive:true});
 window.addEventListener("resize",()=>{if(!PV.open||!PV.pdf||PV.rendering)return;clearTimeout(PV.rt);PV.rt=setTimeout(()=>{if(PV.open&&PV.pdf){PV.rendering=true;pdfRenderPages(PV.pdf).finally(()=>{PV.rendering=false})}},200)});
 window.addEventListener("popstate",()=>{if(PV.open){PV.pop=false;pdfClose()}});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&PV.open){e.preventDefault();pdfClose()}});
 let pinch0=0,z0=1;
 function dist(a,b){const dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;return Math.hypot(dx,dy)}
 if(stage){
  stage.addEventListener("touchstart",e=>{if(e.touches.length===2){pinch0=dist(e.touches[0],e.touches[1]);z0=PV.z}},{passive:true});
  stage.addEventListener("touchmove",e=>{if(e.touches.length===2&&pinch0){e.preventDefault();pdfSetZoom(z0*(dist(e.touches[0],e.touches[1])/pinch0))}},{passive:false});
  stage.addEventListener("touchend",e=>{if(e.touches.length<2)pinch0=0},{passive:true});
 }
})();
function showTasks(){const g=$("tgr").value,s=$("tsj").value,box=$("tlist"),note=document.getElementById("tasknote");if(!s){box.innerHTML="";if(note)note.style.display="";return}
 const ts=openTasks().filter(t=>(norm(t.grade)===norm(g)||norm(t.grade)==="all")&&t.subject===s);
 if(note)note.style.display=ts.length&&ts.every(t=>t.kind==="handout")?"none":"";
 if(!ts.length){TS=[];box.innerHTML='<div class="closed" style="font-size:1rem">No tasks for this subject right now.</div>';return}
 box.innerHTML=ts.map((t,i)=>{if(t.kind==="handout")return handoutCard(t);const done=store("adm_task_"+t.id)||store(tkey(t.id));const pdf=taskPdfLinks(t),instr=pdf&&pdf.strip?stripTaskPdfUrl(t.instructions,pdf.strip):String(t.instructions||"");return'<div class="card task" id="tk'+i+'"><h3>'+esc(t.title)+'</h3>'+(t.deadline?'<div class="dl">Deadline: '+fmt(t.deadline)+' · '+left(t.deadline)+'</div>':'<div class="dl">No deadline</div>')+'<div class="ins">'+esc(instr)+'</div>'+taskPdfButtons(pdf,t)+
 (done?'<p class="ok"><b>✅ Submitted — You already submitted this. Only one submission is allowed.</b></p>':'<label class="f">📷 Photos of your work (1–5). Take a photo or choose from Gallery; you can add more one at a time.</label><input type="file" accept="image/*"'+MULTI+' data-i="'+i+'"><div class="pcount note" style="text-align:left"></div><div class="thumbs"></div><div class="err"></div><button class="go" data-i="'+i+'">Submit task</button>')+'</div>'}).join("");
 box.querySelectorAll("input[type=file]").forEach(inp=>picker(inp.parentNode,inp));
 box.querySelectorAll("button.go[data-i]").forEach(b=>b.onclick=()=>sendTask(ts[+b.dataset.i],b.parentNode));bindTaskPdfButtons(box);TS=ts;taskStatus(ts)}
const ONCE="You already submitted this. Only one submission is allowed.";
function tkey(id){return"adm_task_"+norm($("tnm").value)+"_"+id}
function chk(nm,id){return get("action=checkTask&name="+encodeURIComponent(nm)+"&task="+encodeURIComponent(id)).then(j=>!!(j&&j.exists)).catch(()=>false)}
function lockCard(card,t){const pdf=taskPdfLinks(t);card.innerHTML='<h3>'+esc(t.title)+'</h3>'+taskPdfButtons(pdf,t)+'<p class="ok"><b>✅ Submitted — '+ONCE+'</b></p>';bindTaskPdfButtons(card)}
function taskStatus(ts){const nm=$("tnm").value.trim();if(!nm)return;ts.forEach((t,i)=>{const c=$("tk"+i);if(!c||!c.querySelector("button"))return;chk(nm,t.id).then(x=>{if(x&&$("tnm").value.trim()===nm){store(tkey(t.id),1);lockCard(c,t)}})})}
// Name/section changes only re-check "already submitted" locks; they no longer rebuild the task cards,
// which used to wipe photos a student had already picked (typing a name then tapping Submit fired "change").
let TS=[];function nameChanged(){if(!$("tsj").value||!TS.length)return;TS.forEach((t,i)=>{const c=$("tk"+i);if(c&&c.querySelector("button")&&store(tkey(t.id)))lockCard(c,t)});taskStatus(TS)}
["tnm","tsec"].forEach(id=>{const e=$(id);if(e){e.addEventListener("change",nameChanged)}});document.addEventListener("change",e=>{if(e.target&&e.target.id==="tnmL")nameChanged()});
// ---------- PHOTO PICKER ----------
// Photos are read the moment they are picked. Decoding is tried 3 ways (createImageBitmap with resize,
// <img>+objectURL, FileReader dataURL) and downscaled to 1600px JPEG. If the phone can't decode it
// (HEIC, huge 50MP photo, low memory) but the bytes look like a photo, the ORIGINAL is sent as-is
// (up to MAXRAW). Only truly empty (0-byte) or non-photo files are rejected, with the real reason shown.
// Inside the student app, the file input is single-select: app 1.6.1 and older returned the empty
// camera temp file instead of Gallery photos whenever "multiple" was allowed, so those apps get one photo per pick.
// App 1.6.3+ exposes AdmStudent.appVersion() and fixes multi-select, so it gets "multiple" again.
const MAXP=5,MAXRAW=7*1024*1024,INAPP=typeof window.AdmStudent!=="undefined",APPV=(()=>{try{return INAPP&&typeof AdmStudent.appVersion==="function"?String(AdmStudent.appVersion()||""):""}catch(_){return""}})(),MULTI=INAPP&&!APPV?"":" multiple",
 READERR="This photo couldn't be read. Retake it or choose it from Gallery.",
 EMPTYERR="The photo came in empty, so it wasn't added. Take the photo with your phone's Camera app first, then tap the button and choose it from Gallery.",
 NETERR="Couldn't reach the server. Check your internet, then tap the button again. (Your photos are still here.)",
 PREP="Please wait, still preparing your photos…";
function failMsg(j){return j.error===BUSY?BUSY:"Upload failed: "+(j.error||"please try again.")}
function photoErr(msg,code){return Object.assign(new Error(msg),{read:true,code:code||"read"})}
function withTO(p,ms,what){return new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error(what+" timed out")),ms);p.then(v=>{clearTimeout(t);ok(v)},e=>{clearTimeout(t);no(e)})})}
function readBuf(f){if(f.arrayBuffer)return f.arrayBuffer();return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error||new Error("read error"));r.readAsArrayBuffer(f)})}
function readURL(b){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||""));r.onerror=()=>no(r.error||new Error("read error"));r.readAsDataURL(b)})}
function sniff(u){const s=(a,b)=>String.fromCharCode.apply(null,u.subarray(a,b));
 if(u.length>2&&u[0]===0xFF&&u[1]===0xD8&&u[2]===0xFF)return"jpeg";
 if(u.length>3&&u[0]===0x89&&s(1,4)==="PNG")return"png";
 if(u.length>11&&s(0,4)==="RIFF"&&s(8,12)==="WEBP")return"webp";
 if(u.length>3&&s(0,4)==="GIF8")return"gif";
 if(u.length>1&&s(0,2)==="BM")return"bmp";
 if(u.length>11&&s(4,8)==="ftyp"){const br=s(8,12).toLowerCase();if(/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(br))return"heic";if(/^avi[fs]$/.test(br))return"avif"}
 return""}
const MIME={jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",bmp:"image/bmp",heic:"image/heic",avif:"image/avif"};
function toJpeg(src,w,h){if(!w||!h)throw new Error("no size");const M=1600,r=Math.min(1,M/Math.max(w,h)),c=document.createElement("canvas");
 c.width=Math.max(1,Math.round(w*r));c.height=Math.max(1,Math.round(h*r));const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);
 const d=c.toDataURL("image/jpeg",0.72);c.width=c.height=1;if(!d||d.length<200||d.indexOf("data:image/jpeg")!==0)throw new Error("canvas export failed");return d.split(",")[1]}
function viaImg(url){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>{try{ok(toJpeg(im,im.naturalWidth||im.width,im.naturalHeight||im.height))}catch(e){no(e)}};im.onerror=()=>no(new Error("image decode failed"));im.src=url})}
async function shrink(file){
 if(!file)throw photoErr("no file received","empty");
 let buf;try{buf=await withTO(readBuf(file),30000,"reading the file")}catch(e){throw photoErr("couldn't open the file ("+(e&&e.message||e)+")")}
 if(!buf||!buf.byteLength)throw photoErr("empty file (0 bytes)","empty");
 const kind=sniff(new Uint8Array(buf,0,Math.min(32,buf.byteLength))),looksImg=!!kind||/^image\//i.test(file.type||"");
 if(!looksImg&&file.type)throw photoErr("not a photo ("+file.type+")","type");
 const blob=new Blob([buf],{type:MIME[kind]||file.type||"image/jpeg"}),why=[];
 if(kind!=="heic"){
  if(typeof createImageBitmap==="function"){try{const b=await withTO(createImageBitmap(blob,{resizeWidth:1600,resizeQuality:"medium",imageOrientation:"from-image"}).catch(()=>createImageBitmap(blob)),30000,"bitmap");
    try{return toJpeg(b,b.width,b.height)}finally{b.close&&b.close()}}catch(e){why.push("bitmap: "+(e&&e.message||e))}}
  const u=URL.createObjectURL(blob);try{return await withTO(viaImg(u),30000,"image")}catch(e){why.push("img: "+(e&&e.message||e))}finally{URL.revokeObjectURL(u)}
  if(buf.byteLength<=20*1024*1024){try{return await withTO(readURL(blob).then(viaImg),40000,"dataURL")}catch(e){why.push("dataURL: "+(e&&e.message||e))}}
 }else why.push("HEIC can't be shrunk on this phone");
 // Couldn't decode/shrink: send the original bytes if it looks like a photo and is small enough.
 if(looksImg&&buf.byteLength<=MAXRAW){const d=await readURL(blob);const b64=d.split(",")[1]||"";if(b64.length>100)return b64}
 const mb=(buf.byteLength/1048576).toFixed(1);
 if(looksImg)throw photoErr("photo is "+mb+" MB and this phone couldn't shrink it ("+why.join("; ")+")","big");
 throw photoErr("unknown file format, "+mb+" MB ("+why.join("; ")+")","type")}
function picker(card,inp){const P=[];card._P=P;card._busy=0;const th=card.querySelector(".thumbs"),er=card.querySelector(".err"),pc=card.querySelector(".pcount");
 let dt=card.querySelector(".errd");if(!dt){dt=document.createElement("div");dt.className="errd note";dt.style.textAlign="left";er.after(dt)}
 const draw=()=>{th.innerHTML="";P.forEach((b,i)=>{const w=document.createElement("div");w.className="th";const im=new Image();im.alt="Photo "+(i+1);
   im.onerror=()=>{const t=document.createElement("div");t.textContent="📷 Photo "+(i+1);t.style.cssText="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:12px;border:2px solid var(--line);font-size:.8rem;text-align:center";im.replaceWith(t)};
   im.src="data:image/jpeg;base64,"+b;
   const x=document.createElement("button");x.type="button";x.className="rm";x.setAttribute("aria-label","Remove photo "+(i+1));x.textContent="×";x.onclick=()=>{P.splice(i,1);er.textContent="";dt.textContent="";draw()};w.append(im,x);th.appendChild(w)});
  if(pc)pc.textContent=P.length?P.length+" of "+MAXP+" photos added"+(P.length<MAXP?" · tap the button above to add more":" · maximum reached"):"";inp.disabled=P.length>=MAXP};
 inp.onchange=async()=>{const fs=[...(inp.files||[])];if(!fs.length)return;card._busy++;er.textContent="Preparing photos…";dt.textContent="";let bad=[],over=0;
  for(const f of fs){if(P.length>=MAXP){over++;continue}try{P.push(await shrink(f));draw()}catch(e){bad.push(e)}}
  try{inp.value=""}catch(_){}card._busy--;draw();
  const allEmpty=bad.length&&bad.every(e=>e.code==="empty");
  er.textContent=[bad.length?(allEmpty?EMPTYERR:bad.every(e=>e.code==="big")?"This photo is too big for this phone to shrink. Take a screenshot of the photo and add the screenshot instead.":(bad.length>1?bad.length+" photos couldn't be read. Retake them or choose them from Gallery.":READERR)):"",over?"Only "+MAXP+" photos are allowed, so "+over+" extra photo"+(over>1?"s were":" was")+" not added.":""].filter(Boolean).join(" ");
  if(bad.length&&typeof attachInAppChromeHelp==="function")attachInAppChromeHelp(er);
  dt.textContent=bad.length?"Details: "+bad.map(e=>(e&&e.message)||String(e)).join(" | ")+(allEmpty&&INAPP?" — the in-app camera on app 1.6.1 or older can't save photos. Use Gallery, or install app 1.6.2.":""):""};
 draw()}
async function sendTask(t,card){const nm=$("tnm").value.trim(),sc=$("tsec").value.trim(),er=card.querySelector(".err"),bt=card.querySelector("button.go"),files=(card._P||[]).slice(0,MAXP);
 if(!nm||!sc){er.textContent="Please enter your name and section at the top first.";window.scrollTo(0,0);return}
 if(card._busy){er.textContent=PREP;return}
 if(!files.length){er.textContent="Please add at least 1 photo.";return}
 if(!confirm("Submit "+files.length+" photo(s) for \""+t.title+"\"? You can only submit once."))return;
 bt.disabled=true;er.textContent="";bt.textContent="Checking…";
 if(store(tkey(t.id))||await chk(nm,t.id)){store(tkey(t.id),1);lockCard(card,t);return}
 try{const imgs=files;bt.textContent="Uploading… please wait, don't close this page";
  const j=await post({type:"task",taskId:t.id,name:nm,section:sc,grade:$("tgr").value,images:imgs},{check:()=>chk(nm,t.id),wait:busyMsg(bt)});
  if(j.ok||j.dup||j.error==="already_submitted"){j.dup=!j.ok;store(tkey(t.id),1);card.innerHTML='<h3>'+esc(t.title)+'</h3><div class="card score" style="box-shadow:none"><div class="note">SHS ADM PORTAL · TASK RECEIPT</div><b style="font-size:1.4rem">'+(j.ok?"✓ Submitted":"Already submitted")+'</b><div class="row">'+esc(nm)+' · '+esc(sc)+'</div><div class="row">'+esc(t.subject)+'</div><div class="row">'+(j.ok?j.count+" photo(s) received · ":"")+fmt(Date.now())+'</div>'+(j.dup?'<p class="note">'+ONCE+'</p>':'')+'</div>';return}
  iabErr(er,j.closed?"This task is already closed.":failMsg(j))}
 catch(e){iabErr(er,NETERR)}
 bt.disabled=false;bt.textContent="Submit task"}

// ---------- start ----------
if(!API_URL)notOpen();else get("action=config").then(j=>{if(!j||!j.ok)throw 0;CFG=j;setupNames();$("loading").style.display="none";fillDates();fillTDates();hcd();load("");const start=SV==="tasks"||SV==="handouts"?"tasks":(SV==="games"?"quiz":(location.hash==="#tasks"?"tasks":"quiz"));tab(start);applySingleView()}).catch(e=>{applySingleView();notOpen()});

function setupNames(){const LS=(CFG.learners||[]).filter(x=>x&&x.g&&x.s&&x.n);if(!LS.length)return;
 [["gr","sec","nm"],["tgr","tsec","tnm"]].forEach(([g,s,n])=>{const gi=$(g),si=$(s),ni=$(n),nl=ni.previousElementSibling,sl=si.previousElementSibling;
  const ss=document.createElement("select"),ns=document.createElement("select");ss.id=s+"L";ns.id=n+"L";
  const l1=document.createElement("label");l1.className="f";l1.htmlFor=ss.id;l1.textContent="Section";
  const l2=document.createElement("label");l2.className="f";l2.htmlFor=ns.id;l2.textContent="Your name";
  const nt=document.createElement("label");nt.className="f";nt.htmlFor=n;nt.textContent="Type your name (First Last)";
  gi.after(l1,ss,l2,ns,nt,ni);sl.textContent="Type your section";si.before(sl);
  if(nl)nl.remove();let manual=false;
  const vis=()=>{nt.style.display=ni.style.display=manual?"":"none";sl.style.display=si.style.display=manual?"":"none"};
  const sync=()=>{manual=ns.value==="__other";if(manual){ni.value="";si.value=""}else{ni.value=ns.value;si.value=ss.value}vis()};
  const fillN=()=>{const prev=ns.value,ps=namesForSection(LS,gi.value,ss.value);
   ns.replaceChildren();ns.add(new Option(ss.value?"— Choose your name —":"— Choose section first —",""));
   ps.forEach(x=>ns.add(new Option(x.l&&x.f?x.l+", "+x.f:x.n,x.n)));
   if(ss.value)ns.add(new Option("My name is not on the list","__other"));
   ns.disabled=!ss.value;if(prev&&[...ns.options].some(o=>o.value===prev))ns.value=prev;sync()};
  const fillS=()=>{const prev=ss.value,secs=sectionsForGrade(LS,gi.value);
   ss.disabled=false;ss.replaceChildren();
   ss.add(new Option(!gi.value?"— Choose grade level first —":secs.length?"— Choose section —":"— No section on the list —",""));
   secs.forEach(sec=>ss.add(new Option(sec,sec)));
   ss.value=secs.indexOf(prev)>=0?prev:(secs.length===1?secs[0]:"");fillN()};
  const prev=gi.onchange;gi.onchange=function(ev){if(typeof prev==="function")prev.call(gi,ev);fillS()};
  gi.addEventListener("input",fillS);ss.addEventListener("change",fillN);ns.addEventListener("change",sync);fillS()})};
