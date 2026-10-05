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
const questionText=q=>String(q.question_text ?? q.question ?? q.text ?? q.title ?? 'Question data उपलब्ध');
const questionClass=q=>String(q.class_level ?? q.class ?? q.class_name ?? '');
const fileNameFor=file=>`${Date.now()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`;
const storagePath=(qid,sn,fn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/scene-${sn}/${fn}`;
const publicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;
const imageStoragePath=(qid,sn)=>`video-scenes/questions/${encodeURIComponent(String(qid))}/images/scene-${sn}.png`;
const imagePublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`;
const pickField=(q, keys, fallback='')=>{for(const k of keys){if(q && q[k]!==undefined && q[k]!==null && String(q[k]).trim()!=='')return String(q[k]);}return fallback;};
const optionText=(q,n)=>pickField(q,[`option_${n}`,`option${n}`,`option_${String.fromCharCode(96+n)}`,`option${String.fromCharCode(96+n)}`,`choice_${n}`,`choice${n}`,`answer_option_${n}`],'');
const answerText=q=>pickField(q,['correct_answer','correctAnswer','answer','correct_option','correct_option_text','right_answer'],'');
const correctOptionDisplay=q=>{
  const raw=answerText(q).trim();
  const letters=['A','B','C','D'];
  let idx=-1;
  const m=raw.match(/^(?:OPTION\s*)?([ABCD])(?:[\s\):.-]|$)/i);
  if(m) idx=letters.indexOf(m[1].toUpperCase());
  if(idx<0){
    const low=raw.toLowerCase();
    for(let i=0;i<4;i++){
      const opt=optionText(q,i+1).trim().toLowerCase();
      if(opt && low===opt) {idx=i; break;}
      if(opt && low.includes(opt) && opt.length>2) {idx=i; break;}
    }
  }
  if(idx>=0){
    const opt=optionText(q,idx+1).trim();
    return opt ? `${letters[idx]}) ${opt}` : letters[idx];
  }
  return raw;
};
const hintText=q=>pickField(q,['hint','question_hint','explanation_hint'],'Hint उपलब्ध नहीं है।');
const explanationText=q=>pickField(q,['explanation','solution','answer_explanation'],'');
const chapterText=q=>pickField(q,['chapter_name','chapter','chapter_title'],'');
const sceneImageText=(q,sn)=>{
  const qt=questionText(q);
  const a=answerText(q);
  if(sn===1)return {title:'आज का प्रश्न',body:qt};
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

function chapterNumber(q){
  return pickField(q,['chapter_number','chapter_no','chapter_num','chapterNumber'],'');
}

function formatClassLabel(q){
  const cls=questionClass(q);
  if(!cls)return '';
  const n=String(cls).replace(/[^0-9]/g,'');
  return n ? `कक्षा ${n}वीं` : `कक्षा ${cls}`;
}

function drawQuestionImage(q,sn){
  const W=1080,H=1920;
  const c=document.createElement('canvas'); c.width=W;c.height=H;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,W,H);
  const {title,body}=sceneImageText(q,sn);

  // Scenes 1–4: title is separate. Only the main content gets the soft shadow.
  // The main content is centered in the visual space between the title and
  // the girl's fixed position in the master video. The shadow follows content size.
  if(sn>=1 && sn<=4){
    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    const metaY=225, metaH=72, gap=18;
    const meta=[
      {text:formatClassLabel(q),w:270,fill:'#e8f3ff',stroke:'#5aa7e8',textColor:'#145ea8'},
      {text:chapterNumber(q)?`अध्याय ${chapterNumber(q)}`:'अध्याय',w:220,fill:'#fff2cc',stroke:'#e7b84b',textColor:'#8a5a00'},
      {text:chapterText(q)||'अध्याय का नाम',w:500,fill:'#eaf7e8',stroke:'#75bd72',textColor:'#28702a'}
    ];
    let mx=(W-(meta.reduce((a,b)=>a+b.w,0)+gap*2))/2;
    for(const m of meta){
      ctx.fillStyle=m.fill;
      ctx.strokeStyle=m.stroke;
      ctx.lineWidth=3;
      ctx.beginPath();ctx.roundRect(mx,metaY,m.w,metaH,20);ctx.fill();ctx.stroke();
      ctx.fillStyle=m.textColor;
      ctx.font='800 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      const mt=wrapCanvasText(ctx,m.text,m.w-24,34,2);
      let my=metaY+metaH/2-(mt.length-1)*17;
      for(const line of mt){ctx.fillText(line,mx+m.w/2,my);my+=34;}
      mx+=m.w+gap;
    }

    // Title stays completely outside the content shadow.
    const sceneTitle = sn===1 ? 'आज का प्रश्न'
      : sn===2 ? 'विकल्प ध्यान से देखिए'
      : sn===3 ? 'Hint'
      : 'सही उत्तर';

    ctx.fillStyle='#1557a6';
    ctx.font='800 44px "Noto Sans Devanagari", "Mangal", sans-serif';
    ctx.fillText(sceneTitle,W/2,360);

    const contentW=W-170;
    let lines=[];
    let mainFont=48;
    let lineH=70;

    if(sn===1){
      ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      lines=wrapCanvasText(ctx,body,contentW-80,lineH,8);
    }else if(sn===2){
      const opts=[1,2,3,4].map(n=>optionText(q,n)).filter(v=>String(v||'').trim());
      const labels=['A','B','C','D'];
      ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      lines=opts.slice(0,4).map((value,i)=>`${labels[i]}) ${value}`);
    }else if(sn===3){
      ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      lines=wrapCanvasText(ctx,hintText(q),contentW-80,lineH,10);
    }else{
      ctx.font=`800 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      lines=wrapCanvasText(ctx,correctOptionDisplay(q),contentW-80,lineH,3);
      const exp=explanationText(q);
      if(exp){
        ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';
        const expLines=wrapCanvasText(ctx,exp,contentW-80,40,8);
        lines=[...lines,'',...expLines];
      }
    }

    // Keep the requested large size. Reduce only when a line physically
    // cannot fit inside the safe horizontal width.
    const fitWidth=contentW-80;
    const mainLines=()=>lines.filter(Boolean);
    ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
    while(mainFont>36 && mainLines().some(t=>ctx.measureText(t).width>fitWidth)){
      mainFont-=2;
      ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      if(sn===1) lines=wrapCanvasText(ctx,body,fitWidth,lineH,8);
      if(sn===2){
        const opts=[1,2,3,4].map(n=>optionText(q,n)).filter(v=>String(v||'').trim());
        const labels=['A','B','C','D'];
        lines=opts.slice(0,4).map((value,i)=>`${labels[i]}) ${value}`);
      }
      if(sn===3) lines=wrapCanvasText(ctx,hintText(q),fitWidth,lineH,10);
      if(sn===4){
        lines=wrapCanvasText(ctx,correctOptionDisplay(q),fitWidth,lineH,3);
        if(explanationText(q)){
          ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';
          lines=[...lines,'',...wrapCanvasText(ctx,explanationText(q),fitWidth,40,8)];
        }
      }
    }

    // The content midpoint is deliberately below the title and above the
    // girl's fixed lower-frame area. Long content expands equally upward/downward.
    const centerY=550;
    const contentLineH=(sn===4 && lines.some((_,i)=>i>0 && false)) ? 48 : lineH;
    const textH=lines.length*contentLineH;

    // No oval/card behind the main content.
    // Use a strong golden-yellow text shadow only, on all Scene 1–4 body text.
    ctx.save();
    ctx.shadowColor='rgba(245,180,0,0.95)';
    ctx.shadowBlur=12;
    ctx.shadowOffsetX=2;
    ctx.shadowOffsetY=3;

    let yy=centerY-textH/2+contentLineH/2;
    lines.forEach((line,index)=>{
      if(line===''){ yy+=contentLineH; return; }

      if(sn===4 && index===0){
        ctx.fillStyle='#16a34a';
        ctx.font=`800 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      }else if(sn===4){
        ctx.fillStyle=['#1557a6','#159447','#d97706','#c026d3'][Math.max(0,index-2)%4];
        ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';
      }else{
        ctx.fillStyle=sn===2
          ? ['#1557a6','#159447','#d97706','#c026d3'][index%4]
          : sn===3 ? ['#1557a6','#159447','#d97706','#c026d3'][index%4]
          : ['#1557a6','#159447','#d97706','#c026d3'][index%4];
        ctx.font=`700 ${mainFont}px "Noto Sans Devanagari", "Mangal", sans-serif`;
      }
      ctx.fillText(line,W/2,yy);
      yy+=contentLineH;
    });

    ctx.restore();
    return c;
  }

  // Scene 5: fixed, single-piece CTA composition.
  // Transparent background; no cards/boxes. The master video's logo remains visible.
  ctx.save();
  ctx.clearRect(0,0,W,H);
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  const centerX=W/2;

  // Scene 5: blue background shadow/glow removed for a clean fixed area.

  const drawDot=(x,y,r,color)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  };
  drawDot(170,285,13,'#e31e24');
  drawDot(910,300,11,'#f5b400');
  drawDot(135,840,10,'#1677d2');
  drawDot(945,830,13,'#159447');

  // The duplicate "गणित सेतु" heading is intentionally removed because
  // the master video already contains the logo above.
  // The remaining CTA composition is shifted upward into that freed space.

  // Both yellow divider lines are removed; the fixed area remains unchanged.

  ctx.font='900 48px "Noto Sans Devanagari", "Mangal", sans-serif';
  const y1=385;
  const parts1=[
    {t:'गणित को ',c:'#173f8f'},
    {t:'समझिए',c:'#e31e24'},
    {t:', सवालों को ',c:'#173f8f'},
    {t:'हल कीजिए',c:'#159447'}
  ];
  let total1=0; parts1.forEach(p=>{total1+=ctx.measureText(p.t).width;});
  let x1=centerX-total1/2;
  parts1.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,x1+ctx.measureText(p.t).width/2,y1);x1+=ctx.measureText(p.t).width;});

  ctx.font='700 38px "Noto Sans Devanagari", "Mangal", sans-serif';
  const y2=455;
  const parts2=[
    {t:'और ',c:'#334155'},
    {t:'सफलता',c:'#f08a00'},
    {t:' की ओर बढ़िए',c:'#334155'}
  ];
  let total2=0; parts2.forEach(p=>{total2+=ctx.measureText(p.t).width;});
  let x2=centerX-total2/2;
  parts2.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,x2+ctx.measureText(p.t).width/2,y2);x2+=ctx.measureText(p.t).width;});

  ctx.font='800 36px "Noto Sans Devanagari", "Mangal", sans-serif';
  const flowY=585;
  const flowParts=[
    {t:'सोचिए',c:'#e31e24'},{t:'  •  ',c:'#f5b400'},
    {t:'समझिए',c:'#1677d2'},{t:'  •  ',c:'#f5b400'},
    {t:'सीखिए',c:'#159447'}
  ];
  let flowW=0; flowParts.forEach(p=>{flowW+=ctx.measureText(p.t).width;});
  let fx=centerX-flowW/2;
  flowParts.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,fx+ctx.measureText(p.t).width/2,flowY);fx+=ctx.measureText(p.t).width;});

  ctx.font='800 42px "Noto Sans Devanagari", "Mangal", sans-serif';
  const ctaY=730;
  ctx.fillStyle='#173f8f';
  ctx.fillText('आज ही जुड़िए!',centerX,ctaY);

  ctx.font='700 30px "Noto Sans Devanagari", "Mangal", sans-serif';
  const actionY=815;
  const actionParts=[
    {t:'फॉलो करें',c:'#1677d2'},
    {t:'  •  ',c:'#f5b400'},
    {t:'सब्सक्राइब करें',c:'#e31e24'}
  ];
  let actionW=0; actionParts.forEach(p=>{actionW+=ctx.measureText(p.t).width;});
  let ax=centerX-actionW/2;
  actionParts.forEach(p=>{ctx.fillStyle=p.c;ctx.fillText(p.t,ax+ctx.measureText(p.t).width/2,actionY);ax+=ctx.measureText(p.t).width;});

  // Large natural emojis use only the empty left/right space beside the CTA text.
  ctx.font='78px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign='center';
  ctx.fillText('👍 ❤️ ✨',125,actionY);
  ctx.fillText('✨ ❤️ 🔔',955,actionY);

  // No yellow decorative lines/arcs in Scene 5. Keep this fixed area clean.

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
  installQuickPreviewStyles();
  const finalBtn=document.getElementById('finalPreviewBtn');
  finalBtn.textContent='⚡ Quick Preview देखें';
  finalBtn.onclick=buildQuickPreview;
  const wrap=finalBtn.parentElement;
  let permanent=document.getElementById('permanentMasterBtn');
  if(!permanent){permanent=document.createElement('button');permanent.id='permanentMasterBtn';permanent.type='button';permanent.className='vsm-btn vsm-secondary';permanent.textContent='💾 Permanent MP4 बनाएं';wrap.insertBefore(permanent,document.getElementById('downloadFinalBtn'));}
  [...wrap.querySelectorAll('button')].forEach(b=>{if(b!==permanent && /Permanent MP4/.test(b.textContent||''))b.remove();});
  permanent.onclick=buildFinalPreview;
  document.getElementById('downloadFinalBtn').onclick=downloadFinal;
  document.getElementById('quickDownloadBtn').onclick=downloadQuickPreview;
  document.getElementById('publishFinalBtn').onclick=publishFinal;
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
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  document.getElementById('sceneGrid').innerHTML=scenes.map(s=>{const master=s.n===1;return `<div class="qtm-scene" id="qscene-${sid}-${s.n}">
  <h4>Scene ${s.n} — ${esc(s.name)}</h4><div class="qtm-scene-body">
  <div class="qtm-media-box"><div class="qtm-media-label">🎬 ${master?'MASTER VIDEO PREVIEW':'MASTER VIDEO (Scene 1)'}</div>
  <div id="qpreview-${sid}-${s.n}"><div class="qtm-empty">${master?'अभी 45-sec Master Video save नहीं है':'Scene 1 का 45-sec Master Video यहाँ preview होगा।'}</div></div>
  ${master?`<input class="qtm-file" id="file-${sid}-1" type="file" accept="video/mp4,video/*"><div class="qtm-upload"><button class="vsm-btn vsm-primary" type="button" onclick="document.getElementById('file-${sid}-1').click()">⬆️ Upload / Replace 45-sec Master Video</button></div>`:''}</div>
  <div class="qtm-media-box"><div class="qtm-media-label">🖼️ SCENE IMAGE</div><div class="qtm-image-wrap" id="qimage-${sid}-${s.n}"><div class="qtm-image-empty">अभी image generate नहीं हुई</div></div>
  <div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">✨ Generate Image</button><button class="vsm-mini" type="button" onclick="generateSceneImage(${s.n})">🔄 Regenerate</button></div>
  <div class="qtm-image-status" id="qimagestatus-${sid}-${s.n}">Image अभी save नहीं है</div></div></div>
  <div class="qtm-status" id="qstatus-${sid}-${s.n}">Checking…</div></div>`;}).join('');
  const mf=document.getElementById(`file-${sid}-1`); if(mf)mf.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)saveQuestionScene(qid,1,f);e.target.value='';});
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
    await loadSavedFinalVideo();
    await loadExistingRenderJob();
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
  const sid=safeId(qid), preview=document.getElementById(`qpreview-${sid}-${sn}`), status=document.getElementById(`qstatus-${sid}-${sn}`); if(!preview||!status)return;
  const master=videoRowsByScene[1]||null; if(!master){preview.innerHTML='<div class="qtm-empty">Scene 1 का 45-sec Master Video अभी save नहीं है</div>';status.textContent='⚪ पहले Scene 1 में Master Video upload करें';return;}
  const url=publicUrl(master.storage_path); preview.innerHTML=`<video controls preload="metadata" src="${url}"></video><div class="qtm-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  status.innerHTML=sn===1?'<span class="qtm-badge qtm-saved">✅ 45-sec Master Video Saved</span>':'<span class="qtm-badge qtm-saved">✅ Scene 1 Master — shared preview</span>';
}
async function loadQuestionImages(){
  const qid=questionId(selectedQuestion), sid=safeId(qid);
  imageRowsByScene={};
  layerRowsByScene={};

  // Images are independent of video rows. Never let a layer-table problem
  // prevent the five saved images from loading.
  try{
    const {data,error}=await sb.from('video_question_scene_images')
      .select('id,question_id,scene_number,file_name,storage_path,is_active,image_width,image_height')
      .eq('question_id',qid)
      .order('scene_number',{ascending:true});
    if(error)throw error;
    const imageRows=Array.isArray(data)?data:[];
    scenes.forEach(s=>{
      const row=imageRows.find(r=>Number(r.scene_number)===s.n)||null;
      imageRowsByScene[s.n]=row;
      renderSceneImage(qid,s.n,row);
    });
  }catch(e){
    console.error('Question images load failed:',e);
    scenes.forEach(s=>{
      imageRowsByScene[s.n]=null;
      renderSceneImage(qid,s.n,null);
      const el=document.getElementById(`qimagestatus-${sid}-${s.n}`);
      if(el)el.textContent=`⚠️ Image record load नहीं हुआ: ${e.message||e}`;
    });
  }

  // Layer settings are optional. If unavailable, use Scene 1/default position.
  try{
    const {data:layers,error:layerErr}=await sb.from('video_question_scene_layers')
      .select('*').eq('question_id',qid).order('scene_number',{ascending:true});
    if(layerErr)throw layerErr;
    const savedLayers=Array.isArray(layers)?layers:[];
    const scene1Defaults=savedLayers.find(r=>Number(r.scene_number)===1)||null;
    scenes.forEach(s=>{
      const own=savedLayers.find(r=>Number(r.scene_number)===s.n)||null;
      const inherited=(s.n>1 && !own && scene1Defaults)
        ? {...scene1Defaults,scene_number:s.n,__inherited:true} : own;
      layerRowsByScene[s.n]=inherited;
      renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],inherited);
    });
  }catch(layerErr){
    console.warn('Layer settings unavailable; using defaults:',layerErr);
    scenes.forEach(s=>{
      layerRowsByScene[s.n]=null;
      renderLayerEditor(qid,s.n,imageRowsByScene[s.n],videoRowsByScene[s.n],null);
    });
  }
}

function renderSceneImage(qid,sn,row){
  const sid=safeId(qid), box=document.getElementById(`qimage-${sid}-${sn}`), st=document.getElementById(`qimagestatus-${sid}-${sn}`);
  if(!box||!st)return;
  if(!row){
    box.innerHTML='<div class="qtm-image-empty">अभी image generate नहीं हुई</div>';
    st.textContent='Image अभी save नहीं है';
    return;
  }
  const url=imagePublicUrl(row.storage_path);
  box.innerHTML=`<img id="sceneimg-${sid}-${sn}" src="${url}" alt="Scene ${sn} image" loading="eager" style="max-width:100%;height:auto;display:block"><div class="qtm-image-actions"><button class="vsm-mini" type="button" onclick="window.open('${url}','_blank')">▶ Preview</button></div>`;
  const img=document.getElementById(`sceneimg-${sid}-${sn}`);
  img?.addEventListener('load',()=>{st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';});
  img?.addEventListener('error',()=>{st.textContent='❌ Saved image load नहीं हुई — Storage URL check करें'; console.error('Image URL failed:',url);});
  if(img?.complete && img.naturalWidth>0)st.innerHTML='<span class="qtm-badge qtm-saved">✅ Image Permanently Saved</span>';
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
  const masterVideo=videoRowsByScene?.[1]||null;
  const videoUrl=masterVideo?.storage_path?publicUrl(masterVideo.storage_path):'';
  const imageUrl=imagePublicUrl(imageRow.storage_path);
  editor.innerHTML=`
    <div class="qtm-media-label">🎛️ IMAGE LAYER — Scene ${sn}</div>
    <div class="qtm-layer-stage" id="layerstage-${sid}-${sn}">
      ${videoUrl?`<video autoplay loop muted playsinline preload="auto" src="${videoUrl}"></video>`:'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Video पहले upload करें</div>'}
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
    const {error:dbErr}=await sb.from('video_question_scene_images')
      .upsert({...payload,created_at:old?.created_at||new Date().toISOString()},{onConflict:'question_id,scene_number'});
    if(dbErr)throw dbErr;
    imageRowsByScene[sn]=payload;
    renderSceneImage(qid,sn,payload);
    document.getElementById('finalStatus').textContent=`✅ Scene ${sn} image saved. अब यही image बाद में video layer में लगाई जा सकती है।`;
  }catch(e){
    console.error('Image generate failed:',e);st.textContent='❌ Image generate failed';alert(`Scene ${sn} image generate failed: ${e.message||e}`);
  }
}

// Inline HTML buttons need a window-level handler because this file uses an IIFE.
window.generateSceneImage = generateSceneImage;

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
      // Never remove an uploaded master file on a database error. The new file
      // is left in Storage so a failed DB write cannot destroy the previously
      // working master. It can be cleaned up manually later if needed.
      throw dbErr;
    }

    // IMPORTANT: Never delete the previously saved master video.
    // The 45-sec master is permanent for this question. If the user deliberately
    // uses Replace later, the new upload gets a new storage path while the old
    // file remains safely stored instead of disappearing.
    // This keeps the same master video available today, tomorrow and later.
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


async function makeVideoPoster(videoUrl){
  return await new Promise((resolve)=>{
    const v=document.createElement('video');
    v.crossOrigin='anonymous';
    v.muted=true;
    v.playsInline=true;
    v.preload='auto';
    let done=false;
    const finish=(value)=>{if(done)return;done=true;try{v.pause();}catch(_){}
      v.removeAttribute('src');v.load();resolve(value);};
    const draw=()=>{
      try{
        const w=v.videoWidth||1080,h=v.videoHeight||1920;
        const c=document.createElement('canvas');
        c.width=w;c.height=h;
        const c2=c.getContext('2d');
        if(!c2) return finish('');
        c2.drawImage(v,0,0,w,h);
        finish(c.toDataURL('image/jpeg',0.88));
      }catch(_){finish('');}
    };
    v.addEventListener('loadeddata',()=>{
      if(v.readyState>=2){
        try{v.currentTime=0;}catch(_){draw();}
      }
    },{once:true});
    v.addEventListener('seeked',draw,{once:true});
    v.addEventListener('error',()=>finish(''),{once:true});
    v.src=videoUrl;
    v.load();
    setTimeout(()=>finish(''),12000);
  });
}

async function loadExistingRenderJob(){
  const qid=questionId(selectedQuestion);
  if(!qid||!sb)return;
  try{
    const {data:job,error}=await sb.from('video_render_jobs')
      .select('id,status,progress,final_path,error_message,updated_at')
      .eq('question_id',qid).maybeSingle();
    if(error)throw error;
    if(!job)return;
    const status=document.getElementById('finalStatus');
    if(job.status==='completed'){
      await loadSavedFinalVideo();
      return;
    }
    if(job.status==='failed'){
      status.textContent=`❌ पिछला Final MP4 render failed: ${job.error_message||'Unknown error'}`;
      return;
    }
    const pct=Math.max(0,Math.min(100,Number(job.progress)||0));
    status.textContent=`⏳ Final MP4 background में बन रहा है… ${pct}%`;
    const timer=setInterval(async()=>{
      try{
        const {data:r,error:e}=await sb.from('video_render_jobs')
          .select('status,progress,final_path,error_message').eq('id',job.id).maybeSingle();
        if(e||!r)return;
        const p=Math.max(0,Math.min(100,Number(r.progress)||0));
        if(r.status==='completed'){
          clearInterval(timer); await loadSavedFinalVideo();
          status.textContent='✅ Final MP4 तैयार और Supabase में सुरक्षित है — 100%';
        }else if(r.status==='failed'){
          clearInterval(timer); status.textContent=`❌ Final MP4 render failed: ${r.error_message||'Unknown error'}`;
        }else status.textContent=`⏳ Final MP4 background में बन रहा है… ${p}%`;
      }catch(e){console.warn('Existing render job check failed:',e);}
    },5000);
    setTimeout(()=>clearInterval(timer),60*60*1000);
  }catch(e){
    console.warn('Existing render job load failed:',e);
  }
}

async function loadSavedFinalVideo(){
  const qid=questionId(selectedQuestion);
  const preview=document.getElementById('finalPreview');
  const downloadBtn=document.getElementById('downloadFinalBtn');
  if(!qid||!preview||!downloadBtn)return false;
  const path=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
  const url=publicUrl(path);
  try{
    const res=await fetch(`${url}&check=${Date.now()}`,{method:'HEAD',cache:'no-store'});
    if(!res.ok)return false;
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=url;
    finalBlob=null;
    const savedPreviewUrl=`${url}&v=${Date.now()}`;
    const savedPoster=await makeVideoPoster(savedPreviewUrl);
    preview.innerHTML=`<video controls playsinline preload="auto"${savedPoster?` poster="${savedPoster}"`:''} src="${savedPreviewUrl}"></video>`;
    downloadBtn.disabled=false;
    downloadBtn.dataset.single='1';
    downloadBtn.dataset.url=url;
    document.getElementById('publishFinalBtn').disabled=false;
    document.getElementById('finalStatus').textContent='✅ यह Question का saved 45-sec Final MP4 है — दोबारा conversion की जरूरत नहीं।';
    return true;
  }catch(e){
    console.warn('Saved final MP4 check failed:',e);
    return false;
  }
}

function updateFinalAvailability(){
  document.getElementById('finalPreviewBtn').disabled=!selectedQuestion;
}

function resetFinalUI(){
  document.getElementById('finalPreview').innerHTML='<div class="qtm-empty">Final Preview अभी नहीं बना है।</div>';
  document.getElementById('downloadFinalBtn').disabled=true;
  document.getElementById('publishFinalBtn').disabled=true;
  const qbtn=document.getElementById('quickDownloadBtn'); if(qbtn) qbtn.disabled=true;
  document.getElementById('finalStatus').textContent='जितने Scene upload होंगे, Final Preview में उतने ही क्रम से जुड़ेंगे।';
}

function installQuickPreviewStyles(){if(document.getElementById('gs-quick-preview-style'))return;const st=document.createElement('style');st.id='gs-quick-preview-style';st.textContent=`.gs-quick-stage{position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;overflow:hidden;border-radius:10px}.gs-quick-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.gs-quick-stage img{position:absolute;display:none;max-width:none;pointer-events:none}.gs-quick-note{font-size:12px;color:#64748b;text-align:center;margin-top:7px}`;document.head.appendChild(st);}
// Master video is one complete Canva-made video. The 1-second gaps already contain
// the user's own indicator images inside that master video. We DO NOT add or load
// any separate transition image. Final timing: Scene 1 0–8 sec, Scene 2 9–17 sec,
// Scene 3 18–25.9 sec, Scene 4 27–34.9 sec, Scene 5 36–43.5 sec.
const VIDEO_TIMELINE={
  1:[0,8],
  2:[9,17],
  3:[18.1,26],
  4:[27.1,35],
  5:[36.1,43.6]
};
function timelineWindows(){return [VIDEO_TIMELINE[1],VIDEO_TIMELINE[2],VIDEO_TIMELINE[3],VIDEO_TIMELINE[4],VIDEO_TIMELINE[5]];}
async function buildQuickPreview(){installQuickPreviewStyles();const status=document.getElementById('finalStatus'),preview=document.getElementById('finalPreview'),btn=document.getElementById('finalPreviewBtn');btn.disabled=true;status.textContent='⏳ Master Video और 5 images browser में जोड़ी जा रही हैं…';try{const master=videoRowsByScene[1];if(!master?.storage_path)throw new Error('Scene 1 का 45-sec Master Video upload नहीं है।');const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);const quickMasterUrl=publicUrl(master.storage_path);
// IMPORTANT: Quick Preview must appear immediately. Do not generate a poster/frame or run any conversion here.
    // Scene images use 1-sec Fade In/Fade Out in the preview. The 1-sec gaps remain
    // untouched so the master video's own indicator images stay visible between scenes.
preview.innerHTML=`<div class="gs-quick-stage"><video id="gsQuickVideo" controls playsinline preload="metadata" src="${quickMasterUrl}"></video><div id="gsQuickOverlay"></div></div><div class="gs-quick-note">⚡ Quick Preview: एक ही पूरा Master Video चल रहा है। Canva में रखी आपकी 1-sec indicator images Master Video के अंदर ही रहेंगी; Scenes 1–2 अपनी fixed windows में, Scene 3 7.9-sec (18–25.9), Scene 4 7.9-sec (27–34.9), और Scene 5 CTA image 7.5-sec (36–43.5) दिखाई देगी दिखाई देगी।</div>`;const video=document.getElementById('gsQuickVideo'),overlay=document.getElementById('gsQuickOverlay'),windows=timelineWindows();overlay.innerHTML=[1,2,3,4,5].map(n=>`<img id="gsqimg${n}" src="${imagePublicUrl(imageRowsByScene[n].storage_path)}" alt="Scene ${n}">`).join('');const fadeOpacity=(t,start,end)=>{
  const FADE=1.0;
  if(t<start || (end!==null && t>=end))return 0;
  if(t<start+FADE)return Math.max(0,Math.min(1,(t-start)/FADE));
  if(end!==null && t>end-FADE)return Math.max(0,Math.min(1,(end-t)/FADE));
  return 1;
};
const sync=()=>{
  const t=Number(video.currentTime)||0;
  const duration=Number(video.duration)||45;
  for(let n=1;n<=5;n++){
    const img=document.getElementById(`gsqimg${n}`),row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:1080,height:1920},[a,b]=windows[n-1];
    const end=b===null?duration:b;
    img.style.left=`${(Number(row.x)||0)/1080*100}%`;
    img.style.top=`${(Number(row.y)||0)/1920*100}%`;
    img.style.width=`${(Number(row.width)||1080)/1080*100}%`;
    img.style.height=`${(Number(row.height)||1920)/1920*100}%`;
    const opacity=fadeOpacity(t,a,end);
    img.style.opacity=String(opacity);
    img.style.display=opacity>0?'block':'none';
  }
};video.addEventListener('loadedmetadata',()=>{sync();const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=false;status.textContent='✅ Quick Preview तैयार है — Play दबाकर पाँचों images देखें। अब ⬇️ Quick Preview Download करें दबाएँ।'},{once:true});video.addEventListener('timeupdate',sync);video.addEventListener('seeking',sync);video.addEventListener('error',()=>{const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=true;status.textContent='❌ Master Video browser में load नहीं हुआ।'},{once:true});}catch(e){console.error('Quick Preview:',e);preview.innerHTML=`<div class="qtm-empty">❌ ${esc(e.message||String(e))}</div>`;status.textContent='❌ Quick Preview failed';}finally{btn.disabled=false;}}


async function downloadQuickPreview(){
  const btn=document.getElementById('quickDownloadBtn');
  const status=document.getElementById('finalStatus');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  const oldText=btn.textContent;
  try{
    const qid=questionId(selectedQuestion);
    if(!qid)throw new Error('Question ID उपलब्ध नहीं है।');

    // QUICK DOWNLOAD is now a permanent-download path.
    // If the 45-sec Final MP4 already exists in Supabase, NEVER record again.
    // If it does not exist yet, render it once with FFmpeg, save it permanently,
    // then download that same saved file. This avoids MediaRecorder/canvas
    // re-recording, frozen frames, missing voice and repeated work on mobile.
    const finalPath=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
    const savedUrl=publicUrl(finalPath);
    status.textContent='⏳ पहले से सेव 45-sec वीडियो चेक किया जा रहा है…';

    let exists=false;
    try{
      // HTTP HEAD/content-length is not reliable on every PC/browser path.
      // Check the actual Supabase Storage object metadata instead.
      const folder=`video-scenes/questions/${encodeURIComponent(String(qid))}/final`;
      const {data:files,error:listErr}=await sb.storage.from(BUCKET).list(folder,{limit:100,search:`question-${qid}-final.mp4`});
      if(listErr) throw listErr;
      exists=Array.isArray(files) && files.some(f=>String(f.name||'')===`question-${qid}-final.mp4` && Number(f.metadata?.size||f.size||0)>0);
    }catch(e){
      console.warn('Permanent MP4 storage check failed; using range request:',e);
      try{
        const check=await fetch(`${savedUrl}&check=${Date.now()}`,{method:'GET',headers:{Range:'bytes=0-1'},cache:'no-store'});
        exists=check.ok && (check.status===200 || check.status===206);
      }catch(_){ exists=false; }
    }

    if(!exists){
      status.textContent='⏳ यह वीडियो पहली बार स्थायी रूप से सेव किया जा रहा है…';
      // One-time render + permanent Supabase save. No browser recording.
      await buildFinalPreview();
      const folder=`video-scenes/questions/${encodeURIComponent(String(qid))}/final`;
      const {data:files,error:listErr}=await sb.storage.from(BUCKET).list(folder,{limit:100,search:`question-${qid}-final.mp4`});
      if(listErr)throw new Error(`Saved Final MP4 check failed: ${listErr.message||listErr}`);
      const saved=Array.isArray(files) && files.find(f=>String(f.name||'')===`question-${qid}-final.mp4`);
      if(!saved || Number(saved.metadata?.size||saved.size||0)<=0)throw new Error('स्थायी Final MP4 Supabase Storage में नहीं मिला।');
    }

    const name=`question-${qid}-final.mp4`;
    const separator=savedUrl.includes('?')?'&':'?';
    const downloadUrl=`${savedUrl}${separator}download=${encodeURIComponent(name)}&v=${Date.now()}`;
    const a=document.createElement('a');
    a.href=downloadUrl;
    a.download=name;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();

    status.textContent=exists
      ? '✅ Saved Final MP4 से डाउनलोड शुरू हो गया। दोबारा recording की जरूरत नहीं है।'
      : '✅ वीडियो एक बार स्थायी रूप से सेव हो गया और डाउनलोड शुरू हो गया। आगे सीधे यही saved video डाउनलोड होगा।';
  }catch(e){
    console.error('Quick Preview permanent download failed:',e);
    status.textContent=`❌ Saved Video download failed: ${e.message||e}`;
  }finally{
    btn.textContent=oldText;
    btn.disabled=false;
  }
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  const qid=questionId(selectedQuestion);
  try{
    if(await loadSavedFinalVideo()){
      status.textContent='✅ इस Question का Final MP4 पहले से Supabase में सुरक्षित है — दोबारा render की जरूरत नहीं।';
      return;
    }
    const master=videoRowsByScene[1];
    if(!qid)throw new Error('Question ID उपलब्ध नहीं है।');
    if(!master?.storage_path)throw new Error('Scene 1 का 45-sec Master Video upload नहीं है।');
    const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);
    if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);

    const sceneLayers={};
    for(let n=1;n<=5;n++){
      const row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:1080,height:1920};
      sceneLayers[n]={x:Number(row.x)||0,y:Number(row.y)||0,width:Number(row.width)||1080,height:Number(row.height)||1920};
    }

    const timeline={1:[0,8],2:[9,17],3:[18,25.9],4:[27,34.9],5:[36,43.5]};
    const payload={
      question_id:String(qid),
      master_path:master.storage_path,
      scene_images:Object.fromEntries([1,2,3,4,5].map(n=>[n,imageRowsByScene[n].storage_path])),
      scene_layers:sceneLayers,
      timeline,
      output_path:`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`,
      duration_seconds:45,
      codec:{video:'libx264',audio:'aac',pix_fmt:'yuv420p',movflags:'+faststart'}
    };

    // One shared Supabase job is the source of truth for PC + mobile.
    // The browser only queues the job; the background worker does the heavy FFmpeg render.
    status.textContent='⏳ Final MP4 render job तैयार हो रहा है… 0%';
    const {data:job,error:jobErr}=await sb.from('video_render_jobs').upsert({
      question_id:String(qid),status:'queued',progress:0,final_path:null,error_message:null,job_payload:payload,updated_at:new Date().toISOString()
    },{onConflict:'question_id'}).select('id,status,progress,final_path,error_message').single();
    if(jobErr)throw new Error(`Render job save failed: ${jobErr.message||jobErr}`);

    const renderJobId=job.id;
    let pollTimer=null;
    let channel=null;
    let finished=false;
    const cleanup=()=>{if(pollTimer)clearInterval(pollTimer);pollTimer=null;if(channel)sb.removeChannel(channel);channel=null;};
    const showJob=(r)=>{
      const pct=Math.max(0,Math.min(100,Number(r?.progress)||0));
      if(r?.status==='completed') status.textContent='✅ Final MP4 तैयार और Supabase में सुरक्षित है — 100%';
      else if(r?.status==='failed') status.textContent=`❌ Final MP4 render failed: ${r.error_message||'Unknown error'}`;
      else status.textContent=`⏳ Final MP4 background में बन रहा है… ${pct}%`;
    };
    const finish=async(r)=>{
      if(finished)return; finished=true;cleanup();
      if(r?.status==='failed')throw new Error(r.error_message||'Background Final MP4 render failed.');
      if(r?.status!=='completed')return;
      const finalPath=r.final_path||payload.output_path;
      const verifyUrl=publicUrl(finalPath);
      const verifyRes=await fetch(`${verifyUrl}&verify=${Date.now()}`,{method:'HEAD',cache:'no-store'});
      if(!verifyRes.ok)throw new Error(`Final MP4 verify failed (${verifyRes.status})`);
      const savedBytes=Number(verifyRes.headers.get('content-length')||0);
      if(savedBytes<=0)throw new Error('Final MP4 verify failed: saved file size is 0 bytes.');
      const savedPreviewUrl=`${verifyUrl}&stream=${Date.now()}`;
      preview.innerHTML=`<video controls playsinline preload="metadata" src="${savedPreviewUrl}"></video>`;
      const downloadBtn=document.getElementById('downloadFinalBtn');
      downloadBtn.disabled=false;downloadBtn.dataset.url=verifyUrl;downloadBtn.dataset.single='1';
      document.getElementById('publishFinalBtn').disabled=false;
      status.textContent='✅ पूरा 45-sec Final MP4 तैयार और Supabase में सुरक्षित है — 100%';
    };

    channel=sb.channel(`video-render-${String(qid)}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'video_render_jobs',filter:`question_id=eq.${String(qid)}`},async payloadEvent=>{
        const r=payloadEvent.new;showJob(r);
        if(r.id===renderJobId && ['completed','failed'].includes(r.status)){
          try{await finish(r);}catch(e){cleanup();status.textContent=`❌ ${e.message||e}`;alert(`Final MP4 नहीं बन सका:\n${e.message||e}`);}
        }
      }).subscribe();

    const check=async()=>{
      try{
        const {data:r,error}=await sb.from('video_render_jobs').select('id,status,progress,final_path,error_message').eq('id',renderJobId).maybeSingle();
        if(error)throw error;
        if(!r)return;
        showJob(r);
        if(['completed','failed'].includes(r.status))await finish(r);
      }catch(e){console.warn('Render job polling failed:',e);}
    };
    await check();
    pollTimer=setInterval(check,5000);
    // The browser can be closed now. The Supabase job remains queued/processing and
    // the server worker continues rendering independently.
  }catch(e){
    console.error('Final MP4 background job failed:',e);
    status.textContent=`❌ Final MP4 failed: ${e.message||e}`;
    alert(`Final MP4 नहीं बन सका:\n${e.message||e}`);
  }finally{
    btn.disabled=false;
  }
}

async function downloadFinal(){
  const btn=document.getElementById('downloadFinalBtn');
  const qid=questionId(selectedQuestion);
  const name=`question-${qid}-final.mp4`;
  btn.disabled=true;
  const oldText=btn.textContent;
  try{
    let url=btn.dataset.url||'';
    if(!url){
      const finalPath=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
      url=publicUrl(finalPath);
      const check=await fetch(`${url}&check=${Date.now()}`,{method:'HEAD',cache:'no-store'});
      if(!check.ok)throw new Error('इस Question का permanently saved Final MP4 अभी उपलब्ध नहीं है। पहले एक बार Generate करें।');
      const savedBytes=Number(check.headers.get('content-length')||0);
      if(savedBytes<=0)throw new Error('Saved Final MP4 का file size verify नहीं हो सका।');
    }

    // Do NOT fetch the whole 45-sec file into a browser Blob on PC.
    // Supabase serves the saved MP4 directly, allowing Chrome/Edge to use normal
    // HTTP range requests and download the complete file without RAM truncation.
    const separator=url.includes('?')?'&':'?';
    const downloadUrl=`${url}${separator}download=${encodeURIComponent(name)}&v=${Date.now()}`;
    const a=document.createElement('a');
    a.href=downloadUrl;
    a.download=name;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    document.getElementById('finalStatus').textContent='✅ Permanently saved 45-sec MP4 का direct download शुरू हो गया। यही saved file आगे भी कभी भी डाउनलोड की जा सकती है।';
  }catch(e){
    console.error('Final download failed:',e);
    document.getElementById('finalStatus').textContent=`❌ Download failed: ${e.message||e}`;
  }finally{
    btn.textContent=oldText;
    btn.disabled=false;
  }
}

function publishFinal(){
  alert('Final video तैयार है। Publishing button रखा गया है; Facebook / YouTube / WhatsApp Channel publishing को अगले चरण में मौजूदा publishing workflow से जोड़ा जाएगा।');
}

window.addEventListener('DOMContentLoaded',init);
})();
