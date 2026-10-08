(function(){
  const SUPABASE_URL='https://cbgojvnbkosdehvwerth.supabase.co';
  const ANON='sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
  const AI_URL=SUPABASE_URL+'/functions/v1/gemini-generate-post';
  const sb=window.supabaseClient || window.supabase.createClient(SUPABASE_URL,ANON);
  let currentQuestion=null, currentPlatform='facebook', currentType='post', generatedDraft='';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  function msg(t,kind='info'){const e=$('ccNotice'); if(e){e.textContent=t;e.className='notice '+kind;e.hidden=false;setTimeout(()=>e.hidden=true,5000)}}
  function renderQuestion(q){
    currentQuestion=q||null;
    const box=$('currentQuestion');
    if(!q){box.innerHTML='<div class="empty">अभी कोई Question selected नहीं है। ऊपर से ✨ Generate Question दबाएँ।</div>'; return;}
    box.innerHTML=`<div class="q-card"><div><span class="qid">Q${esc(q.id)}</span><span class="meta">Class ${esc(q.class_level)} · Chapter ${esc(q.chapter_number)} — ${esc(q.chapter_name||'')}</span><h3>${esc(q.question_text)}</h3><div class="opts"><span>A) ${esc(q.option_a)}</span><span>B) ${esc(q.option_b)}</span><span>C) ${esc(q.option_c)}</span><span>D) ${esc(q.option_d)}</span></div><div class="answer">✓ Correct: ${esc(q.correct_option||q.correct_answer||'—')} &nbsp; 💡 ${esc(q.hint||'')}</div></div><button id="clearCurrent" class="ghost">✕ Clear</button></div>`;
    $('clearCurrent').onclick=()=>{currentQuestion=null;renderQuestion(null);updateState()};
  }
  async function generateQuestion(){
    const cls=Number($('ccClass').value);
    const btn=$('generateQuestion');btn.disabled=true;btn.textContent='⏳ नया Question खोज रहे हैं...';
    try{
      let query=sb.from('questions').select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,correct_answer,hint,explanation').eq('class_level',cls).order('id',{ascending:true}).limit(500);
      const ch=$('ccChapter').value;if(ch&&ch!=='all')query=query.eq('chapter_number',Number(ch));
      const {data,error}=await query;if(error)throw error;
      const rows=data||[]; if(!rows.length)throw new Error('इस Class/Chapter के लिए कोई Question उपलब्ध नहीं है।');
      const used=JSON.parse(localStorage.getItem('gsContentUsedQuestionIds')||'[]').map(String);
      let fresh=rows.filter(q=>!used.includes(String(q.id)));
      if(!fresh.length){localStorage.removeItem('gsContentUsedQuestionIds');fresh=rows;msg('Question pool पूरा हो गया था। अब pool फिर से शुरू किया गया है।','info')}
      const q=fresh[Math.floor(Math.random()*fresh.length)];
      currentQuestion=q;localStorage.setItem('gsCurrentContentQuestion',JSON.stringify(q));localStorage.setItem('gsContentUsedQuestionIds',JSON.stringify([...used,String(q.id)]));
      renderQuestion(q);updateState();msg(`Q${q.id} तैयार है। अब इसी Question पर Content बनाइए।`,'success');
    }catch(e){console.error(e);msg(e.message||'Question generate नहीं हो सका।','error')}
    finally{btn.disabled=false;btn.textContent='✨ Generate New Question'}
  }
  async function loadChapters(){
    const cls=Number($('ccClass').value);const sel=$('ccChapter');sel.innerHTML='<option value="all">All Chapters</option>';
    const {data}=await sb.from('questions').select('chapter_number,chapter_name').eq('class_level',cls).order('chapter_number',{ascending:true});
    const seen=new Set();(data||[]).forEach(q=>{const k=String(q.chapter_number);if(!seen.has(k)){seen.add(k);sel.insertAdjacentHTML('beforeend',`<option value="${esc(k)}">Chapter ${esc(k)} — ${esc(q.chapter_name||'')}</option>`)}})
  }
  function updateState(){
    $('currentPlatform').textContent=currentPlatform==='facebook'?'Facebook':currentPlatform==='instagram'?'Instagram':currentPlatform==='youtube'?'YouTube':'WhatsApp Channel';
    $('currentType').textContent=currentType;
    $('workspaceQuestion').textContent=currentQuestion?`Q${currentQuestion.id} · Class ${currentQuestion.class_level} · Chapter ${currentQuestion.chapter_number}`:'—';
    document.querySelectorAll('[data-platform]').forEach(b=>b.classList.toggle('active',b.dataset.platform===currentPlatform));
    document.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===currentType));
    const video=currentType==='reel'||currentType==='video';
    $('postStudio').hidden=!(currentType==='post'&&currentPlatform!=='youtube');
    $('imageStudio').hidden=currentType!=='image';
    $('videoStudio').hidden=!video;
    $('youtubeMeta').hidden=currentPlatform!=='youtube';
    $('whatsappNote').hidden=currentPlatform!=='whatsapp';
  }
  async function generatePost(){
    if(!currentQuestion){msg('पहले एक Question generate करें।','error');return}
    const btn=$('generatePost');btn.disabled=true;btn.textContent='⏳ Gemini Draft बना रहा है...';$('postOutput').value='';
    try{const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error('Admin session उपलब्ध नहीं है।');
      const type=$('postType').value,lang=$('postLanguage').value,instruction=$('postInstruction').value.trim();
      const topic=[`Selected Question: ${currentQuestion.question_text}`,`Options: A) ${currentQuestion.option_a}; B) ${currentQuestion.option_b}; C) ${currentQuestion.option_c}; D) ${currentQuestion.option_d}`,`Correct: ${currentQuestion.correct_option||currentQuestion.correct_answer||''}`,`Hint: ${currentQuestion.hint||''}`,`Explanation: ${currentQuestion.explanation||''}`,`Chapter: ${currentQuestion.chapter_name||currentQuestion.chapter_number}`,instruction?`Instruction: ${instruction}`:''].filter(Boolean).join('\n');
      const r=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':ANON},body:JSON.stringify({type,classLevel:String(currentQuestion.class_level),language:lang,topic})});
      const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{d={error:raw}};if(!r.ok||!d.text)throw new Error(d.error||d.message||`Gemini error ${r.status}`);generatedDraft=d.text.trim();$('postOutput').value=generatedDraft;$('useDraft').disabled=false;$('postStatus').textContent='GEMINI • CONNECTED • READY';msg('Draft तैयार है। Verify/Edit करके Save करें।','success');
    }catch(e){console.error(e);$('postStatus').textContent='ERROR';msg(e.message,'error')}finally{btn.disabled=false;btn.textContent='✨ AI Draft Generate करें'}
  }
  function saveCurrent(){if(!currentQuestion){msg('पहले Question generate करें।','error');return}const key='gsContentPackages';const all=JSON.parse(localStorage.getItem(key)||'[]');const pkg={id:crypto.randomUUID(),question_id:currentQuestion.id,class_level:currentQuestion.class_level,platform:currentPlatform,content_type:currentType,draft:generatedDraft,created_at:new Date().toISOString(),status:'saved'};all.unshift(pkg);localStorage.setItem(key,JSON.stringify(all.slice(0,100)));msg('Content package Save हो गया।','success');renderReport()}
  function renderReport(){const all=JSON.parse(localStorage.getItem('gsContentPackages')||'[]');$('savedCount').textContent=all.length;$('publishedCount').textContent=all.filter(x=>x.status==='published').length;$('pendingCount').textContent=all.filter(x=>x.status!=='published').length;}
  function bind(){
    $('generateQuestion').onclick=generateQuestion;$('ccClass').onchange=loadChapters;$('ccChapter').onchange=()=>{};
    document.querySelectorAll('[data-platform]').forEach(b=>b.onclick=()=>{currentPlatform=b.dataset.platform;updateState()});
    document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{currentType=b.dataset.type;updateState()});
    $('generatePost').onclick=generatePost;$('savePackage').onclick=saveCurrent;$('saveDraft').onclick=saveCurrent;
    $('useDraft').onclick=()=>{$('postOutput').focus();msg('Draft workspace में रख दिया गया है। आप verify/edit करके Save करें।','success')};
    $('newQuestion').onclick=()=>generateQuestion();
    $('previewPackage').onclick=()=>{if(!currentQuestion){msg('पहले Question चुनें।','error');return} $('previewText').textContent=generatedDraft||'इस Content का preview अभी तैयार नहीं है।';$('previewModal').hidden=false};
    $('closePreview').onclick=()=>$('previewModal').hidden=true;
  }
  document.addEventListener('DOMContentLoaded',async()=>{bind();renderReport();await loadChapters();const old=JSON.parse(localStorage.getItem('gsCurrentContentQuestion')||'null');if(old){currentQuestion=old;renderQuestion(old)}updateState()});
})();
