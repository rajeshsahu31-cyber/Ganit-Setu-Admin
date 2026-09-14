(() => {
  const $ = (id) => document.getElementById(id);
  const text = $("postText");
  const preview = $("previewCard");
  const content = $("previewContent");
  const targetsOut = $("previewTargets");
  const timeOut = $("previewTime");
  const status = $("previewStatus");
  const historyList = $("postHistoryList");
  const HISTORY_KEY = "gs_social_posts";
  const publishPanel = $("publishPanel");
  const scheduleFields = $("scheduleFields");
  const scheduleDate = $("scheduleDate");
  const scheduleTime = $("scheduleTime");
  const publishNowBtn = $("publishNowBtn");
  const cancelPublishBtn = $("cancelPublishBtn");
  let approvedPostId = null;
  let publishMode = "now";

  function selectedTargetValues() {
    return [...document.querySelectorAll('.checks input:checked')].map(x => x.value);
  }
  function selectedTargets() {
    return [...document.querySelectorAll('.checks input:checked')].map(x => x.parentElement.textContent.trim());
  }
  function currentImage() {
    const img = $("mediaPreview");
    return img && !$("mediaPreviewWrap").hidden && img.src ? img.src : "";
  }
  function renderPreview(state = "Draft") {
    const value = text.value.trim();
    const img = currentImage();
    content.innerHTML = "";
    if (img) {
      const image = document.createElement("img");
      image.src = img; image.className = "preview-image"; image.alt = "Post image";
      content.appendChild(image);
    }
    const caption = document.createElement("div");
    caption.className = "preview-caption";
    caption.textContent = value || "यहाँ आपकी पोस्ट का preview दिखाई देगा।";
    content.appendChild(caption);
    targetsOut.textContent = selectedTargets().join("  •  ") || "कोई platform selected नहीं";
    timeOut.textContent = new Date().toLocaleString("hi-IN");
    status.textContent = state;
    preview.hidden = false;
  }

  function getPosts() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch (_) { return []; }
  }
  function savePosts(posts) { localStorage.setItem(HISTORY_KEY, JSON.stringify(posts)); }
  function escapeHtml(v) {
    return String(v || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }
  function renderHistory() {
    if (!historyList) return;
    const posts = getPosts();
    if (!posts.length) {
      historyList.innerHTML = '<div class="empty-history">अभी कोई saved post नहीं है। Preview या Save Draft के बाद यहाँ पोस्ट दिखाई देगी।</div>';
      return;
    }
    historyList.innerHTML = posts.map(p => `
      <article class="history-item">
        ${p.image ? `<img src="${p.image}" alt="Post image">` : '<div class="history-no-image">📝</div>'}
        <div class="history-main">
          <div class="history-top"><span class="history-status ${p.status.toLowerCase().replace(/\s+/g,'-')}">${escapeHtml(p.status)}</span><small>${escapeHtml(new Date(p.updatedAt).toLocaleString('hi-IN'))}</small></div>
          <div class="history-text">${escapeHtml(p.text || 'बिना caption')}</div>
          <div class="history-targets">${escapeHtml(p.targets.join(' • ') || 'No platform')}</div>
          <div class="history-actions">
            <button type="button" data-action="edit" data-id="${p.id}">✏️ Edit</button>
            <button type="button" data-action="duplicate" data-id="${p.id}">📋 Duplicate</button>
            <button type="button" class="delete-btn" data-action="delete" data-id="${p.id}">🗑️ Delete</button>
          </div>
        </div>
      </article>`).join("");
  }
  function addHistory(statusText) {
    const post = { id: Date.now().toString(), text: text.value.trim(), targets: selectedTargetValues(), image: currentImage(), status: statusText, updatedAt: new Date().toISOString() };
    const posts = getPosts();
    posts.unshift(post); savePosts(posts.slice(0, 50)); renderHistory(); return post;
  }
  function loadPost(p) {
    text.value = p.text || "";
    document.querySelectorAll('.checks input').forEach(x => x.checked = p.targets.includes(x.value));
    if (p.image) { $("mediaPreview").src = p.image; $("mediaPreviewWrap").hidden = false; }
    renderPreview("Editing"); window.scrollTo({top:0, behavior:'smooth'});
  }

  $("previewBtn").addEventListener("click", () => renderPreview("Preview"));
  $("saveDraftBtn").addEventListener("click", () => {
    localStorage.setItem("gs_social_draft", JSON.stringify({text:text.value,targets:selectedTargetValues(),image:currentImage(),savedAt:new Date().toISOString()}));
    addHistory("Draft"); renderPreview("Saved Draft"); alert("Draft सुरक्षित कर दिया गया है और Post History में जोड़ दिया गया है।");
  });
  $("approveBtn").addEventListener("click", () => {
    if (!text.value.trim() && !currentImage()) { alert("पहले Post text या image तैयार कीजिए।"); text.focus(); return; }
    const post = addHistory("Approved");
    approvedPostId = post.id;
    renderPreview("Approved");
    if (publishPanel) {
      publishPanel.hidden = false;
      publishPanel.scrollIntoView({behavior:"smooth", block:"start"});
    }
  });

  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    publishMode = btn.dataset.mode;
    scheduleFields.hidden = publishMode !== 'schedule';
    if (publishMode === 'now') publishNowBtn.textContent = '🚀 Publish Now';
    else publishNowBtn.textContent = '🗓️ Schedule Post';
  }));

  cancelPublishBtn?.addEventListener('click', () => {
    publishPanel.hidden = true;
    approvedPostId = null;
  });

  publishNowBtn?.addEventListener('click', () => {
    if (!approvedPostId) { alert('पहले किसी post को Approve कीजिए।'); return; }
    if (publishMode === 'schedule') {
      if (!scheduleDate.value || !scheduleTime.value) {
        alert('Schedule के लिए Date और Time दोनों चुनिए।');
        return;
      }
      const when = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
      if (Number.isNaN(when.getTime()) || when <= new Date()) {
        alert('Future Date और Time चुनिए।');
        return;
      }
      updatePostStatus(approvedPostId, 'Scheduled', {scheduledAt: when.toISOString()});
      renderPreview('Scheduled');
      publishPanel.hidden = true;
      alert(`Post ${when.toLocaleString('hi-IN')} के लिए schedule हो गई है।\n\nActual social-platform publishing API connection के बाद यह अपने-आप publish होगी।`);
      return;
    }
    alert('Social platform API अभी connected नहीं है।\n\nपहले YouTube / Facebook / Instagram / WhatsApp की official API + OAuth connection जोड़नी होगी। Post को Published नहीं दिखाया गया है।');
  });

  function updatePostStatus(id, statusText, extra = {}) {
    const posts = getPosts();
    const i = posts.findIndex(x => x.id === id);
    if (i < 0) return;
    posts[i] = {...posts[i], ...extra, status: statusText, updatedAt: new Date().toISOString()};
    savePosts(posts);
    renderHistory();
  }
  historyList?.addEventListener("click", e => {
    const btn=e.target.closest("button[data-action]"); if(!btn)return;
    const id=btn.dataset.id, action=btn.dataset.action;
    const posts=getPosts(), post=posts.find(x=>x.id===id); if(!post)return;
    if(action==='delete'){
      if(!confirm('क्या आप इस पोस्ट को Delete करना चाहते हैं?\n\nयह action इस Post History से पोस्ट हटा देगा।')) return;
      savePosts(posts.filter(x=>x.id!==id)); renderHistory(); return;
    }
    if(action==='edit'){ loadPost(post); return; }
    if(action==='duplicate'){
      const copy={...post,id:Date.now().toString(),status:'Draft',updatedAt:new Date().toISOString()};
      savePosts([copy,...posts].slice(0,50)); renderHistory(); alert('Post duplicate होकर Draft के रूप में जोड़ दी गई है।');
    }
  });

  try {
    const d=JSON.parse(localStorage.getItem("gs_social_draft")||"null");
    if(d){ text.value=d.text||""; document.querySelectorAll('.checks input').forEach(x=>x.checked=d.targets?.includes(x.value)??true); if(d.image){$("mediaPreview").src=d.image;$("mediaPreviewWrap").hidden=false;} }
  } catch (_) {}
  renderHistory();

  /* Content Studio */
  const buttons=document.querySelectorAll('.format-card');
  const uploadBox=$("mediaUploadBox"), bannerTools=$("bannerTools"), videoTools=$("videoTools");
  const fileInput=$("mediaFile"), mediaImg=$("mediaPreview"), previewWrap=$("mediaPreviewWrap"), remove=$("removeMedia");
  const canvas=$("bannerCanvas"), generated=$("generatedBanner"); let bannerData='';
  function setFormat(f){
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.format===f));
    uploadBox.hidden=!['image','banner'].includes(f); bannerTools.hidden=f!=='banner'; videoTools.hidden=f!=='video';
    if(f==='image'){$("mediaUploadTitle").textContent='Image Post';$("mediaUploadHint").textContent='JPG, PNG या WebP image चुनें।';}
    else if(f==='banner'){$("mediaUploadTitle").textContent='Banner Post';$("mediaUploadHint").textContent='अपना banner upload करें या नीचे branded banner बनाएं।';}
  }
  buttons.forEach(b=>b.addEventListener('click',()=>setFormat(b.dataset.format)));
  fileInput?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>6*1024*1024){alert('Image 6 MB से छोटी रखें।');e.target.value='';return;}const r=new FileReader();r.onload=ev=>{mediaImg.src=ev.target.result;previewWrap.hidden=false;renderPreview('Preview');};r.readAsDataURL(f);});
  remove?.addEventListener('click',()=>{mediaImg.src='';previewWrap.hidden=true;fileInput.value='';renderPreview('Draft');});
  document.querySelectorAll('.template-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.template-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    const p={question:['आज का गणित प्रश्न','Class 9th & 10th • Practice','यहाँ आज का सवाल लिखें'],trick:['Maths Trick of the Day','सीखें • समझें • याद रखें','यहाँ Maths Trick लिखें'],test:['Ganit Setu Test Announcement','Class 9th & 10th','आज का Test जरूर दें!'],app:['Ganit Setu App Update','Learn • Practice • Progress','नई सुविधा / महत्वपूर्ण जानकारी']}[btn.dataset.template];
    $("bannerTitle").value=p[0];$("bannerSubtitle").value=p[1];$("bannerBody").value=p[2];
  }));
  $("buildBanner")?.addEventListener('click',()=>{
    const ctx=canvas.getContext('2d'),title=$("bannerTitle").value.trim()||'आज का गणित प्रश्न',sub=$("bannerSubtitle").value.trim()||'Class 9th & 10th • Ganit Setu',body=$("bannerBody").value.trim()||'गणित सीखें, अभ्यास करें और आगे बढ़ें।';
    const g=ctx.createLinearGradient(0,0,1200,630);g.addColorStop(0,'#0b3d91');g.addColorStop(.55,'#087f5b');g.addColorStop(1,'#f59f00');ctx.fillStyle=g;ctx.fillRect(0,0,1200,630);
    ctx.fillStyle='rgba(255,255,255,.10)';for(let x=-80;x<1400;x+=180){ctx.beginPath();ctx.arc(x,90,85,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#fff';ctx.font='bold 52px Arial';ctx.fillText('GANIT SETU',70,82);ctx.font='bold 52px Arial';wrap(ctx,title,70,190,1060,64);ctx.font='28px Arial';ctx.fillStyle='#fff7d6';wrap(ctx,sub,70,350,1060,40);ctx.font='34px Arial';ctx.fillStyle='#fff';wrap(ctx,body,70,445,1060,46);ctx.font='bold 22px Arial';ctx.fillStyle='#fff7d6';ctx.fillText('Practice • Learn • Progress • Succeed',70,575);bannerData=canvas.toDataURL('image/png');generated.hidden=false;
  });
  function wrap(ctx,t,x,y,max,line){let row='';for(const word of t.split(/\s+/)){const test=row?row+' '+word:word;if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,y);row=word;y+=line;}else row=test;}if(row)ctx.fillText(row,x,y);}
  $("useBanner")?.addEventListener('click',()=>{if(!bannerData)return;mediaImg.src=bannerData;previewWrap.hidden=false;$("mediaUploadHint").textContent='Banner Preview तैयार है।';renderPreview('Preview');});
})();

/* AI Content Studio (secure backend ready) */
(() => {
  const $ = (id) => document.getElementById(id);
  const btn = $('generateAiBtn');
  const out = $('aiGeneratedText');
  const status = $('aiStatus');
  const useBtn = $('useAiDraftBtn');
  const clearBtn = $('clearAiBtn');

  // IMPORTANT: No OpenAI key or platform secret is stored here.
  // This URL points to the Supabase Edge Function that must be deployed securely.
  const AI_FUNCTION_URL = 'https://cbgojvnbkosdehvwerth.supabase.co/functions/v1/ai-generate-post';

  function setStatus(label, type='') {
    if (!status) return;
    status.textContent = label;
    status.className = 'ai-status' + (type ? ' ' + type : '');
  }

  btn?.addEventListener('click', async () => {
    const type = $('aiPostType')?.value || 'question';
    const classLevel = $('aiClass')?.value || 'both';
    const language = $('aiLanguage')?.value || 'hi';
    const topic = $('aiTopic')?.value.trim() || '';

    btn.disabled = true;
    setStatus('GENERATING');
    out.value = '';

    try {
      const session = window.supabase?.auth ? await window.supabase.auth.getSession() : null;
      const accessToken = session?.data?.session?.access_token;
      if (!accessToken) throw new Error('Admin secure session उपलब्ध नहीं है। पहले secure admin login जोड़ना होगा।');

      const response = await fetch(AI_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ type, classLevel, language, topic })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `AI service error (${response.status})`);

      out.value = data.text || '';
      useBtn.disabled = !out.value.trim();
      setStatus('READY', 'ready');
    } catch (error) {
      console.error('AI generation error:', error);
      setStatus('NOT CONNECTED', 'error');
      out.value = 'AI Generator अभी secure backend से connected नहीं है।\n\nयह जानबूझकर सुरक्षित रखा गया है—API key को browser में नहीं रखा गया है। Supabase Edge Function + secure Admin Login connect होने के बाद यहीं से AI drafts generate होंगे।';
      useBtn.disabled = true;
    } finally {
      btn.disabled = false;
    }
  });

  useBtn?.addEventListener('click', () => {
    if (!out.value.trim()) return;
    const post = document.getElementById('postText');
    if (post) {
      post.value = out.value.trim();
      post.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  clearBtn?.addEventListener('click', () => {
    out.value = '';
    useBtn.disabled = true;
    setStatus('READY', 'ready');
  });
})();
