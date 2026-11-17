// GANIT SETU - Written Questions Manager (separate from objective question bank)
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const client = () => window.supabaseClient;
  const columns = [
    ['question_id','Question ID','text'],['class_level','कक्षा','number'],['chapter_number','अध्याय क्रमांक','number'],
    ['chapter_name_hi','अध्याय नाम (हिंदी)','text'],['chapter_name_en','Chapter name (English)','text'],
    ['marks','अंक','number'],['question_type','प्रश्न प्रकार','text'],['difficulty','कठिनाई','text'],['medium','माध्यम','select'],
    ['question_text_hi','प्रश्न (हिंदी)','textarea'],['question_text_en','Question (English)','textarea'],
    ['given_data_hi','दिया गया (हिंदी)','textarea'],['given_data_en','Given data (English)','textarea'],
    ['required_to_find_hi','ज्ञात करना है (हिंदी)','textarea'],['required_to_find_en','Required to find (English)','textarea'],
    ['formula_theorem_hi','सूत्र/प्रमेय (हिंदी)','textarea'],['formula_theorem_en','Formula/Theorem (English)','textarea'],
    ['solution_steps_hi','हल के चरण (हिंदी)','textarea'],['solution_steps_en','Solution steps (English)','textarea'],
    ['final_answer_hi','अंतिम उत्तर (हिंदी)','textarea'],['final_answer_en','Final answer (English)','textarea'],
    ['marking_scheme_json','Marking scheme JSON','json'],['diagram_type','Diagram type','text'],
    ['diagram_description_hi','चित्र विवरण (हिंदी)','textarea'],['diagram_description_en','Diagram description (English)','textarea'],
    ['diagram_url','Diagram URL','text'],['table_data_json','Table data JSON','json'],['graph_data_json','Graph data JSON','json'],
    ['exam_year','परीक्षा वर्ष','number'],['paper_set','Paper set','text'],['exam_type','परीक्षा प्रकार','text'],
    ['original_question_number','मूल प्रश्न क्रमांक','text'],['source_reference','Source reference','text'],
    ['status','स्थिति','status'],['is_active','सक्रिय','boolean'],['remarks','टिप्पणी','textarea']
  ];
  let records = [], selected = null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const msg = (s, bad=false) => { $('wqmMsg').textContent=s; $('wqmMsg').className='notice '+(bad?'bad':'ok'); };
  const val = (r,k) => r[k] == null ? '' : (typeof r[k] === 'object' ? JSON.stringify(r[k],null,2) : String(r[k]));
  async function load() {
    const c=client(); if(!c){msg('Supabase client नहीं मिला।',true);return;}
    msg('लिखित प्रश्न लोड हो रहे हैं…');
    try {
      const {data:sd,error:se}=await c.auth.getSession();
      if(se) throw se; if(!sd?.session) throw new Error('पहले Admin Login करें।');
      const {data,error}=await c.from('written_questions').select('*').order('created_at',{ascending:false}).range(0,999);
      if(error) throw error;
      records=data||[]; render();
      msg(`${records.length} प्रश्न लोड हुए।`);
    } catch(e){ console.error(e); msg('लोड नहीं हो सका: '+(e.message||e),true); }
  }
  function filtered(){
    const q=$('wqmSearch').value.trim().toLowerCase(), cl=$('wqmClass').value, mk=$('wqmMarks').value,
      st=$('wqmStatus').value, med=$('wqmMedium').value, ch=$('wqmChapter').value;
    return records.filter(r=>
      (!q || [r.question_id,r.question_text_hi,r.question_text_en,r.chapter_name_hi,r.chapter_name_en].some(x=>String(x||'').toLowerCase().includes(q))) &&
      (!cl || String(r.class_level)===cl) && (!mk || String(r.marks)===mk) &&
      (!st || r.status===st) && (!med || r.medium===med) && (!ch || String(r.chapter_number)===ch)
    );
  }
  function render(){
    $('wqmTotal').textContent=records.length;
    $('wqmDraft').textContent=records.filter(r=>r.status==='draft').length;
    $('wqmPublished').textContent=records.filter(r=>r.status==='published').length;
    $('wqmList').innerHTML=filtered().map(r=>`<tr>
      <td><b>${esc(r.question_id)}</b><small>${esc(r.chapter_name_hi||r.chapter_name_en||'')}</small></td>
      <td>${esc(r.class_level)}</td><td>${esc(r.chapter_number)}</td><td>${esc(r.marks)}</td>
      <td>${esc(r.medium)}</td><td><span class="${r.status==='published'?'published':'draft'}">${esc(r.status)}</span></td>
      <td><button class="wqmBtn" data-view="${esc(r.id)}">पूरी जानकारी</button></td>
    </tr>`).join('') || '<tr><td colspan="7">कोई प्रश्न नहीं मिला।</td></tr>';
  }
  function detail(r){
    selected=r;
    $('wqmDetail').innerHTML=`<div class="wqmDetailHead"><div><h3>${esc(r.question_id)}</h3><p>कक्षा ${esc(r.class_level)} · अध्याय ${esc(r.chapter_number)} · ${esc(r.marks)} अंक · ${esc(r.medium)}</p></div><button class="wqmBtn" id="wqmClose">बंद करें</button></div>
      <div class="wqmLang"><section><h4>हिंदी</h4>${[['प्रश्न',r.question_text_hi],['दिया गया',r.given_data_hi],['ज्ञात करना है',r.required_to_find_hi],['सूत्र/प्रमेय',r.formula_theorem_hi],['हल',r.solution_steps_hi],['अंतिम उत्तर',r.final_answer_hi],['चित्र विवरण',r.diagram_description_hi]].map(([a,b])=>`<p><b>${a}:</b><br>${esc(b||'—').replace(/\n/g,'<br>')}</p>`).join('')}</section>
      <section><h4>English</h4>${[['Question',r.question_text_en],['Given data',r.given_data_en],['Required to find',r.required_to_find_en],['Formula/Theorem',r.formula_theorem_en],['Solution',r.solution_steps_en],['Final answer',r.final_answer_en],['Diagram description',r.diagram_description_en]].map(([a,b])=>`<p><b>${a}:</b><br>${esc(b||'—').replace(/\n/g,'<br>')}</p>`).join('')}</section></div>
      <div class="wqmMeta">${[['Marking scheme',r.marking_scheme_json],['Diagram type / URL',[r.diagram_type,r.diagram_url].filter(Boolean).join(' / ')],['Table data',r.table_data_json],['Graph data',r.graph_data_json],['Exam details',[r.exam_year,r.exam_type,r.paper_set,r.original_question_number].filter(Boolean).join(' · ')],['Source',r.source_reference],['Remarks',r.remarks],['Active',r.is_active?'Yes':'No'],['Created',r.created_at],['Updated',r.updated_at]].map(([a,b])=>`<p><b>${a}:</b> ${esc(val({x:b},'x')||'—')}</p>`).join('')}</div>
      <div class="wqmActions"><button class="wqmBtn" id="wqmEdit">Edit करें</button><button class="wqmBtn" id="wqmPublish">${r.status==='published'?'Unpublish करें':'Publish करें'}</button><button class="wqmBtn danger" id="wqmDelete">Delete</button></div>`;
    $('wqmDetail').scrollIntoView({behavior:'smooth',block:'start'});
    $('wqmClose').onclick=()=>{$('wqmDetail').innerHTML='';selected=null;};
    $('wqmEdit').onclick=()=>edit(r);
    $('wqmPublish').onclick=()=>changeStatus(r);
    $('wqmDelete').onclick=()=>remove(r);
  }
  function edit(r){
    $('wqmDetail').innerHTML=`<h3>प्रश्न Edit करें — ${esc(r.question_id)}</h3><form id="wqmForm"><div class="wqmFormGrid">${columns.map(([k,label,type])=>{
      const v=val(r,k);
      if(type==='textarea'||type==='json') return `<label>${label}<textarea name="${k}" ${type==='json'?'class="jsonField"':''}>${esc(v)}</textarea></label>`;
      if(type==='select') return `<label>${label}<select name="${k}"><option ${r.medium==='Hindi'?'selected':''}>Hindi</option><option ${r.medium==='English'?'selected':''}>English</option><option ${r.medium==='Both'?'selected':''}>Both</option></select></label>`;
      if(type==='status') return `<label>${label}<select name="${k}"><option value="draft" ${r.status==='draft'?'selected':''}>draft</option><option value="published" ${r.status==='published'?'selected':''}>published</option></select></label>`;
      if(type==='boolean') return `<label>${label}<select name="${k}"><option value="true" ${r.is_active?'selected':''}>हाँ</option><option value="false" ${!r.is_active?'selected':''}>नहीं</option></select></label>`;
      return `<label>${label}<input name="${k}" type="${type==='number'?'number':'text'}" value="${esc(v)}"></label>`;
    }).join('')}</div><div class="wqmActions"><button class="wqmBtn" type="submit">बदलाव Save करें</button><button class="wqmBtn secondary" type="button" id="wqmCancel">Cancel</button></div></form>`;
    $('wqmCancel').onclick=()=>detail(r);
    $('wqmForm').onsubmit=async e=>{
      e.preventDefault(); const form=new FormData(e.currentTarget), obj={};
      for(const [k,label,type] of columns){
        let v=form.get(k);
        if(type==='json'){try{obj[k]=v.trim()?JSON.parse(v):null;}catch(_){msg(`${label} का JSON सही नहीं है।`,true);return;}}
        else if(type==='number') obj[k]=v===''?null:Number(v);
        else if(type==='boolean') obj[k]=v==='true';
        else obj[k]=v===''?null:v;
      }
      if(!obj.question_id||!obj.class_level||!obj.chapter_number||!obj.marks||(!obj.question_text_hi&&!obj.question_text_en)){msg('आवश्यक जानकारी: ID, कक्षा, अध्याय, अंक और कम से कम एक भाषा में प्रश्न भरें।',true);return;}
      const {error}=await client().from('written_questions').update(obj).eq('id',r.id);
      if(error){console.error(error);msg('Save नहीं हुआ: '+error.message,true);return;}
      msg('प्रश्न अपडेट हो गया।'); await load(); const fresh=records.find(x=>x.id===r.id); if(fresh) detail(fresh);
    };
  }
  async function changeStatus(r){
    const status=r.status==='published'?'draft':'published';
    if(!confirm(`${r.question_id} को ${status==='published'?'Publish':'Unpublish'} करें?`))return;
    const {error}=await client().from('written_questions').update({status}).eq('id',r.id);
    if(error){msg('स्थिति नहीं बदली: '+error.message,true);return;}
    await load(); const fresh=records.find(x=>x.id===r.id); if(fresh)detail(fresh);
  }
  async function remove(r){
    if(!confirm(`${r.question_id} को स्थायी रूप से Delete करना है? यह वापस नहीं आएगा।`))return;
    const {error}=await client().from('written_questions').delete().eq('id',r.id);
    if(error){msg('Delete नहीं हुआ: '+error.message,true);return;}
    $('wqmDetail').innerHTML=''; selected=null; await load();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    ['wqmSearch','wqmClass','wqmMarks','wqmStatus','wqmMedium','wqmChapter'].forEach(id=>$(id)?.addEventListener(id==='wqmSearch'?'input':'change',render));
    $('wqmRefresh')?.addEventListener('click',load);
    $('wqmList')?.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){const r=records.find(x=>x.id===b.dataset.view);if(r)detail(r);}});
    if($('wqmList')) load();
  });
})();
