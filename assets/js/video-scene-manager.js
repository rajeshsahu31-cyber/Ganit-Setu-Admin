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

  // Scene 1 is the master visual layout. Keep this layout fixed so it can
  // later be copied to the other four scene images without changing size.
  if(sn===1){
    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    // Fixed metadata row: class, chapter number and chapter name.
    // It sits below the top logo-safe area and above the question box.
    const metaY=150, metaH=72, gap=18;
    const meta=[
      {text:formatClassLabel(q),w:270},
      {text:chapterNumber(q)?`अध्याय ${chapterNumber(q)}`:'अध्याय',w:220},
      {text:chapterText(q)||'अध्याय का नाम',w:500}
    ];
    let mx=(W-(meta.reduce((a,b)=>a+b.w,0)+gap*2))/2;
    for(const m of meta){
      ctx.fillStyle='rgba(255,255,255,0.96)';
      ctx.strokeStyle='rgba(37,99,235,0.35)';
      ctx.lineWidth=2.5;
      ctx.beginPath();ctx.roundRect(mx,metaY,m.w,metaH,18);ctx.fill();ctx.stroke();
      ctx.fillStyle='#1d4ed8';
      ctx.font='700 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      const mt=wrapCanvasText(ctx,m.text,m.w-24,34,2);
      let my=metaY+metaH/2-(mt.length-1)*17;
      for(const line of mt){ctx.fillText(line,mx+m.w/2,my);my+=34;}
      mx+=m.w+gap;
    }

    // New heading replaces the old "सवाल ध्यान से पढ़िए" heading.
    ctx.fillStyle='#1d4ed8';
    ctx.font='700 42px "Noto Sans Devanagari", "Mangal", sans-serif';
    ctx.fillText('आज का प्रश्न',W/2,285);

    // Fixed, slightly smaller question box. Its bottom stays safely above
    // the girl's head area in the master video.
    const x=60,y=330,w=960,h=540,r=30;
    ctx.fillStyle='rgba(255,255,255,0.94)';
    ctx.strokeStyle='rgba(37,99,235,0.28)';
    ctx.lineWidth=3;
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke();

    // Keep the main question font large/readable.
    ctx.fillStyle='#0f172a';
    const fontSize=48;
    ctx.font=`600 ${fontSize}px "Noto Sans Devanagari", "Mangal", sans-serif`;
    const lines=wrapCanvasText(ctx,body,w-120,fontSize*1.45,8);
    const lineH=fontSize*1.45;
    const total=lines.length*lineH;
    let yy=y+(h-total)/2+lineH/2;
    for(const line of lines){ctx.fillText(line,W/2,yy);yy+=lineH;}

    ctx.restore();
    return c;
  }


  // Scenes 2–4 use the exact same master frame as Scene 1:
  // same metadata row, same heading position, same outer box size and spacing.
  if(sn>=2 && sn<=4){
    ctx.save();
    ctx.textAlign='center';
    ctx.textBaseline='middle';

    const metaY=150, metaH=72, metaGap=18;
    const meta=[
      {text:formatClassLabel(q),w:270},
      {text:chapterNumber(q)?`अध्याय ${chapterNumber(q)}`:'अध्याय',w:220},
      {text:chapterText(q)||'अध्याय का नाम',w:500}
    ];
    let mx=(W-(meta.reduce((a,b)=>a+b.w,0)+metaGap*2))/2;
    for(const m of meta){
      ctx.fillStyle='rgba(255,255,255,0.96)';
      ctx.strokeStyle='rgba(37,99,235,0.35)';
      ctx.lineWidth=2.5;
      ctx.beginPath();ctx.roundRect(mx,metaY,m.w,metaH,18);ctx.fill();ctx.stroke();
      ctx.fillStyle='#1d4ed8';
      ctx.font='700 27px "Noto Sans Devanagari", "Mangal", sans-serif';
      const mt=wrapCanvasText(ctx,m.text,m.w-24,34,2);
      let my=metaY+metaH/2-(mt.length-1)*17;
      for(const line of mt){ctx.fillText(line,mx+m.w/2,my);my+=34;}
      mx+=m.w+metaGap;
    }

    // Scene-specific heading; only the word changes between scenes.
    ctx.fillStyle='#1d4ed8';
    ctx.font='700 42px "Noto Sans Devanagari", "Mangal", sans-serif';
    const sceneTitle = sn===2 ? 'विकल्प' : (sn===3 ? 'Hint' : 'सही उत्तर');
    ctx.fillText(sceneTitle,W/2,285);

    const x=60,y=330,w=960,h=540,r=30;
    ctx.fillStyle='rgba(255,255,255,0.94)';
    ctx.strokeStyle='rgba(37,99,235,0.28)';
    ctx.lineWidth=3;
    ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke();

    if(sn===2){
      // Four compact option boxes, all left-aligned and constrained to the
      // same fixed area. Text wraps automatically and never leaves its box.
      const opts=[1,2,3,4].map(n=>optionText(q,n)).filter(v=>String(v||'').trim());
      const labels=['A','B','C','D'];
      const fills=['#eff6ff','#f0fdf4','#fff7ed','#fdf2f8'];
      const strokes=['#93c5fd','#86efac','#fdba74','#f9a8d4'];
      const pad=22, gap=14;
      const boxX=x+36, boxW=w-72;
      const boxH=Math.min(105, Math.max(76, (h-2*pad-gap*3)/4));
      let oy=y+pad;
      ctx.textAlign='left';
      ctx.textBaseline='middle';

      opts.slice(0,4).forEach((value,i)=>{
        ctx.fillStyle=fills[i];
        ctx.strokeStyle=strokes[i];
        ctx.lineWidth=2;
        ctx.beginPath();ctx.roundRect(boxX,oy,boxW,boxH,18);ctx.fill();ctx.stroke();

        const labelW=72;
        ctx.fillStyle='#0f172a';
        ctx.font='700 30px "Noto Sans Devanagari", "Mangal", sans-serif';
        ctx.fillText(`${labels[i]})`,boxX+22,oy+boxH/2);

        ctx.font='600 30px "Noto Sans Devanagari", "Mangal", sans-serif';
        const maxLines=Math.max(1,Math.floor((boxH-22)/38));
        const lines=wrapCanvasText(ctx,String(value),boxW-labelW-28,38,maxLines);
        let ty=oy+boxH/2-(lines.length-1)*19;
        for(const line of lines){ctx.fillText(line,boxX+labelW,ty);ty+=38;}
        oy+=boxH+gap;
      });
    } else if(sn===3){
      // Hint: same fixed box, with automatic wrapping for long hints.
      ctx.textAlign='center';
      ctx.fillStyle='#0f172a';
      ctx.font='600 42px "Noto Sans Devanagari", "Mangal", sans-serif';
      const lines=wrapCanvasText(ctx,hintText(q),w-120,58,8);
      let ty=y+h/2-(lines.length-1)*29;
      for(const line of lines){ctx.fillText(line,W/2,ty);ty+=58;}
    } else {
      // Correct answer + compact explanation. The answer is highlighted,
      // while the explanation uses a smaller font to preserve the fixed box.
      ctx.textAlign='center';
      ctx.fillStyle='#16a34a';
      ctx.font='800 52px "Noto Sans Devanagari", "Mangal", sans-serif';
      const answerLines=wrapCanvasText(ctx,correctOptionDisplay(q),w-120,66,2);
      let ty=y+120-(answerLines.length-1)*33;
      for(const line of answerLines){ctx.fillText(line,W/2,ty);ty+=66;}

      const exp=explanationText(q);
      if(exp){
        ctx.fillStyle='#334155';
        ctx.font='500 28px "Noto Sans Devanagari", "Mangal", sans-serif';
        const lines=wrapCanvasText(ctx,exp,w-120,40,9);
        let ey=y+260-(lines.length-1)*20;
        for(const line of lines){ctx.fillText(line,W/2,ey);ey+=40;}
      }
    }

    ctx.restore();
    return c;
  }

  // Scene 5: clean white CTA template. No background image is generated.
  // Everything is drawn in code so the same design is reused for every question.
  ctx.save();
  ctx.clearRect(0,0,W,H);
  // Scene 5 sits over the master video. Keep the upper CTA area white,
  // but leave the lower part transparent so the girl's master video remains visible.
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,W,1200);
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  // Top brand wordmark — only the original-style Hindi name, no tagline/English line.
  // Keep the lettering bold and compact so it matches the user's original branding.
  const brandY=180;
  ctx.font='900 112px "Noto Sans Devanagari", "Mangal", sans-serif';
  ctx.fillStyle='#173f8f';
  ctx.fillText('गणित',W/2-115,brandY);
  ctx.fillStyle='#e31e24';
  ctx.fillText('सेतु',W/2+205,brandY);

  // Yellow tagline strip.
  const tagX=70,tagY=330,tagW=W-140,tagH=105;
  ctx.fillStyle='#ffe36e';
  ctx.beginPath();ctx.roundRect(tagX,tagY,tagW,tagH,28);ctx.fill();
  ctx.fillStyle='#111827';
  ctx.font='800 43px "Noto Sans Devanagari", "Mangal", sans-serif';
  ctx.fillText('मज़ेदार सवाल  •  आसान समाधान  •  बेहतर तैयारी',W/2,tagY+tagH/2);

  // Three learning cards with simple icons and arrows.
  const cardY=560, cardH=235, cardW=275, cardGap=38;
  const cards=[
    {x:70,fill:'#fde7f0',stroke:'#f3a5c0',icon:'🧠',text:'सोचिए'},
    {x:70+cardW+cardGap,fill:'#e5f3ff',stroke:'#8bc8f5',icon:'✏️',text:'समझिए'},
    {x:70+2*(cardW+cardGap),fill:'#e8f8df',stroke:'#9edb7c',icon:'🏆',text:'सीखिए'}
  ];
  cards.forEach((card,i)=>{
    ctx.fillStyle=card.fill;
    ctx.strokeStyle=card.stroke;
    ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(card.x,cardY,cardW,cardH,34);ctx.fill();ctx.stroke();
    ctx.font='76px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillStyle='#111827';
    ctx.fillText(card.icon,card.x+cardW/2,cardY+82);
    ctx.fillStyle=i===0?'#e91e63':(i===1?'#1677d2':'#159447');
    ctx.font='900 48px "Noto Sans Devanagari", "Mangal", sans-serif';
    ctx.fillText(card.text,card.x+cardW/2,cardY+175);
  });

  // Arrows between the three cards.
  ctx.fillStyle='#173f8f';
  ctx.font='900 58px sans-serif';
  ctx.fillText('→',cards[0].x+cardW+cardGap/2,cardY+cardH/2);
  ctx.fillText('→',cards[1].x+cardW+cardGap/2,cardY+cardH/2);

  // CTA buttons. These are visual buttons in the exported image/video.
  const btnY=910,btnH=145,btnW=420;
  const followX=70,subX=W-70-btnW;
  ctx.fillStyle='#1677e8';
  ctx.beginPath();ctx.roundRect(followX,btnY,btnW,btnH,42);ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.font='72px "Segoe UI Symbol", "Segoe UI Emoji", sans-serif';
  ctx.fillText('👤',followX+95,btnY+btnH/2);
  ctx.font='800 55px Arial, sans-serif';
  ctx.fillText('Follow',followX+260,btnY+btnH/2);

  ctx.fillStyle='#ef2b2d';
  ctx.beginPath();ctx.roundRect(subX,btnY,btnW,btnH,42);ctx.fill();
  // YouTube-style play icon.
  ctx.fillStyle='#ffffff';
  ctx.beginPath();ctx.roundRect(subX+42,btnY+35,90,75,18);ctx.fill();
  ctx.fillStyle='#ef2b2d';
  ctx.beginPath();ctx.moveTo(subX+78,btnY+52);ctx.lineTo(subX+78,btnY+93);ctx.lineTo(subX+108,btnY+72);ctx.closePath();ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.font='800 51px Arial, sans-serif';
  ctx.fillText('Subscribe',subX+285,btnY+btnH/2);

  // Small bell accent below the CTA buttons.
  ctx.fillStyle='#f5b400';
  ctx.font='62px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText('🔔',W/2,btnY+225);

  // Keep the lower part deliberately clean so it blends with the existing
  // white upper area of the girl's master video scene.
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
  const qbtn=document.getElementById('quickDownloadBtn'); if(qbtn) qbtn.disabled=true;
  document.getElementById('finalStatus').textContent='जितने Scene upload होंगे, Final Preview में उतने ही क्रम से जुड़ेंगे।';
}

function installQuickPreviewStyles(){if(document.getElementById('gs-quick-preview-style'))return;const st=document.createElement('style');st.id='gs-quick-preview-style';st.textContent=`.gs-quick-stage{position:relative;width:min(100%,540px);aspect-ratio:9/16;margin:0 auto;background:#000;overflow:hidden;border-radius:10px}.gs-quick-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.gs-quick-stage img{position:absolute;display:none;max-width:none;pointer-events:none}.gs-quick-note{font-size:12px;color:#64748b;text-align:center;margin-top:7px}`;document.head.appendChild(st);}
function timelineWindows(){return [[0,8],[9,17],[18,26],[27,35],[36,44]];}
async function buildQuickPreview(){installQuickPreviewStyles();const status=document.getElementById('finalStatus'),preview=document.getElementById('finalPreview'),btn=document.getElementById('finalPreviewBtn');btn.disabled=true;status.textContent='⏳ Master Video और 5 images browser में जोड़ी जा रही हैं…';try{const master=videoRowsByScene[1];if(!master?.storage_path)throw new Error('Scene 1 का Master Video upload नहीं है।');const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);preview.innerHTML=`<div class="gs-quick-stage"><video id="gsQuickVideo" controls playsinline preload="metadata" src="${publicUrl(master.storage_path)}"></video><div id="gsQuickOverlay"></div></div><div class="gs-quick-note">⚡ Quick Preview: कोई FFmpeg/render नहीं। एक ही 45-sec Master Video पर पाँचों images timing के अनुसार दिखाई जाएँगी।</div>`;const video=document.getElementById('gsQuickVideo'),overlay=document.getElementById('gsQuickOverlay'),windows=timelineWindows();overlay.innerHTML=[1,2,3,4,5].map(n=>`<img id="gsqimg${n}" src="${imagePublicUrl(imageRowsByScene[n].storage_path)}" alt="Scene ${n}">`).join('');const sync=()=>{const t=Number(video.currentTime)||0;for(let n=1;n<=5;n++){const img=document.getElementById(`gsqimg${n}`),row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:1080,height:1920},[a,b]=windows[n-1];img.style.left=`${(Number(row.x)||0)/1080*100}%`;img.style.top=`${(Number(row.y)||0)/1920*100}%`;img.style.width=`${(Number(row.width)||1080)/1080*100}%`;img.style.height=`${(Number(row.height)||1920)/1920*100}%`;img.style.display=(t>=a&&t<b)?'block':'none';}};video.addEventListener('loadedmetadata',()=>{sync();const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=false;status.textContent='✅ Quick Preview तैयार है — Play दबाकर पाँचों images देखें। अब ⬇️ Quick Preview Download करें दबाएँ।'},{once:true});video.addEventListener('timeupdate',sync);video.addEventListener('seeking',sync);video.addEventListener('error',()=>{const qbtn=document.getElementById('quickDownloadBtn');if(qbtn)qbtn.disabled=true;status.textContent='❌ Master Video browser में load नहीं हुआ।'},{once:true});}catch(e){console.error('Quick Preview:',e);preview.innerHTML=`<div class="qtm-empty">❌ ${esc(e.message||String(e))}</div>`;status.textContent='❌ Quick Preview failed';}finally{btn.disabled=false;}}


async function downloadQuickPreview(){
  const btn=document.getElementById('quickDownloadBtn');
  const status=document.getElementById('finalStatus');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  let canvas=null,ctx=null,video=null,audioCtx=null,masterUrl=null,raf=0,recorder=null;
  const imageUrls=[];
  try{
    const master=videoRowsByScene[1];
    if(!master?.storage_path)throw new Error('Scene 1 का Master Video upload नहीं है।');
    const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);
    if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);

    const W=1080,H=1920,FPS=30;
    status.textContent='⏳ Quick Preview को पूरा रिकॉर्ड किया जा रहा है…';
    const fetchBlob=async(url,label)=>{
      const res=await fetch(url,{mode:'cors',cache:'no-store'});
      if(!res.ok)throw new Error(`${label} load failed (${res.status})`);
      return await res.blob();
    };
    const masterBlob=await fetchBlob(publicUrl(master.storage_path),'Master Video');
    masterUrl=URL.createObjectURL(masterBlob);

    const images={};
    for(let n=1;n<=5;n++){
      const b=await fetchBlob(imagePublicUrl(imageRowsByScene[n].storage_path),`Scene ${n} image`);
      const u=URL.createObjectURL(b); imageUrls.push(u);
      const im=new Image(); im.src=u;
      await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error(`Scene ${n} image decode नहीं हुई।`));});
      images[n]=im;
    }

    video=document.createElement('video');
    video.playsInline=true; video.preload='auto'; video.muted=false; video.src=masterUrl;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('Master Video browser में load नहीं हुआ।'));video.load();});

    canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas उपलब्ध नहीं है।');
    const windows=timelineWindows();
    const draw=()=>{
      if(!video||video.readyState<2)return;
      ctx.drawImage(video,0,0,W,H);
      const t=Number(video.currentTime)||0;
      for(let n=1;n<=5;n++){
        const [start,end]=windows[n-1];
        if(t>=start&&t<end){
          const row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:W,height:H};
          const x=Math.max(0,Math.min(W,Math.round(Number(row.x)||0)));
          const y=Math.max(0,Math.min(H,Math.round(Number(row.y)||0)));
          const w=Math.max(1,Math.min(W-x,Math.round(Number(row.width)||W)));
          const h=Math.max(1,Math.min(H-y,Math.round(Number(row.height)||H)));
          ctx.drawImage(images[n],x,y,w,h);
        }
      }
    };

    const candidates=[
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
      'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'
    ];
    const mimeType=candidates.find(t=>window.MediaRecorder?.isTypeSupported(t));
    if(!mimeType)throw new Error('इस browser में video recording support उपलब्ध नहीं है।');

    const stream=canvas.captureStream(FPS);
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const source=audioCtx.createMediaElementSource(video);
      const dest=audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // Keep audio audible while recording; the recorded track comes from dest.
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      await audioCtx.resume();
    }catch(e){console.warn('Audio capture unavailable',e);}

    const chunks=[];
    const options={videoBitsPerSecond:6000000,audioBitsPerSecond:128000,mimeType};
    recorder=new MediaRecorder(stream,options);
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Recording failed'));});

    video.currentTime=0;
    await new Promise(resolve=>{
      if(video.readyState>=3)resolve(); else video.addEventListener('canplay',resolve,{once:true});
    });
    draw();
    if(audioCtx?.state==='suspended')await audioCtx.resume();
    await video.play();
    recorder.start(250);
    const loop=()=>{draw();if(recorder?.state==='recording')raf=requestAnimationFrame(loop);};
    raf=requestAnimationFrame(loop);

    // Download must follow the actual Quick Preview/master-video duration.
    // Do not impose a fixed 30s/45s cutoff; stop only when the source video ends.
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;resolve();};
      video.addEventListener('ended',finish,{once:true});
    });
    cancelAnimationFrame(raf); draw();
    if(recorder.state!=='inactive')recorder.stop();
    await stopped;
    video.pause();

    const ext=mimeType.startsWith('video/mp4')?'mp4':'webm';
    const blob=new Blob(chunks,{type:mimeType});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`question-${questionId(selectedQuestion)}-quick-preview.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent=`✅ पूरा Quick Preview डाउनलोड हो गया (${ext.toUpperCase()}) — जितनी देर Preview चला, उतनी ही पूरी अवधि रिकॉर्ड हुई।`;
  }catch(e){
    console.error('Quick Preview download failed:',e);
    status.textContent=`❌ Quick Preview download failed: ${e.message||e}`;
  }finally{
    cancelAnimationFrame(raf);
    try{if(video)video.pause();}catch(_){ }
    try{if(audioCtx)await audioCtx.close();}catch(_){ }
    if(masterUrl)URL.revokeObjectURL(masterUrl);
    imageUrls.forEach(u=>URL.revokeObjectURL(u));
    btn.disabled=false;
  }
}

async function buildFinalPreview(){
  const status=document.getElementById('finalStatus');
  const preview=document.getElementById('finalPreview');
  const btn=document.getElementById('finalPreviewBtn');
  btn.disabled=true;
  status.textContent='⏳ Quick Preview को Final MP4 में तैयार किया जा रहा है…';

  let raf=0, recorder=null, audioCtx=null, video=null, canvas=null;
  let masterObjectUrl=null;
  const imageObjectUrls=[];
  try{
    const master=videoRowsByScene[1];
    if(!master?.storage_path)throw new Error('Scene 1 का Master Video upload नहीं है।');
    const missing=[1,2,3,4,5].filter(n=>!imageRowsByScene[n]?.storage_path);
    if(missing.length)throw new Error(`Scene ${missing.join(', ')} की image अभी saved नहीं है।`);

    // IMPORTANT: Quick Preview is DOM-based. For export we reproduce that exact
    // composition on a canvas. Remote Supabase media is first loaded as Blob
    // URLs so canvas recording is not affected by cross-origin/CORS tainting.
    const W=1080,H=1920,FPS=30;
    canvas=document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
    if(!ctx)throw new Error('Canvas उपलब्ध नहीं है।');

    status.textContent='⏳ Master Video और 5 images तैयार हो रही हैं…';
    const fetchBlob=async(url,label)=>{
      const res=await fetch(url,{mode:'cors',cache:'no-store'});
      if(!res.ok)throw new Error(`${label} load failed (${res.status})`);
      return await res.blob();
    };

    const masterBlob=await fetchBlob(publicUrl(master.storage_path),'Master Video');
    masterObjectUrl=URL.createObjectURL(masterBlob);

    const images={};
    for(let n=1;n<=5;n++){
      const b=await fetchBlob(imagePublicUrl(imageRowsByScene[n].storage_path),`Scene ${n} image`);
      const u=URL.createObjectURL(b); imageObjectUrls.push(u);
      const im=new Image();
      im.src=u;
      await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error(`Scene ${n} image decode नहीं हुई।`));});
      images[n]=im;
    }

    video=document.createElement('video');
    video.playsInline=true;
    video.preload='auto';
    video.src=masterObjectUrl;
    await new Promise((resolve,reject)=>{
      video.onloadedmetadata=resolve;
      video.onerror=()=>reject(new Error('Master Video browser में load नहीं हुआ।'));
      video.load();
    });

    const windows=timelineWindows();
    const draw=()=>{
      if(!video||video.readyState<2)return;
      ctx.drawImage(video,0,0,W,H);
      const t=Number(video.currentTime)||0;
      for(let n=1;n<=5;n++){
        const [start,end]=windows[n-1];
        if(t>=start && t<end){
          const row=layerRowsByScene[n]||layerRowsByScene[1]||{x:0,y:0,width:1080,height:1920};
          const x=Math.max(0,Math.min(W,Math.round(Number(row.x)||0)));
          const y=Math.max(0,Math.min(H,Math.round(Number(row.y)||0)));
          const w=Math.max(1,Math.min(W-x,Math.round(Number(row.width)||W)));
          const h=Math.max(1,Math.min(H-y,Math.round(Number(row.height)||H)));
          ctx.drawImage(images[n],x,y,w,h);
        }
      }
    };

    // Browser recording is the fastest route. On Chrome/Android the native
    // recorder is normally WebM, so one single lightweight FFmpeg conversion
    // is used only at the very end to obtain the requested MP4.
    const types=[
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4',
      'video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'
    ];
    const mime=types.find(t=>window.MediaRecorder?.isTypeSupported(t));
    if(!mime)throw new Error('इस browser में video recording support उपलब्ध नहीं है।');

    const videoStream=canvas.captureStream(FPS);
    let recordStream=videoStream;
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const source=audioCtx.createMediaElementSource(video);
      const dest=audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
      dest.stream.getAudioTracks().forEach(t=>recordStream.addTrack(t));
      await audioCtx.resume();
    }catch(e){console.warn('Audio capture unavailable',e);}

    const chunks=[];
    const mimeCandidates=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    const mimeType=mimeCandidates.find(t=>MediaRecorder.isTypeSupported(t))||'';
    const recorderOptions={videoBitsPerSecond:6000000,audioBitsPerSecond:128000};
    if(mimeType) recorderOptions.mimeType=mimeType;
    recorder=new MediaRecorder(recordStream,recorderOptions);
    recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    const stopped=new Promise((resolve,reject)=>{
      recorder.onstop=resolve;
      recorder.onerror=e=>reject(e.error||new Error('MediaRecorder error'));
    });

    // Draw the first frame before recording starts, then keep the canvas in
    // lock-step with the same master video used by Quick Preview.
    video.currentTime=0;
    await new Promise(resolve=>{
      if(video.readyState>=3)resolve(); else video.addEventListener('canplay',resolve,{once:true});
    });
    draw();
    if(audioCtx?.state==='suspended')await audioCtx.resume();
    await video.play();
    recorder.start(250);
    const renderLoop=()=>{
      draw();
      if(recorder?.state==='recording')raf=requestAnimationFrame(renderLoop);
    };
    raf=requestAnimationFrame(renderLoop);

    // Download must follow the actual Quick Preview/master-video duration.
    // Do not impose a fixed 30s/45s cutoff; stop only when the source video ends.
    await new Promise(resolve=>{
      let done=false;
      const finish=()=>{if(done)return;done=true;resolve();};
      video.addEventListener('ended',finish,{once:true});
    });
    cancelAnimationFrame(raf);
    draw();
    if(recorder.state!=='inactive')recorder.stop();
    await stopped;
    video.pause();

    let blob=new Blob(chunks,{type:mime});
    const nativeMp4=mime.startsWith('video/mp4');
    if(!nativeMp4){
      status.textContent='⏳ Recording तैयार है — MP4 conversion शुरू हो रहा है…';
      if(!window.FFmpegWASM||!window.FFmpegUtil)
        throw new Error('इस browser में native MP4 नहीं है और MP4 conversion library उपलब्ध नहीं है।');

      const {FFmpeg}=window.FFmpegWASM,{fetchFile}=window.FFmpegUtil;
      const ffmpeg=new FFmpeg();

      // IMPORTANT: this is the ONLY conversion step.
      // The five scenes are NOT rendered again.
      ffmpeg.on('progress', ({progress})=>{
        const pct=Math.max(0,Math.min(100,Math.round((Number(progress)||0)*100)));
        status.textContent=`⏳ Final MP4 conversion… ${pct}%`;
      });

      const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
      // Download FFmpeg core files into same-origin Blob URLs first. This avoids
      // Chrome cross-origin worker/module issues that can leave exec() at 0%.
      const [coreURL,wasmURL,workerURL]=await Promise.all([
        FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.js`,'text/javascript'),
        FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.wasm`,'application/wasm'),
        FFmpegUtil.toBlobURL(`${base}/ffmpeg-core.worker.js`,'text/javascript')
      ]);
      const loadPromise=ffmpeg.load({
        coreURL,
        wasmURL,
        workerURL,
        classWorkerURL:new URL('assets/js/ffmpeg-class-worker.js?v=20261002-41',location.href).href
      });
      await Promise.race([
        loadPromise,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('MP4 converter 90 सेकंड में शुरू नहीं हुआ।')),90000))
      ]);

      await ffmpeg.writeFile('preview.webm',await fetchFile(blob));

      status.textContent='⏳ Final MP4 conversion… 0%';
      ffmpeg.on('log', ({message})=>{
        if(message && /error|failed|invalid|unable/i.test(message)) console.warn('FFmpeg:',message);
      });

      const execPromise=ffmpeg.exec([
        '-i','preview.webm',
        '-c:v','mpeg4',
        '-q:v','5',
        '-pix_fmt','yuv420p',
        '-threads','1',
        '-c:a','aac',
        '-b:a','128k',
        '-movflags','+faststart',
        '-y','final.mp4'
      ]);

      await Promise.race([
        execPromise,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('MP4 conversion 5 मिनट में पूरा नहीं हुआ।')),300000))
      ]);

      const data=await ffmpeg.readFile('final.mp4');
      blob=new Blob([data.buffer],{type:'video/mp4'});
      try{ffmpeg.terminate();}catch(_){}
    }

    const qid=questionId(selectedQuestion);
    const finalPath=`video-scenes/questions/${encodeURIComponent(String(qid))}/final/question-${encodeURIComponent(String(qid))}-final.mp4`;
    try{
      const {error}=await sb.storage.from(BUCKET).upload(finalPath,blob,{contentType:'video/mp4',upsert:true,cacheControl:'31536000'});
      if(error)throw error;
    }catch(saveErr){console.warn('Final MP4 storage save failed:',saveErr);}

    finalBlob=blob;
    if(finalObjectUrl)URL.revokeObjectURL(finalObjectUrl);
    finalObjectUrl=URL.createObjectURL(blob);
    preview.innerHTML=`<video controls autoplay playsinline src="${finalObjectUrl}"></video>`;
    document.getElementById('downloadFinalBtn').disabled=false;
    document.getElementById('publishFinalBtn').disabled=false;
    status.textContent='✅ Final MP4 तैयार है — Quick Preview की वही 5-image composition save हुई है।';
  }catch(e){
    console.error('Preview-to-MP4 failed:',e);
    status.textContent=`❌ Final MP4 failed: ${e.message||e}`;
  }finally{
    cancelAnimationFrame(raf);
    try{if(video)video.pause();}catch(_){ }
    try{if(audioCtx)await audioCtx.close();}catch(_){ }
    if(masterObjectUrl)URL.revokeObjectURL(masterObjectUrl);
    imageObjectUrls.forEach(u=>URL.revokeObjectURL(u));
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