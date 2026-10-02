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
let videoRowsByScene={};
let imageRowsByScene={};
let layerRowsByScene={};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const safeId=v=>String(v).replace(/[^a-zA-Z0-9_-]/g,'_');
const questionId=q=>String(q.question_id ?? q.id ?? q.question_number ?? '');
const questionText=q=>String(q.question ?? q.question_text ?? q.text ?? q.title ?? 'Question data उपलब्ध');
const questionClass=q=>String(q.class_level ?? q.class ?? q.class_name ?? '');
const fileNameFor=file=>`${Date.now()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
const storagePath=(qid,sn,fn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/scene-${sn}/${fn}`;
const publicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;
const imageStoragePath=(qid,sn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/images/scene-${sn}.png`;
const imagePublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;
const pickField=(q, keys, fallback='')=>{for(const k of keys){if(q && q[k]!==undefined && q[k]!==null && String(q[k]).trim()!=='')return String(q[k]);}return fallback;};
const optionText=(q,n)=>pickField(q,[`option_${n}`,`option${n}`,`option_${String.fromCharCode(96+n)}`,`option${String.fromCharCode(96+n)}`,`choice_${n}`,`choice${n}`,`answer_option_${n}`],'');
const answerText=q=>pickField(q,['correct_answer','correctAnswer','answer','correct_option','correct_option_text','right_answer'],'');
const hintText=q=>pickField(q,['hint','question_hint','explanation_hint'],'Hint उपलब्ध नहीं है।');
const explanationText=q=>pickField(q,['explanation','solution','answer_explanation'],'');
const chapterText=q=>pickField(q,['chapter_name','chapter','chapter_title'],'');
const sceneImageText=(q,sn)=>{
  const qt=questionText(q);
  const a=answerText(q);
  if(sn===1)return {title:'सवाल ध्यान से पढ़िए',body:qt};
  if(sn===2){const opts=[1,2,3,4].map((n,i)=>optionText(q,n)).filter(Boolean);return {title:'विकल्प ध्यान से देखिए',body:opts.length?opts.map((v,i)=>`${String.fromCharCode(65+i)}) ${v}`).join('\n'):'विकल्प उपलब्ध हैं।'};}
  if(sn===3)return {title:'Hint',body:hintText(q)};
  if(sn===4)return {title:'सही उत्तर',body:a+(explanationText(q)?`\n\n${explanationText(q)}`:'')};
  return {title:'गणित सेतु',body:'ऐसे ही मज़ेदार गणित के सवालों के लिए\nगणित सेतु को फॉलो और सब्सक्राइब करें।'};
};

function wrapCanvasText(ctx,text,maxWidth,lineHeight,maxLines=8){
  const lines=[];
  String(text||'').split(/\n/).forEach(par=>{
    const words=par.split(/\s+/).filter(Boolean); if(!words.length){lines.push('');return;}
    let line='';
    for(const word of words){
      const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width<=maxWidth) line=test;
      else {if(line)lines.push(line); line=word;}
    }
    if(line)lines.push(line);
  });
  return lines.slice(0,maxLines);
}

function drawQuestionImage(q,sn){
  const W=1080,H=1920;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const {title,body}=sceneImageText(q,sn);
  // Transparent canvas so the generated artwork can later be placed as a video layer.
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,0.94)';
  ctx.strokeStyle='rgba(37,99,235,0.22)';
  ctx.lineWidth=3;
  const x=70,y=90,w=W-140,h=760,r=34;
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d4ed8';ctx.font='700 46px "Noto Sans Devanagari", "Mangal", sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title,W/2,y+70);
  ctx.fillStyle='#0f172a';
  let fontSize=sn===5?40:(sn===2?44:48);
  ctx.font=`600 ${fontSize}px "Noto Sans Devanagari", "Mangal", sans-serif`;
  const lines=wrapCanvasText(ctx,body,w-120,fontSize*1.45,sn===2?8:10);
  const total=lines.length*fontSize*1.45;
  let yy=y+120+(h-150-total)/2;
  for(const line of lines){ctx.fillText(line,W/2,yy);yy+=fontSize*1.45;}
  if(chapterText(q)){
    ctx.fillStyle='#475569';ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';ctx.fillText(chapterText(q),W/2,y+h-45);
  }
  ctx.restore();
  return c;
}

function canvasToBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG generate नहीं हुआ।')),'image/png'));}


async function init(){
  if(!window.supabase){alert('Supabase library load नहीं हुई।');return;}
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data:{session}}=await sb.auth.getSession();
  if(!session){location.href='index.html';return;}

  document.getElementById('batchGenerateBtn').addEventListener('click',loadQuestions);
  const finalBtn=document.getElementById('finalPreviewBtn');
  finalBtn.textContent='⚡ Quick Preview देखें';
  finalBtn.addEventListener('click',buildFinalPreview);

  const downloadBtn=document.getElementById('downloadFinalBtn');
  downloadBtn.textContent='⬇️ Quick Preview Download करें';
  downloadBtn.disabled=true;
  downloadBtn.addEventListener('click',downloadFinal);

  // Remove stale controls injected by older builds. Keep exactly one download
  // button and never show a separate Permanent MP4 button.
  document.querySelectorAll('button').forEach(b=>{
    const t=(b.textContent||'').trim();
    if(b!==downloadBtn && (/Permanent MP4|Permanent Master/i.test(t) || /^⬇️?\s*Download Video$/.test(t))) b.remove();
  });
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
    // पहले questions table को सामान्य तरीके से पढ़ें।
    // किसी specific column (जैसे question_id) पर निर्भर नहीं रहेंगे,
    // क्योंकि अलग database versions में ID column अलग हो सकता है।
    const {data,error}=await sb.from('questions').select('*').limit(500);
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    if(!rows.length)throw new Error('questions table में कोई question नहीं मिला।');

    let savedIds=[];
    try{ savedIds=JSON.parse(localStorage.getItem('vsm_selected_question_ids')||'[]'); }catch(_){ savedIds=[]; }
    if(!Array.isArray(savedIds))savedIds=[];

    // F5 के बाद पहले से selected questions को उन्हीं rows में खोजें।
    const byId=new Map(rows.map(q=>[questionId(q),q]));
    const restored=savedIds.map(id=>byId.get(String(id))).filter(Boolean);

    if(restored.length){
      questions=restored.slice(0,count);
      // अगर saved selection में कम questions मिले तो नए questions से भरें।
      if(questions.length<count){
        const used=new Set(questions.map(questionId));
        const extras=rows.filter(q=>!used.has(questionId(q))).sort(()=>Math.random()-0.5);
        questions=questions.concat(extras.slice(0,count-questions.length));
      }
    }else{
      questions=[...rows].sort(()=>Math.random()-0.5).slice(0,count);
    }

    localStorage.setItem('vsm_selected_question_ids',JSON.stringify(questions.map(questionId)));

    picker.innerHTML=questions.map((q,i)=>
      `<button type="button" class="vsm-btn vsm-secondary" data-qidx="${i}">Question ${i+1} — ${esc(questionId(q))}</button>`
    ).join('');

    picker.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>openQuestion(Number(b.dataset.qidx)));
    });

    status.textContent=`✅ ${questions.length} question(s) loaded`;
    openQuestion(0);
  }catch(e){
    console.error('Questions load failed:',e);
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
      <div class="qtm-scene-body">
        <div class="qtm-media-box">
          <div class="qtm-media-label">🎬 VIDEO PREVIEW</div>
          <div id="qpreview-${sid}-${s.n}"><div class="qtm-empty">अभी video save नहीं है</div></div>
          ${s.n===1?`<input class="qtm-file" id="file-${sid}-${s.n}" type="file" accept="video/mp4,video/*">
          <div class="qtm-upload"><button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-${s.n}').click()">⬆️ Upload 45-sec Master Video</button></div>`:''}
        </div>
        <div class="qtm-media-box">
          <div class="qtm-media-label">🖼️ SCENE IMAGE</div>
          <div class="qtm-image-wrap" id="qimage-${sid}-${s.n}"><div class="qtm-image-empty">अभी image generate नहीं हुई</div></div>
          <div class="qtm-image-actions">
            <button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">✨ Generate Image</button>
            <button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">🔄 Regenerate</button>
          </div>
          <div class="qtm-image-status" id="qimagestatus-${sid}-${s.n}">Image अभी save नहीं है</div>
        </div>
      </div>
      <div class="qtm-status" id="qstatus-${sid}-${s.n}">Checking…</div>
    </div>`).join('');

  const masterFile=document.getElementById(`file-${sid}-1`);
  if(masterFile){
    masterFile.addEventListener('change',e=>{
      const f=e.target.files?.[0];
      if(f)saveQuestionScene(qid,1,f);
      e.target.value='';
    });
  }
}

async function loadQuestionScenes(){
  const qid=questionId(selectedQuestion);
  try{
    const {data,error}=await sb.from('video_question_scene_templates')
      .select('id,question_id,scene_number,file_name,storage_path,is_active')
      .eq('question_id',qid)
      .order('scene_number',{ascending:true});
    if(error)throw error;

    videoRowsByScene={};
    scenes.forEach(s=>{
      const row=(data||[]).find(r=>Number(r.scene_number)===s.n)||null;
      videoRowsByScene[s.n]=row;
      renderScene(qid,s.n,row);
    });
    await loadQuestionImages();
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

  if(sn!==1){
    preview.innerHTML='<div class="qtm-empty">Scene 1 का 45-sec Master Video ही यहाँ इस्तेमाल होगा।<br>अलग Scene Video की जरूरत नहीं है।</div>';
    status.innerHTML=row
      ? '<span class="qtm-badge qtm-saved">ℹ️ पुराना Scene Video मौजूद है; Final Preview में इस्तेमाल नहीं होगा।</span>'
      : '⚪ केवल Image रखें';
    return;
  }
  if(!row){
    preview.innerHTML='<div class="qtm-empty">अभी 45-sec Master Video save नहीं है</div>';
    status.textContent='⚪ Master Video upload करें';
    return;
  }
  const url=publicUrl(row.storage_path);
  preview.innerHTML=`
    <video controls preload="metadata" src="${url}"></video>
    <div class="qtm-actions">
      <button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button>
      <button class="vsm-mini" type="button" onclick="document.getElementById('file-${sid}-1').click()">🔄 Replace Master Video</button>
    </div>`;
  status.innerHTML='<span class="qtm-badge qtm-saved">✅ 45-sec Master Video Saved</span>';
}

async function loadQuestionImages(){
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  try{
    const {data,error}=await sb.from('video_question_scene_images')
      .select('id,question_id,scene_number,file_name,storage_path,is_active')
      .eq('question_id',qid).order('scene_number',{ascending:true});
    if(error)throw error;
    imageRowsByScene={};
    const imageRows=data||[];
    scenes.forEach(s=>{
      const row=imageRows.find(r=>Number(r.scene_number)===s.n)||null;
      imageRowsByScene[s.n]=row;
      renderSceneImage(qid,s.n,row);
    });
    try{
      const {data:layers,error:layerErr}=await sb.from('video_question_scene_layers').select('*').eq('question_id',qid).order('scene_number',{ascending:true});
      if(layerErr)throw layerErr;
      layerRowsByScene={};
      const savedLayers=layers||[];
      const scene1Defaults=savedLayers.find(r=>Number(r.scene_number)===1)||null;
      scenes.forEach(s=>{
        const own=savedLayers.find(r=>Number(r.scene_number)===s.n)||null;
        // Scene 1 is the editable master/default. Scenes 2-5 inherit it until they
        // get their own saved override. The inherited values are NOT written to DB.
        const inherited=(s.n>1 && !own && scene1Defaults)
          ? {...scene1Defaults,scene_number:s.n,__inherited:true}
          : own;
        layerRowsByScene[s.n]=inherited;
        renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],inherited);
      });
    }catch(layerErr){
      console.warn('Layer settings load skipped:',layerErr);
      scenes.forEach(s=>renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],null));
    }
  }catch(e){
    console.error('Image load failed:',e);
    scenes.forEach(s=>{const el=document.getElementById(`qimagestatus-${sid}-${s.n}`);if(el)el.textContent='⚠️ Image table/record load नहीं हुआ';});
  }
}

function renderSceneImage(qid,sn,row){
  const sid=safeId(qid), box=document.getElementById(`qimage-${sid}-${sn}`), st=document.getElementById(`qimagestatus-${sid}-${sn}`);
  if(!box||!st)return;
  if(!row){box.innerHTML='<div class="qtm-image-empty">अभी image generate नहीं हुई</div>';st.textContent='Image अभी save नहीं है';return;}
  const url=imagePublicUrl(row.storage_path);
  box.innerHTML=`<img src="${url}" alt="Scene ${sn} image" loading="lazy"><div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';
  renderLayerEditor(qid,sn,row,videoRowsByScene[sn],layerRowsByScene[sn]);
}

function renderLayerEditor(qid,sn,imageRow,videoRow,layerRow){
  const sid=safeId(qid);
  const host=document.getElementById(`qscene-${sid}-${sn}`);
  if(!host)return;
  let editor=host.querySelector('.qtm-layer-editor');
  if(!imageRow){ if(editor)editor.remove(); return; }
  if(!editor){ editor=document.createElement('div'); editor.className='qtm-layer-editor'; host.appendChild(editor); }
  const defaults={x:0,y:0,width:1080,height:1920};
  const layer={...defaults,...(layerRow||{})};
  const inherited=Boolean(layerRow?.__inherited);
  const videoUrl=videoRow?.storage_path?publicUrl(videoRow.storage_path):'';
  const imageUrl=imagePublicUrl(imageRow.storage_path);
  editor.innerHTML=`
    <div class="qtm-media-label">🎛️ IMAGE LAYER — Scene ${sn}</div>
    <div class="qtm-layer-stage" id="layerstage-${sid}-${sn}">
      ${videoUrl?`<video muted playsinline preload="metadata" src="${videoUrl}"></video>`:'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Video पहले upload करें</div>'}
      <img id="layerimg-${sid}-${sn}" src="${imageUrl}" draggable="false" alt="Scene ${sn} layer">
    </div>
    <div class="qtm-layer-controls">
      <label>X <input id="layerx-${sid}-${sn}" type="number" step="1" value="${Number(layer.x)||0}"></label>
      <label>Y <input id="layery-${sid}-${sn}" type="number" step="1" value="${Number(layer.y)||0}"></label>
      <label>Width <input id="layerw-${sid}-${sn}" type="number" min="100" max="1080" step="1" value="${Number(layer.width)||1080}"></label>
      <label>Height <input id="layerh-${sid}-${sn}" type="number" min="100" max="1920" step="1" value="${Number(layer.height)||1920}"></label>
    </div>
    <div class="qtm-layer-actions">
      <button class="vsm-mini" type="button" id="layerSave-${sid}-${sn}">💾 Position Save</button>
      <button class="vsm-mini" type="button" id="layerReset-${sid}-${sn}">↩️ Reset</button>
    </div>
    <div class="qtm-layer-help">🖱️ Image को सीधे drag करके जगह बदलें। X/Y और Size से exact adjustment करें।</div>
    <div class="qtm-layer-default-note" style="margin-top:6px;font-size:11px;color:#475569;">${inherited?'⭐ Scene 1 की position अभी default के रूप में लगी है। इस Scene को Save करने पर इसकी अपनी अलग position बन जाएगी।':sn===1?'⭐ Scene 1 की saved position आगे के scenes के लिए default रहेगी।':'🔧 इस Scene की अपनी saved position है। इसे अलग से बदला जा सकता है।'}</div>`;

  const stage=editor.querySelector(`#layerstage-${sid}-${sn}`), img=editor.querySelector(`#layerimg-${sid}-${sn}`);
  const xIn=editor.querySelector(`#layerx-${sid}-${sn}`), yIn=editor.querySelector(`#layery-${sid}-${sn}`), wIn=editor.querySelector(`#layerw-${sid}-${sn}`), hIn=editor.querySelector(`#layerh-${sid}-${sn}`);
  const apply=()=>{ img.style.left=`${(Number(xIn.value)||0)/1080*100}%`; img.style.top=`${(Number(yIn.value)||0)/1920*100}%`; img.style.width=`${(Number(wIn.value)||1080)/1080*100}%`; img.style.height=`${(Number(hIn.value)||1920)/1920*100}%`; };
  [xIn,yIn,wIn,hIn].forEach(el=>el.addEventListener('input',apply));
  apply();

  let dragging=false,startX=0,startY=0,baseX=0,baseY=0;
  const pointerStart=e=>{dragging=true; img.setPointerCapture?.(e.pointerId); startX=e.clientX; startY=e.clientY; baseX=Number(xIn.value)||0;baseY=Number(yIn.value)||0;e.preventDefault();};
  const pointerMove=e=>{if(!dragging)return; const dx=(e.clientX-startX)/stage.clientWidth*1080; const dy=(e.clientY-startY)/stage.clientHeight*1920; xIn.value=Math.round(Math.max(0,Math.min(1080-(Number(wIn.value)||1080),baseX+dx))); yIn.value=Math.round(Math.max(0,Math.min(1920-(Number(hIn.value)||1920),baseY+dy))); apply();};
  const pointerEnd=()=>{dragging=false;};
  img.addEventListener('pointerdown',pointerStart); img.addEventListener('pointermove',pointerMove); img.addEventListener('pointerup',pointerEnd); img.addEventListener('pointercancel',pointerEnd);

  const bgVideo=stage.querySelector('video');
  if(bgVideo){
    // IMPORTANT: the template is already intended to be 9:16. Do not let the
    // browser create letterbox/black areas around it. The editor canvas itself
    // is the 1080x1920 frame, so the video is stretched only to that same
    // frame. This keeps the editor coordinates identical to the final render.
    bgVideo.style.objectFit='fill';
    bgVideo.style.objectPosition='center center';
    bgVideo.style.background='transparent';
    bgVideo.addEventListener('loadedmetadata',()=>{
      const sw=Number(bgVideo.videoWidth)||0, sh=Number(bgVideo.videoHeight)||0;
      const badge=document.createElement('div');
      badge.className='qtm-video-size-note';
      badge.textContent=sw&&sh?`Template: ${sw} × ${sh} (${(sw/sh).toFixed(3)})`:'Template size पढ़ा जा रहा है…';
      editor.insertBefore(badge, editor.querySelector('.qtm-layer-controls'));
    },{once:true});
  }

  editor.querySelector(`#layerSave-${sid}-${sn}`).onclick=async()=>{
    const btn=editor.querySelector(`#layerSave-${sid}-${sn}`);
    btn.disabled=true; btn.textContent='⏳ Saving...';
    try{
      await saveLayerSettings(qid,sn,{x:Number(xIn.value)||0,y:Number(yIn.value)||0,width:Number(wIn.value)||1080,height:Number(hIn.value)||1920});
      btn.textContent='✅ Saved';
      setTimeout(()=>{btn.disabled=false;btn.textContent='💾 Position Save';},1200);
    }catch(_){
      btn.disabled=false;btn.textContent='💾 Position Save';
    }
  };
  editor.querySelector(`#layerReset-${sid}-${sn}`).onclick=()=>{
    if(sn>1 && layerRowsByScene[1]){
      const d=layerRowsByScene[1]; xIn.value=Number(d.x)||0; yIn.value=Number(d.y)||0; wIn.value=Number(d.width)||1080; hIn.value=Number(d.height)||1920;
    }else{xIn.value=0;yIn.value=0;wIn.value=1080;hIn.value=1920;}
    apply();
  };
}

async function saveLayerSettings(qid,sn,vals){
  const st=document.getElementById(`qimagestatus-${safeId(qid)}-${sn}`);
  try{
    const payload={question_id:qid,scene_number:sn,x:vals.x,y:vals.y,width:vals.width,height:vals.height,z_index:10,is_active:true,updated_at:new Date().toISOString()};
    // Do not request a returned row here. This avoids failures caused by a
    // SELECT/RETURNING restriction even when INSERT/UPDATE policies are valid.
    const {error}=await sb.from('video_question_scene_layers')
      .upsert(payload,{onConflict:'question_id,scene_number',ignoreDuplicates:false});
    if(error)throw error;
    layerRowsByScene[sn]={...payload};
    if(st)st.textContent=`✅ Scene ${sn} image position saved`;
    return payload;
  }catch(e){
    console.error('Layer save failed:',e);
    const msg=e?.message||String(e);
    if(st)st.textContent=`⚠️ Layer save failed: ${msg}`;
    alert(`Scene ${sn} Position Save failed:\n${msg}`);
    throw e;
  }
}

async function generateSceneImage(sn){
  if(!selectedQuestion)return;
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  const st=document.getElementById(`qimagestatus-${sid}-${sn}`), box=document.getElementById(`qimage-${sid}-${sn}`);
  st.textContent='⏳ Image generate और save हो रही है…';
  try{
    const canvas=drawQuestionImage(selectedQuestion,sn);
    const blob=await canvasToBlob(canvas);
    const fn=`scene-${sn}.png`;
    const path=imageStoragePath(qid,sn);
    const {data:oldRows,error:oldErr}=await sb.from('video_question_scene_images')
      .select('id,storage_path').eq('question_id',qid).eq('scene_number',sn).limit(1);
    if(oldErr)throw oldErr;
    const old=oldRows?.[0]||null;
    const {error:uploadErr}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:'image/png',upsert:true,cacheControl:'31536000'});
    if(uploadErr)throw uploadErr;
    const payload={question_id:qid,scene_number:sn,file_name:fn,storage_path:path,image_width:1080,image_height:1920,is_active:true,updated_at:new Date().toISOString()};
    // Always UPSERT by the Question + Scene unique key. This prevents duplicate-key
    // errors even if an old record already exists or Generate/Regenerate is clicked quickly.
    const {data:savedRow,error:dbErr}=await sb.from('video_question_scene_images')
      .upsert({...payload,created_at:old?.created_at||new Date().toISOString()},{onConflict:'question_id,scene_number'})
      .select('id,question_id,scene_number,file_name,storage_path,is_active,image_width,image_height,created_at,updated_at')
      .single();
    if(dbErr)throw dbErr;
    renderSceneImage(qid,sn,savedRow||payload);
    document.getElementById('finalStatus').textContent=`✅ Scene ${sn} image saved. अब यही image बाद में video layer में लगाई जा सकती है।`;
  }catch(e){
    console.error('Image generate failed:',e);st.textContent='❌ Image generate failed';alert(`Scene ${sn} image generate failed: ${e.message||e}`);
  }
}

// Inline HTML buttons need a window-level handler because this file uses an IIFE.
window.generateSceneImage = generateSceneImage;

async function getUploadedVideoDuration(file){
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const v=document.createElement('video');
    v.preload='metadata';
    v.onloadedmetadata=()=>{const d=Number(v.duration)||0;URL.revokeObjectURL(url);resolve(d);};
    v.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Video duration पढ़ी नहीं जा सकी।'));};
    v.src=url;
  });
}

async function saveQuestionScene(qid,sn,file){
  if(sn!==1){alert('केवल Scene 1 में 45-sec Master Video upload होगा।');return;}
  if(!file.type.startsWith('video/')){alert('केवल video file चुनें।');return;}
  // Regression guard: Scene templates are full master videos, not 8-second clips.
  // Reject short uploads before they can replace the previously saved 45-sec video.
  try{
    const duration=await getUploadedVideoDuration(file);
    if(duration<40){
      alert(`यह video केवल ${duration.toFixed(1)} सेकंड का है। Ganit Setu में Scene ${sn} के लिए पूरा 45-second master video upload करें। पुराना video सुरक्षित रखा गया है।`);
      return;
    }
  }catch(e){
    alert(e.message||'Video duration check failed.');
    return;
  }
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
  const previewBtn=document.getElementById('finalPreviewBtn');
  if(previewBtn)previewBtn.disabled=!selectedQuestion;
}

function resetFinalUI(){
  if(finalObjectUrl){URL.revokeObjectURL(finalObjectUrl);finalObjectUrl=null;}
  finalBlob=null;
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">पहले ⚡ Quick Preview देखें।</div>';
  const d=document.getElementById('downloadFinalBtn');
  d.disabled=true;
  d.textContent='⬇️ Quick Preview Download करें';
  d.dataset.ready='0';
  document.getElementById('publishFinalBtn').disabled=true;
  document.getElementById('finalStatus').textContent='⚡ Scene 1 का 45-sec Master Video + पाँचों saved Scene Images preview में दिखेंगी।';
}

function getMasterRow(){return videoRowsByScene?.[1]||null;}

function getTimelineItems(){
  const windows=[[0,8],[9,17],[18,26],[27,35],[36,null]];
  return windows.map((w,i)=>{
    const sn=i+1;
    const imageRow=imageRowsByScene?.[sn]||null;
    const own=layerRowsByScene?.[sn]||null;
    const masterLayer=layerRowsByScene?.[1]||null;
    const layer=(own&&own.x!==undefined)?own:(masterLayer||{x:0,y:0,width:1080,height:1920});
    return {sn,start:w[0],end:w[1],imageRow,layer};
  });
}

function quickLayerStyle(layer){
  const x=Math.max(0,Math.min(1080,Number(layer?.x)||0));
  const y=Math.max(0,Math.min(1920,Number(layer?.y)||0));
  const w=Math.max(1,Math.min(1080,Number(layer?.width)||1080));
  const h=Math.max(1,Math.min(1920,Number(layer?.height)||1920));
  return {left:(x/1080*100)+'%',top:(y/1920*100)+'%',width:(w/1080*100)+'%',height:(h/1920*100)+'%'};
}

function syncQuickImages(video,items){
  const t=Number(video.currentTime)||0;
  items.forEach(item=>{
    const img=document.getElementById(`qtm-quick-img-${item.sn}`);
    if(!img)return;
    img.style.display=(item.imageRow&&t>=item.start&&(item.end===null||t<item.end))?'block':'none';
  });
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ Master Video और 5 saved images पढ़ी जा रही हैं…';
  try{
    const master=getMasterRow();
    if(!master?.storage_path)throw new Error('Scene 1 में पूरा 45-second Master Video upload करें।');
    const items=getTimelineItems();
    const missing=items.filter(x=>!x.imageRow);
    if(missing.length)throw new Error(`Scene ${missing.map(x=>x.sn).join(', ')} की image saved नहीं है।`);

    const masterUrl=publicUrl(master.storage_path);
    preview.innerHTML=`
      <div id="qtmQuickPreviewStage" style="position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;border-radius:10px;overflow:hidden;">
        <video id="qtmMasterPreviewVideo" playsinline preload="metadata" src="${masterUrl}"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;background:#000;display:block;"></video>
        <div id="qtmQuickOverlay" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
          ${items.map(item=>{const st=quickLayerStyle(item.layer);const url=imagePublicUrl(item.imageRow.storage_path);return `<img id="qtm-quick-img-${item.sn}" src="${url}" alt="Scene ${item.sn}" style="position:absolute;left:${st.left};top:${st.top};width:${st.width};height:${st.height};object-fit:fill;display:none;">`;}).join('')}
        </div>
        <div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;z-index:20;">
          <button id="qtmQuickPlayBtn" type="button" style="border:0;border-radius:12px;padding:12px 18px;background:rgba(0,0,0,.75);color:#fff;font-size:18px;">▶</button>
          <button id="qtmQuickFullscreenBtn" type="button" style="border:0;border-radius:12px;padding:12px 18px;background:rgba(0,0,0,.75);color:#fff;font-size:16px;">⛶ Fullscreen</button>
        </div>
      </div>
      <div style="font-size:12px;color:#64748b;text-align:center;margin-top:8px;">⚡ Quick Preview — Master Video + पाँचों Scene Images। कोई scene-wise video render नहीं।</div>`;

    const video=document.getElementById('qtmMasterPreviewVideo');
    const stage=document.getElementById('qtmQuickPreviewStage');
    const playBtn=document.getElementById('qtmQuickPlayBtn');
    const fsBtn=document.getElementById('qtmQuickFullscreenBtn');
    const sync=()=>syncQuickImages(video,items);
    video.addEventListener('timeupdate',sync);
    video.addEventListener('seeking',sync);
    video.addEventListener('loadedmetadata',()=>{
      sync();
      const d=Number(video.duration)||0;
      status.textContent=d>=44?'✅ Quick Preview तैयार है। Play दबाकर पाँचों images देखें।':`⚠️ Master Video ${d.toFixed(2)} sec है; लगभग 45 sec अपेक्षित है।`;
    },{once:true});
    video.addEventListener('error',()=>status.textContent='❌ Master Video browser में load नहीं हुआ।',{once:true});
    playBtn.onclick=async()=>{try{if(video.paused)await video.play();else video.pause();}catch(e){status.textContent='❌ Video play नहीं हुआ';}};
    video.addEventListener('play',()=>playBtn.textContent='⏸');
    video.addEventListener('pause',()=>playBtn.textContent='▶');
    fsBtn.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch(e){status.textContent='❌ Fullscreen उपलब्ध नहीं है';}};
    document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===stage){stage.style.width='100vw';stage.style.height='100vh';stage.style.aspectRatio='auto';stage.style.borderRadius='0';}else{stage.style.width='min(100%,540px)';stage.style.height='';stage.style.aspectRatio='9/16';stage.style.borderRadius='10px';}});

    sync();
    const d=document.getElementById('downloadFinalBtn');
    d.disabled=false;
    d.dataset.ready='0';
    d.title='यह button preview को MP4 में बनाकर download करेगा।';
  }catch(e){
    console.error('Quick Preview failed:',e);
    preview.innerHTML=`<div class="qtm-empty">❌ ${esc(e.message||String(e))}</div>`;
    status.textContent='❌ Quick Preview failed';
  }finally{btn.disabled=false;}
}

async function renderCompositeMp4(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const downloadBtn=document.getElementById('downloadFinalBtn');
  if(downloadBtn)downloadBtn.disabled=true;
  status.textContent='⏳ Composite MP4 render शुरू… 0%';
  let ffmpeg=null;
  try{
    const master=getMasterRow();
    const items=getTimelineItems();
    if(!master?.storage_path)throw new Error('Scene 1 में 45-second Master Video upload करें।');
    const missing=items.filter(x=>!x.imageRow);
    if(missing.length)throw new Error(`Scene ${missing.map(x=>x.sn).join(', ')} की image saved नहीं है।`);
    if(!window.FFmpegWASM||!window.FFmpegUtil)throw new Error('Video compiler library load नहीं हुई। Page refresh करके फिर प्रयास करें।');

    const {FFmpeg}=window.FFmpegWASM;
    const {fetchFile}=window.FFmpegUtil;
    ffmpeg=new FFmpeg();
    ffmpeg.on('log',({message})=>console.log('[Ganit Setu FFmpeg]',message));
    ffmpeg.on('progress',({progress})=>{
      const pct=Math.max(0,Math.min(99,Math.floor((Number(progress)||0)*99)));
      status.textContent=`⏳ Composite MP4 render हो रहा है… ${pct}%`;
    });
    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    const classWorkerURL=new URL('assets/js/ffmpeg-class-worker.js?v=20261002-28',window.location.href).href;
    const timeout=(promise,ms,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),ms))]);
    await timeout(ffmpeg.load({coreURL:`${base}/ffmpeg-core.js`,wasmURL:`${base}/ffmpeg-core.wasm`,classWorkerURL}),60000,'FFmpeg worker 60 सेकंड में start नहीं हुआ।');
    await ffmpeg.writeFile('master_original.mp4',await fetchFile(publicUrl(master.storage_path)));

    const windows=[[0,8],[9,17],[18,26],[27,35],[36,null]];
    const filters=['[0:v]scale=1080:1920,setsar=1[base]'];
    let prev='base';
    for(let i=0;i<5;i++){
      const item=items[i],sn=item.sn,l=item.layer||{};
      const x=Math.max(0,Math.min(1080,Math.round(Number(l.x)||0)));
      const y=Math.max(0,Math.min(1920,Math.round(Number(l.y)||0)));
      const w=Math.max(1,Math.min(1080,Math.round(Number(l.width)||1080)));
      const h=Math.max(1,Math.min(1920,Math.round(Number(l.height)||1920)));
      await ffmpeg.writeFile(`img${sn}.png`,await fetchFile(imagePublicUrl(item.imageRow.storage_path)));
      const imgLabel=`imgv${sn}`,outLabel=`ov${sn}`;
      filters.push(`[${i+1}:v]scale=${w}:${h},setsar=1[${imgLabel}]`);
      const [start,end]=windows[i];
      const enable=end===null?`gte(t,${start})`:`between(t,${start},${end})`;
      filters.push(`[${prev}][${imgLabel}]overlay=${x}:${y}:format=auto:enable='${enable}'[${outLabel}]`);
      prev=outLabel;
    }
    filters.push(`[${prev}]format=yuv420p[vout]`);
    const args=['-i','master_original.mp4'];
    for(let sn=1;sn<=5;sn++)args.push('-loop','1','-i',`img${sn}.png`);
    args.push('-filter_complex',filters.join(';'),'-map','[vout]','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','copy','-movflags','+faststart','final.mp4');

    status.textContent='⏳ Video render पूरा किया जा रहा है…';
    await timeout(ffmpeg.exec(args),300000,'Composite MP4 render 5 मिनट में पूरा नहीं हुआ।');
    status.textContent='⏳ Final MP4 file तैयार हो रही है…';
    const data=await ffmpeg.readFile('final.mp4');
    if(!data||!data.length)throw new Error('FFmpeg ने खाली final.mp4 बनाया।');
    finalBlob=new Blob([data],{type:'video/mp4'});
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(finalBlob);
    preview.innerHTML=`<div style="position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;border-radius:10px;overflow:hidden;"><video controls playsinline preload="metadata" src="${finalObjectUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;background:#000;"></video></div>`;
    if(downloadBtn){downloadBtn.disabled=false;downloadBtn.dataset.ready='1';}
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('publishFinalBtn').classList.remove('qtm-publish-disabled');
    status.textContent=`✅ Composite MP4 तैयार है — ${Math.max(0.1,finalBlob.size/1024/1024).toFixed(1)} MB. Download दबाएँ।`;
  }catch(e){
    console.error('Composite MP4 render failed:',e);
    status.textContent=`❌ MP4 तैयार नहीं हुआ: ${e.message||e}`;
    alert(`MP4 तैयार नहीं हुआ।\n\n${e.message||e}`);
  }finally{
    try{if(ffmpeg)ffmpeg.terminate();}catch(_){ }
    if(downloadBtn && !finalObjectUrl)downloadBtn.disabled=false;
  }
}

async function downloadFinal(){
  if(!finalObjectUrl){await renderCompositeMp4();}
  if(!finalObjectUrl)return;
  const status=document.getElementById('finalStatus');
  try{
    const a=document.createElement('a');
    a.href=finalObjectUrl;
    a.download=`question-${questionId(selectedQuestion)}-final.mp4`;
    a.rel='noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    status.textContent='✅ Composite MP4 download शुरू किया गया है।';
  }catch(e){
    console.error('Download failed:',e);
    window.open(finalObjectUrl,'_blank','noopener');
  }
}

function publishFinal(){
  alert('Final video तैयार है। Publishing button रखा गया है; Facebook / YouTube / WhatsApp Channel publishing को अगले चरण में मौजूदा publishing workflow से जोड़ा जाएगा।');
}

window.addEventListener('DOMContentLoaded',init);
})();