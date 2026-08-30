const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allQuestions=[];
let bulkValidRows=[];
let bulkInvalidRows=[];
const $=id=>document.getElementById(id);
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
async function loadQuestions(){
 $('questionList').innerHTML='<div class="muted">⏳ प्रश्न लोड हो रहे हैं...</div>';
 const {data,error}=await supabaseClient.from('teacher_questions').select('*').order('created_at',{ascending:false});
 if(error){$('questionList').innerHTML='<div class="error-box">❌ '+esc(error.message)+'</div>';return;}
 allQuestions=data||[]; render();
}
function render(){
 const exam=$('examFilter').value,set=$('setFilter').value,section=$('sectionFilter').value,q=$('questionSearch').value.trim().toLowerCase();
 const rows=allQuestions.filter(x=>(exam==='all'||x.exam_type===exam)&&(set==='all'||x.set_name===set)&&(section==='all'||String(x.section_number)===section)&&(!q||[x.question_text,x.section_name].join(' ').toLowerCase().includes(q)));
 $('questionCount').textContent='कुल दिख रहे प्रश्न: '+rows.length;
 if(!rows.length){$('questionList').innerHTML='<div class="empty-box">📚 कोई प्रश्न नहीं मिला।</div>';return;}
 $('questionList').innerHTML=rows.map(x=>`<article class="question-card"><div class="question-meta"><span>${esc(x.exam_type)}</span><span>Set ${esc(x.set_name||'—')}</span><span>Section ${esc(x.section_number)}${x.section_name?' • '+esc(x.section_name):''}</span><span>${x.is_active?'✅ Active':'⛔ Inactive'}</span></div><h3>${esc(x.question_text)}</h3><div class="options"><div>A. ${esc(x.option_a)}</div><div>B. ${esc(x.option_b)}</div><div>C. ${esc(x.option_c)}</div><div>D. ${esc(x.option_d)}</div></div><p class="answer-line">सही उत्तर: <b>${esc(x.correct_answer)}</b> • ${esc(x.difficulty||'medium')}</p>${x.explanation?'<p class="muted">'+esc(x.explanation)+'</p>':''}<div class="question-actions"><button onclick="editQuestion('${x.id}')">✏️ Edit</button><button onclick="toggleQuestion('${x.id}',${!x.is_active})">${x.is_active?'⛔ Inactive':'✅ Active'}</button><button onclick="deleteQuestion('${x.id}')">🗑️ Delete</button></div></article>`).join('');
}

function normalizeKey(k){
  return String(k||'').trim().toLowerCase().replace(/\s+/g,'_');
}
function normalizeRow(row){
  const o={};
  Object.entries(row||{}).forEach(([k,v])=>o[normalizeKey(k)]=typeof v==='string'?v.trim():v);
  return {
    exam_type:String(o.exam_type||'').trim().toLowerCase(),
    set_name:String(o.set_name||'').trim().toUpperCase()||null,
    section_number:Number(o.section_number),
    section_name:String(o.section_name||'').trim()||null,
    question_text:String(o.question_text||'').trim(),
    option_a:String(o.option_a||'').trim(),
    option_b:String(o.option_b||'').trim(),
    option_c:String(o.option_c||'').trim(),
    option_d:String(o.option_d||'').trim(),
    correct_answer:String(o.correct_answer||'').trim().toUpperCase(),
    explanation:String(o.explanation||'').trim()||null,
    difficulty:String(o.difficulty||'medium').trim().toLowerCase()||'medium',
    is_active:true
  };
}
function validateBulkRow(x){
  const errors=[];
  if(!['primary','secondary'].includes(x.exam_type)) errors.push('exam_type primary या secondary होना चाहिए');
  if(x.set_name && !['A','B','C'].includes(x.set_name)) errors.push('set_name A/B/C होना चाहिए');
  if(!Number.isInteger(x.section_number)||x.section_number<1||x.section_number>5) errors.push('section_number 1 से 5 होना चाहिए');
  ['question_text','option_a','option_b','option_c','option_d'].forEach(k=>{if(!x[k]) errors.push(k+' खाली है');});
  if(!['A','B','C','D'].includes(x.correct_answer)) errors.push('correct_answer A/B/C/D होना चाहिए');
  if(!['easy','medium','hard'].includes(x.difficulty)) errors.push('difficulty easy/medium/hard होना चाहिए');
  return errors;
}
function renderBulkPreview(){
  const preview=$('bulkPreview');
  const total=bulkValidRows.length+bulkInvalidRows.length;
  $('bulkStatus').innerHTML=`कुल Rows: <b>${total}</b> • ✅ Valid: <b>${bulkValidRows.length}</b> • ❌ Invalid: <b>${bulkInvalidRows.length}</b>`;
  $('confirmBulkBtn').disabled=bulkValidRows.length===0;
  if(!total){preview.innerHTML='';return;}
  const validHtml=bulkValidRows.slice(0,20).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.exam_type)}</td><td>${esc(x.set_name||'—')}</td><td>${esc(x.section_number)}</td><td>${esc(x.question_text)}</td><td>✅</td></tr>`).join('');
  const invalidHtml=bulkInvalidRows.slice(0,20).map((x,i)=>`<tr><td>${x.rowNumber}</td><td colspan="4">${esc(x.errors.join(' | '))}</td><td>❌</td></tr>`).join('');
  preview.innerHTML=`<table style="width:100%;border-collapse:collapse"><thead><tr><th>Row</th><th>Exam</th><th>Set</th><th>Section</th><th>Question / Error</th><th>Status</th></tr></thead><tbody>${validHtml}${invalidHtml}</tbody></table><p class="muted">Preview में अधिकतम 20+20 rows दिखाई जा रही हैं। केवल valid rows ही upload होंगी।</p>`;
}
async function readBulkFile(){
  const file=$('bulkFile').files[0];
  if(!file) return alert('कृपया Excel या CSV file चुनें।');
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  bulkValidRows=[];bulkInvalidRows=[];
  rows.forEach((r,i)=>{
    const x=normalizeRow(r);
    const errors=validateBulkRow(x);
    if(errors.length) bulkInvalidRows.push({rowNumber:i+2,errors,row:x});
    else bulkValidRows.push(x);
  });
  renderBulkPreview();
}
async function uploadBulkQuestions(){
  if(!bulkValidRows.length) return alert('Upload करने के लिए कोई valid question नहीं है।');
  if(!confirm(`क्या आप ${bulkValidRows.length} valid questions Supabase में upload करना चाहते हैं?`)) return;
  $('confirmBulkBtn').disabled=true;
  $('bulkStatus').textContent='⏳ Questions upload हो रहे हैं...';
  const batchSize=100;
  let uploaded=0;
  for(let i=0;i<bulkValidRows.length;i+=batchSize){
    const batch=bulkValidRows.slice(i,i+batchSize);
    const {error}=await supabaseClient.from('teacher_questions').insert(batch);
    if(error){
      $('confirmBulkBtn').disabled=false;
      return alert('❌ Upload error: '+error.message+` (Batch starting at ${i+1})`);
    }
    uploaded+=batch.length;
    $('bulkStatus').textContent=`⏳ ${uploaded} / ${bulkValidRows.length} questions upload हो चुके हैं...`;
  }
  alert(`✅ ${uploaded} questions सफलतापूर्वक Supabase में upload हो गए।`);
  $('bulkUploadPanel').style.display='none';
  $('bulkFile').value='';
  bulkValidRows=[];bulkInvalidRows=[];
  $('bulkPreview').innerHTML='';
  $('bulkStatus').textContent='';
  loadQuestions();
}
function downloadTemplate(){
  const sample=[{
    exam_type:'primary',set_name:'A',section_number:1,section_name:'बाल विकास एवं शिक्षाशास्त्र',
    question_text:'बाल विकास का कौन-सा सिद्धांत बताता है कि विकास एक निरंतर प्रक्रिया है?',
    option_a:'विकास रुक-रुक कर होता है',option_b:'विकास एक सतत प्रक्रिया है',
    option_c:'विकास केवल जन्म के बाद शुरू होता है',option_d:'विकास सभी बच्चों में बिल्कुल समान होता है',
    correct_answer:'B',explanation:'बाल विकास जन्म से शुरू होकर निरंतर आगे बढ़ता है।',difficulty:'medium'
  }];
  const ws=XLSX.utils.json_to_sheet(sample);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'TET Questions');
  XLSX.writeFile(wb,'TET_Questions_Bulk_Upload_Template.xlsx');
}

function openForm(){ $('questionFormPanel').style.display='block'; $('questionFormPanel').scrollIntoView({behavior:'smooth'}); }
function resetForm(){ $('questionForm').reset(); $('questionId').value=''; $('formTitle').textContent='नया TET प्रश्न जोड़ें'; $('saveBtn').textContent='💾 प्रश्न Save करें'; }
window.editQuestion=id=>{const x=allQuestions.find(a=>a.id===id); if(!x)return; resetForm(); $('questionId').value=x.id;$('examType').value=x.exam_type;$('setName').value=x.set_name||'';$('sectionNumber').value=x.section_number;$('sectionName').value=x.section_name||'';$('questionText').value=x.question_text;$('optionA').value=x.option_a;$('optionB').value=x.option_b;$('optionC').value=x.option_c;$('optionD').value=x.option_d;$('correctAnswer').value=x.correct_answer;$('difficulty').value=x.difficulty||'medium';$('explanation').value=x.explanation||'';$('formTitle').textContent='✏️ प्रश्न Edit करें';$('saveBtn').textContent='💾 बदलाव Save करें';openForm();};
window.toggleQuestion=async(id,val)=>{const {error}=await supabaseClient.from('teacher_questions').update({is_active:val,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);loadQuestions();};
window.deleteQuestion=async id=>{if(!confirm('क्या आप यह प्रश्न हटाना चाहते हैं?'))return;const {error}=await supabaseClient.from('teacher_questions').delete().eq('id',id);if(error)return alert(error.message);loadQuestions();};
document.addEventListener('DOMContentLoaded',()=>{
 $('showBulkBtn').onclick=()=>{ $('bulkUploadPanel').style.display='block'; $('bulkUploadPanel').scrollIntoView({behavior:'smooth'}); };
 $('closeBulkBtn').onclick=()=>{ $('bulkUploadPanel').style.display='none'; };
 $('downloadTemplateBtn').onclick=downloadTemplate;
 $('previewBulkBtn').onclick=readBulkFile;
 $('confirmBulkBtn').onclick=uploadBulkQuestions;
 $('clearBulkBtn').onclick=()=>{ $('bulkFile').value='';bulkValidRows=[];bulkInvalidRows=[];$('bulkPreview').innerHTML='';$('bulkStatus').textContent='';$('confirmBulkBtn').disabled=true; };
 ['examFilter','setFilter','sectionFilter'].forEach(id=>$(id).addEventListener('change',render));$('questionSearch').addEventListener('input',render);$('showAddBtn').onclick=()=>{resetForm();openForm();};$('cancelBtn').onclick=()=>{$('questionFormPanel').style.display='none';};$('questionForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('questionId').value;const payload={exam_type:$('examType').value,set_name:$('setName').value||null,section_number:Number($('sectionNumber').value),section_name:$('sectionName').value.trim()||null,question_text:$('questionText').value.trim(),option_a:$('optionA').value.trim(),option_b:$('optionB').value.trim(),option_c:$('optionC').value.trim(),option_d:$('optionD').value.trim(),correct_answer:$('correctAnswer').value,difficulty:$('difficulty').value,explanation:$('explanation').value.trim()||null,updated_at:new Date().toISOString()};$('saveBtn').disabled=true;const r=id?await supabaseClient.from('teacher_questions').update(payload).eq('id',id):await supabaseClient.from('teacher_questions').insert(payload);$('saveBtn').disabled=false;if(r.error)return alert('❌ '+r.error.message);alert('✅ प्रश्न सफलतापूर्वक Save हो गया।');$('questionFormPanel').style.display='none';resetForm();loadQuestions();});loadQuestions();});
