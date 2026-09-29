(function(){
'use strict';

const SUPABASE_URL='https://cbgojvnbkosdehvwerth.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
const BUCKET='content-media';

const scenes=[
 {n:1,name:'Question Intro',desc:'सवाल को ध्यान से पढ़ने के लिए curiosity'},
 {n:2,name:'Options',desc:'विकल्पों को ध्यान से देखने के लिए prompt'},
 {n:3,name:'Hint',desc:'Hint देखने के लिए guidance'},
 {n:4,name:'Answer Reveal',desc:'उत्तर check करने की curiosity'},
 {n:5,name:'CTA',desc:'गणित सेतु Follow / Subscribe CTA'}
];

let sb=null;
let questions=[];
let selectedQuestion=null;
let finalBlob=null;
let finalObjectUrl=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const safeId=v=>String(v).replace(/[^a-zA-Z0-9_-]/g,'_');
const questionId=q=>String(q.question_id ?? q.id ?? q.question_number ?? '');
const questionText=q=>String(q.question ?? q.question_text ?? q.text ?? q.title ?? 'Question data उपलब्ध');
const questionClass=q=>String(q.class_level ?? q.class ?? q.class_name ?? '');
const fileNameFor=file=>`${Date.now()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
const storagePath=(qid,sn,fn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/scene-${sn}/${fn}`;
const publicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;

async function init(){
  if(!window.supabase){alert('Supabase library load नहीं हुई।');return;}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.href='index.html';return;}

  document.getElementById('batchGenerateBtn').addEventListener('click',loadQuestions);
  document.getElementById('finalPreviewBtn').addEventListener('click',buildFinalPreview);
  document.getElementById('downloadFinalBtn').addEventListener('click',downloadFinal);
  document.getElementById('publishFinalBtn').addEventListener('click',publishFinal);
}

async function loadQuestions(){
  const count=Math.min(5,Math.max(1,Number(document.getElementById('batchCount').value||1)));
  const result=document.getElementById('batchResult');
  const status=document.getElementById('batchResultStatus');
  const picker=document.getElementById('questionPicker');
  const btn=document.getElementById('batchGenerateBtn');

  btn.disabled=true;
  btn.textContent='⏳ Questions पढ़ रहा है…';
  result.style.display='block';
  status.textContent='Loading…';
  picker.innerHTML='<span class="qtm-empty">Supabase से questions पढ़े जा रहे हैं…</span>';

  try{
    const {data,error}=await sb.from('questions').select('*').limit(100);
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    if(!rows.length)throw new Error('questions table में कोई question नहीं मिला।');

    questions=[...rows].sort(()=>Math.random()-0.5).slice(0,count);
    picker.innerHTML=questions.map((q,i)=>
      `<button type="button" class="vsm-btn vsm-secondary" data-qidx="${i}">Question ${i+1} — ${esc(questionId(q))}</button>`
    ).join('');

    picker.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>openQuestion(Number(b.dataset.qidx)));
    });

    status.textContent=`✅ ${questions.length} question(s) loaded`;
    openQuestion(0);
  }catch(e){
    console.error(e);
    status.textContent='❌ Questions load failed';
    picker.innerHTML=`<span class="qtm-empty">Error: ${esc(e.message||String(e))}</span>`;
  }finally{
    btn.disabled=false;
    btn.textContent='🎬 Questions Load करें';
  }
}

async function openQuestion(index){
  selectedQuestion=questions[index];
  finalBlob=null;
  if(finalObjectUrl){URL.revokeObjectURL(finalObjectUrl);finalObjectUrl=null;}

  document.getElementById('questionWorkspace').style.display='block';
  document.getElementById('workspaceTitle').textContent=`Question ${index+1} — ${questionId(selectedQuestion)}`;
  document.getElementById('workspaceText').textContent=questionText(selectedQuestion);
  const cls=document.getElementById('workspaceClass');
  cls.textContent=questionClass(selectedQuestion)?`Class ${questionClass(selectedQuestion)}`:'';

  document.querySelectorAll('#questionPicker button').forEach((b,i)=>b.classList.toggle('active',i===index));

  renderScenes();
  resetFinalUI();
  await loadQuestionScenes();
}

function renderScenes(){
  const qid=questionId(selectedQuestion);
  const sid=safeId(qid);
  document.getElementById('sceneGrid').innerHTML=scenes.map(s=>`
    <div class="qtm-scene" id="qscene-${sid}-${s.n}">
      <h4>Scene ${s.n} — ${esc(s.name)}</h4>
      <div id="qpreview-${sid}-${s.n}">
        <div class="qtm-empty">अभी video save नहीं है</div>
      </div>
      <input class="qtm-file" id="file-${sid}-${s.n}" type="file" accept="video/mp4,video/*">
      <div class="qtm-upload">
        <button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-${s.n}').click()">⬆️ Upload Scene ${s.n}</button>
      </div>
      <div class="qtm-status" id="qstatus-${sid}-${s.n}">Checking…</div>
    </div>`).join('');

  scenes.forEach(s=>{
    document.getElementById(`file-${sid}-${s.n}`).addEventListener('change',e=>{
      const f=e.target.files?.[0];
      if(f)saveQuestionScene(qid,s.n,f);
      e.target.value='';
    });
  });
}

async function loadQuestionScenes(){
  const qid=questionId(selectedQuestion);
  try{
    const {data,error}=await sb.from('video_question_scene_templates')
      .select('id,question_id,scene_number,file_name,storage_path,is_active')
      .eq('question_id',qid)
      .order('scene_number',{ascending:true});
    if(error)throw error;

    scenes.forEach(s=>{
      const row=(data||[]).find(r=>Number(r.scene_number)===s.n);
      renderScene(qid,s.n,row);
    });
    setTimeout(updateFinalAvailability,50);
  }catch(e){
    console.error(e);
    scenes.forEach(s=>{
      const st=document.getElementById(`qstatus-${safeId(qid)}-${s.n}`);
      if(st)st.textContent='⚠️ Template load नहीं हो सका';
    });
  }
}

function renderScene(qid,sn,row){
  const sid=safeId(qid);
  const preview=document.getElementById(`qpreview-${sid}-${sn}`);
  const status=document.getElementById(`qstatus-${sid}-${sn}`);
  if(!preview||!status)return;

  if(!row){
    preview.innerHTML='<div class="qtm-empty">अभी video save नहीं है</div>';
    status.textContent='⚪ Upload करें';
    return;
  }

  const url=publicUrl(row.storage_path);
  preview.innerHTML=`
    <video controls preload="metadata" src="${url}"></video>
    <div class="qtm-actions">
      <button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button>
      <button class="vsm-mini" type="button" onclick="document.getElementById('file-${sid}-${sn}').click()">🔄 Replace</button>
    </div>`;
  status.innerHTML='<span class="qtm-badge qtm-saved">✅ Permanently Saved</span>';
}

async function saveQuestionScene(qid,sn,file){
  if(!file.type.startsWith('video/')){alert('केवल video file चुनें।');return;}
  const sid=safeId(qid);
  const status=document.getElementById(`qstatus-${sid}-${sn}`);
  status.textContent='⏳ Video save हो रहा है…';

  try{
    const {data:oldRows,error:oldErr}=await sb.from('video_question_scene_templates')
      .select('id,storage_path')
      .eq('question_id',qid).eq('scene_number',sn).limit(1);
    if(oldErr)throw oldErr;

    const old=oldRows?.[0]||null;
    const fn=fileNameFor(file);
    const path=storagePath(qid,sn,fn);

    const {error:uploadErr}=await sb.storage.from(BUCKET).upload(path,file,{
      contentType:file.type||'video/mp4',upsert:false,cacheControl:'31536000'
    });
    if(uploadErr)throw uploadErr;

    const payload={question_id:qid,scene_number:sn,file_name:fn,storage_path:path,is_active:true,updated_at:new Date().toISOString()};
    let dbErr=null;

    if(old){
      const {error}=await sb.from('video_question_scene_templates').update(payload).eq('id',old.id);
      dbErr=error;
    }else{
      const {error}=await sb.from('video_question_scene_templates').insert({...payload,created_at:new Date().toISOString()});
      dbErr=error;
    }

    if(dbErr){
      await sb.storage.from(BUCKET).remove([path]);
      throw dbErr;
    }

    if(old?.storage_path)await sb.storage.from(BUCKET).remove([old.storage_path]);
    renderScene(qid,sn,{...payload});
    updateFinalAvailability();
    document.getElementById('finalStatus').textContent=`✅ Scene ${sn} permanently saved.`;
  }catch(e){
    console.error(e);
    status.textContent='❌ Save failed';
    alert(`Scene ${sn} upload failed: ${e.message||e}`);
  }
}

async function getRows(){
  const qid=questionId(selectedQuestion);
  const {data,error}=await sb.from('video_question_scene_templates')
    .select('scene_number,file_name,storage_path,is_active')
    .eq('question_id',qid)
    .order('scene_number',{ascending:true});
  if(error)throw error;
  return data||[];
}

function updateFinalAvailability(){
  document.getElementById('finalPreviewBtn').disabled=!selectedQuestion;
}

function resetFinalUI(){
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">Final Preview अभी नहीं बना है।</div>';
  document.getElementById('downloadFinalBtn').disabled=true;
  document.getElementById('publishFinalBtn').disabled=true;
  document.getElementById('finalStatus').textContent='जितने Scene upload होंगे, Final Preview में उतने ही क्रम से जुड़ेंगे।';
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ Saved scenes पढ़े जा रहे हैं…';

  try{
    const rows=await getRows();
    const available=scenes.map(s=>rows.find(r=>Number(r.scene_number)===s.n)).filter(Boolean);
    if(!available.length)throw new Error('कम-से-कम 1 Scene video upload करें।');

    // If only one scene exists, preview it directly; no rendering dependency is needed.
    if(available.length===1){
      const url=publicUrl(available[0].storage_path);
      preview.innerHTML=`<video controls autoplay src="${url}"></video>`;
      status.textContent='✅ 1 Scene का Final Preview तैयार है।';
      // Direct single-video download is supported.
      const a=document.getElementById('downloadFinalBtn');
      a.disabled=false;
      a.dataset.url=url;
      a.dataset.single='1';
      document.getElementById('publishFinalBtn').disabled=false;
      document.getElementById('publishFinalBtn').classList.remove('qtm-publish-disabled');
      return;
    }

    // For 2–5 scenes, use ffmpeg.wasm concatenation in the browser.
    if(!window.FFmpeg || !window.FFmpegUtil)throw new Error('Video compiler library load नहीं हुई। Internet connection check करें।');
    const {FFmpeg}=window.FFmpeg;
    const {fetchFile,toBlobURL}=window.FFmpegUtil;
    const ffmpeg=new FFmpeg();
    status.textContent='⏳ Video compiler load हो रहा है…';
    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL:await toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),
      wasmURL:await toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm')
    });

    const names=[];
    for(let i=0;i<available.length;i++){
      const name=`scene${i+1}.mp4`;
      status.textContent=`⏳ Scene ${i+1}/${available.length} तैयार हो रहा है…`;
      await ffmpeg.writeFile(name,await fetchFile(publicUrl(available[i].storage_path)));
      names.push(name);
    }

    const concatList=names.map(n=>`file '${n}'`).join('\n');
    await ffmpeg.writeFile('concat.txt',new TextEncoder().encode(concatList));
    status.textContent='⏳ Scenes compile हो रहे हैं…';
    await ffmpeg.exec(['-f','concat','-safe','0','-i','concat.txt','-c','copy','final.mp4']);

    const data=await ffmpeg.readFile('final.mp4');
    finalBlob=new Blob([data.buffer],{type:'video/mp4'});
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(finalBlob);
    preview.innerHTML=`<video controls autoplay src="${finalObjectUrl}"></video>`;
    document.getElementById('downloadFinalBtn').disabled=false;
    document.getElementById('downloadFinalBtn').dataset.single='0';
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('publishFinalBtn').classList.remove('qtm-publish-disabled');
    status.textContent=`✅ ${available.length} Scenes compile होकर Final Preview तैयार है।`;
  }catch(e){
    console.error(e);
    status.textContent=`❌ Final Preview failed: ${e.message||e}`;
  }finally{
    btn.disabled=false;
  }
}

async function downloadFinal(){
  const btn=document.getElementById('downloadFinalBtn');
  if(btn.dataset.single==='1'){
    const a=document.createElement('a');
    a.href=btn.dataset.url;
    a.download=`question-${questionId(selectedQuestion)}-final.mp4`;
    a.target='_blank';
    a.click();
    return;
  }
  if(!finalObjectUrl)return;
  const a=document.createElement('a');
  a.href=finalObjectUrl;
  a.download=`question-${questionId(selectedQuestion)}-final.mp4`;
  a.click();
}

function publishFinal(){
  alert('Final video तैयार है। Publishing button रखा गया है; Facebook / YouTube / WhatsApp Channel publishing को अगले चरण में मौजूदा publishing workflow से जोड़ा जाएगा।');
}

window.addEventListener('DOMContentLoaded',init);
})();