const SUPABASE_URL="https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const classFilter=document.getElementById('classFilter');
const testFilter=document.getElementById('testFilter');
const statusBox=document.getElementById('rankingStatus');
const rankList=document.getElementById('rankList');
const podium=document.getElementById('podium');
classFilter.addEventListener('change',loadTests);
testFilter.addEventListener('change',loadRanking);
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
async function loadTests(){
 const cls=Number(classFilter.value); testFilter.innerHTML='<option value="">टेस्ट लोड हो रहे हैं...</option>'; testFilter.disabled=true; rankList.innerHTML='';podium.style.display='none';
 if(!cls){testFilter.innerHTML='<option value="">टेस्ट चुनें</option>';statusBox.textContent='कक्षा और टेस्ट चुनें।';return}
 try{const {data,error}=await supabaseClient.from('tests').select('id,title,test_type,class_level,test_date,status').eq('class_level',cls).eq('status','active').order('id',{ascending:false});if(error)throw error;
 testFilter.innerHTML='<option value="">टेस्ट चुनें</option>'+(data||[]).map(t=>`<option value="${t.id}">${esc(t.title)}${t.test_date?' — '+esc(t.test_date):''}</option>`).join('');testFilter.disabled=false;statusBox.textContent=(data||[]).length?'टेस्ट चुनें।':'इस कक्षा के लिए कोई active test उपलब्ध नहीं है।';
 }catch(e){statusBox.className='error';statusBox.textContent='❌ टेस्ट लोड नहीं हो सके: '+e.message}
}
async function loadRanking(){
 const testId=testFilter.value; rankList.innerHTML='';podium.style.display='none';if(!testId){statusBox.textContent='टेस्ट चुनें।';return}
 statusBox.className='loading';statusBox.textContent='⏳ लाइव रैंकिंग लोड हो रही है...';
 try{
  const {data,error}=await supabaseClient.from('test_attempts').select('id,student_id,test_id,correct_answers,wrong_answers,score,total_marks,percentage,time_taken_seconds,submitted_at,status,students!test_attempts_student_id_fkey(full_name,class_level,student_id,school_name)').eq('test_id',Number(testId)).eq('status','submitted');if(error)throw error;
  const cls=Number(classFilter.value);
  const rows=(data||[]).filter(r=>Number(r.students?.class_level)===cls).sort((a,b)=>{let d=Number(b.score||0)-Number(a.score||0);if(d)return d;d=Number(b.percentage||0)-Number(a.percentage||0);if(d)return d;const ta=a.time_taken_seconds??999999,tb=b.time_taken_seconds??999999; if(ta!==tb)return ta-tb;return new Date(a.submitted_at||0)-new Date(b.submitted_at||0)});
  renderRanking(rows);
 }catch(e){console.error(e);statusBox.className='error';statusBox.textContent='❌ रैंकिंग लोड नहीं हो सकी: '+e.message}
}
function fmtTime(s){if(s==null)return '—';s=Number(s);return Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'}
function renderRanking(rows){
 if(!rows.length){statusBox.className='empty';statusBox.textContent='अभी इस टेस्ट के लिए कोई submitted result उपलब्ध नहीं है।';return}
 statusBox.textContent=`${rows.length} विद्यार्थियों की लाइव रैंकिंग`;
 const medals=['🥇','🥈','🥉'];podium.innerHTML=rows.slice(0,3).map((r,i)=>`<div class="podium-card ${i===0?'first':''}"><div>${medals[i]}</div><div class="podium-name">${esc(r.students?.full_name||'—')}</div><div>${esc(r.score)}/${esc(r.total_marks)} • ${Number(r.percentage||0).toFixed(2)}%</div><small>Rank #${i+1}</small></div>`).join('');podium.style.display='grid';
 rankList.innerHTML='<div class="rank-table-head"><span>रैंक</span><span>विद्यार्थी</span><span>स्कोर</span><span class="hide-mobile">प्रतिशत</span><span class="hide-mobile">समय</span></div>'+rows.map((r,i)=>`<div class="rank-row"><span class="rank-num">${i<3?medals[i]:'#'+(i+1)}</span><span class="student-mini"><b>${esc(r.students?.full_name||'—')}</b><small class="muted-small">${esc(r.students?.student_id||'')} ${r.students?.school_name?'• '+esc(r.students.school_name):''}</small></span><span><b>${esc(r.score)}/${esc(r.total_marks)}</b></span><span class="hide-mobile">${Number(r.percentage||0).toFixed(2)}%</span><span class="hide-mobile">${fmtTime(r.time_taken_seconds)}</span></div>`).join('');
}
