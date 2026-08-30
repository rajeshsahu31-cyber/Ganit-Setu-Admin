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
    hint: $('hint').value.trim() || null,
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
  $('hint').value='';
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


// ============================================
// BULK CSV UPLOAD + DUPLICATE PROTECTION
// ============================================

let bulkRows = [];

function showBulkMessage(text, type='success'){
  $('bulkMessage').innerHTML =
    `<div class="${type === 'error' ? 'error-box' : 'success-box'}">${text}</div>`;
}

function csvEscape(value){
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

function downloadCsvTemplate(){
  const headers = [
    'class_level','chapter_number','chapter_name','question_text',
    'option_a','option_b','option_c','option_d','correct_option',
    'hint','explanation','difficulty'
  ];

  const sample = [
    '10','1','अध्याय 1','यह एक उदाहरण प्रश्न है?',
    'विकल्प A','विकल्प B','विकल्प C','विकल्प D','A',
    'यह उदाहरण Hint है','यह उदाहरण Explanation है','medium'
  ];

  const csv = '\ufeff' + headers.map(csvEscape).join(',') + '\n' +
              sample.map(csvEscape).join(',');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Ganit_Setu_Questions_Template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function parseCSV(text){
  const rows = [];
  let row = [], cell = '', quoted = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];

    if(ch === '"'){
      if(quoted && text[i+1] === '"'){
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if(ch === ',' && !quoted){
      row.push(cell.trim());
      cell = '';
    } else if((ch === '\n' || ch === '\r') && !quoted){
      if(ch === '\r' && text[i+1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if(row.some(v => v !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if(row.some(v => v !== '')) rows.push(row);

  if(!rows.length) return [];

  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase());

  return rows.slice(1).map((values, index) => {
    const obj = {_row:index + 2};
    headers.forEach((h,i)=> obj[h] = values[i] ?? '');
    return obj;
  });
}

function normalizeQuestion(text=''){
  return String(text)
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function validateBulkRow(row){
  const classLevel = Number(row.class_level);
  const chapter = Number(row.chapter_number);
  const correct = String(row.correct_option || '').trim().toUpperCase();
  const difficulty = String(row.difficulty || 'medium').trim().toLowerCase();

  if(![9,10].includes(classLevel)) return 'Invalid class_level (9 या 10 होना चाहिए)';
  if(!Number.isInteger(chapter) || chapter < 1 || chapter > (classLevel === 9 ? 12 : 14))
    return 'Invalid chapter_number';
  if(!String(row.question_text || '').trim()) return 'question_text खाली है';
  if(!String(row.option_a || '').trim() || !String(row.option_b || '').trim() ||
     !String(row.option_c || '').trim() || !String(row.option_d || '').trim())
    return 'चारों options जरूरी हैं';
  if(!['A','B','C','D'].includes(correct)) return 'correct_option A/B/C/D होना चाहिए';
  if(!['easy','medium','hard'].includes(difficulty)) return 'difficulty invalid है';

  return null;
}

async function previewBulkUpload(){
  const file = $('bulkFile').files[0];

  if(!file){
    showBulkMessage('पहले CSV file चुनें।', 'error');
    return;
  }

  try{
    const text = await file.text();
    const parsed = parseCSV(text);

    if(!parsed.length){
      showBulkMessage('CSV में कोई Question नहीं मिला।', 'error');
      return;
    }

    // Duplicate protection:
    // 1. CSV के अंदर duplicate
    // 2. Supabase में existing same class + chapter + normalized question
    const seen = new Set();
    const validCandidates = [];

    bulkRows = parsed.map(row => {
      const error = validateBulkRow(row);
      const normalized = `${row.class_level}|${row.chapter_number}|${normalizeQuestion(row.question_text)}`;

      if(error) return {...row, _status:'error', _reason:error};

      if(seen.has(normalized))
        return {...row, _status:'skip', _reason:'CSV के अंदर duplicate Question'};

      seen.add(normalized);
      validCandidates.push({...row, _key:normalized});
      return {...row, _status:'checking', _reason:'Database duplicate check'};
    });

    // Existing DB questions by class/chapter groups
    const groups = {};
    validCandidates.forEach(r => {
      const key = `${r.class_level}|${r.chapter_number}`;
      if(!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    for(const key of Object.keys(groups)){
      const [classLevel, chapterNumber] = key.split('|').map(Number);

      const {data, error} = await supabaseClient
        .from('questions')
        .select('question_text')
        .eq('class_level', classLevel)
        .eq('chapter_number', chapterNumber);

      if(error){
        groups[key].forEach(candidate => {
          const target = bulkRows.find(r => r._row === candidate._row);
          if(target){
            target._status = 'error';
            target._reason = 'Database check error: ' + error.message;
          }
        });
        continue;
      }

      const existing = new Set((data || []).map(q => normalizeQuestion(q.question_text)));

      groups[key].forEach(candidate => {
        const target = bulkRows.find(r => r._row === candidate._row);
        if(!target) return;

        if(existing.has(normalizeQuestion(candidate.question_text))){
          target._status = 'skip';
          target._reason = 'पहले से database में मौजूद है';
        } else {
          target._status = 'ready';
          target._reason = 'Upload के लिए तैयार';
        }
      });
    }

    renderBulkPreview();
    $('uploadBulkBtn').disabled = !bulkRows.some(r => r._status === 'ready');

  }catch(err){
    showBulkMessage('CSV पढ़ने में Error: ' + err.message, 'error');
  }
}

function renderBulkPreview(){
  const counts = {ready:0, skip:0, error:0, checking:0};

  bulkRows.forEach(r => counts[r._status] = (counts[r._status] || 0) + 1);

  $('bulkSummary').innerHTML =
    `कुल: <b>${bulkRows.length}</b> | ` +
    `Upload Ready: <b>${counts.ready}</b> | ` +
    `Duplicate Skip: <b>${counts.skip}</b> | ` +
    `Invalid/Error: <b>${counts.error}</b>`;

  $('bulkPreviewList').innerHTML = bulkRows.map(r => {
    const cls = r._status === 'ready' ? 'bulk-ok' :
                r._status === 'skip' ? 'bulk-skip' : 'bulk-error';

    return `<tr>
      <td>${r._row}</td>
      <td>${escapeHtml(r.class_level)}</td>
      <td>${escapeHtml(r.chapter_number)}</td>
      <td>${escapeHtml(r.question_text || '')}</td>
      <td class="${cls}">${escapeHtml(r._reason || r._status)}</td>
    </tr>`;
  }).join('');
}

async function uploadBulkQuestions(){
  const ready = bulkRows.filter(r => r._status === 'ready');

  if(!ready.length){
    showBulkMessage('Upload करने के लिए कोई नया valid Question नहीं है।', 'error');
    return;
  }

  if(!confirm(`${ready.length} नए Questions Supabase में upload करें?`)) return;

  $('uploadBulkBtn').disabled = true;
  $('uploadBulkBtn').textContent = 'Upload हो रहा है...';

  let added = 0;
  let failed = 0;

  // Row-by-row insert keeps partial failures visible and avoids one bad row blocking all.
  for(const row of ready){
    const payload = {
      class_level: Number(row.class_level),
      subject: 'Mathematics',
      chapter_number: Number(row.chapter_number),
      chapter_name: String(row.chapter_name || `अध्याय ${row.chapter_number}`).trim(),
      question_text: String(row.question_text).trim(),
      option_a: String(row.option_a).trim(),
      option_b: String(row.option_b).trim(),
      option_c: String(row.option_c).trim(),
      option_d: String(row.option_d).trim(),
      correct_option: String(row.correct_option).trim().toUpperCase(),
      hint: String(row.hint || '').trim() || null,
      explanation: String(row.explanation || '').trim() || null,
      marks: 1,
      difficulty: String(row.difficulty || 'medium').trim().toLowerCase(),
      status: 'active'
    };

    // Final duplicate check immediately before insert.
    const {data: existing, error: checkError} = await supabaseClient
      .from('questions')
      .select('id,question_text')
      .eq('class_level', payload.class_level)
      .eq('chapter_number', payload.chapter_number);

    if(checkError){
      row._status = 'error';
      row._reason = 'Final duplicate check error: ' + checkError.message;
      failed++;
      continue;
    }

    const duplicate = (existing || []).some(q =>
      normalizeQuestion(q.question_text) === normalizeQuestion(payload.question_text)
    );

    if(duplicate){
      row._status = 'skip';
      row._reason = 'Upload के समय duplicate मिला, Skip किया गया';
      continue;
    }

    const {error} = await supabaseClient
      .from('questions')
      .insert(payload);

    if(error){
      row._status = 'error';
      row._reason = 'Upload error: ' + error.message;
      failed++;
    }else{
      row._status = 'added';
      row._reason = 'Successfully Added';
      added++;
    }
  }

  renderBulkPreview();
  $('uploadBulkBtn').textContent = '🚀 Upload Valid Questions';
  $('uploadBulkBtn').disabled = true;

  const skipped = bulkRows.filter(r => r._status === 'skip').length;

  showBulkMessage(
    `✓ Bulk Upload Complete — Added: ${added}, Duplicate Skipped: ${skipped}, Errors: ${failed}`
  );

  await loadQuestions();
}

document.addEventListener('DOMContentLoaded', ()=>{
  $('downloadTemplateBtn').addEventListener('click', downloadCsvTemplate);
  $('previewBulkBtn').addEventListener('click', previewBulkUpload);
  $('uploadBulkBtn').addEventListener('click', uploadBulkQuestions);
});
