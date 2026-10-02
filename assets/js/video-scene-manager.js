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

  const actionWrap=finalBtn?.parentElement;
  if(actionWrap && !document.getElementById('permanentMasterBtn')){
    const p=document.createElement('button');
    p.id='permanentMasterBtn';
    p.type='button';
    p.className='vsm-btn vsm-secondary';
    p.textContent='💾 Permanent MP4 बनाएं';
    p.disabled=false;
    p.addEventListener('click',buildPermanentMasterVideo);
    actionWrap.insertBefore(p,document.getElementById('downloadFinalBtn'));
  }
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
  picker.innerHTML='<span class="qtm-empty">Supabase से आज का centrally selected question पढ़ा जा रहा है…</span>';

  try{
    // Daily question selection is centrally stored in Supabase.
    // localStorage is intentionally NOT used as the source of truth.
    const {data:selection,error:selectionError}=await sb.rpc(
      'get_or_create_video_daily_questions',
      {p_count:count}
    );
    if(selectionError)throw selectionError;

    const selectedRows=Array.isArray(selection)?selection:[];
    if(!selectedRows.length)throw new Error('आज के लिए कोई centrally selected question नहीं मिला।');

    const ids=selectedRows
      .sort((a,b)=>Number(a.slot_no||0)-Number(b.slot_no||0))
      .map(r=>String(r.question_id));

    const {data:rows,error}=await sb.from('questions').select('*').in('id',ids);
    if(error)throw error;
    const byId=new Map((Array.isArray(rows)?rows:[]).map(q=>[questionId(q),q]));
    questions=ids.map(id=>byId.get(String(id))).filter(Boolean).slice(0,count);

    if(!questions.length)throw new Error('Selected question database में नहीं मिला।');

    picker.innerHTML=questions.map((q,i)=>
      `<button type="button" class="vsm-btn vsm-secondary" data-qidx="${i}">Question ${i+1} — ${esc(questionId(q))}</button>`
    ).join('');

    picker.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click',()=>openQuestion(Number(b.dataset.qidx)));
    });

    status.textContent=`✅ आज के centrally selected ${questions.length} question(s) loaded — सभी devices पर यही selection रहेगा।`;
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
  document.getElementById('sceneGrid').innerHTML=scenes.map(s=>{
    const isMaster=s.n===1;
    return `
    <div class="qtm-scene" id="qscene-${sid}-${s.n}">
      <h4>Scene ${s.n} — ${esc(s.name)}</h4>
      <div class="qtm-scene-body">
        <div class="qtm-media-box">
          <div class="qtm-media-label">🎬 ${isMaster?'MASTER VIDEO PREVIEW':'MASTER VIDEO'} </div>
          <div id="qpreview-${sid}-${s.n}">
            <div class="qtm-empty">${isMaster?'अभी 45-sec master video save नहीं है':'Scene 1 का 45-sec master video ही इस Scene के साथ इस्तेमाल होगा। अलग video upload नहीं चाहिए।'}</div>
          </div>
          ${isMaster ? `
          <input class="qtm-file" id="file-${sid}-${s.n}" type="file" accept="video/mp4,video/*">
          <div class="qtm-upload"><button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-${s.n}').click()">⬆️ Upload 45-sec Master Video</button></div>
          ` : ''}
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
    </div>`;
  }).join('');

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
      ? '<span class="qtm-badge qtm-saved">ℹ️ पुराना Scene Video मौजूद है, लेकिन Final Preview में इस्तेमाल नहीं होगा।</span>'
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
      <button class="vsm-mini" type="button" onclick="document.getElementById('file-${sid}-1').click()">🔄 Replace</button>
    </div>`;
  status.innerHTML='<span class="qtm-badge qtm-saved">✅ 45-sec Master Video Saved</span>';
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
  const selected=!!selectedQuestion;
  const finalBtn=document.getElementById('finalPreviewBtn');
  if(finalBtn)finalBtn.disabled=!selected;
  const permanent=document.getElementById('permanentMasterBtn');
  if(permanent)permanent.disabled=!selected;
}

function resetFinalUI(){
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">पहले ⚡ Quick Preview देखें।</div>';
  document.getElementById('downloadFinalBtn').disabled=true;
  document.getElementById('publishFinalBtn').disabled=true;
  document.getElementById('finalStatus').textContent='⚡ केवल Scene 1 का 45-sec Master Video रहेगा; Scene 2–5 में सिर्फ Images रहेंगी।';
}

function getMasterRow(){
  return videoRowsByScene?.[1] || null;
}

function getTimelineItems(){
  const windows=[[0,8],[9,17],[18,26],[27,35],[36,44]];
  return windows.map((w,i)=>{
    const sn=i+1;
    const imageRow=imageRowsByScene?.[sn]||null;
    const own=layerRowsByScene?.[sn]||null;
    const masterLayer=layerRowsByScene?.[1]||null;
    const layer=(own && own.x!==undefined) ? own : (masterLayer||{x:0,y:0,width:1080,height:1920});
    return {sn,start:w[0],end:w[1],imageRow,layer};
  });
}

function quickLayerStyle(layer){
  const x=Math.max(0,Math.min(1080,Number(layer?.x)||0));
  const y=Math.max(0,Math.min(1920,Number(layer?.y)||0));
  const w=Math.max(1,Math.min(1080,Number(layer?.width)||1080));
  const h=Math.max(1,Math.min(1920,Number(layer?.height)||1920));
  return {
    left:(x/1080*100)+'%',
    top:(y/1920*100)+'%',
    width:(w/1080*100)+'%',
    height:(h/1920*100)+'%'
  };
}

function syncQuickImages(video,items){
  const t=Number(video.currentTime)||0;
  items.forEach(item=>{
    const img=document.getElementById(`qtm-quick-img-${item.sn}`);
    if(!img)return;
    const visible=item.imageRow && t>=item.start && t<item.end;
    img.style.display=visible?'block':'none';
  });
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ Master video और 5 images तैयार की जा रही हैं…';

  try{
    const master=getMasterRow();
    if(!master?.storage_path){
      throw new Error('Scene 1 में 45-second Master Video upload करें।');
    }

    const items=getTimelineItems();
    const missing=items.filter(x=>!x.imageRow);
    if(missing.length){
      throw new Error(`Scene ${missing.map(x=>x.sn).join(', ')} की image अभी saved नहीं है।`);
    }

    const masterUrl=publicUrl(master.storage_path);
    preview.innerHTML=`
      <div class="qtm-quick-preview" style="position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;border-radius:10px;overflow:hidden;">
        <video id="qtmMasterPreviewVideo" controls controlsList="nofullscreen" playsinline preload="metadata"
          src="${masterUrl}"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;background:#000;display:block;"></video>
        <button id="qtmQuickFullscreenBtn" type="button" aria-label="Fullscreen"
          style="position:absolute;right:10px;bottom:10px;z-index:30;width:42px;height:42px;border:0;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font-size:22px;cursor:pointer;line-height:42px;padding:0;">⛶</button>
        <div id="qtmQuickOverlay" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;">
          ${items.map(item=>{
            const st=quickLayerStyle(item.layer);
            const url=imagePublicUrl(item.imageRow.storage_path);
            return `<img id="qtm-quick-img-${item.sn}" src="${url}" alt="Scene ${item.sn}"
              style="position:absolute;left:${st.left};top:${st.top};width:${st.width};height:${st.height};object-fit:fill;display:none;">`;
          }).join('')}
        </div>
      </div>
      <div style="font-size:12px;color:#64748b;text-align:center;margin-top:8px;">
        ⚡ Quick Preview — केवल Scene 1 का 45-sec Master Video + पाँचों Scene Images। कोई scene-wise video render नहीं।
      </div>`;

    const video=document.getElementById('qtmMasterPreviewVideo');
    const fullscreenBtn=document.getElementById('qtmQuickFullscreenBtn');
    if(fullscreenBtn){
      fullscreenBtn.addEventListener('click',async()=>{
        const wrap=video.closest('.qtm-quick-preview');
        try{
          if(document.fullscreenElement){
            await document.exitFullscreen();
          }else if(wrap?.requestFullscreen){
            await wrap.requestFullscreen();
          }
        }catch(e){ console.warn('Quick Preview fullscreen failed:',e); }
      });
      document.addEventListener('fullscreenchange',()=>{
        fullscreenBtn.textContent=document.fullscreenElement?'✕':'⛶';
      });
    }
    const sync=()=>syncQuickImages(video,items);
    video.addEventListener('timeupdate',sync);
    video.addEventListener('seeking',sync);
    video.addEventListener('loadedmetadata',()=>{
      sync();
      const d=Number(video.duration)||0;
      status.textContent=d>=44
        ? '✅ Quick Preview तैयार है। Play दबाकर पाँचों images को एक ही Master Video पर देखें।'
        : `⚠️ Master Video ${d.toFixed(2)} sec है; लगभग 45 sec Master Video अपेक्षित है।`;
    },{once:true});
    video.addEventListener('error',()=>{
      status.textContent='❌ Master Video browser में load नहीं हुआ। Scene 1 का saved video जाँचें।';
    },{once:true});

    // Do not call FFmpeg, fetchFile, or any encode operation here.
    sync();
  }catch(e){
    console.error('Quick Preview failed:',e);
    preview.innerHTML=`<div class="qtm-empty">❌ ${esc(e.message||String(e))}</div>`;
    status.textContent='❌ Quick Preview failed';
  }finally{
    btn.disabled=false;
  }
}

async function buildPermanentMasterVideo(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('permanentMasterBtn');
  if(btn)btn.disabled=true;
  status.textContent='⏳ Permanent MP4 के लिए केवल 45-sec Master Video render हो रहा है…';

  try{
    const master=getMasterRow();
    if(!master?.storage_path)throw new Error('Scene 1 में 45-second Master Video upload करें।');
    const items=getTimelineItems();
    const missing=items.filter(x=>!x.imageRow);
    if(missing.length)throw new Error(`Scene ${missing.map(x=>x.sn).join(', ')} की image saved नहीं है।`);
    if(!window.FFmpegWASM || !window.FFmpegUtil)throw new Error('FFmpeg library load नहीं हुई।');

    const {FFmpeg}=window.FFmpegWASM;
    const {fetchFile}=window.FFmpegUtil;
    const ffmpeg=new FFmpeg();
    ffmpeg.on('progress',({progress})=>{
      const pct=Math.max(0,Math.min(100,Math.round((Number(progress)||0)*100)));
      status.textContent=`⏳ Permanent MP4 render… ${pct}%`;
    });

    const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    const classWorkerURL=new URL('assets/js/ffmpeg-class-worker.js?v=20260929-23',window.location.href).href;
    const coreURL=`${base}/ffmpeg-core.js`, wasmURL=`${base}/ffmpeg-core.wasm`;
    await ffmpeg.load({coreURL,wasmURL,classWorkerURL});

    await ffmpeg.writeFile('master.mp4',await fetchFile(publicUrl(master.storage_path)));
    const filters=['[0:v]scale=1080:1920,setsar=1[base]'];
    let prev='base';
    for(let i=0;i<items.length;i++){
      const item=items[i], sn=item.sn;
      const l=item.layer;
      const x=Math.max(0,Math.round(Number(l?.x)||0));
      const y=Math.max(0,Math.round(Number(l?.y)||0));
      const w=Math.max(1,Math.min(1080,Math.round(Number(l?.width)||1080)));
      const h=Math.max(1,Math.min(1920,Math.round(Number(l?.height)||1920)));
      const name=`img${sn}.png`;
      await ffmpeg.writeFile(name,await fetchFile(imagePublicUrl(item.imageRow.storage_path)));
      const imgLabel=`imgv${sn}`, outLabel=`ov${sn}`;
      filters.push(`[${i+1}:v]scale=${w}:${h},setsar=1[${imgLabel}]`);
      filters.push(`[${prev}][${imgLabel}]overlay=${x}:${y}:format=auto:enable='between(t,${item.start},${item.end})'[${outLabel}]`);
      prev=outLabel;
    }

    const args=['-i','master.mp4'];
    items.forEach(item=>args.push('-loop','1','-i',`img${item.sn}.png`));
    args.push('-filter_complex',filters.join(';'),'-map',`[${prev}]`,'-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac','-t','45','-movflags','+faststart','final.mp4');
    await ffmpeg.exec(args);

    const data=await ffmpeg.readFile('final.mp4');
    finalBlob=new Blob([data.buffer],{type:'video/mp4'});
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(finalBlob);
    preview.innerHTML=`<video controls autoplay src="${finalObjectUrl}" style="display:block;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;"></video>`;
    document.getElementById('downloadFinalBtn').disabled=false;
    document.getElementById('downloadFinalBtn').dataset.single='0';
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('publishFinalBtn').classList.remove('qtm-publish-disabled');
    status.textContent='✅ Permanent MP4 तैयार है — एक Master Video में पाँचों images लग गई हैं।';
    try{ffmpeg.terminate();}catch(_){}
  }catch(e){
    console.error('Permanent master render failed:',e);
    status.textContent=`❌ Permanent MP4 failed: ${e.message||e}`;
  }finally{
    if(btn)btn.disabled=false;
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