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
    ['diagram_url','Diagram URL','text'],
    ['table_data_json_hi','Table data JSON (हिंदी)','json'],['table_data_json_en','Table data JSON (English)','json'],
    ['graph_data_json_hi','Graph data JSON (हिंदी)','json'],['graph_data_json_en','Graph data JSON (English)','json'],
    ['exam_year','परीक्षा वर्ष','number'],['paper_set','Paper set','text'],['exam_type','परीक्षा प्रकार','text'],
    ['original_question_number','मूल प्रश्न क्रमांक','text'],['source_reference','Source reference','text'],
    ['status','स्थिति','status'],['is_active','सक्रिय','boolean'],['remarks','टिप्पणी','textarea']
  ];
  let records = [], selected = null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const msg = (s, bad=false) => { $('wqmMsg').textContent=s; $('wqmMsg').className='notice '+(bad?'bad':'ok'); };
  const val = (r,k) => r[k] == null ? '' : (typeof r[k] === 'object' ? JSON.stringify(r[k],null,2) : String(r[k]));

  // Compress still images in the browser before sending them to Supabase.
  // WebP supports transparency; GIF is kept unchanged to preserve animation.
  async function compressDiagramImage(file) {
    if (file.type === 'image/gif') return file;

    let drawable = null;
    let objectUrl = null;
    try {
      if ('createImageBitmap' in window) {
        drawable = await createImageBitmap(file);
      } else {
        // Fallback for mobile browsers/WebViews without createImageBitmap.
        objectUrl = URL.createObjectURL(file);
        drawable = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('चित्र पढ़ा नहीं जा सका।'));
          img.src = objectUrl;
        });
      }

      const width = drawable.width || drawable.naturalWidth;
      const height = drawable.height || drawable.naturalHeight;
      if (!width || !height) throw new Error('चित्र का आकार पढ़ा नहीं जा सका।');
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('इमेज Compression शुरू नहीं हो सका।');
      // Do not paint a background: transparent PNG remains transparent in WebP.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.82, 0.76, 0.70, 0.64]) {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(result => result ? resolve(result) : reject(new Error('Compressed इमेज तैयार नहीं हो सकी।')), 'image/webp', quality);
        });
        // Some browsers silently return PNG when WebP encoding is unsupported.
        if (blob.type !== 'image/webp') {
          throw new Error('इस मोबाइल ब्राउज़र में WebP Compression उपलब्ध नहीं है। Supabase के question-diagrams Bucket में image/png भी Allow करें।');
        }
        if (blob.size <= 1.5 * 1024 * 1024 || quality === 0.64) {
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
            type: 'image/webp', lastModified: Date.now()
          });
        }
      }
      throw new Error('चित्र Compress नहीं हो सका।');
    } finally {
      drawable?.close?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  async function diagramStoragePath(publicUrl) {
    if (!publicUrl) return null;
    try {
      const pathname = new URL(publicUrl, window.location.href).pathname;
      const marker = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/question-diagrams\//i;
      const match = pathname.match(marker);
      if (!match || match.index == null) return null;
      const rawPath = pathname.slice(match.index + match[0].length);
      const path = rawPath.split('/').map(part => decodeURIComponent(part)).join('/').replace(/^\/+/, '');
      return path && !path.split('/').some(part => part === '..') ? path : null;
    } catch (_) { return null; }
  }
  async function deleteOldDiagramIfUnused(c, oldUrl, newUrl, currentId) {
    if (!oldUrl || !newUrl || oldUrl === newUrl) return 'unchanged';
    const oldPath = await diagramStoragePath(oldUrl);
    const newPath = await diagramStoragePath(newUrl);
    if (!oldPath || !newPath || oldPath === newPath) return 'not-managed';
    const { data: refs, error: refError } = await c.from('written_questions')
      .select('id').eq('diagram_url', oldUrl).neq('id', currentId).limit(1);
    if (refError) throw refError;
    if (refs && refs.length) return 'shared';
    const { error } = await c.storage.from('question-diagrams').remove([oldPath]);
    if (error) throw error;
    return 'deleted';
  }

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
      st=$('wqmStatus').value, med=$('wqmMedium').value, ch=$('wqmChapter').value,
      yr=$('wqmYear').value, set=$('wqmSet').value, level=$('wqmLevel').value;
    return records.filter(r=>
      (!q || [r.question_id,r.question_text_hi,r.question_text_en,r.chapter_name_hi,r.chapter_name_en].some(x=>String(x||'').toLowerCase().includes(q))) &&
      (!cl || String(r.class_level)===cl) && (!mk || String(r.marks)===mk) &&
      (!st || r.status===st) && (!med || r.medium===med) && (!ch || String(r.chapter_number)===ch) &&
      (!yr || String(r.exam_year||'')===yr) &&
      (!set || String(r.paper_set||'').toLowerCase()===set.toLowerCase()) &&
      (!level || String(r.maths_level||'').toLowerCase()===level.toLowerCase())
    );
  }
  function populateMetadataFilters(){
    const yearSelect=$('wqmYear'), setSelect=$('wqmSet');
    const selectedYear=yearSelect.value, selectedSet=setSelect.value;
    const years=[...new Set(records.map(r=>r.exam_year).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''))].map(String).sort((a,b)=>Number(b)-Number(a));
    const sets=[...new Set(records.map(r=>String(r.paper_set||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
    yearSelect.innerHTML='<option value="">सभी वर्ष</option>'+years.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    setSelect.innerHTML='<option value="">सभी Set</option>'+sets.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(years.includes(selectedYear)) yearSelect.value=selectedYear;
    if(sets.includes(selectedSet)) setSelect.value=selectedSet;
  }
  function render(){
    populateMetadataFilters();
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
      <div class="wqmMeta">${[['Marking scheme',r.marking_scheme_json],['Diagram type / URL',[r.diagram_type,r.diagram_url].filter(Boolean).join(' / ')],['Table data (Hindi)',r.table_data_json_hi],['Table data (English)',r.table_data_json_en],['Graph data (Hindi)',r.graph_data_json_hi],['Graph data (English)',r.graph_data_json_en],['Exam details',[r.exam_year,r.exam_type,r.paper_set,r.original_question_number].filter(Boolean).join(' · ')],['Source',r.source_reference],['Remarks',r.remarks],['Active',r.is_active?'Yes':'No'],['Created',r.created_at],['Updated',r.updated_at]].map(([a,b])=>`<p><b>${a}:</b> ${esc(val({x:b},'x')||'—')}</p>`).join('')}</div>
      ${r.diagram_url ? `<div class="wqmDiagramPreview"><b>प्रश्न का चित्र</b><br><img src="${esc(r.diagram_url)}" alt="प्रश्न का चित्र" loading="lazy" style="max-width:100%;max-height:360px;object-fit:contain;border:1px solid #dbe4ee;border-radius:10px;margin-top:8px"></div>` : ''}
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
    }).join('')}</div>
      <div class="wqmDiagramUpload" style="margin:14px 0;padding:14px;border:1px solid #dbe4ee;border-radius:10px">
        <label for="wqmDiagramFile"><b>प्रश्न का चित्र अपलोड करें (सभी Sets के लिए समान सुविधा)</b></label>
        <input id="wqmDiagramFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" style="display:block;margin:10px 0">
        <small>PNG, JPG, WEBP या GIF · मूल चित्र अधिकतम 5 MB। PNG/JPG/WEBP अपने-आप WebP में Compress होंगे (लक्ष्य लगभग 1.5 MB); GIF की Animation सुरक्षित रखने के लिए उसे Compress नहीं किया जाएगा।</small>
        <div id="wqmDiagramPreview">${r.diagram_url ? `<img src="${esc(r.diagram_url)}" alt="वर्तमान प्रश्न चित्र" style="max-width:100%;max-height:220px;object-fit:contain;margin-top:8px">` : '<span>अभी कोई चित्र अपलोड नहीं है।</span>'}</div>
      </div>
      <div class="wqmActions"><button class="wqmBtn" type="submit">बदलाव Save करें</button><button class="wqmBtn secondary" type="button" id="wqmCancel">Cancel</button></div></form>`;
    $('wqmCancel').onclick=()=>detail(r);
    $('wqmDiagramFile').onchange=()=>{
      const file=$('wqmDiagramFile').files?.[0];
      if(!file){$('wqmDiagramPreview').innerHTML=r.diagram_url?`<img src="${esc(r.diagram_url)}" alt="वर्तमान प्रश्न चित्र" style="max-width:100%;max-height:220px;object-fit:contain;margin-top:8px">`:'<span>अभी कोई चित्र अपलोड नहीं है।</span>';return;}
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024){
        msg('केवल PNG/JPG/WEBP/GIF चित्र चुनें। आकार 5 MB से अधिक न हो।',true);$('wqmDiagramFile').value='';return;
      }
      const url=URL.createObjectURL(file);
      $('wqmDiagramPreview').innerHTML=`<img src="${url}" alt="नया चित्र Preview" style="max-width:100%;max-height:220px;object-fit:contain;margin-top:8px">`;
    };
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
      const diagramFile=$('wqmDiagramFile').files?.[0];
      const oldDiagramUrl=String(r.diagram_url||'').trim();
      let uploadedDiagramPath=null;
      const existingDiagramPath=oldDiagramUrl ? await diagramStoragePath(oldDiagramUrl) : null;
      if(diagramFile && oldDiagramUrl && !existingDiagramPath){
        msg('पुरानी फोटो का Supabase Storage Path पहचान में नहीं आया। नई फोटो अलग से सेव नहीं की गई। कृपया diagram_url जाँचें।',true);
        return;
      }
      const saveButton=$('wqmForm').querySelector('button[type="submit"]');
      if(diagramFile){
        if(!['image/png','image/jpeg','image/webp','image/gif'].includes(diagramFile.type)||diagramFile.size>5*1024*1024){
          msg('केवल PNG/JPG/WEBP/GIF चित्र चुनें। आकार 5 MB से अधिक न हो।',true);return;
        }
        saveButton.disabled=true; saveButton.textContent='चित्र अपलोड हो रहा है…';
        try{
          saveButton.textContent='चित्र Compress हो रहा है…';
          const uploadFile=await compressDiagramImage(diagramFile);
          const ext=uploadFile.type==='image/webp'?'webp':({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif' })[uploadFile.type];
          const safeId=String(obj.question_id||r.id).replace(/[^a-zA-Z0-9_-]/g,'_');
          const existingPath=existingDiagramPath;
          const unique=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`;
          // Existing managed image: overwrite the exact same Storage object/path.
          const path=existingPath || `class-${obj.class_level}/${obj.exam_year||'unassigned'}/${obj.paper_set||'unassigned'}/${safeId}_${unique}.${ext}`;
          uploadedDiagramPath=existingPath ? null : path;
          msg(`चित्र तैयार है (${(diagramFile.size/1024/1024).toFixed(2)} MB → ${(uploadFile.size/1024/1024).toFixed(2)} MB)। उसी Storage Path पर Replace हो रहा है…`);
          const {error:uploadError}=await client().storage.from('question-diagrams').upload(path,uploadFile,{contentType:uploadFile.type,upsert:true});
          if(uploadError) throw uploadError;
          const {data:urlData}=client().storage.from('question-diagrams').getPublicUrl(path);
          if(!urlData?.publicUrl) throw new Error('चित्र का Public URL नहीं मिला।');
          obj.diagram_url=existingPath ? oldDiagramUrl : urlData.publicUrl;
        }catch(uploadError){
          console.error('Written diagram upload error:',uploadError);
          msg('चित्र अपलोड नहीं हुआ: '+(uploadError.message||uploadError)+'। Storage Bucket/Policy SQL जाँचें।',true);
          saveButton.disabled=false;saveButton.textContent='बदलाव Save करें';return;
        }
      }
      saveButton.disabled=true;saveButton.textContent='Save हो रहा है…';
      const {error}=await client().from('written_questions').update(obj).eq('id',r.id);
      if(error){
        console.error(error);
        if(uploadedDiagramPath){
          const {error:rollbackError}=await client().storage.from('question-diagrams').remove([uploadedDiagramPath]);
          if(rollbackError) console.warn('New diagram rollback failed:',rollbackError);
        }
        msg('Save नहीं हुआ: '+error.message,true);saveButton.disabled=false;saveButton.textContent='बदलाव Save करें';return;
      }
      if(diagramFile && oldDiagramUrl && existingDiagramPath){
        msg('प्रश्न अपडेट हुआ। पुरानी Storage फाइल के उसी Path पर नई इमेज Replace हो गई; अलग दूसरी फाइल नहीं बनी।');
      } else if(uploadedDiagramPath && obj.diagram_url){
        msg('प्रश्न अपडेट हुआ। नई इमेज सेव हो गई।');
      } else {
        msg('प्रश्न अपडेट हो गया।');
      }
      await load(); const fresh=records.find(x=>x.id===r.id); if(fresh) detail(fresh);
    };
  }
  // Common solution-readiness rule: applies to every year, paper set and maths level.
  // Each OR alternative is a separate row, so each alternative must have its own solution.
  function solutionReadiness(r){
    const missing=[];
    if(!String(r.solution_steps_hi||'').trim()) missing.push('हल के चरण (हिंदी)');
    if(!String(r.final_answer_hi||'').trim()) missing.push('अंतिम उत्तर (हिंदी)');
    return missing;
  }
  async function changeStatus(r){
    const status=r.status==='published'?'draft':'published';
    if(status==='published' && [2,3,4].includes(Number(r.marks))){
      const missing=solutionReadiness(r);
      if(missing.length){
        msg(`${r.question_id} Publish नहीं हुआ। पहले Edit करके ये जानकारी भरें: ${missing.join(' और ')}। यह नियम सभी Sets पर लागू है।`,true);
        $('wqmDetail').scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
    }
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
    ['wqmSearch','wqmClass','wqmMarks','wqmStatus','wqmMedium','wqmChapter','wqmYear','wqmSet','wqmLevel'].forEach(id=>$(id)?.addEventListener(id==='wqmSearch'?'input':'change',render));
    $('wqmRefresh')?.addEventListener('click',load);
    $('wqmList')?.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){const r=records.find(x=>x.id===b.dataset.view);if(r)detail(r);}});
    if($('wqmList')) load();
  });
})();
