// ============================================
// GANIT SETU ADMIN - SCHOOL MANAGEMENT
// LIVE DATA ONLY (NO DUMMY DATA)
// ============================================

const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allSchools = [];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('schoolSearch')?.addEventListener('input', filterSchools);
  loadSchools();
});

async function loadSchools() {
  const list = document.getElementById('schoolList');
  try {
    const [{ data: students, error: studentError }, { data: teachers, error: teacherError }] = await Promise.all([
      supabaseClient.from('students').select('school_name, school_dise_code, class_level'),
      supabaseClient.from('teachers').select('school_name, school_dise_code')
    ]);

    if (studentError) throw studentError;
    if (teacherError) throw teacherError;

    const map = new Map();

    function addSchool(name, dise, type, classLevel) {
      const code = String(dise || '').trim();
      const schoolName = String(name || '').trim();
      if (!code && !schoolName) return;
      const key = code || schoolName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { school_name: schoolName || '—', school_dise_code: code || '—', teachers: 0, students: 0, class9: 0, class10: 0 });
      }
      const item = map.get(key);
      if (schoolName && item.school_name === '—') item.school_name = schoolName;
      if (code && item.school_dise_code === '—') item.school_dise_code = code;
      if (type === 'teacher') item.teachers++;
      if (type === 'student') {
        item.students++;
        if (Number(classLevel) === 9) item.class9++;
        if (Number(classLevel) === 10) item.class10++;
      }
    }

    (students || []).forEach(s => addSchool(s.school_name, s.school_dise_code, 'student', s.class_level));
    (teachers || []).forEach(t => addSchool(t.school_name, t.school_dise_code, 'teacher'));

    allSchools = Array.from(map.values()).sort((a,b) => a.school_name.localeCompare(b.school_name, 'hi'));
    renderSchools(allSchools);
  } catch (error) {
    console.error('Schools Load Error:', error);
    list.innerHTML = `<div class="school-row"><span>❌ विद्यालयों की जानकारी लोड नहीं हो सकी: ${escapeHtml(error.message || 'Unknown Error')}</span></div>`;
  }
}

function filterSchools() {
  const q = String(document.getElementById('schoolSearch')?.value || '').trim().toLowerCase();
  renderSchools(allSchools.filter(s => `${s.school_name} ${s.school_dise_code}`.toLowerCase().includes(q)));
}

function renderSchools(schools) {
  const list = document.getElementById('schoolList');
  document.getElementById('schoolCount').textContent = schools.length;
  if (!schools.length) {
    list.innerHTML = '<div class="school-row"><span>🏫 कोई विद्यालय नहीं मिला।</span></div>';
    return;
  }
  list.innerHTML = schools.map(s => `
    <div class="school-row">
      <div><b>${escapeHtml(s.school_name)}</b><br><small>🔢 DISE: ${escapeHtml(s.school_dise_code)}</small></div>
      <div>👩‍🏫 शिक्षक: <b>${s.teachers}</b><br>👨‍🎓 विद्यार्थी: <b>${s.students}</b></div>
      <div>📘 कक्षा 9: <b>${s.class9}</b><br>📕 कक्षा 10: <b>${s.class10}</b></div>
    </div>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
