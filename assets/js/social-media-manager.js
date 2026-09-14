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

/* AI Content Studio — Gemini secure backend connection */
(() => {
  const $ = (id) => document.getElementById(id);

  const btn = $("generateAiBtn");
  const out = $("aiGeneratedText");
  const status = $("aiStatus");
  const useBtn = $("useAiDraftBtn");
  const clearBtn = $("clearAiBtn");

  const AI_FUNCTION_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co/functions/v1/gemini-generate-post";

  const SUPABASE_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

  function setStatus(label, type = "") {
    if (!status) return;

    status.textContent = label;
    status.className =
      "ai-status" + (type ? " " + type : "");
  }

  function showError(message) {
    setStatus("ERROR", "error");

    if (out) {
      out.value =
        "Gemini AI connection में समस्या आई है।\n\n" +
        (message || "Unknown error");
    }

    if (useBtn) {
      useBtn.disabled = true;
    }
  }

  async function getAdminSession() {

    let sb = window.gsSupabaseClient;

    /*
     * अगर Social Media Manager page ने shared
     * Supabase client नहीं बनाया है तो यहाँ
     * सुरक्षित तरीके से client बनाया जाएगा।
     */
    if (!sb) {

      if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
      ) {
        throw new Error(
          "Supabase client उपलब्ध नहीं है। कृपया Admin Panel को दोबारा खोलें।"
        );
      }

      sb = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      window.gsSupabaseClient = sb;
    }

    /*
     * Current logged-in Admin session पढ़ें।
     */
    let result = await sb.auth.getSession();

    if (result.error) {
      throw new Error(
        "Admin Auth session पढ़ने में समस्या: " +
        result.error.message
      );
    }

    let session = result.data?.session;

    /*
     * अगर session नहीं मिली तो एक बार refresh करें।
     */
    if (!session?.access_token) {

      const refreshed =
        await sb.auth.refreshSession();

      if (refreshed.error) {
        throw new Error(
          "Secure Admin session उपलब्ध नहीं है। " +
          "कृपया Admin Panel में logout करके फिर login करें।"
        );
      }

      session =
        refreshed.data?.session;
    }

    if (!session?.access_token) {
      throw new Error(
        "Secure Admin session उपलब्ध नहीं है। " +
        "कृपया Admin Panel में logout करके फिर login करें।"
      );
    }

    return {
      client: sb,
      accessToken: session.access_token
    };
  }

  btn?.addEventListener("click", async () => {

    const type =
      $("aiPostType")?.value || "question";

    const classLevel =
      $("aiClass")?.value || "both";

    const language =
      $("aiLanguage")?.value || "hi";

    const topic =
      $("aiTopic")?.value.trim() || "";

    if (!out || !status) {
      return;
    }

    btn.disabled = true;

    setStatus("CONNECTING");

    out.value = "";

    if (useBtn) {
      useBtn.disabled = true;
    }

    try {

      /*
       * Secure Admin login session प्राप्त करें।
       */
      const { accessToken } =
        await getAdminSession();

      /*
       * Gemini Supabase Edge Function को request।
       */
      const response = await fetch(
        AI_FUNCTION_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            "Authorization":
              `Bearer ${accessToken}`,

            "apikey":
              SUPABASE_ANON_KEY
          },

          body: JSON.stringify({
            type: type,
            classLevel: classLevel,
            language: language,
            topic: topic
          })
        }
      );

      /*
       * पहले raw response पढ़ें ताकि
       * वास्तविक error भी दिखाई दे सके।
       */
      const raw =
        await response.text();

      let data = {};

      try {
        data =
          raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = {
          error: raw
        };
      }

      if (!response.ok) {

        throw new Error(
          data?.error ||
          data?.message ||
          `Gemini service error (${response.status})`
        );
      }

      /*
       * Gemini से text मिलना जरूरी है।
       */
      if (
        !data?.text ||
        !String(data.text).trim()
      ) {

        throw new Error(
          "Gemini ने खाली draft लौटाया।"
        );
      }

      /*
       * Generated AI content दिखाएँ।
       */
      out.value =
        String(data.text).trim();

      if (useBtn) {
        useBtn.disabled = false;
      }

      const modelText =
        data.model
          ? ` • ${data.model}`
          : "";

      setStatus(
        `GEMINI • CONNECTED • READY${modelText}`,
        "ready"
      );

      console.log(
        "Ganit Setu Gemini AI:",
        {
          provider:
            data.provider || "Gemini",

          model:
            data.model || "unknown",

          approvalRequired:
            data.approvalRequired !== false
        }
      );

    } catch (error) {

      console.error(
        "Gemini AI generation error:",
        error
      );

      showError(
        error?.message ||
        "Unknown Gemini error"
      );

    } finally {

      btn.disabled = false;
    }
  });

  /*
   * AI Draft को main Post composer में डालें।
   */
  useBtn?.addEventListener(
    "click",
    () => {

      if (!out?.value.trim()) {
        return;
      }

      const post =
        $("postText");

      if (post) {

        post.value =
          out.value.trim();

        post.dispatchEvent(
          new Event(
            "input",
            {
              bubbles: true
            }
          )
        );

        document
          .querySelector(".composer")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }
    }
  );

  /*
   * AI Draft clear करें।
   */
  clearBtn?.addEventListener(
    "click",
    () => {

      if (out) {
        out.value = "";
      }

      if (useBtn) {
        useBtn.disabled = true;
      }

      setStatus(
        "READY",
        "ready"
      );
    }
  );

})();


/* AI Image Studio — Cloudflare FLUX + clean text overlay */
(() => {
  const $ = (id) => document.getElementById(id);

  const generateBtn = $("generateAiImageBtn");
  const useBtn = $("useAiImageBtn");
  const clearBtn = $("clearAiImageBtn");
  const status = $("aiImageStatus");
  const previewBox = $("aiImagePreviewBox");

  const IMAGE_FUNCTION_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co/functions/v1/cloudflare-generate-image";

  const SUPABASE_URL =
    "https://cbgojvnbkosdehvwerth.supabase.co";

  const SUPABASE_ANON_KEY =
    "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

  let generatedImage = "";

  function setImageStatus(label, type = "") {
    if (!status) return;
    status.textContent = label;
    status.className =
      "ai-status" + (type ? " " + type : "");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[c]));
  }

  function showImageError(message) {
    setImageStatus("ERROR", "error");

    if (previewBox) {
      previewBox.innerHTML = `
        <div class="ai-image-error">
          <strong>⚠️ Image generate नहीं हो सकी</strong>
          <span>${escapeHtml(message || "Unknown error")}</span>
        </div>
      `;
    }

    if (useBtn) useBtn.disabled = true;
  }

  async function getAdminAccessToken() {
    let sb = window.gsSupabaseClient;

    if (!sb) {
      if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
      ) {
        throw new Error(
          "Supabase client उपलब्ध नहीं है। Admin Panel को दोबारा खोलें।"
        );
      }

      sb = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      window.gsSupabaseClient = sb;
    }

    let result = await sb.auth.getSession();

    if (result.error) {
      throw new Error(
        "Admin Auth session पढ़ने में समस्या: " +
        result.error.message
      );
    }

    let session = result.data?.session;

    if (!session?.access_token) {
      const refreshed = await sb.auth.refreshSession();

      if (refreshed.error) {
        throw new Error(
          "Secure Admin session उपलब्ध नहीं है। कृपया logout करके फिर login करें।"
        );
      }

      session = refreshed.data?.session;
    }

    if (!session?.access_token) {
      throw new Error(
        "Secure Admin session उपलब्ध नहीं है। कृपया Admin Panel में फिर login करें।"
      );
    }

    return session.access_token;
  }

  function getDefaultPosterTitle(type, language) {
    if (language === "en") {
      const map = {
        maths_motivation: "Learn Mathematics • Grow Every Day",
        maths_trick: "Maths Trick of the Day",
        concept: "Understand Maths Easily",
        formula: "Important Maths Formula",
        exam_tips: "Maths Exam Tips",
        chapter_poster: "Mathematics Chapter",
        daily_question: "Today's Maths Question",
        study_motivation: "Keep Learning Mathematics",
        app_update: "Ganit Setu App Update"
      };
      return map[type] || "Learn • Practice • Progress";
    }

    if (language === "hinglish") {
      const map = {
        maths_motivation: "Maths सीखें • आगे बढ़ें",
        maths_trick: "आज की Maths Trick",
        concept: "Maths Concept आसान बनाएं",
        formula: "Important Maths Formula",
        exam_tips: "Maths Exam Tips",
        chapter_poster: "Maths Chapter",
        daily_question: "Aaj ka Maths Question",
        study_motivation: "Maths पढ़ें • आगे बढ़ें",
        app_update: "Ganit Setu App Update"
      };
      return map[type] || "Learn • Practice • Progress";
    }

    const map = {
      maths_motivation: "गणित सीखें • आगे बढ़ें",
      maths_trick: "आज की गणित Trick",
      concept: "गणित को आसान बनाएं",
      formula: "महत्वपूर्ण गणित सूत्र",
      exam_tips: "गणित परीक्षा की तैयारी",
      chapter_poster: "गणित अध्याय",
      daily_question: "आज का गणित प्रश्न",
      study_motivation: "गणित पढ़ें • आगे बढ़ें",
      app_update: "Ganit Setu App Update"
    };

    return map[type] || "गणित सीखें • अभ्यास करें • आगे बढ़ें";
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return y;

    let line = "";
    let lines = [];

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;

      if (
        ctx.measureText(test).width > maxWidth &&
        line
      ) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }

      if (lines.length >= maxLines) break;
    }

    if (lines.length < maxLines && line) {
      lines.push(line);
    }

    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] =
        lines[maxLines - 1].replace(/[.…]+$/, "") + "…";
    }

    lines.forEach((item, index) => {
      ctx.fillText(item, x, y + index * lineHeight);
    });

    return y + lines.length * lineHeight;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /*
   * FLUX background को final Ganit Setu poster में बदलें।
   * AI image में Hindi/Maths text नहीं रखेंगे;
   * verified/admin-provided text browser canvas पर साफ लिखा जाएगा।
   */
  async function composeFinalPoster(
    imageUrl,
    title,
    language,
    aspectRatio
  ) {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () =>
        reject(new Error("Generated image preview load नहीं हो सकी।"));
      img.src = imageUrl;
    });

    const canvas = document.createElement("canvas");

    let width = 1024;
    let height = 1024;

    if (aspectRatio === "16:9") {
      width = 1280;
      height = 720;
    } else if (aspectRatio === "9:16") {
      width = 720;
      height = 1280;
    } else if (aspectRatio === "4:5") {
      width = 1024;
      height = 1280;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Poster canvas उपलब्ध नहीं है।");
    }

    // Cover-crop background.
    const scale = Math.max(
      width / img.naturalWidth,
      height / img.naturalHeight
    );

    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = (width - drawW) / 2;
    const drawY = (height - drawH) / 2;

    ctx.drawImage(
      img,
      drawX,
      drawY,
      drawW,
      drawH
    );

    // Dark translucent top gradient for readable title.
    const topGradient =
      ctx.createLinearGradient(0, 0, 0, height * 0.34);

    topGradient.addColorStop(0, "rgba(0,0,0,0.68)");
    topGradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = topGradient;
    ctx.fillRect(
      0,
      0,
      width,
      height * 0.36
    );

    // Bottom branding gradient.
    const bottomGradient =
      ctx.createLinearGradient(
        0,
        height * 0.72,
        0,
        height
      );

    bottomGradient.addColorStop(
      0,
      "rgba(0,0,0,0)"
    );

    bottomGradient.addColorStop(
      1,
      "rgba(0,0,0,0.72)"
    );

    ctx.fillStyle = bottomGradient;
    ctx.fillRect(
      0,
      height * 0.68,
      width,
      height * 0.32
    );

    // Branding.
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font =
      '800 34px "Noto Sans Devanagari", "Nirmala UI", Arial, sans-serif';

    ctx.fillText(
      "GANIT SETU",
      42,
      54
    );

    // Correct title / topic supplied by the Admin.
    const safeTitle =
      title ||
      getDefaultPosterTitle(
        $("aiImageType")?.value || "maths_motivation",
        language
      );

    const titleSize =
      width <= 720 ? 44 : 56;

    ctx.font =
      `800 ${titleSize}px "Noto Sans Devanagari", "Nirmala UI", Arial, sans-serif`;

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;

    wrapCanvasText(
      ctx,
      safeTitle,
      42,
      142,
      width - 84,
      titleSize + 10,
      3
    );

    ctx.shadowBlur = 0;

    // Bottom verified branding text.
    ctx.fillStyle = "#ffffff";
    ctx.font =
      '700 25px "Noto Sans Devanagari", "Nirmala UI", Arial, sans-serif';

    ctx.fillText(
      language === "en"
        ? "Learn • Practice • Progress"
        : "गणित सीखें • अभ्यास करें • आगे बढ़ें",
      42,
      height - 62
    );

    return canvas.toDataURL(
      "image/png",
      1.0
    );
  }

  function showGeneratedImage(dataUrl) {
    generatedImage = dataUrl;

    if (!previewBox) return;

    previewBox.innerHTML = "";

    const img = document.createElement("img");
    img.id = "aiGeneratedImage";
    img.src = dataUrl;
    img.alt = "Ganit Setu final AI poster";
    img.loading = "eager";

    previewBox.appendChild(img);

    if (useBtn) useBtn.disabled = false;
  }

  generateBtn?.addEventListener("click", async () => {
    const type =
      $("aiImageType")?.value || "maths_motivation";

    const classLevel =
      $("aiImageClass")?.value || "both";

    const language =
      $("aiImageLanguage")?.value || "hi";

    const aspectRatio =
      $("aiImageAspect")?.value || "1:1";

    const style =
      $("aiImageStyle")?.value || "colorful_educational";

    const topic =
      $("aiImageTopic")?.value.trim() || "";

    if (!previewBox) return;

    generateBtn.disabled = true;
    setImageStatus("GENERATING...");
    if (useBtn) useBtn.disabled = true;

    previewBox.innerHTML = `
      <div class="ai-image-loading">
        <div class="ai-spinner"></div>
        <strong>आपकी Ganit Setu image तैयार हो रही है...</strong>
        <span>Cloudflare FLUX visual + साफ Ganit Setu text</span>
      </div>
    `;

    try {
      const accessToken =
        await getAdminAccessToken();

      const response =
        await fetch(
          IMAGE_FUNCTION_URL,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "Authorization":
                `Bearer ${accessToken}`,
              "apikey":
                SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
              type,
              classLevel,
              language,
              topic,
              style,
              aspectRatio
            })
          }
        );

      const raw =
        await response.text();

      let data = {};

      try {
        data =
          raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = {
          error: raw
        };
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          data?.message ||
          `Cloudflare Image service error (${response.status})`
        );
      }

      const imageUrl =
        data?.image ||
        data?.imageUrl ||
        data?.dataUrl ||
        "";

      if (!imageUrl) {
        throw new Error(
          "Cloudflare ने response दिया लेकिन image data नहीं मिली।"
        );
      }

      const finalTitle =
        topic ||
        getDefaultPosterTitle(
          type,
          language
        );

      setImageStatus(
        "COMPOSING POSTER..."
      );

      const finalPoster =
        await composeFinalPoster(
          imageUrl,
          finalTitle,
          language,
          aspectRatio
        );

      showGeneratedImage(
        finalPoster
      );

      setImageStatus(
        "CLOUDFLARE • IMAGE READY",
        "ready"
      );

    } catch (error) {
      console.error(
        "Cloudflare image generation error:",
        error
      );

      showImageError(
        error?.message ||
        "Unknown Cloudflare image error"
      );

    } finally {
      generateBtn.disabled = false;
    }
  });

  useBtn?.addEventListener("click", () => {
    if (!generatedImage) return;

    const mediaImg =
      $("mediaPreview");

    const previewWrap =
      $("mediaPreviewWrap");

    const uploadBox =
      $("mediaUploadBox");

    const postText =
      $("postText");

    const caption =
      $("aiImageCaption")
        ?.value.trim() || "";

    if (!mediaImg || !previewWrap) {
      alert(
        "Post image area नहीं मिला। कृपया page को refresh करके फिर कोशिश करें।"
      );
      return;
    }

    mediaImg.src =
      generatedImage;

    previewWrap.hidden =
      false;

    if (uploadBox) {
      uploadBox.hidden =
        false;
    }

    const hint =
      $("mediaUploadHint");

    if (hint) {
      hint.textContent =
        "✨ Final Ganit Setu poster तैयार है।";
    }

    if (
      caption &&
      postText
    ) {
      postText.value =
        caption;

      postText.dispatchEvent(
        new Event(
          "input",
          {
            bubbles: true
          }
        )
      );
    }

    document
      .querySelector("#previewBtn")
      ?.click();

    document
      .querySelector(".composer")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
  });

  clearBtn?.addEventListener(
    "click",
    () => {
      generatedImage = "";

      if (previewBox) {
        previewBox.innerHTML = `
          <div class="ai-image-placeholder">
            <div>🖼️</div>
            <span>आपकी colorful Ganit Setu image यहाँ दिखाई देगी।</span>
          </div>
        `;
      }

      if (useBtn) {
        useBtn.disabled = true;
      }

      setImageStatus(
        "READY",
        "ready"
      );
    }
  );
})();
