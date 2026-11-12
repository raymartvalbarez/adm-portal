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

function enter(list){show("app");resetForm();renderList(list);view("post")}
function view(w){$("vp").className=w==="post"?"on":"";$("vl").className=w==="list"?"on":"";$("post").classList.toggle("hide",w!=="post");$("list").classList.toggle("hide",w!=="list")}
$("vp").onclick=()=>view("post");$("vl").onclick=()=>{view("list");loadList()};
$("lock").onclick=()=>{PIN="";try{sessionStorage.removeItem("adm_tpin")}catch(_){}show("unlock")};

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

start();
})();
