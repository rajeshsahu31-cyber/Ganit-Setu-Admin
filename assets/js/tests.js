// ============================================
// GANIT SETU ADMIN - QUESTION MANAGEMENT
// Supabase configuration copied from working Student Panel
// ============================================

const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

function maxChapterForClass(classLevel){
  return Number(classLevel) === 9 ? 12 : 14;
}

function showMessage(text, type='success'){
  $('questionMessage').innerHTML =
    `<div class="${type === 'error' ? 'error-box' : 'success-box'}">${text}</div>`;
}

function fillChapters(){
  const classLevel = Number($('classLevel').value);
  const max = maxChapterForClass(classLevel);
  const select = $('chapterNumber');
  const old = Number(select.value) || 1;

  select.innerHTML = '';
  for(let i=1;i<=max;i++){
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `अध्याय ${i}`;
    select.appendChild(option);
  }
  select.value = Math.min(old, max);
  updateChapterName();
}

function updateChapterName(){
  const chapter = $('chapterNumber').value || 1;
  $('chapterName').value = `अध्याय ${chapter}`;
}

async function loadQuestions(){
  const classLevel = Number($('classLevel').value);
  const chapterNumber = Number($('chapterNumber').value);

  $('questionList').innerHTML = '<tr><td colspan="5">लोड हो रहा है...</td></tr>';

  const {data, error} = await supabaseClient
    .from('questions')
    .select('id,question_text,correct_option,status,created_at')
    .eq('class_level', classLevel)
    .eq('chapter_number', chapterNumber)
    .order('id', {ascending:true});

  if(error){
    $('questionList').innerHTML =
      `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
    $('questionCount').textContent = 'Questions load नहीं हुए';
    return;
  }

  $('questionCount').textContent =
    `कक्षा ${classLevel} • अध्याय ${chapterNumber} • कुल ${data.length} Questions`;

  if(!data.length){
    $('questionList').innerHTML =
      '<tr><td colspan="5">इस अध्याय में अभी कोई Question नहीं है।</td></tr>';
    return;
  }

  $('questionList').innerHTML = data.map((q,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${escapeHtml(q.question_text)}</td>
      <td>${q.correct_option}</td>
      <td>${q.status}</td>
      <td><button class="action-btn danger" onclick="deleteQuestion(${q.id})">Delete</button></td>
    </tr>
  `).join('');
}

function escapeHtml(value=''){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

async function saveQuestion(event){
  event.preventDefault();

  const btn = $('saveQuestionBtn');
  btn.disabled = true;
  btn.textContent = 'Save हो रहा है...';

  const payload = {
    class_level: Number($('classLevel').value),
    subject: 'Mathematics',
    chapter_number: Number($('chapterNumber').value),
    chapter_name: $('chapterName').value.trim() || `अध्याय ${$('chapterNumber').value}`,
    question_text: $('questionText').value.trim(),
    option_a: $('optionA').value.trim(),
    option_b: $('optionB').value.trim(),
    option_c: $('optionC').value.trim(),
    option_d: $('optionD').value.trim(),
    correct_option: $('correctOption').value,
    explanation: $('explanation').value.trim() || null,
    marks: 1,
    difficulty: $('difficulty').value,
    status: 'active'
  };

  const {error} = await supabaseClient
    .from('questions')
    .insert(payload);

  btn.disabled = false;
  btn.textContent = '💾 प्रश्न Save करें';

  if(error){
    showMessage('Question Save नहीं हुआ: ' + error.message, 'error');
    return;
  }

  showMessage('✓ Question सफलतापूर्वक Supabase में Save हो गया।');
  $('questionText').value='';
  $('optionA').value='';
  $('optionB').value='';
  $('optionC').value='';
  $('optionD').value='';
  $('explanation').value='';
  $('correctOption').value='A';
  $('difficulty').value='medium';
  await loadQuestions();
}

async function deleteQuestion(id){
  if(!confirm('क्या आप यह Question Delete करना चाहते हैं?')) return;

  const {error} = await supabaseClient
    .from('questions')
    .delete()
    .eq('id', id);

  if(error){
    showMessage('Delete नहीं हुआ: ' + error.message, 'error');
    return;
  }

  showMessage('✓ Question Delete हो गया।');
  await loadQuestions();
}

window.deleteQuestion = deleteQuestion;

document.addEventListener('DOMContentLoaded', ()=>{
  $('classLevel').addEventListener('change', ()=>{
    fillChapters();
    loadQuestions();
  });

  $('chapterNumber').addEventListener('change', ()=>{
    updateChapterName();
    loadQuestions();
  });

  $('questionForm').addEventListener('submit', saveQuestion);
  $('refreshQuestions').addEventListener('click', loadQuestions);

  fillChapters();
  loadQuestions();
});
