/* Ganit Setu Content Planning — FINAL STABLE BUILD
   Self-contained Supabase client + plan generation + image master prompt.
   Does not require app.js / window.supabaseClient.
*/
(function () {
'use strict';

const GS_SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const GS_SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";

// Content Planning uses the SAME Supabase client/session as the existing Admin Panel.
// Do not create a second Auth project/client here.
let authClient = window.supabaseClient || null;
let supabase = window.supabaseClient || null;

function loadSupabaseLibrary() {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === "function") { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Supabase library load नहीं हुई।"));
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
  return supabase;
}

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

let currentPlan = [];
let currentPlanId = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

async function init() {
  try {
    await ensureSupabaseClient();
  } catch (e) {
    console.error('Ganit Setu Supabase init error:', e);
    alert(e.message || 'Supabase client उपलब्ध नहीं है।');
    return;
  }

  const { data: { session }, error: sessionError } = await authClient.auth.getSession();
  if (sessionError) {
    console.error('Session error:', sessionError);
    alert('Admin session पढ़ी नहीं जा सकी।');
    return;
  }
  if (!session) {
    location.href = 'index.html';
    return;
  }

  const start = $('#startDate');
  if (start && !start.value) {
    const d = new Date();
    start.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  }

  await loadPoolStatus();
  populateDayFilter();
  bindEvents();
  bindRequirementControls();
}

function populateDayFilter() {
  const f = $('#dayFilter');
  const n = Number($('#days')?.value || 1);
  if (!f) return;
  f.innerHTML = '<option value="all">सभी Days</option>' +
    Array.from({length:n}, (_,i) => `<option value="${i+1}">Day ${i+1}</option>`).join('');
}


function getContentRequirements() {
  const result = {};
  document.querySelectorAll('.content-count').forEach(sel => {
    const cls = String(sel.dataset.class);
    const type = String(sel.dataset.type);
    const count = Math.max(0, Math.min(5, Number(sel.value || 0)));
    (result[cls] ||= {})[type] = count;
  });
  return result;
}

function renderRequirementSummary() {
  const box = $('#requirementSummary');
  if (!box) return;
  const req = getContentRequirements();
  const lines = [];
  [9,10].forEach(cls => {
    const x = req[String(cls)] || {};
    const parts = [
      x.post ? `📱 Post ${x.post}` : '',
      x.image ? `🖼️ Image ${x.image}` : '',
      x.video ? `🎬 Reel/Video ${x.video}` : '',
      x.thumbnail ? `🖼️ Thumbnail ${x.thumbnail}` : ''
    ].filter(Boolean);
    lines.push(`<div><b>Class ${cls}:</b> ${parts.length ? parts.join(' • ') : 'आज कोई content नहीं चुना'}</div>`);
  });
  box.innerHTML = lines.join('');
}

function bindRequirementControls() {
  document.querySelectorAll('.content-count').forEach(sel => {
    sel.addEventListener('change', renderRequirementSummary);
  });
  document.querySelectorAll('.select-all-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.class;
      document.querySelectorAll(`.content-count[data-class="${cls}"]`).forEach(sel => sel.value = '0');
      renderRequirementSummary();
    });
  });
  renderRequirementSummary();
}

function bindEvents() {
  $('#generateBtn')?.addEventListener('click', () => generatePlan(false));
  $('#replaceBtn')?.addEventListener('click', () => generatePlan(true));
  $('#days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
  $('#startDate')?.addEventListener('change', loadPoolStatus);
  ['dayFilter','classFilter','typeFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderPlan);
  });
}

async function loadPoolStatus() {
  const box = $('#poolStatus');
  if (!box) return;
  try {
    const startDate = $('#startDate')?.value || new Date().toISOString().slice(0,10);
    const { data, error } = await supabase.rpc('get_content_question_pool_status', { p_date: startDate });
    if (error) throw error;

    const rows = data || [];
    box.innerHTML = rows.map(r => `
      <div class="pool-card">
        <div class="pool-title">📘 कक्षा ${r.class_level}</div>
        <div class="pool-grid">
          <div><small>कुल Eligible</small><strong>${r.total_eligible}</strong></div>
          <div><small>Cycle में Used</small><strong>${r.used_in_cycle}</strong></div>
          <div><small>शेष</small><strong>${r.remaining_in_cycle}</strong></div>
          <div><small>Current Cycle</small><strong>${r.current_cycle}</strong></div>
        </div>
        <div class="pool-chapter">इस महीने: Chapter ${r.chapter_from}–${r.chapter_to}</div>
      </div>
    `).join('') || '<div class="muted">Pool status उपलब्ध नहीं है।</div>';
  } catch (e) {
    box.innerHTML = `<div class="error-box">Pool status नहीं पढ़ा जा सका: ${esc(e.message)}</div>`;
  }
}

async function generatePlan(replaceExisting) {
  const startDate = $('#startDate')?.value;
  const days = Number($('#days')?.value || 1);
  if (!startDate) {
    alert('Start Date चुनिए।');
    return;
  }

  const btn = replaceExisting ? $('#replaceBtn') : $('#generateBtn');
  if (btn) {
    btn.disabled = true;
    btn.dataset.oldText = btn.textContent;
    btn.textContent = '⏳ Plan बनाया जा रहा है...';
  }

  try {
    const req = getContentRequirements();
    const totalRequested = Object.values(req).reduce((sum, c) =>
      sum + Object.values(c || {}).reduce((a, n) => a + Number(n || 0), 0), 0);

    if (!totalRequested) {
      throw new Error('कम से कम एक Content Type की quantity चुनिए।');
    }

    const payload = {
      '9': {
        post: Number(req['9']?.post || 0),
        image: Number(req['9']?.image || 0),
        video: Number(req['9']?.video || 0),
        thumbnail: Number(req['9']?.thumbnail || 0)
      },
      '10': {
        post: Number(req['10']?.post || 0),
        image: Number(req['10']?.image || 0),
        video: Number(req['10']?.video || 0),
        thumbnail: Number(req['10']?.thumbnail || 0)
      }
    };

    const { data, error } = await supabase.rpc('generate_content_plan_v3', {
      p_start_date: startDate,
      p_days: days,
      p_replace_existing: replaceExisting,
      p_requirements: payload,
      p_reuse_questions: Boolean($('#allowQuestionReuse')?.checked)
    });

    if (error) throw error;

    currentPlan = data || [];
    currentPlanId = currentPlan[0]?.plan_id || null;

    if (replaceExisting) {
      showNotice('success', 'पुराना plan सुरक्षित रखते हुए चुनी गई quantities के अनुसार नया random set बनाया गया है।');
    } else {
      showNotice('success', 'Content Plan चुनी गई quantities के अनुसार successfully generate हो गया।');
    }

    updatePlanSummary();
    renderPlan();
    await loadPoolStatus();
  } catch (e) {
    const msg = e.message || 'Plan generate नहीं हो सका।';
    showNotice('error', msg);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || 'Generate Content Plan';
    }
  }
}

function updatePlanSummary() {
  const summary = $('#planSummary');
  if (!summary) return;
  const classes = [...new Set(currentPlan.map(x => x.class_level))];
  const days = [...new Set(currentPlan.map(x => x.plan_day))].length;
  summary.innerHTML = `
    <div class="plan-ready"><b>✅ Plan तैयार है</b><span>${days} Day • ${classes.map(c => `Class ${c}`).join(' • ')} • ${currentPlan.length} content entries</span></div>
  `;
}


function filteredRows() {
  const day = $('#dayFilter')?.value || 'all';
  const cls = $('#classFilter')?.value || 'all';
  const type = $('#typeFilter')?.value || 'all';
  return currentPlan.filter(x =>
    (day === 'all' || String(x.plan_day) === day) &&
    (cls === 'all' || String(x.class_level) === cls) &&
    (type === 'all' || x.content_type === type)
  );
}

async function fetchQuestions(ids) {
  if (!ids.length) return {};
  const unique = [...new Set(ids.map(Number))];
  const { data, error } = await supabase
    .from('questions')
    .select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint')
    .in('id', unique);
  if (error) throw error;
  return Object.fromEntries((data || []).map(q => [Number(q.id), q]));
}

async function renderPlan() {
  const container = $('#planResults');
  if (!container) return;

  if (!currentPlan.length) {
    container.innerHTML = `<div class="empty-box">अभी कोई Plan generate नहीं हुआ है।</div>`;
    $('#promptCenterResults') && ($('#promptCenterResults').innerHTML = `<div class="empty-box prompt-empty">पहले Content Plan generate करें। उसके बाद हर Question के prompts यहाँ मिलेंगे।</div>`);
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">इस filter में कोई question नहीं है।</div>`;
    $('#promptCenterResults') && ($('#promptCenterResults').innerHTML = `<div class="empty-box prompt-empty">इस filter में कोई Question नहीं है।</div>`);
    return;
  }

  container.innerHTML = `<div class="loading-box">Questions लोड हो रहे हैं...</div>`;
  try {
    const qmap = await fetchQuestions(rows.map(x => x.question_id));
    const grouped = {};
    for (const r of rows) {
      const key = `${r.plan_day}`;
      (grouped[key] ||= []).push(r);
    }

    container.innerHTML = Object.entries(grouped).sort((a,b)=>Number(a[0])-Number(b[0])).map(([day, items]) => {
      const byClass = {};
      items.forEach(r => (byClass[r.class_level] ||= []).push(r));
      return `<section class="day-section">
        <div class="day-heading">
          <h2>Day ${esc(day)}</h2>
          <span>${esc(items[0]?.content_date || '')}</span>
        </div>
        ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls, rs]) => `
          <div class="class-section">
            <h3>📘 कक्षा ${esc(cls)} <span>${rs.length} Questions</span></h3>
            <div class="question-grid">
              ${rs.sort((a,b)=>a.selection_order-b.selection_order).map((r,idx) => {
                const q = qmap[Number(r.question_id)];
                return questionCard(r,q,idx+1);
              }).join('')}
            </div>
          </div>
        `).join('')}
      </section>`;
    }).join('');
    renderPromptCenter(rows, qmap);
  } catch (e) {
    container.innerHTML = `<div class="error-box">
      <b>Question लोड नहीं हो पाए।</b><br>${esc(e.message)}
    </div>`;
  }
}


/* =========================================================
   FACEBOOK PUBLISHING
   Uses the existing social_publish_queue / social_publish_logs
   through the secure facebook-oauth Edge Function.
   Page tokens never enter the browser.
   ========================================================= */

const FACEBOOK_PUBLISH_FUNCTION = `${GS_SUPABASE_URL}/functions/v1/facebook-oauth`;

function buildFacebookContent(r, q) {
  if (!q) return { title: `Ganit Setu Q${r.question_id}`, caption: '', description: '', hashtags: '#GanitSetu #Maths #MPBoard' };
  const title = `आज का गणित प्रश्न | कक्षा ${q.class_level} | अध्याय ${q.chapter_number}`;
  const caption = [
    `📘 GANIT SETU`,
    `कक्षा ${q.class_level} | अध्याय ${q.chapter_number} — ${q.chapter_name || ''}`,
    `\n🧮 आज का गणित प्रश्न:`,
    q.question_text,
    `\nA) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `\n🤔 आपका उत्तर क्या है? Comment करके बताइए!`
  ].join('\n');
  const description = `${q.question_text}\n\nHint: ${q.hint || 'Comment करके उत्तर बताइए।'}\n\nGanit Setu — MP Board Mathematics Learning`;
  const hashtags = '#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class' + q.class_level;
  const answerComment = `✅ सही उत्तर: ${q.correct_option || ''}\n💡 Hint: ${q.hint || ''}\n📖 Explanation: ${q.explanation || ''}`;
  return { title, caption, description, hashtags, answerComment };
}

async function getExistingFacebookQueue(r) {
  try {
    let query = supabase
      .from('social_publish_queue')
      .select('id,media_url,thumbnail_url,title,caption,description,hashtags,answer_comment,publish_mode,scheduled_at,status,external_post_id,external_url,error_message,updated_at')
      .eq('plan_id', r.plan_id)
      .eq('question_id', r.question_id)
      .eq('platform', 'facebook')
      .eq('content_type', r.content_type)
      .order('updated_at', { ascending: false })
      .limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function publishQuestionToFacebook(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data उपलब्ध नहीं है।');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ Facebook पर publish हो रहा है...';

  try {
    const existing = await getExistingFacebookQueue(r);
    let mediaUrl = existing?.media_url || '';

    if (r.content_type === 'image' || r.content_type === 'video') {
      if (!mediaUrl) {
        mediaUrl = window.prompt(
          r.content_type === 'image'
            ? 'Facebook पर publish करने वाली IMAGE की public HTTPS URL डालें:'
            : 'Facebook पर publish करने वाली VIDEO की public HTTPS URL डालें:',
          ''
        )?.trim() || '';
      }
      if (!mediaUrl) {
        throw new Error('Media URL नहीं दिया गया।');
      }
      if (!/^https:\/\//i.test(mediaUrl)) {
        throw new Error('Media URL public HTTPS URL होना चाहिए।');
      }
    }

    const meta = buildFacebookContent(r, q);
    const payload = {
      action: 'publish',
      queue_id: existing?.id || null,
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level),
      platform: 'facebook',
      content_type: r.content_type,
      media_url: mediaUrl || null,
      thumbnail_url: null,
      title: meta.title,
      caption: meta.caption,
      description: meta.description,
      hashtags: meta.hashtags,
      answer_comment: meta.answerComment,
      publish_mode: 'now'
    };

    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) throw new Error('Admin session उपलब्ध नहीं है।');

    const response = await fetch(FACEBOOK_PUBLISH_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': GS_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || data?.meta_error_message || 'Facebook publishing failed.');
    }

    button.textContent = '✅ Facebook Published';
    button.classList.add('published');
    if (data.external_url) {
      button.title = data.external_url;
    }
    showNotice('success', `Facebook पर सफलतापूर्वक publish हो गया।${data.external_post_id ? ` Post ID: ${data.external_post_id}` : ''}`);

    const card = button.closest('.question-card');
    if (card && data.external_url) {
      let link = card.querySelector('.facebook-published-link');
      if (!link) {
        link = document.createElement('a');
        link.className = 'facebook-published-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.querySelector('.q-actions')?.appendChild(link);
      }
      link.href = data.external_url;
      link.textContent = '🔗 View Facebook Post';
    }
  } catch (e) {
    button.disabled = false;
    button.textContent = oldText;
    showNotice('error', e.message || 'Facebook publish नहीं हो सका।');
  }
}

function questionCard(r,q,number) {
  const text = q?.question_text;
  const opts = q ? [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]] : [];
  return `<article class="question-card">
    <div class="q-top">
      <span class="q-number">${number}</span>
      <span class="type-badge">${typeLabel(r.content_type)}</span>
      <span class="chapter-badge">Chapter ${esc(r.chapter_number)}</span>
      <span class="cycle-badge">Cycle ${esc(r.cycle_number)}</span>
    </div>
    <div class="q-title">Question ID: <b>Q${esc(r.question_id)}</b> <span>• ${esc(r.chapter_name || q?.chapter_name || '')}</span></div>
    ${q ? `
      <div class="question-text">${esc(text)}</div>
      <div class="options">${opts.map(([l,v]) => `<div class="option"><b>${l})</b> ${esc(v)}</div>`).join('')}</div>
      <div class="answer-box">
        <div>✅ <b>सही उत्तर:</b> ${esc(q.correct_option || 'उपलब्ध नहीं')}</div>
        <div>💡 <b>Hint:</b> ${esc(q.hint || 'Hint उपलब्ध नहीं है।')}</div>
        <div>📖 <b>Explanation:</b> ${esc(q.explanation || 'Explanation उपलब्ध नहीं है।')}</div>
      </div>
    ` : `<div class="missing-question">Question data नहीं मिला। Question ID: Q${esc(r.question_id)}</div>`}
    <div class="q-actions">
      <button type="button" class="publish-facebook" data-question-id="${esc(r.question_id)}" data-content-type="${esc(r.content_type)}">📘 Publish to Facebook</button>
    </div>
  </article>`;
}


function buildIndividualPrompt(kind, q) {
  if (!q) return '';
  const base = [
    `Question ID: Q${q.id}`,
    `Class: ${q.class_level}`,
    `Chapter: ${q.chapter_number} — ${q.chapter_name || ''}`,
    `Question: ${q.question_text}`,
    `Options: A) ${q.option_a} | B) ${q.option_b} | C) ${q.option_c} | D) ${q.option_d}`,
    `Correct Answer: ${q.correct_option}`,
    `Hint: ${q.hint || ''}`,
    `Explanation: ${q.explanation || ''}`
  ].join('\\n');

  if (kind === 'image') {
    return `Create one clean, accurate educational mathematics image for Ganit Setu, MP Board Class ${q.class_level}. Use only this one question. Keep every number, symbol, option and mathematical expression exact. Make it mobile-friendly, readable and professional. Do not include any other question.\\n\\n${base}`;
  }
  if (kind === 'video') {
    return `Create one short educational Reel/Video for Ganit Setu using only this one mathematics question. Include a strong opening hook, the exact question and options, a simple Hindi explanation, answer reveal and concise Hindi voice-over. Keep all mathematics exact. Do not include any other question.\\n\\n${base}`;
  }
  if (kind === 'thumbnail') {
    return `Create one highly readable mobile-first YouTube/Reel thumbnail for Ganit Setu based only on this exact mathematics question. Use a clear educational composition, strong headline treatment and correct mathematical notation. Do not reveal a wrong answer or alter the question. Do not include any other question.\\n\\n${base}`;
  }
  return `Generate the complete social-media content package for this one Ganit Setu mathematics question. Return separate fields for Title, SEO Title, Caption, Description, SEO Keywords, Hashtags, CTA and Answer/Explanation. Use natural Hindi suitable for MP Board Class ${q.class_level}. Keep the question and mathematics exact. Do not create content for any other question.\\n\\n${base}`;
}

async function copyQuestionPrompt(kind, questionId, button) {
  try {
    const q = (await fetchQuestions([questionId]))[Number(questionId)];
    if (!q) throw new Error('Question data नहीं मिला।');
    const prompt = buildIndividualPrompt(kind, q);
    await navigator.clipboard.writeText(prompt);
    const old = button.textContent;
    button.textContent = '✅ Copied';
    setTimeout(() => button.textContent = old, 1200);
  } catch (e) {
    showNotice('error', e.message || 'Prompt copy नहीं हुआ।');
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.prompt-copy-btn');
  if (!btn) return;
  copyQuestionPrompt(btn.dataset.promptKind, btn.dataset.questionId, btn);
});

function renderPromptCenter(rows, qmap) {
  const box = $('#promptCenterResults');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = `<div class="empty-box">इस filter में कोई Question नहीं है।</div>`;
    return;
  }

  const byQuestion = {};
  rows.forEach(r => {
    const id = String(r.question_id);
    (byQuestion[id] ||= []).push(r);
  });

  const cards = Object.entries(byQuestion).sort((a,b) => {
    const ao = Math.min(...a[1].map(x => Number(x.selection_order || 0)));
    const bo = Math.min(...b[1].map(x => Number(x.selection_order || 0)));
    return ao - bo;
  }).map(([qid, qrows]) => {
    const q = qmap[Number(qid)];
    if (!q) return '';
    const types = new Set(qrows.map(r => String(r.content_type)));
    const labels = [...types].map(t => t === 'image' ? '🖼️ Image' : t === 'post' ? '📱 Post' : t === 'video' ? '🎬 Reel / Video' : t === 'thumbnail' ? '🖼️ Thumbnail' : t);
    const buttons = [];
    if (types.has('image')) buttons.push(`<button type="button" class="prompt-copy-btn image" data-prompt-kind="image" data-question-id="${esc(qid)}">🖼️ Copy Image Prompt</button>`);
    if (types.size) buttons.push(`<button type="button" class="prompt-copy-btn package" data-prompt-kind="package" data-question-id="${esc(qid)}">📦 Copy Complete Package</button>`);
    if (types.has('video')) buttons.push(`<button type="button" class="prompt-copy-btn video" data-prompt-kind="video" data-question-id="${esc(qid)}">🎬 Copy Video/Reel Prompt</button>`);
    if (types.has('thumbnail')) buttons.push(`<button type="button" class="prompt-copy-btn thumb" data-prompt-kind="thumbnail" data-question-id="${esc(qid)}">🖼️ Copy Thumbnail Prompt</button>`);

    return `<article class="prompt-row">
      <div class="prompt-row-main">
        <div class="prompt-q"><b>Q${esc(qid)}</b><span>Class ${esc(q.class_level)} • Chapter ${esc(q.chapter_number)}${q.chapter_name ? ` — ${esc(q.chapter_name)}` : ''}</span></div>
        <div class="prompt-types">${labels.join(' • ')}</div>
      </div>
      <div class="prompt-copy-grid">${buttons.join('')}</div>
    </article>`;
  }).join('');

  box.innerHTML = cards || `<div class="empty-box">कोई prompt उपलब्ध नहीं है।</div>`;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copy));
    const old = btn.textContent;
    btn.textContent = '✅ Copied';
    setTimeout(()=>btn.textContent=old,1200);
  } catch {
    alert('Copy नहीं हो पाया।');
  }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.publish-facebook');
  if (!btn) return;
  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;
  const row = currentPlan.find(x => Number(x.question_id) === questionId && x.content_type === contentType);
  if (!row) {
    showNotice('error', 'इस question का planning record नहीं मिला।');
    return;
  }
  try {
    const qmap = await fetchQuestions([questionId]);
    await publishQuestionToFacebook(row, qmap[questionId], btn);
  } catch (err) {
    showNotice('error', err.message || 'Question data load नहीं हो सका।');
  }
});

function typeLabel(t) {
  return t === 'image' ? '🖼️ Image' : t === 'post' ? '📱 Post' : t === 'thumbnail' ? '🖼️ Thumbnail' : '🎬 Video';
}


function showNotice(kind,msg) {
  const box = $('#notice');
  if (!box) return alert(msg);
  box.className = `notice ${kind}`;
  box.textContent = msg;
  box.hidden = false;
}

})();