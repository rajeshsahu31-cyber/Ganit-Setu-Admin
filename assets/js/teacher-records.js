const SUPABASE_URL="https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=v=>String(v??"—").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
let teachers=[], selectedTeacher=null;

function getName(t){return t.full_name||t.name||t.teacher_name||"Teacher";}
function getMobile(t){return t.mobile||t.mobile_number||t.phone||"";}
function renderTeachers(){
 const q=$("teacherSearch").value.trim().toLowerCase();
 const list=teachers.filter(t=>(getName(t)+" "+getMobile(t)).toLowerCase().includes(q));
 $("teacherList").innerHTML=list.length?list.map(t=>`<div class="teacher-item ${selectedTeacher?.id===t.id?"active":""}" data-id="${t.id}"><b>${esc(getName(t))}</b><br><span class="muted">${esc(getMobile(t)||"मोबाइल उपलब्ध नहीं")}</span></div>`).join(""):"कोई Teacher नहीं मिला।";
 document.querySelectorAll(".teacher-item").forEach(x=>x.onclick=()=>selectTeacher(x.dataset.id));
}
async function loadTeachers(){
 $("teacherList").textContent="⏳ Teachers लोड हो रहे हैं...";
 const {data,error}=await supabaseClient.from("teachers").select("*").order("created_at",{ascending:false});
 if(error){$("teacherList").innerHTML="❌ "+esc(error.message);return;}
 teachers=data||[]; renderTeachers();
}
function profileRows(t){
 const skip=new Set(["id","auth_user_id","password_hash","created_at","updated_at"]);
 return Object.entries(t).filter(([k,v])=>!skip.has(k)&&v!==null&&v!=="").slice(0,12)
 .map(([k,v])=>`<tr><td><b>${esc(k.replaceAll("_"," "))}</b></td><td>${esc(v)}</td></tr>`).join("");
}
function fmtTime(sec){
 sec=Number(sec||0); const m=Math.floor(sec/60), s=sec%60;
 return `${m}m ${s}s`;
}
function fmtDate(v){
 if(!v) return "—";
 try{return new Date(v).toLocaleString("hi-IN");}catch(e){return v;}
}
async function showAttemptDetails(attemptId){
 const modal=$("attemptModal");
 modal.style.display="block";
 $("attemptModalBody").innerHTML="⏳ Answer details लोड हो रहे हैं...";
 const {data:answers,error}=await supabaseClient.from("teacher_answers")
   .select("selected_answer,is_correct,question_id,teacher_questions(question_text,option_a,option_b,option_c,option_d,correct_answer,explanation)")
   .eq("attempt_id",attemptId);
 if(error){$("attemptModalBody").innerHTML="❌ "+esc(error.message);return;}
 $("attemptModalBody").innerHTML=(answers||[]).length?(answers||[]).map((a,i)=>{
   const q=a.teacher_questions||{};
   const ok=a.is_correct===true?"✅ सही":a.is_correct===false?"❌ गलत":"—";
   return `<div class="detail-box"><b>Q${i+1}. ${esc(q.question_text)}</b>
   <p>A. ${esc(q.option_a)}<br>B. ${esc(q.option_b)}<br>C. ${esc(q.option_c)}<br>D. ${esc(q.option_d)}</p>
   <p><b>Teacher Answer:</b> ${esc(a.selected_answer)} &nbsp; | &nbsp; <b>Correct:</b> ${esc(q.correct_answer)} &nbsp; ${ok}</p>
   ${q.explanation?`<p class="muted"><b>Explanation:</b> ${esc(q.explanation)}</p>`:""}</div>`;
 }).join(""):"कोई Answer Record उपलब्ध नहीं है।";
}
async function selectTeacher(id){
 selectedTeacher=teachers.find(t=>String(t.id)===String(id)); renderTeachers();
 const box=$("teacherDetail");
 box.innerHTML=`<h2>⏳ ${esc(getName(selectedTeacher))} का रिकॉर्ड लोड हो रहा है...</h2>`;

 const r=await supabaseClient.from("teacher_attempts").select("*").eq("teacher_id",id).order("created_at",{ascending:false});
 const attempts=r.data||[], err=r.error;
 let testMap={};
 if(attempts.length){
   const ids=[...new Set(attempts.map(a=>a.test_id).filter(Boolean))];
   const tr=await supabaseClient.from("teacher_tests").select("*").in("id",ids);
   (tr.data||[]).forEach(x=>testMap[x.id]=x);
 }
 const submitted=attempts.filter(a=>a.status==="submitted").length;
 const completed=attempts.filter(a=>a.status==="submitted"||a.status==="expired");
 const avg=completed.length?(completed.reduce((s,a)=>s+Number(a.percentage||0),0)/completed.length).toFixed(2):"0";

 box.innerHTML=`
 <h2>👤 ${esc(getName(selectedTeacher))}</h2>
 <div class="kpi-row">
  <div class="kpi"><b>${attempts.length}</b><br><span class="muted">Total Attempts</span></div>
  <div class="kpi"><b>${submitted}</b><br><span class="muted">Submitted</span></div>
  <div class="kpi"><b>${avg}%</b><br><span class="muted">Average %</span></div>
  <div class="kpi"><b>${completed.reduce((s,a)=>s+Number(a.correct_answers||0),0)}</b><br><span class="muted">Total Correct</span></div>
 </div>

 <div class="detail-box"><h3>📋 Teacher Profile</h3><div class="table-wrap"><table>${profileRows(selectedTeacher)}</table></div></div>

 <div class="detail-box"><h3>📝 Detailed Test History</h3>
 ${err?`<p>❌ Attempts load नहीं हुए: ${esc(err.message)}</p>`:
 `<div class="table-wrap"><table><thead><tr>
 <th>Test</th><th>Exam</th><th>Set</th><th>Correct</th><th>Wrong</th><th>Unanswered</th><th>Score</th><th>%</th><th>Time</th><th>Status</th><th>Details</th>
 </tr></thead><tbody>
 ${attempts.length?attempts.map(a=>{const t=testMap[a.test_id]||{};return `<tr>
 <td>${esc(t.test_title||"Test")}</td><td>${esc(t.exam_type)}</td><td>${esc(t.test_set)}</td>
 <td>✅ ${Number(a.correct_answers||0)}</td><td>❌ ${Number(a.wrong_answers||0)}</td><td>${Number(a.unanswered_questions||0)}</td>
 <td>${esc(a.score)}</td><td>${Number(a.percentage||0)}%</td><td>${fmtTime(a.time_taken_seconds)}</td>
 <td>${esc(a.status)}</td><td><button class="small-btn" data-attempt="${a.id}">👁️ देखें</button></td>
 </tr>`}).join(""):`<tr><td colspan="11">अभी कोई Test Record नहीं है।</td></tr>`}
 </tbody></table></div>`}
 </div>`;
 document.querySelectorAll("[data-attempt]").forEach(b=>b.onclick=()=>showAttemptDetails(b.dataset.attempt));
}
document.addEventListener("DOMContentLoaded",()=>{
 $("teacherSearch").oninput=renderTeachers;
 $("refreshBtn").onclick=()=>{selectedTeacher=null;$("teacherDetail").innerHTML="<h2>Teacher चुनें</h2>";loadTeachers()};
 loadTeachers();
});
