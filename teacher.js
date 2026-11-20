"use strict";
/* ADM Portal Teacher page. Talks to the same Apps Script /exec as the student portal.
   All teacher calls are POST with the PIN in the body. The PIN is kept only in this tab's sessionStorage. */
(function(){
const $=id=>document.getElementById(id);
const SUBJECTS={"Grade 11":["General Mathematics","Practical Research 1"],"Grade 12":["Practical Research 2","Community Engagement, Solidarity and Citizenship (CESC)","Entrepreneurship"]};
const MAXPDF=10*1024*1024;
let PIN="";try{PIN=sessionStorage.getItem("adm_tpin")||""}catch(_){}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]))}
function manilaNow(){return new Date(Date.now()+8*36e5).toISOString().slice(0,16)} // yyyy-mm-ddThh:mm in Manila
function show(id){["loading","notready","setpin","unlock","app"].forEach(x=>$(x).classList.toggle("hide",x!==id))}
async function call(o,tries){tries=tries||3;let last=null;
 for(let a=1;a<=tries;a++){
  try{const r=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(o)});
   const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(_){}
   if(j&&!j.busy)return j;last=j}catch(e){last={ok:false,net:true,error:"Couldn't reach the server. Check your internet and try again."}}
  if(a<tries)await new Promise(r=>setTimeout(r,2500*a))}
 return last||{ok:false,error:"Server busy. Please try again in a minute."}}
// An old backend has no teacher actions: its answer has no teacher:true marker.
function isOld(j){return !j||j.teacher!==true}
function busy(b,on,label){b.disabled=on;if(label)b.textContent=label}

async function start(){show("loading");
 if(typeof API_URL==="undefined"||!API_URL){show("notready");return}
 const j=await call({action:"teacherStatus"},2);
 if(isOld(j)){show("notready");return}
 if(!j.pinSet){show("setpin");return}
 if(PIN){const l=await call({action:"teacherList",pin:PIN},2);if(l.ok){enter(l);return}PIN="";try{sessionStorage.removeItem("adm_tpin")}catch(_){}}
 show("unlock");setTimeout(()=>$("pin").focus(),50)}
$("retry").onclick=start;

$("spbtn").onclick=async()=>{const a=$("np1").value.trim(),b=$("np2").value.trim(),m=$("spmsg"),bt=$("spbtn");m.textContent="";
 if(!/^\d{6,12}$/.test(a)){m.textContent="Use 6 to 12 digits.";return}
 if(a!==b){m.textContent="The two PINs don't match.";return}
 busy(bt,true,"Saving…");const j=await call({action:"teacherSetPin",pin:a});busy(bt,false,"Save PIN");
 if(isOld(j)){show("notready");return}
 if(!j.ok){m.textContent=j.error||"Couldn't save the PIN.";if(j.pinSet)setTimeout(start,1200);return}
 $("np1").value=$("np2").value="";$("pin").value=a;unlock()};

async function unlock(){const p=$("pin").value.trim(),m=$("ulmsg"),bt=$("ulbtn");m.textContent="";
 if(!p){m.textContent="Enter your PIN.";return}
 busy(bt,true,"Checking…");const j=await call({action:"teacherList",pin:p});busy(bt,false,"Unlock");
 if(isOld(j)){show("notready");return}
 if(!j.ok){m.textContent=j.error||"Wrong PIN.";return}
 PIN=p;try{sessionStorage.setItem("adm_tpin",p)}catch(_){}$("pin").value="";enter(j)}
$("ulbtn").onclick=unlock;$("pin").addEventListener("keydown",e=>{if(e.key==="Enter")unlock()});

function enter(list){show("app");resetForm();renderList(list);resetVid();view("post")}
function view(w){$("va")&&($("va").className=w==="accts"?"on":"");$("accts")&&$("accts").classList.toggle("hide",w!=="accts");$("vp").className=w==="post"?"on":"";$("vl").className=w==="list"?"on":"";$("vm")&&($("vm").className=w==="motiv"?"on":"");$("post").classList.toggle("hide",w!=="post");$("list").classList.toggle("hide",w!=="list");$("motiv")&&$("motiv").classList.toggle("hide",w!=="motiv")}
$("vp").onclick=()=>view("post");$("vl").onclick=()=>{view("list");loadList()};$("vm")&&($("vm").onclick=()=>{view("motiv");loadUploads()});
function lockPage(msg){PIN="";try{sessionStorage.removeItem("adm_tpin")}catch(_){}show("unlock");if(msg)$("ulmsg").textContent=msg}
$("lock").onclick=()=>lockPage("");
// ---------- learner accounts (Code_accounts.gs) ----------
let ACCTS=[];
async function loadCodes(){const box=$("cl2");if(!box)return;box.innerHTML='<div class="wait">Loading…</div>';const j=await call({action:"teacherAcctCodes",pin:PIN});
 if(j&&j.badPin){lockPage("Please unlock again.");return}
 if(!j||!j.ok){box.innerHTML='<div class="err">'+esc(j&&j.teacher?j.error:"Class codes are not set up on the server yet (Code_accounts.gs).")+'</div>';return}
 const cs=j.codes||[];box.innerHTML=cs.map((c,i)=>'<div style="padding:10px 0;border-top:1px solid var(--line)"><div style="font-weight:800">'+esc(c.g+" · "+c.s)+'</div>'+(c.code?'<div style="font-size:1.6rem;font-weight:900;letter-spacing:.2em;margin:4px 0">'+esc(c.code)+'</div>':'<div class="note">No code yet. Learners in this section can\'t create accounts until you make one.</div>')+'<button class="ghost" data-c="'+i+'" style="min-height:44px;margin-top:6px">'+(c.code?"Make a new code":"Make a code")+'</button></div>').join("")||'<div class="note">No sections on the Learners tab.</div>';
 box.querySelectorAll("button[data-c]").forEach(b=>b.onclick=async()=>{const c=cs[+b.dataset.c];if(c.code&&!confirm("Make a new class code for "+c.g+" "+c.s+"? The old code "+c.code+" will stop working."))return;
  b.disabled=true;b.textContent="Making…";const r=await call({action:"teacherAcctCodeNew",pin:PIN,grade:c.g,section:c.s});
  if(r&&r.ok){loadCodes()}else{b.disabled=false;b.textContent="Make a new code";alert((r&&r.error)||"Could not make a code. Try again.")}})}
async function loadAccts(){loadCodes();const box=$("al");if(!box)return;box.innerHTML='<div class="wait">Loading…</div>';const j=await call({action:"teacherAcctList",pin:PIN});
 if(j&&j.badPin){lockPage("Please unlock again.");return}
 if(!j||!j.ok){box.innerHTML='<div class="card"><div class="err">'+esc(j&&j.teacher?j.error:"Learner accounts are not set up on the server yet (Code_accounts.gs).")+'</div></div>';return}
 ACCTS=j.accounts||[];renderAccts()}
function renderAccts(){const box=$("al"),f=$("af")?$("af").value:"",xs=ACCTS.filter(a=>!f||(f==="on"?a.hasPin:!a.hasPin));
 const on=ACCTS.filter(a=>a.hasPin).length;
 box.innerHTML='<div class="card"><p class="note" style="margin-top:0">'+on+' of '+ACCTS.length+' learners have an account.</p>'+(xs.length?xs.map((a,i)=>'<div class="trow" style="padding:10px 0;border-top:1px solid var(--line)"><div style="font-weight:800">'+esc(a.n)+'</div><div class="note">'+esc(a.g+" · "+a.s)+' · '+(a.hasPin?"✅ Account"+(a.lastLogin?" · last login "+esc(a.lastLogin):""):"No account yet")+(a.hasPhoto?" · 📷 photo":"")+(a.reset?" · PIN reset "+esc(a.reset):"")+'</div>'+(a.hasPin?'<button class="ghost" data-k="'+i+'" style="min-height:44px;margin-top:6px">Reset PIN</button>':"")+'</div>').join(""):'<div class="note">No learners here.</div>')+'</div>';
 box.querySelectorAll("button[data-k]").forEach(b=>b.onclick=async()=>{const a=xs[+b.dataset.k];if(!confirm("Reset the PIN of "+a.n+"? They will create a new PIN the next time they log in. Their history and photo stay."))return;
  b.disabled=true;b.textContent="Resetting…";const j=await call({action:"teacherAcctReset",pin:PIN,key:a.key});
  if(j&&j.ok){a.hasPin=false;a.reset="just now";renderAccts()}else{b.disabled=false;b.textContent="Reset PIN";alert((j&&j.error)||"Could not reset. Try again.")}})}
$("va")&&($("va").onclick=()=>{view("accts");loadAccts()});$("ar")&&($("ar").onclick=loadAccts);$("af")&&($("af").onchange=renderAccts);

function fillSubjects(){const g=$("g").value,s=$("s"),prev=s.value;s.innerHTML=SUBJECTS[g].map(x=>'<option>'+esc(x)+'</option>').join("");if(SUBJECTS[g].includes(prev))s.value=prev}
$("g").onchange=fillSubjects;
function isPdfFile(f){if(!f)return false;const name=String(f.name||"").trim();if(/\.pdf$/i.test(name))return true;return String(f.type||"").toLowerCase()==="application/pdf"}
const PDFNOTE="No file chosen yet. Student copy only. Never upload a teacher key. Maximum 10 MB.";
function pdfNote(html,isErr){const i=$("pdfinfo");i.className="pdfinfo"+(isErr?" err":"");i.innerHTML=html}
function clearPdf(){try{$("pdf").value=""}catch(_){}}
function resetForm(){fillSubjects();const n=manilaNow();$("rel").value=n.slice(0,10);$("op").value=n;$("cl").value="";$("ti").value="";$("ins").value="";clearPdf();pdfNote(PDFNOTE)}
$("pdf").addEventListener("change",()=>{const f=$("pdf").files&&$("pdf").files[0];
 if(!f){pdfNote(PDFNOTE);return}
 const mb=((f.size||0)/1048576).toFixed(1);
 if(f.size>MAXPDF){pdfNote("<b>"+esc(f.name)+" is "+mb+" MB. Please choose a PDF of 10 MB or less.</b>",true);clearPdf();return}
 if(!isPdfFile(f)){pdfNote("<b>"+esc(f.name||"That file")+" is not a PDF. Please choose a .pdf file.</b>",true);clearPdf();return}
 let msg="<b>Selected: "+esc(f.name)+" · "+mb+" MB</b>";
 if(/key|answer/i.test(f.name))msg+=' <span class="err">⚠️ This filename looks like a teacher key. Students will be able to open it.</span>';
 pdfNote(msg)});
try{if(typeof fillInAppChromeBar==="function"&&$("iabbar"))fillInAppChromeBar($("iabbar"),location.href,navigator.userAgent)}catch(_){}
function readB64(f){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||"").split(",")[1]||"");r.onerror=()=>no(r.error);r.readAsDataURL(f)})}
function pmsg(cls,html){$("pmsg").innerHTML=html?'<div class="msgbox '+cls+'">'+html+'</div>':"";if(cls==="no"&&typeof attachInAppChromeHelp==="function")attachInAppChromeHelp($("pmsg"))}

$("pbtn").onclick=async()=>{const bt=$("pbtn");pmsg();
 const d={action:"teacherPost",pin:PIN,grade:$("g").value,subject:$("s").value,release:$("rel").value,title:$("ti").value.trim(),instructions:$("ins").value.trim(),opens:$("op").value,close:$("cl").value};
 if(!d.release)return pmsg("no","Choose the release date.");
 if(!d.title)return pmsg("no","Type a title.");
 if(!d.instructions)return pmsg("no","Type the instructions.");
 if(!d.opens)return pmsg("no","Choose when the task opens.");
 if(d.close&&d.close<=d.opens)return pmsg("no","Closes must be after Opens.");
 const f=$("pdf").files[0];
 if(f){if(f.size>MAXPDF)return pmsg("no","The PDF is bigger than 10 MB. Please choose a file of 10 MB or less.");if(!isPdfFile(f))return pmsg("no","Please choose a PDF file (.pdf).")}
 const when=d.close?"until "+d.close.replace("T"," "):"until you close it";
 if(!confirm("Post \""+d.title+"\" for "+d.grade+" · "+d.subject+"?\nOpens "+d.opens.replace("T"," ")+", stays open "+when+"."))return;
 busy(bt,true,f?"Uploading PDF… please wait":"Posting…");
 try{if(f){d.pdf=await readB64(f);d.pdfName=f.name}}catch(e){busy(bt,false,"Post task");return pmsg("no","Couldn't read the PDF on this phone. Try choosing it again.")}
 const j=await call(d,2);busy(bt,false,"Post task");
 if(isOld(j)){show("notready");return}
 if(j.badPin||j.noPin||j.locked){PIN="";try{sessionStorage.removeItem("adm_tpin")}catch(_){}show("unlock");$("ulmsg").textContent=j.error||"Please unlock again.";return}
 if(!j.ok)return pmsg("no",esc(j.error||"Couldn't post the task. Please try again."));
 const future=d.opens>manilaNow();
 pmsg("ok","✅ Posted <b>"+esc(j.id)+"</b>. "+(future?"Students will see it from "+esc(j.opens)+".":"Students can see it now in the Tasks tab under "+esc(d.release)+".")+(j.pdf?' <a href="'+esc(j.pdf)+'" target="_blank" rel="noopener">Check the PDF</a>':"")+(j.warning?'<br><span style="color:var(--no)">⚠️ '+esc(j.warning)+'</span>':""));
 resetForm()};

const ST={open:["p-open","Open"],closed:["p-closed","Closed"],scheduled:["p-scheduled","Opens later"],ended:["p-ended","Past close time"]};
async function loadList(){$("tl").innerHTML='<div class="wait">Loading…</div>';const j=await call({action:"teacherList",pin:PIN});
 if(isOld(j)){show("notready");return}
 if(!j.ok){if(j.badPin||j.locked||j.noPin){show("unlock");$("ulmsg").textContent=j.error||""}else $("tl").innerHTML='<div class="card err">'+esc(j.error||"Couldn't load tasks.")+'</div>';return}
 renderList(j)}
$("rl").onclick=loadList;
function renderList(j){const ts=j.tasks||[];
 if(!ts.length){$("tl").innerHTML='<div class="card">No tasks yet.</div>';return}
 $("tl").innerHTML=ts.map((t,i)=>{const st=ST[t.status]||ST.closed;return'<div class="card tk'+(t.active?"":" closed")+'"><div class="bd"><h3>'+esc(t.title||"(no title)")+'</h3><div class="meta">'+esc(t.grade)+" · "+esc(t.subject)+'<br>'+esc(t.id)+'</div><span class="pill '+st[0]+'">'+st[1]+'</span>'+
  '<div class="meta">'+(t.opens?"Opens "+esc(t.opens)+" · ":"")+(t.deadline?"Closes "+esc(t.deadline):"No close time")+(t.pdf?' · <a href="'+esc(t.pdf)+'" target="_blank" rel="noopener">PDF</a>':"")+'</div></div>'+
  '<div><label class="sw" aria-label="Open or close '+esc(t.title)+'"><input type="checkbox" data-i="'+i+'"'+(t.active?" checked":"")+'><span></span></label><div class="swl">'+(t.active?"ON":"OFF")+'</div></div></div>'}).join("");
 $("tl").querySelectorAll("input[type=checkbox]").forEach(cb=>cb.onchange=()=>toggle(ts[+cb.dataset.i],cb))}
async function toggle(t,cb){const on=cb.checked;
 if(!confirm((on?"Open":"Close")+" \""+t.title+"\" for students?")){cb.checked=!on;return}
 cb.disabled=true;const j=await call({action:"teacherToggle",pin:PIN,id:t.id,active:on});cb.disabled=false;
 if(isOld(j)){show("notready");return}
 if(!j.ok){cb.checked=!on;alert(j.error||"Couldn't change it. Please try again.");return}
 loadList()}


const MAXVID=40*1024*1024, VIDCHUNK=(typeof VIDEO_UPLOAD_CHUNK==="number"?VIDEO_UPLOAD_CHUNK:1500000);
const VIDNOTE="No file chosen yet. Maximum 40 MB. Short clips upload faster on mobile data.";
function isVideoFile(f){if(!f)return false;return typeof isTeacherVideoFile==="function"?isTeacherVideoFile(f.name,f.type):/\.(mp4|m4v|mov|webm|3gp)$/i.test(f.name||"")||/^video\//i.test(f.type||"")}
function vidNote(html,isErr){const i=$("vidinfo");if(!i)return;i.className="pdfinfo"+(isErr?" err":"");i.innerHTML=html}
function clearVid(){try{$("vid").value=""}catch(_){}}
function resetVid(){if($("vti"))$("vti").value="";if($("vcap"))$("vcap").value="";clearVid();vidNote(VIDNOTE);vidProg(0,true);vmsg()}
function vmsg(cls,html){const el=$("vmsg");if(!el)return;el.innerHTML=html?'<div class="msgbox '+cls+'">'+html+'</div>':"";if(cls==="no"&&typeof attachInAppChromeHelp==="function")attachInAppChromeHelp(el)}
function vidProg(pct,hide){const bar=$("vbar"),wrap=$("vprog");if(!wrap||!bar)return;wrap.hidden=!!hide;bar.style.width=Math.max(0,Math.min(100,pct))+"%"}
function planVid(f){return typeof videoUploadPlan==="function"?videoUploadPlan(f.size,VIDCHUNK,MAXVID):{ok:f.size>0&&f.size<=MAXVID,size:f.size,chunk:VIDCHUNK,chunks:Math.ceil(f.size/VIDCHUNK)}}
$("vid")&&$("vid").addEventListener("change",()=>{const f=$("vid").files&&$("vid").files[0];
 if(!f){vidNote(VIDNOTE);return}
 const mb=((f.size||0)/1048576).toFixed(1);
 if(!isVideoFile(f)){vidNote("<b>"+esc(f.name||"That file")+" is not a video. Please choose an MP4, MOV, M4V, WebM or 3GP file.</b>",true);clearVid();return}
 if(f.size>MAXVID){vidNote("<b>"+esc(f.name)+" is "+mb+" MB. Please choose a video of 40 MB or less.</b>",true);clearVid();return}
 const plan=planVid(f), mins=Math.max(1,Math.ceil((f.size*8)/(3e6)/60));
 vidNote("<b>Selected: "+esc(f.name)+" · "+mb+" MB</b> · "+plan.chunks+" part"+(plan.chunks===1?"":"s")+". On typical mobile data this may take about "+mins+" minute"+(mins===1?"":"s")+".")});
function readSliceB64(file,start,end){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||"").split(",")[1]||"");r.onerror=()=>no(r.error||new Error("read"));r.readAsDataURL(file.slice(start,end))})}
$("vbtn")&&($("vbtn").onclick=async()=>{const bt=$("vbtn"),f=$("vid")&&$("vid").files&&$("vid").files[0],title=($("vti")&&$("vti").value||"").trim(),caption=($("vcap")&&$("vcap").value||"").trim();
 vmsg();if(!title)return vmsg("no","Type a title.");if(!f)return vmsg("no","Choose a video file first.");if(!isVideoFile(f))return vmsg("no","Please choose a video file (MP4, MOV, M4V, WebM or 3GP).");
 const plan=planVid(f);if(!plan.ok)return vmsg("no",plan.error==="too_large"?"The video must be 40 MB or smaller.":"That video can't be uploaded.");
 if(!confirm("Upload \""+title+"\" ("+((f.size/1048576).toFixed(1))+" MB) as a Motivation episode? Keep this page open until it finishes."))return;
 busy(bt,true,"Starting upload…");vidProg(1);
 const start=await call({action:"teacherUploadStart",pin:PIN,title:title,caption:caption,name:f.name,mime:f.type||"",size:f.size,chunks:plan.chunks},2);
 if(isOld(start)){busy(bt,false,"Upload video");show("notready");return}
 if(start.badPin||start.noPin||start.locked){busy(bt,false,"Upload video");lockPage(start.error||"Please unlock again.");return}
 if(!start.ok){busy(bt,false,"Upload video");vidProg(0,true);return vmsg("no",esc(start.error||"Couldn't start the upload."))}
 const id=start.id,chunk=start.chunk||VIDCHUNK,parts=plan.parts||Array.from({length:plan.chunks},(_,i)=>({index:i,start:i*chunk,end:Math.min(f.size,(i+1)*chunk)}));
 try{
  for(let i=0;i<parts.length;i++){
   const part=parts[i];busy(bt,true,"Uploading part "+(i+1)+" of "+parts.length+"…");
   const data=await readSliceB64(f,part.start,part.end);
   const j=await call({action:"teacherUploadChunk",pin:PIN,id:id,index:part.index,data:data},3);
   if(j.badPin||j.noPin||j.locked){lockPage(j.error||"Please unlock again.");return}
   if(!j||!j.ok)throw new Error((j&&j.error)||("Part "+(i+1)+" failed. Please try again."));
   vidProg(Math.round((i+1)/parts.length*90));
  }
  busy(bt,true,"Finishing…");
  const fin=await call({action:"teacherUploadFinish",pin:PIN,id:id},3);
  if(fin.badPin||fin.noPin||fin.locked){lockPage(fin.error||"Please unlock again.");return}
  if(!fin.ok)throw new Error(fin.error||"Couldn't finish the upload.");
  vidProg(100);busy(bt,false,"Upload video");
  vmsg("ok","✅ Uploaded <b>"+esc(id)+"</b>. Status: Pending. It will appear on the Motivation tab after it is published.");
  resetVid();loadUploads();
 }catch(e){busy(bt,false,"Upload video");vidProg(0,true);vmsg("no",esc((e&&e.message)||e||"Upload failed. Please try again."))}
 finally{bt.disabled=false}});
const UST={Pending:["p-pending","Pending"],Published:["p-published","Published"],Failed:["p-failed","Failed"],Uploading:["p-uploading","Uploading"]};
async function loadUploads(){const box=$("vlst");if(!box)return;box.innerHTML='<div class="wait">Loading…</div>';
 const j=await call({action:"teacherUploads",pin:PIN});
 if(isOld(j)){show("notready");return}
 if(!j.ok){if(j.badPin||j.locked||j.noPin)lockPage(j.error||"");else box.innerHTML='<div class="card err">'+esc(j.error||"Couldn't load uploads.")+"</div>";return}
 renderUploads(j)}
$("vr")&&($("vr").onclick=loadUploads);$("vlock")&&($("vlock").onclick=()=>lockPage(""));
function renderUploads(j){const us=j.uploads||[],box=$("vlst");if(!box)return;
 if(!us.length){box.innerHTML='<div class="card">No Motivation videos uploaded yet.</div>';return}
 box.innerHTML=us.map(u=>{const st=UST[u.status]||UST.Uploading;return'<div class="card tk"><div class="bd"><h3>'+esc(u.title||"(no title)")+'</h3><div class="meta">'+esc(u.id)+(u.name?" · "+esc(u.name):"")+(u.size?" · "+(u.size/1048576).toFixed(1)+" MB":"")+'</div><span class="pill '+st[0]+'">'+st[1]+'</span>'+
  (u.episode?'<span class="pill p-published">Episode '+esc(u.episode)+"</span>":"")+
  '<div class="meta">'+(u.at?esc(u.at)+" · ":"")+(u.caption?esc(u.caption):"")+(u.notes?" · "+esc(u.notes):"")+"</div></div></div>"}).join("")}

start();
})();
