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

  await loadSettings();
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
  $('#copyPlanIdBtn')?.addEventListener('click', copyPlanId);
  $('#days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
  $('#startDate')?.addEventListener('change', loadPoolStatus);
  ['dayFilter','classFilter','typeFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderPlan);
  });
}

async function loadSettings() {
  const box = $('#settingsBox');
  try {
    const { data, error } = await supabase
      .from('content_automation_settings')
      .select('class_level,image_question_count,post_question_count,video_question_count,is_active')
      .in('class_level',[9,10])
      .order('class_level');

    if (error) throw error;
    const byClass = Object.fromEntries((data || []).map(x => [x.class_level, x]));
    if (box) {
      box.innerHTML = [9,10].map(c => {
        const s = byClass[c];
        return `<div class="setting-card">
          <div class="setting-title">कक्षा ${c}</div>
          ${s ? `<div class="setting-values">
            <span>🖼️ Image <b>${s.image_question_count}</b></span>
            <span>📱 Post <b>${s.post_question_count}</b></span>
            <span>🎬 Video <b>${s.video_question_count}</b></span>
          </div>` : `<div class="setting-missing">Settings उपलब्ध नहीं हैं</div>`}
        </div>`;
      }).join('');
    }
  } catch (e) {
    if (box) box.innerHTML = `<div class="error-box">Settings पढ़ी नहीं जा सकीं: ${esc(e.message)}</div>`;
  }
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

    /*
     * IMPORTANT:
     * The current Supabase RPC still accepts one common questions-per-type value.
     * Until the new per-type RPC is added, use the largest requested quantity as
     * the safe backend request. The new UI stores the exact requirement locally;
     * the next backend step will make the database plan exact per content type.
     */
    const questionsPerType = Math.min(5, Math.max(1,
      Math.max(...Object.values(req).flatMap(c => Object.values(c || {}).map(Number)), 1)
    ));

    const { data, error } = await supabase.rpc('generate_content_plan_safe', {
      p_start_date: startDate,
      p_days: days,
      p_replace_existing: replaceExisting,
      p_questions_per_type: questionsPerType
    });
    if (error) throw error;

    currentPlan = data || [];
    currentPlanId = currentPlan[0]?.plan_id || null;

    if (replaceExisting) {
      showNotice('success', 'पुराना generated plan सुरक्षित रखते हुए नया random set बनाया गया है।');
    } else {
      showNotice('success', 'Content Plan successfully generate हो गया।');
    }

    updatePlanSummary();
    renderPlan();
    await loadPoolStatus();
  } catch (e) {
    const msg = e.message || 'Plan generate नहीं हो सका।';
    if (/Not enough unique questions/i.test(msg)) {
      showNotice('error', msg + ' यदि इसी तारीख का पुराना generated plan replace करना है, तो “♻️ Replace Existing Plan → नया Set” दबाएँ।');
    } else {
      showNotice('error', msg);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || 'Generate Plan';
    }
  }
}

function updatePlanSummary() {
  const summary = $('#planSummary');
  if (!summary) return;

  const classes = [...new Set(currentPlan.map(x => x.class_level))];
  const days = [...new Set(currentPlan.map(x => x.plan_day))].length;
  summary.innerHTML = `
    <div><b>Plan तैयार है</b></div>
    <div>${days} Day • ${classes.map(c => `Class ${c}`).join(' • ')}</div>
    <div>${currentPlan.length} total content-question entries</div>
    ${currentPlanId ? `<div class="plan-id">Plan ID: <code>${esc(currentPlanId)}</code>
      <button id="copyPlanIdBtn2" type="button">Copy</button></div>` : ''}
  `;
  $('#copyPlanIdBtn2')?.addEventListener('click', copyPlanId);
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
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">इस filter में कोई question नहीं है।</div>`;
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
  const opts = q ? [
    ['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]
  ] : [];

  const full = q ? [
    `Question ID: Q${q.id}`,
    `Class ${q.class_level} | Chapter ${q.chapter_number} — ${q.chapter_name}`,
    ``,
    q.question_text,
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `Correct Answer: ${q.correct_option}`,
    `Hint: ${q.hint || ''}`,
    `Explanation: ${q.explanation || ''}`
  ].join('\n') : `Question ID: Q${r.question_id}\nChapter ${r.chapter_number} — ${r.chapter_name}`;

  return `<article class="question-card">
    <div class="q-top">
      <span class="q-number">${number}</span>
      <span class="type-badge">${typeLabel(r.content_type)}</span>
      <span class="chapter-badge">Chapter ${esc(r.chapter_number)}</span>
      <span class="cycle-badge">Cycle ${esc(r.cycle_number)}</span>
    </div>
    <div class="q-title">Question ID: <b>Q${esc(r.question_id)}</b> <span>• ${esc(r.chapter_name)}</span></div>
    ${q ? `
      <div class="question-text">${esc(text)}</div>
      <div class="options">
        ${opts.map(([l,v]) => `<div class="option"><b>${l})</b> ${esc(v)}</div>`).join('')}
      </div>
      <div class="answer-box">
        <div>✅ <b>सही उत्तर:</b> ${esc(q.correct_option || 'उपलब्ध नहीं')}</div>
        <div>💡 <b>Hint:</b> ${esc(q.hint || 'Hint उपलब्ध नहीं है।')}</div>
        <div>📖 <b>Explanation:</b> ${esc(q.explanation || 'Explanation उपलब्ध नहीं है।')}</div>
      </div>
    ` : `<div class="missing-question">Question data नहीं मिला। Question ID: Q${esc(r.question_id)}</div>`}
    <div class="prompt-actions">
      <button type="button" class="prompt-btn image" data-prompt-kind="image" data-question-id="${esc(r.question_id)}">🖼️ Copy Image Prompt</button>
      <button type="button" class="prompt-btn package" data-prompt-kind="package" data-question-id="${esc(r.question_id)}">📦 Copy Complete Package Prompt</button>
      ${r.content_type === 'video' ? `<button type="button" class="prompt-btn video" data-prompt-kind="video" data-question-id="${esc(r.question_id)}">🎬 Copy Video Prompt</button>` : ''}
      ${r.content_type === 'thumbnail' ? `<button type="button" class="prompt-btn thumb" data-prompt-kind="thumbnail" data-question-id="${esc(r.question_id)}">🖼️ Copy Thumbnail Prompt</button>` : ''}
      ${r.content_type === 'image' || r.content_type === 'post' || r.content_type === 'video' ? `<button type="button" class="publish-facebook" data-question-id="${esc(r.question_id)}" data-content-type="${esc(r.content_type)}">📘 Facebook Publish</button>` : ''}
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
    return `Create a clean, accurate educational mathematics image for Ganit Setu, MP Board Class ${q.class_level}. Use this exact question as the educational content. Do not change mathematical symbols, numbers, options, or answer. Make the design mobile-friendly, readable and professional.\\n\\n${base}`;
  }
  if (kind === 'video') {
    return `Create one short educational Reel/Video concept for Ganit Setu using only this mathematics question. Include a strong opening hook, clear on-screen question, simple explanation, answer reveal, and a concise Hindi voice-over script. Keep all mathematics exact.\\n\\n${base}`;
  }
  if (kind === 'thumbnail') {
    return `Create one YouTube/Video thumbnail concept for Ganit Setu based on this exact mathematics question. Make it highly readable on mobile, educational and uncluttered. Do not alter mathematical notation or answer.\\n\\n${base}`;
  }
  return `Generate the complete social-media content package for this one Ganit Setu mathematics question. Return separate fields for: Title, SEO Title, Caption, Description, SEO Keywords, Hashtags, CTA, and Answer/Explanation. Keep the question and mathematics exact, use natural Hindi suitable for MP Board Class ${q.class_level}, and do not create content for any other question.\\n\\n${base}`;
}

async function copyQuestionPrompt(kind, questionId, button) {
  try {
    const q = (await fetchQuestions([questionId]))[Number(questionId)];
    if (!q) throw new Error('Question data नहीं मिला।');
    await navigator.clipboard.writeText(buildIndividualPrompt(kind, q));
    const old = button.textContent;
    button.textContent = '✅ Copied';
    setTimeout(() => button.textContent = old, 1200);
  } catch (e) {
    showNotice('error', e.message || 'Prompt copy नहीं हुआ।');
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.prompt-btn');
  if (!btn) return;
  copyQuestionPrompt(btn.dataset.promptKind, btn.dataset.questionId, btn);
});

/* =========================================================
   COMPLETE IMAGE MASTER PROMPT
   Class 9 / Class 10 are intentionally separate.
   One click copies ALL unique selected questions for a class.
   ========================================================= */

function buildCompleteImagePrompt(classLevel, classRows, qmap) {
  const seen = new Set();
  const questions = [];

  [...classRows]
    .sort((a,b) =>
      Number(a.plan_day || 0) - Number(b.plan_day || 0) ||
      Number(a.selection_order || 0) - Number(b.selection_order || 0)
    )
    .forEach(r => {
      const id = Number(r.question_id);
      if (seen.has(id)) return;
      seen.add(id);

      const q = qmap[id];
      if (q) questions.push({
        id,
        classLevel: Number(q.class_level),
        chapterNumber: Number(q.chapter_number),
        chapterName: q.chapter_name || '',
        question: q.question_text || '',
        A: q.option_a || '',
        B: q.option_b || '',
        C: q.option_c || '',
        D: q.option_d || '',
        answer: q.correct_option || '',
        hint: q.hint || '',
        explanation: q.explanation || ''
      });
    });

  if (!questions.length) {
    return `GANIT SETU COMPLETE IMAGE PROMPT\n\nClass ${classLevel}\n\nNo question data is currently loaded.`;
  }

  const questionData = questions.map((q, i) => `
QUESTION ${String(i + 1).padStart(2,'0')}
Question ID: Q${q.id}
Class: ${q.classLevel}
Chapter: ${q.chapterNumber} — ${q.chapterName}

Question:
${q.question}

Options:
A) ${q.A}
B) ${q.B}
C) ${q.C}
D) ${q.D}

INTERNAL ANSWER DATA (DO NOT SHOW ON QUIZ IMAGE):
Correct Answer: ${q.answer}
Hint: ${q.hint}
Explanation: ${q.explanation}
`).join('\n------------------------------\n');

  const fileNames = questions.map((q,i) => {
    const n = String(i + 1).padStart(2,'0');
    return [
      `Q${n}_FACEBOOK_INSTAGRAM_FEED.png`,
      `Q${n}_WHATSAPP_CHANNEL.png`,
      `Q${n}_INSTAGRAM_WHATSAPP_STATUS.png`,
      `Q${n}_CONTENT.txt`
    ].join('\n');
  }).join('\n');

  return `GANIT SETU — COMPLETE IMAGE BATCH MASTER PROMPT
MASTER VERSION: GS-IMAGE-01

ROLE
You are the official visual content designer for GANIT SETU, a Hindi Mathematics
learning platform for MP Board students.

BATCH
Create the complete image-content batch for Class ${classLevel}.
There are ${questions.length} unique selected questions in this batch.

VERY IMPORTANT
Process EVERY supplied question.
Do not skip, merge, invent, reorder, paraphrase, or duplicate questions.

OFFICIAL LOGO — MANDATORY REFERENCE
An official GANIT SETU logo image will be attached with this prompt.

Use that attached logo as the exact and permanent GANIT SETU brand reference.

DO NOT:
- redesign or recreate the logo
- replace the logo
- alter its colors, typography, proportions or Hindi text
- add an outer circle
- add or remove symbols
- stretch, rotate, crop or distort it

LOGO PLACEMENT
- Top-center.
- Slightly small and elegant.
- Give it a dedicated protected area.
- If needed, place it on a subtle clean white background/panel.
- The logo must NOT touch any banner, border, text, student, decoration
  or other object.
- Maintain visible breathing space on every side.
- Never overlap or be overlapped.
- Keep approximately the same visual scale and placement across the whole batch.

MASTER VISUAL STYLE
Every image must look like part of the same official GANIT SETU daily-question series.

Use the approved visual direction:
- premium educational classroom style
- green chalkboard
- warm classroom lighting
- wooden frame/desk elements
- books and tasteful stationery
- subtle plants and maths decorations
- attractive school-going student
- student has a curious/thinking expression
- optional subtle thought bubble/question mark
- clean, colorful, modern and professional
- attractive for Class 9 students
- readable for mobile screens
- no unnecessary clutter

CONSISTENCY RULE
For every question:
KEEP CONSISTENT:
- official logo
- logo size/placement
- classroom/chalkboard visual language
- typography character
- option-card treatment
- student-character concept
- visual hierarchy
- CTA treatment
- overall color/lighting character
- premium educational appearance

CHANGE ONLY:
- question-specific text
- class
- chapter
- options
- question-specific mathematical illustration

CLASS AND CHAPTER
Use ONLY the supplied database values.
Never guess or invent the class/chapter.

Display:
कक्षा ${classLevel}
अध्याय [SUPPLIED CHAPTER NUMBER AND NAME]

MAIN IMAGE CONTENT
For every question show:
GANIT SETU
कक्षा [Class]
अध्याय [Chapter Number — Chapter Name]
आज का गणित प्रश्न
[EXACT QUESTION]
A) [EXACT OPTION A]
B) [EXACT OPTION B]
C) [EXACT OPTION C]
D) [EXACT OPTION D]

ANSWER RULE
The supplied Correct Answer, Hint and Explanation are INTERNAL DATA.

DO NOT display the correct answer on the quiz image.
DO NOT highlight the correct option.
DO NOT put a check mark on the correct option.
DO NOT use color coding that reveals the answer.

STUDENT ENGAGEMENT
Use:
“आपका उत्तर क्या है? 🤔”
“Comment करके बताइए!”

Do not reveal the answer in the quiz image.

QUESTION-SPECIFIC VISUAL
Where useful, create a mathematically accurate supporting diagram,
graph, coordinate plane, geometric figure, number line, formula visual,
or other relevant maths illustration.
Never create a visual that contradicts the supplied question.
If no diagram is useful, use tasteful maths decoration instead.

THREE PLATFORM-SPECIFIC IMAGES FOR EVERY QUESTION

1) FACEBOOK + INSTAGRAM FEED
- Square 1:1.
- Purpose-built composition.
- Mobile-readable.
- Keep important content inside safe margins.

2) WHATSAPP CHANNEL
- Vertical mobile-friendly format.
- Purpose-built for a WhatsApp Channel post.
- Large readable question and options.

3) INSTAGRAM / WHATSAPP STATUS
- Vertical 9:16.
- Mobile-first.
- Large readable text.
- Keep important content in safe zones.

Do NOT simply resize one image into the other formats.
Each format must be composed separately while preserving the same master style.

CONTENT PACKAGE
For EACH question, also prepare accompanying text metadata:
- Title
- Short caption
- Description
- Answer Comment
- Hint
- Explanation
- CTA
- Relevant hashtags
- Relevant keywords

IMPORTANT:
The quiz images must hide the answer.
The Answer Comment must contain the correct answer and may contain the explanation.
The title/caption/description/hashtags must correspond to the SAME Question ID.

ANSWER COMMENT FORMAT
For each question create a ready-to-post comment such as:
“✅ सही उत्तर: [Correct Option + option text]
💡 Hint: [Hint]
📖 Explanation: [Explanation]”

Do not reveal an answer anywhere in the quiz image itself.

FILE NAMES
Use exactly these filenames:

${fileNames}

BATCH / ZIP
Generate all requested images and content for ALL questions in this batch.
Package the completed files into ONE ZIP for Class ${classLevel}.

The ZIP should contain:
- all 3 platform images for every question
- the corresponding content/metadata file for every question

Do not create one separate ZIP per question.

QUALITY CONTROL — BEFORE DELIVERY
Check every question:
1. Correct Question ID.
2. Correct Class.
3. Correct Chapter Number.
4. Correct Chapter Name.
5. Exact question text.
6. Exact A-D options.
7. Correct answer remains hidden from quiz images.
8. Hint remains hidden from quiz images.
9. Explanation remains hidden from quiz images.
10. Official supplied logo is unchanged.
11. Logo has clear empty space around it.
12. Logo does not touch or overlap anything.
13. Student does not cover important content.
14. No text overlap.
15. No cropped important content.
16. Hindi spelling is correct.
17. Mathematical notation is correct.
18. All three platform versions are actually different compositions.
19. Every question has all three image files.
20. Every question has its matching content metadata.
21. Filenames are unique and exact.
22. Nothing is missing from the final ZIP.

SOURCE QUESTIONS — CLASS ${classLevel}
${questionData}

FINAL INSTRUCTION
Complete the entire Class ${classLevel} batch in one operation.
Do not ask me to provide the questions again.
Use the supplied question data as the only source of truth.
Use the attached official GANIT SETU logo as the only logo reference.
`;
}

function ensureImagePromptSection() {
  let section = $('#completeImagePromptSection');
  if (section) return section;

  const results = $('#planResults');
  if (!results || !results.parentElement) return null;

  section = document.createElement('section');
  section.id = 'completeImagePromptSection';
  section.className = 'panel complete-image-prompt-panel';
  section.innerHTML = `
    <div class="complete-image-prompt-head">
      <h2>🖼️ Complete Image Prompt</h2>
      <p>Class 9 और Class 10 अलग-अलग। एक click में उस class के सभी selected questions का पूरा Image Master Prompt copy करें।</p>
    </div>
    <div id="completeImagePromptButtons" class="complete-image-prompt-buttons"></div>
  `;

  results.parentElement.insertBefore(section, results);
  return section;
}

function renderCompleteImagePromptButtons(rows, qmap) {
  const section = ensureImagePromptSection();
  if (!section) return;

  const box = $('#completeImagePromptButtons');
  if (!box) return;

  const classes = [...new Set(rows.map(r => Number(r.class_level)))].sort();
  if (!classes.length) {
    box.innerHTML = '<div class="muted">इस filter में selected questions उपलब्ध नहीं हैं।</div>';
    return;
  }

  box.innerHTML = classes.map(cls => {
    const uniqueCount = new Set(
      rows.filter(r => Number(r.class_level) === cls).map(r => Number(r.question_id))
    ).size;

    return `
      <div class="complete-image-prompt-class">
        <div>
          <b>📘 Class ${cls}</b>
          <span>${uniqueCount} unique question${uniqueCount > 1 ? 's' : ''}</span>
        </div>
        <button type="button"
          class="primary-btn complete-image-prompt-copy"
          data-image-class="${cls}">
          📋 Copy Class ${cls} Complete Image Prompt
        </button>
      </div>
    `;
  }).join('');

  box.querySelectorAll('.complete-image-prompt-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cls = Number(btn.dataset.imageClass);
      const classRows = rows.filter(r => Number(r.class_level) === cls);
      const prompt = buildCompleteImagePrompt(cls, classRows, qmap);

      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }

      const old = btn.textContent;
      btn.textContent = '✅ Complete Prompt Copied';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = old;
        btn.disabled = false;
      }, 1800);
    });
  });
}

const _originalRenderPlanForImagePrompt = renderPlan;
renderPlan = async function() {
  await _originalRenderPlanForImagePrompt();

  if (!currentPlan.length) {
    $('#completeImagePromptSection')?.remove();
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    const section = ensureImagePromptSection();
    if (section) $('#completeImagePromptButtons').innerHTML =
      '<div class="muted">इस filter में selected questions उपलब्ध नहीं हैं।</div>';
    return;
  }

  try {
    const qmap = await fetchQuestions(rows.map(x => x.question_id));
    renderCompleteImagePromptButtons(rows, qmap);
  } catch (e) {
    console.error(e);
  }
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
  return t === 'image' ? '🖼️ Image' : t === 'post' ? '📱 Post' : '🎬 Video';
}

function copyPlanId() {
  if (!currentPlanId) return;
  navigator.clipboard.writeText(currentPlanId).then(() => showNotice('success','Plan ID copied.'));
}

function showNotice(kind,msg) {
  const box = $('#notice');
  if (!box) return alert(msg);
  box.className = `notice ${kind}`;
  box.textContent = msg;
  box.hidden = false;
}

})();