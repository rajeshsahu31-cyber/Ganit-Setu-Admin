/* Ganit Setu — Content Day Planning
   Clean build: dynamic question allocation, no question-wise mapping UI,
   no per-question publishing, no duplicate legacy handlers.
*/
(function () {
  'use strict';

  const GS_SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const GS_SUPABASE_ANON_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
  const VERIFY_PLATFORM_FUNCTION = `${GS_SUPABASE_URL}/functions/v1/verify-platform-publish`;

  let authClient = window.supabaseClient || null;
  let supabase = window.supabaseClient || null;
  let currentPlan = [];
  let displayPlan = [];
  let currentPlanId = null;
  let allocation = [];

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  function loadSupabaseLibrary() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Supabase library load नहीं हुई।'));
      document.head.appendChild(script);
    });
  }

  async function ensureSupabaseClient() {
    await loadSupabaseLibrary();
    authClient = window.supabaseClient || authClient;
    if (!authClient) {
      authClient = window.supabase.createClient(GS_SUPABASE_URL, GS_SUPABASE_ANON_KEY);
      window.supabaseClient = authClient;
    }
    supabase = authClient;
  }

  function showNotice(kind, message) {
    const box = $('#notice');
    if (!box) return;
    box.className = `notice ${kind}`;
    box.textContent = message;
    box.hidden = false;
  }

  function copyText(text, success = 'Copied.') {
    navigator.clipboard.writeText(text).then(() => showNotice('success', success))
      .catch(() => showNotice('error', 'Copy नहीं हो सका।'));
  }

  function copyPlanId() {
    if (currentPlanId) copyText(currentPlanId, 'Plan ID copied.');
  }

  function populateDayFilter() {
    const f = $('#dayFilter');
    const n = Number($('#days')?.value || 1);
    if (!f) return;
    f.innerHTML = '<option value="all">सभी Days</option>' +
      Array.from({ length:n }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join('');
  }

  function getContentRequirements() {
    const result = { '9': {}, '10': {} };
    document.querySelectorAll('.content-count').forEach(sel => {
      const cls = String(sel.dataset.class);
      const type = String(sel.dataset.type);
      result[cls][type] = Math.max(0, Math.min(5, Number(sel.value || 0)));
    });
    return result;
  }

  function enforceThumbnailRule() {
    document.querySelectorAll('.requirement-class-card').forEach(card => {
      const video = card.querySelector('.content-count[data-type="video"]');
      const thumb = card.querySelector('.content-count[data-type="thumbnail"]');
      if (!video || !thumb) return;
      thumb.value = video.value;
      thumb.disabled = true;
      thumb.title = 'Thumbnail हमेशा Video Question से बनेगा।';
    });
  }

  function renderRequirementSummary() {
    enforceThumbnailRule();
    const box = $('#requirementSummary');
    if (!box) return;
    const req = getContentRequirements();
    box.innerHTML = [9,10].map(cls => {
      const x = req[String(cls)] || {};
      const parts = [
        x.post ? `📱 Post ${x.post}` : '',
        x.image ? `🖼️ Image ${x.image}` : '',
        x.video ? `🎬 Reel/Video ${x.video}` : '',
        x.video ? `🖼️ Thumbnail ${x.video} (Video से)` : ''
      ].filter(Boolean);
      return `<div><b>Class ${cls}:</b> ${parts.length ? parts.join(' • ') : 'आज कोई content नहीं चुना'}</div>`;
    }).join('');
  }

  function bindRequirementControls() {
    document.querySelectorAll('.content-count').forEach(sel => {
      sel.addEventListener('change', renderRequirementSummary);
    });
    document.querySelectorAll('.select-all-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`.content-count[data-class="${btn.dataset.class}"]`).forEach(sel => {
          sel.value = '0';
        });
        renderRequirementSummary();
      });
    });
    renderRequirementSummary();
  }

  function bindEvents() {
    $('#generateBtn')?.addEventListener('click', generatePlan);
    $('#days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
    $('#startDate')?.addEventListener('change', loadPoolStatus);
    $('#copyPlanIdBtn')?.addEventListener('click', copyPlanId);
    ['dayFilter','classFilter','typeFilter'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderPlan);
    });
    $('#reviewPublishBtn')?.addEventListener('click', () => showNotice('info', 'Review & Publish अगला चरण है; अभी Content Day Planning तक ही setup किया गया है।'));
  }

  async function loadPoolStatus() {
    const box = $('#poolStatus');
    if (!box) return;
    try {
      const date = $('#startDate')?.value || new Date().toISOString().slice(0,10);
      const { data, error } = await supabase.rpc('get_content_question_pool_status', { p_date: date });
      if (error) throw error;
      box.innerHTML = (data || []).map(r => `
        <div class="pool-card">
          <div class="pool-title">📘 कक्षा ${esc(r.class_level)}</div>
          <div class="pool-grid">
            <div><small>कुल Eligible</small><strong>${esc(r.total_eligible)}</strong></div>
            <div><small>Cycle में Used</small><strong>${esc(r.used_in_cycle)}</strong></div>
            <div><small>शेष</small><strong>${esc(r.remaining_in_cycle)}</strong></div>
            <div><small>Current Cycle</small><strong>${esc(r.current_cycle)}</strong></div>
          </div>
          <div class="pool-chapter">इस महीने: Chapter ${esc(r.chapter_from)}–${esc(r.chapter_to)}</div>
        </div>`).join('') || '<div class="muted">Pool status उपलब्ध नहीं है।</div>';
    } catch (e) {
      box.innerHTML = `<div class="error-box">Pool status नहीं पढ़ा जा सका: ${esc(e.message)}</div>`;
    }
  }

  async function fetchQuestions(ids) {
    const unique = [...new Set(ids.map(Number).filter(Boolean))];
    if (!unique.length) return {};
    const { data, error } = await supabase
      .from('questions')
      .select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint')
      .in('id', unique);
    if (error) throw error;
    return Object.fromEntries((data || []).map(q => [Number(q.id), q]));
  }

  function requirementForClass(cls) {
    return getContentRequirements()[String(cls)] || {};
  }

  /*
     Allocation rule:
     - Image and Video use different unique Questions.
     - Quantity is dynamic; never assume 2.
     - Thumbnail always follows the Video Questions.
     - If unique Questions are insufficient, never duplicate; report shortage.
  */
  function buildAllocation(rows) {
    const result = [];
    const shortages = [];
    const groups = {};

    rows.forEach(r => {
      const key = `${r.plan_day}|${r.class_level}`;
      (groups[key] ||= []).push(r);
    });

    Object.entries(groups).forEach(([key, group]) => {
      const [day, cls] = key.split('|').map(Number);
      const req = requirementForClass(cls);
      const unique = [];
      const seen = new Set();
      group.forEach(r => {
        const id = Number(r.question_id);
        if (id && !seen.has(id)) {
          seen.add(id);
          unique.push(r);
        }
      });

      const imageRows = group.filter(r => r.content_type === 'image');
      const videoRows = group.filter(r => r.content_type === 'video');
      const imageCount = Number(req.image || 0);
      const videoCount = Number(req.video || 0);

      const used = new Set();
      const imageQuestions = [];
      const videoQuestions = [];

      imageRows.forEach(r => {
        if (imageQuestions.length < imageCount && !used.has(Number(r.question_id))) {
          imageQuestions.push(r); used.add(Number(r.question_id));
        }
      });
      unique.forEach(r => {
        if (imageQuestions.length < imageCount && !used.has(Number(r.question_id))) {
          imageQuestions.push(r); used.add(Number(r.question_id));
        }
      });

      videoRows.forEach(r => {
        if (videoQuestions.length < videoCount && !used.has(Number(r.question_id))) {
          videoQuestions.push(r); used.add(Number(r.question_id));
        }
      });
      unique.forEach(r => {
        if (videoQuestions.length < videoCount && !used.has(Number(r.question_id))) {
          videoQuestions.push(r); used.add(Number(r.question_id));
        }
      });

      if (imageQuestions.length < imageCount) {
        shortages.push(`Class ${cls}, Day ${day}: Image के लिए ${imageCount - imageQuestions.length} unique Question कम हैं।`);
      }
      if (videoQuestions.length < videoCount) {
        shortages.push(`Class ${cls}, Day ${day}: Video के लिए ${videoCount - videoQuestions.length} unique Question कम हैं।`);
      }

      imageQuestions.forEach((r, i) => result.push({
        ...r, allocation_type:'image', allocation_order:i + 1, allocation_label:`🖼️ Image ${i + 1}`
      }));
      videoQuestions.forEach((r, i) => result.push({
        ...r, allocation_type:'video', allocation_order:i + 1, allocation_label:`🎬 Video ${i + 1}`
      }));

      // Thumbnail is derived from the exact Video Question, never a new Question.
      videoQuestions.forEach((r, i) => result.push({
        ...r, allocation_type:'thumbnail', allocation_order:i + 1, allocation_label:`🖼️ Thumbnail ${i + 1}`, derived_from_video:true
      }));
    });

    return { result, shortages };
  }

  async function generatePlan() {
    const startDate = $('#startDate')?.value;
    const days = Number($('#days')?.value || 1);
    if (!startDate) return showNotice('error', 'Start Date चुनिए।');

    const btn = $('#generateBtn');
    if (btn) { btn.disabled = true; btn.dataset.oldText = btn.textContent; btn.textContent = '⏳ Plan बनाया जा रहा है...'; }

    try {
      renderRequirementSummary();
      const req = getContentRequirements();
      const totalRequested = Object.values(req).reduce((sum, c) => sum + Object.values(c || {}).reduce((a,n) => a + Number(n || 0), 0), 0);
      if (!totalRequested) throw new Error('कम से कम एक Content Type की quantity चुनिए।');

      // Question reuse is deliberately disabled. Image/Video allocation below also enforces uniqueness.
      // Thumbnail is derived from Video and must not consume another Question.
      const rpcReq = JSON.parse(JSON.stringify(req));
      Object.keys(rpcReq).forEach(cls => { rpcReq[cls].thumbnail = 0; });

      const { data, error } = await supabase.rpc('generate_content_plan_v4', {
        p_start_date:startDate,
        p_days:days,
        p_requirements:rpcReq,
        p_reuse_questions:false
      });
      if (error) throw error;

      currentPlan = data || [];
      currentPlanId = currentPlan[0]?.plan_id || null;
      const built = buildAllocation(currentPlan);
      allocation = built.result;
      displayPlan = allocation;
      renderPlanSummary();
      renderPlan();
      await loadPoolStatus();

      if (built.shortages.length) {
        showNotice('error', `Plan बना है, लेकिन duplicate किए बिना कुछ content के लिए Question कम हैं: ${built.shortages.join(' | ')}`);
      } else {
        showNotice('success', 'Content Plan successfully generate हो गया। Image और Video Questions अलग-अलग रखे गए हैं।');
      }
    } catch (e) {
      showNotice('error', e.message || 'Plan generate नहीं हो सका।');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.oldText || '🚀 Generate Content Plan'; }
    }
  }

  function renderAllocationSummary() {
    const box = $('#allocationSummary');
    if (!box) return;
    if (!allocation.length) {
      box.innerHTML = '<div class="empty-box">Content Plan generate करने के बाद यहाँ allocation summary दिखेगी।</div>';
      return;
    }
    const groups = {};
    allocation.forEach(r => {
      const key = `${r.plan_day}|${r.class_level}`;
      (groups[key] ||= []).push(r);
    });
    box.innerHTML = Object.entries(groups).map(([key, rows]) => {
      const [day, cls] = key.split('|');
      const images = rows.filter(r => r.allocation_type === 'image');
      const videos = rows.filter(r => r.allocation_type === 'video');
      return `<div class="allocation-day-card">
        <div class="allocation-day-head"><b>Day ${esc(day)} • Class ${esc(cls)}</b><span>${images.length + videos.length} unique Questions</span></div>
        <div class="allocation-columns">
          <div><strong>🖼️ Image Questions</strong>${images.length ? images.map((r,i)=>`<span>Q${esc(r.question_id)} <small>Image ${i+1}</small></span>`).join('') : '<em>None</em>'}</div>
          <div><strong>🎬 Video Questions</strong>${videos.length ? videos.map((r,i)=>`<span>Q${esc(r.question_id)} <small>Video ${i+1} + Thumbnail</small></span>`).join('') : '<em>None</em>'}</div>
        </div>
      </div>`;
    }).join('');
  }

  function renderPlanSummary() {
    const box = $('#planSummary');
    if (!box) return;
    const classes = [...new Set(displayPlan.map(x => x.class_level))];
    const days = [...new Set(displayPlan.map(x => x.plan_day))].length;
    const imageCount = displayPlan.filter(x => x.allocation_type === 'image').length;
    const videoCount = displayPlan.filter(x => x.allocation_type === 'video').length;
    const thumbCount = displayPlan.filter(x => x.allocation_type === 'thumbnail').length;
    renderAllocationSummary();
    box.innerHTML = `
      <div><b>Plan तैयार है</b></div>
      <div>${days || 0} Day • ${classes.map(c => `Class ${c}`).join(' • ') || '—'}</div>
      <div class="content-summary-counts">
        <span>🖼️ Image <b>${imageCount}</b></span>
        <span>🎬 Video <b>${videoCount}</b></span>
        <span>🖼️ Thumbnail <b>${thumbCount}</b> <small>(Video से)</small></span>
      </div>
      ${currentPlanId ? `<div class="plan-id">Plan ID: <code>${esc(currentPlanId)}</code> <button id="copyPlanIdBtn2" type="button">Copy</button></div>` : ''}
      <div class="verify-all-wrap"><button id="verifyAllPlatformsBtn" type="button" class="secondary-btn">🔍 Verify All Platforms</button><div id="verifyAllPlatformsResult" class="verify-all-result"></div></div>
    `;
    $('#copyPlanIdBtn2')?.addEventListener('click', copyPlanId);
  }

  function filteredDisplayRows() {
    const day = $('#dayFilter')?.value || 'all';
    const cls = $('#classFilter')?.value || 'all';
    const type = $('#typeFilter')?.value || 'all';
    return displayPlan.filter(r =>
      (day === 'all' || String(r.plan_day) === day) &&
      (cls === 'all' || String(r.class_level) === cls) &&
      (type === 'all' || String(r.allocation_type) === type)
    );
  }

  function promptFor(kind, q) {
    const common = `GANIT SETU\nClass: ${q.class_level}\nChapter: ${q.chapter_number} — ${q.chapter_name || ''}\nQuestion ID: Q${q.id}\nQuestion: ${q.question_text}\nA) ${q.option_a}\nB) ${q.option_b}\nC) ${q.option_c}\nD) ${q.option_d}`;
    if (kind === 'image') return `${common}\n\nCreate a clean educational mathematics quiz image. Keep the correct answer hidden. Use Hindi/Devanagari and exact mathematical notation.`;
    if (kind === 'video') return `${common}\n\nCreate a Google Flow-ready educational video/reel prompt for this Question. Explain the concept visually and keep the answer reveal separate from the question opening.`;
    return `${common}\n\nCreate a YouTube thumbnail prompt based on this same Video Question. Do not introduce another Question.`;
  }

  async function renderPlan() {
    const container = $('#planResults');
    if (!container) return;
    if (!displayPlan.length) {
      container.innerHTML = '<div class="empty-box">अभी कोई Plan generate नहीं हुआ है।</div>';
      return;
    }

    const rows = filteredDisplayRows();
    if (!rows.length) {
      container.innerHTML = '<div class="empty-box">इस filter में कोई content नहीं है।</div>';
      return;
    }

    container.innerHTML = '<div class="loading-box">Questions लोड हो रहे हैं...</div>';
    try {
      const qmap = await fetchQuestions(rows.map(r => r.question_id));
      const grouped = {};
      rows.forEach(r => ((grouped[r.plan_day] ||= []).push(r)));
      container.innerHTML = Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0])).map(([day, items]) => {
        const byClass = {};
        items.forEach(r => ((byClass[r.class_level] ||= []).push(r)));
        return `<section class="day-section"><div class="day-heading"><h2>Day ${esc(day)}</h2><span>${esc(items[0]?.content_date || '')}</span></div>
          ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls, rs]) => `<div class="class-section"><h3>📘 कक्षा ${esc(cls)} <span>${rs.length} content items</span></h3><div class="question-grid compact-question-grid">
            ${rs.sort((a,b)=>a.allocation_order-b.allocation_order).map(r => {
              const q = qmap[Number(r.question_id)];
              if (!q) return `<article class="question-card"><b>Q${esc(r.question_id)}</b><div class="error-box">Question data उपलब्ध नहीं है।</div></article>`;
              return `<article class="question-card compact-question-card">
                <div class="q-top"><span class="q-number">Q${esc(q.id)}</span><span class="type-badge">${esc(r.allocation_label)}</span><span class="chapter-badge">Chapter ${esc(q.chapter_number)} — ${esc(q.chapter_name || '')}</span></div>
                <div class="question-text">${esc(q.question_text)}</div>
                <div class="allocation-note">${r.allocation_type === 'thumbnail' ? '🖼️ यह Thumbnail इसी Video Question से बनेगा — नया Question नहीं लिया गया।' : r.allocation_type === 'image' ? '🖼️ Image Question' : '🎬 Video Question'}</div>
                <div class="prompt-actions">
                  ${r.allocation_type === 'image' ? `<button type="button" class="prompt-btn image" data-copy-kind="image" data-qid="${esc(q.id)}">🖼️ Copy Image Prompt</button>` : ''}
                  ${r.allocation_type === 'video' ? `<button type="button" class="prompt-btn video" data-copy-kind="video" data-qid="${esc(q.id)}">🎬 Copy Video Prompt</button>` : ''}
                  ${r.allocation_type === 'thumbnail' ? `<button type="button" class="prompt-btn thumb" data-copy-kind="thumbnail" data-qid="${esc(q.id)}">🖼️ Copy Thumbnail Prompt</button>` : ''}
                </div>
              </article>`;
            }).join('')}
          </div></div>`).join('')}
        </section>`;
      }).join('');

      container.querySelectorAll('[data-copy-kind]').forEach(btn => btn.addEventListener('click', () => {
        const q = qmap[Number(btn.dataset.qid)];
        if (q) copyText(promptFor(btn.dataset.copyKind, q), 'Prompt copied.');
      }));
    } catch (e) {
      container.innerHTML = `<div class="error-box">Questions लोड नहीं हो पाए: ${esc(e.message)}</div>`;
    }
  }

  async function verifyAllPlatforms() {
    const resultBox = $('#verifyAllPlatformsResult');
    const button = $('#verifyAllPlatformsBtn');
    if (!currentPlan.length) return showNotice('error', 'पहले Content Plan generate कीजिए।');
    if (button) { button.disabled = true; button.textContent = '⏳ Verification...'; }
    if (resultBox) resultBox.innerHTML = '<div class="muted">Status check किया जा रहा है...</div>';

    const rows = [...new Map(currentPlan.map(r => [`${r.plan_id}|${r.question_id}|${r.content_type}`, r])).values()];
    const summary = {
      youtube:{published:0,processing:0,failed:0,notFound:0,unavailable:0,details:[]},
      facebook:{published:0,failed:0,unavailable:0,details:[]},
      instagram:{unavailable:0,details:[]},
      whatsapp:{details:['🟢 Channel configured — direct WhatsApp auto-publish verification/API इस workflow में नहीं है']}
    };

    try {
      for (const r of rows.filter(x => x.content_type === 'video')) {
        const card = [...document.querySelectorAll('.question-card')].find(c => Number(c.querySelector('.q-number')?.textContent?.replace('Q','')) === Number(r.question_id));
        const videoId = card?.dataset.youtubeVideoId || '';
        if (!videoId) { summary.youtube.unavailable++; summary.youtube.details.push(`Q${r.question_id}: Video ID इस page session में उपलब्ध नहीं है`); continue; }
        try {
          const { data:{session} } = await authClient.auth.getSession();
          if (!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');
          const response = await fetch(VERIFY_PLATFORM_FUNCTION,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':GS_SUPABASE_ANON_KEY},body:JSON.stringify({platform:'youtube',video_id:videoId,question_id:Number(r.question_id),plan_id:r.plan_id||currentPlanId||null})});
          const data = await response.json().catch(()=>({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'YouTube verification failed.');
          if (data.status==='published'){summary.youtube.published++;summary.youtube.details.push(`Q${r.question_id}: 🟢 Published`);}
          else if(data.status==='processing'){summary.youtube.processing++;summary.youtube.details.push(`Q${r.question_id}: 🟡 Processing`);}
          else if(data.status==='failed'){summary.youtube.failed++;summary.youtube.details.push(`Q${r.question_id}: 🔴 Failed${data.failure_reason?` — ${data.failure_reason}`:''}`);}
          else if(data.status==='not_found'){summary.youtube.notFound++;summary.youtube.details.push(`Q${r.question_id}: ⚪ Not Found`);}
          else {summary.youtube.unavailable++;summary.youtube.details.push(`Q${r.question_id}: ℹ️ ${data.status||'Unknown'}`);}
        } catch(e){summary.youtube.failed++;summary.youtube.details.push(`Q${r.question_id}: 🔴 Verify error — ${e.message||String(e)}`);}
      }

      for (const r of rows.filter(x => ['image','post','video'].includes(x.content_type))) {
        summary.facebook.unavailable++;
        try {
          const {data,error}=await supabase.from('social_publish_queue').select('status,error_message').eq('plan_id',r.plan_id||currentPlanId).eq('question_id',r.question_id).eq('platform','facebook').eq('content_type',r.content_type).order('updated_at',{ascending:false}).limit(1).maybeSingle();
          if(error) throw error;
          if(!data) summary.facebook.details.push(`Q${r.question_id}: ⚪ No Facebook publish record`);
          else if(String(data.status||'').toLowerCase()==='published'){summary.facebook.unavailable--;summary.facebook.published++;summary.facebook.details.push(`Q${r.question_id}: 🟢 Published`);}
          else if(['failed','error'].includes(String(data.status||'').toLowerCase())){summary.facebook.unavailable--;summary.facebook.failed++;summary.facebook.details.push(`Q${r.question_id}: 🔴 Failed${data.error_message?` — ${data.error_message}`:''}`);}
          else summary.facebook.details.push(`Q${r.question_id}: 🟡 ${data.status||'Pending'}`);
        } catch(e){summary.facebook.details.push(`Q${r.question_id}: ⚪ Verification unavailable`);}
      }

      rows.filter(x=>x.content_type==='image').forEach(r=>{summary.instagram.unavailable++;summary.instagram.details.push(`Q${r.question_id}: ⚪ Instagram publish status का persistent verification record उपलब्ध नहीं है`);});

      if(resultBox) resultBox.innerHTML=`<div class="verify-platform-card"><b>🔍 Platform Verification Result</b>
        <div>▶️ YouTube — 🟢 ${summary.youtube.published} Published, 🟡 ${summary.youtube.processing} Processing, 🔴 ${summary.youtube.failed} Failed, ⚪ ${summary.youtube.notFound} Not Found, ℹ️ ${summary.youtube.unavailable} Unavailable</div>
        <div class="verify-details">${summary.youtube.details.map(esc).join('<br>')}</div>
        <div>📘 Facebook — 🟢 ${summary.facebook.published} Published, 🔴 ${summary.facebook.failed} Failed, ⚪ ${summary.facebook.unavailable} Unavailable/Pending</div>
        <div class="verify-details">${summary.facebook.details.map(esc).join('<br>')}</div>
        <div>📸 Instagram — ⚪ ${summary.instagram.unavailable} Verification unavailable</div>
        <div class="verify-details">${summary.instagram.details.map(esc).join('<br>')}</div>
        <div>📢 WhatsApp Channel — 🟢 Configured</div>
        <div class="verify-details">${summary.whatsapp.details.map(esc).join('<br>')}</div>
        <small>Note: जहाँ backend persistent publish status उपलब्ध नहीं है, वहाँ system “Published” का दावा नहीं करेगा।</small>
      </div>`;
      showNotice('success','🔍 सभी उपलब्ध platform statuses verify कर दिए गए हैं।');
    } catch(e) {
      if(resultBox) resultBox.innerHTML=`<div class="error-box">❌ Verification नहीं हो सकी: ${esc(e.message||String(e))}</div>`;
      showNotice('error',`❌ All Platforms verification नहीं हो सकी: ${e.message||String(e)}`);
    } finally {
      if(button){button.disabled=false;button.textContent='🔍 Verify All Platforms';}
    }
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#verifyAllPlatformsBtn')) verifyAllPlatforms();
  });

  async function init() {
    try { await ensureSupabaseClient(); }
    catch(e){ console.error(e); showNotice('error',e.message||'Supabase client उपलब्ध नहीं है।'); return; }

    const {data:{session},error}=await authClient.auth.getSession();
    if(error){showNotice('error','Admin session पढ़ी नहीं जा सकी।');return;}
    if(!session){location.href='index.html';return;}

    const start=$('#startDate');
    if(start&&!start.value){const d=new Date();start.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
    await loadPoolStatus();
    populateDayFilter();
    bindEvents();
    bindRequirementControls();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
