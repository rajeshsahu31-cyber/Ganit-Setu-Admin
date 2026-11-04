// ============================================
// GANIT SETU ADMIN - STUDENT MANAGEMENT
// LIVE DATA ONLY (NO DUMMY DATA)
// ============================================

const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allStudents = [];
let currentFilter = 'all';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

function normalizeClass(v){
  const s=String(v??'').trim().toLowerCase();
  if(s==='9' || s==='class 9' || s==='class9' || s==='कक्षा 9') return '9';
  if(s==='10' || s==='class 10' || s==='class10' || s==='कक्षा 10') return '10';
  return String(v??'');
}

async function loadStudents(){
  const list=$('studentList');
  if(!list) return;
  list.innerHTML='<div class="loading-box">⏳ विद्यार्थियों की जानकारी लोड हो रही है...</div>';

  try{
    const {data,error}=await supabaseClient
      .from('students')
      .select('*')
      .order('created_at',{ascending:false});

    if(error) throw error;
    allStudents=data||[];
    renderStudents();
  }catch(error){
    console.error('Students Load Error:',error);
    list.innerHTML=`<div class="error-box">❌ विद्यार्थियों की जानकारी लोड नहीं हो सकी:<br><small>${escapeHtml(error.message||'Unknown Error')}</small></div>`;
  }
}

function getFilteredStudents(){
  const q=String($('search')?.value||'').trim().toLowerCase();
  return allStudents.filter(s=>{
    const cls=normalizeClass(s.class_level);
    if(currentFilter!=='all' && cls!==currentFilter) return false;
    const text=[s.full_name,s.student_id,s.name,s.school_name,s.school_dise_code,s.mobile].join(' ').toLowerCase();
    return !q || text.includes(q);
  });
}

function renderStudents(){
  const list=$('studentList');
  if(!list) return;
  const students=getFilteredStudents();

  if(!students.length){
    list.innerHTML='<div class="empty-box">📭 कोई विद्यार्थी नहीं मिला।</div>';
    return;
  }

  list.innerHTML=students.map((s,index)=>{
    const name=s.full_name||s.name||'नाम उपलब्ध नहीं';
    const sid=s.student_id||s.registration_id||s.id||'—';
    const cls=normalizeClass(s.class_level)||'—';
    const school=s.school_name||'—';
    const dise=s.school_dise_code||s.udise_code||'—';
    const active=s.status===undefined || s.status===null || String(s.status).toLowerCase()==='active';
    const initial=String(name).trim().charAt(0)||'👨‍🎓';
    const photo=s.photo_url||s.profile_photo||'';

    return `<div class="student-row">
      <div>${escapeHtml(String(index+1))}</div>
      <div class="student-profile">
        <div class="student-photo">${photo?`<img src="${escapeHtml(photo)}" alt="photo">`:escapeHtml(initial)}</div>
        <div><b>${escapeHtml(name)}</b><br><small>${escapeHtml(sid)}</small></div>
      </div>
      <div>कक्षा ${escapeHtml(cls)}</div>
      <div>${escapeHtml(school)}</div>
      <div>${escapeHtml(dise)}</div>
      <div class="${active?'status-active':'status-inactive'}">${active?'● Active':'● Inactive'}</div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded',()=>{
  $('search')?.addEventListener('input',renderStudents);
  $('allBtn')?.addEventListener('click',()=>{currentFilter='all';renderStudents();});
  $('class9Btn')?.addEventListener('click',()=>{currentFilter='9';renderStudents();});
  $('class10Btn')?.addEventListener('click',()=>{currentFilter='10';renderStudents();});
  loadStudents();
});
