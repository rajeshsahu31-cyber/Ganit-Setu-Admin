/* Ganit Setu Content Planning â€” FINAL STABLE BUILD
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
    script.onerror = () => reject(new Error("Supabase library load à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤ˆà¥¤"));
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
    alert(e.message || 'Supabase client à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    return;
  }

  const { data: { session }, error: sessionError } = await authClient.auth.getSession();
  if (sessionError) {
    console.error('Session error:', sessionError);
    alert('Admin session à¤ªà¤¢à¤¼à¥€ à¤¨à¤¹à¥€à¤‚ à¤œà¤¾ à¤¸à¤•à¥€à¥¤');
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
  f.innerHTML = '<option value="all">à¤¸à¤­à¥€ Days</option>' +
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
      x.post ? `ðŸ“± Post ${x.post}` : '',
      x.image ? `ðŸ–¼ï¸ Image ${x.image}` : '',
      x.video ? `ðŸŽ¬ Reel/Video ${x.video}` : '',
      x.thumbnail ? `ðŸ–¼ï¸ Thumbnail ${x.thumbnail}` : ''
    ].filter(Boolean);
    lines.push(`<div><b>Class ${cls}:</b> ${parts.length ? parts.join(' â€¢ ') : 'à¤†à¤œ à¤•à¥‹à¤ˆ content à¤¨à¤¹à¥€à¤‚ à¤šà¥à¤¨à¤¾'}</div>`);
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
  $('#generateBtn')?.addEventListener('click', () => generatePlan());
  $('#copyPlanIdBtn')?.addEventListener('click', copyPlanId);
  $('#days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
  $('#startDate')?.addEventListener('change', loadPoolStatus);
  ['dayFilter','classFilter','typeFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderPlan);
  });
}

async function loadSettings() {
  // The current UI uses exact per-class/per-content quantities selected by the admin.
  // The legacy content_automation_settings table is intentionally not used here.
  const box = $('#settingsBox');
  if (box) box.innerHTML = '<div class="muted">à¤†à¤œ à¤•à¥€ quantity à¤¨à¥€à¤šà¥‡ Class 9 / Class 10 à¤¸à¥‡ à¤šà¥à¤¨à¥€ à¤œà¤¾à¤¤à¥€ à¤¹à¥ˆà¥¤</div>';
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
        <div class="pool-title">ðŸ“˜ à¤•à¤•à¥à¤·à¤¾ ${r.class_level}</div>
        <div class="pool-grid">
          <div><small>à¤•à¥à¤² Eligible</small><strong>${r.total_eligible}</strong></div>
          <div><small>Cycle à¤®à¥‡à¤‚ Used</small><strong>${r.used_in_cycle}</strong></div>
          <div><small>à¤¶à¥‡à¤·</small><strong>${r.remaining_in_cycle}</strong></div>
          <div><small>Current Cycle</small><strong>${r.current_cycle}</strong></div>
        </div>
        <div class="pool-chapter">à¤‡à¤¸ à¤®à¤¹à¥€à¤¨à¥‡: Chapter ${r.chapter_from}â€“${r.chapter_to}</div>
      </div>
    `).join('') || '<div class="muted">Pool status à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤</div>';
  } catch (e) {
    box.innerHTML = `<div class="error-box">Pool status à¤¨à¤¹à¥€à¤‚ à¤ªà¤¢à¤¼à¤¾ à¤œà¤¾ à¤¸à¤•à¤¾: ${esc(e.message)}</div>`;
  }
}

async function generatePlan() {
  const startDate = $('#startDate')?.value;
  const days = Number($('#days')?.value || 1);
  if (!startDate) {
    alert('Start Date à¤šà¥à¤¨à¤¿à¤à¥¤');
    return;
  }

  const btn = $('#generateBtn');
  if (btn) {
    btn.disabled = true;
    btn.dataset.oldText = btn.textContent;
    btn.textContent = 'â³ Plan à¤¬à¤¨à¤¾à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';
  }

  try {
    const req = getContentRequirements();
    const totalRequested = Object.values(req).reduce((sum, c) =>
      sum + Object.values(c || {}).reduce((a, n) => a + Number(n || 0), 0), 0);

    if (!totalRequested) {
      throw new Error('à¤•à¤® à¤¸à¥‡ à¤•à¤® à¤à¤• Content Type à¤•à¥€ quantity à¤šà¥à¤¨à¤¿à¤à¥¤');
    }

    const reuseQuestions = false; // Ganit Setu rule: NEVER reuse a question on the same day.

    const { data, error } = await supabase.rpc('generate_content_plan_v4', {
      p_start_date: startDate,
      p_days: days,
      p_requirements: req,
      p_reuse_questions: reuseQuestions
    });
    if (error) throw error;

    currentPlan = data || [];
    currentPlanId = currentPlan[0]?.plan_id || null;

    showNotice('success', 'Content Plan successfully generate à¤¹à¥‹ à¤—à¤¯à¤¾à¥¤ Current cycle à¤–à¤¤à¥à¤® à¤¹à¥‹à¤¨à¥‡ à¤ªà¤° à¤…à¤—à¤²à¤¾ cycle à¤…à¤ªà¤¨à¥‡-à¤†à¤ª à¤¶à¥à¤°à¥‚ à¤¹à¥‹à¤—à¤¾à¥¤');
    updatePlanSummary();
    renderPlan();
    await loadPoolStatus();
  } catch (e) {
    showNotice('error', e.message || 'Plan generate à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.oldText || 'ðŸš€ Generate Content Plan';
    }
  }
}

function updatePlanSummary() {
  const summary = $('#planSummary');
  if (!summary) return;

  const classes = [...new Set(currentPlan.map(x => x.class_level))];
  const days = [...new Set(currentPlan.map(x => x.plan_day))].length;
  summary.innerHTML = `
    <div><b>Plan à¤¤à¥ˆà¤¯à¤¾à¤° à¤¹à¥ˆ</b></div>
    <div>${days} Day â€¢ ${classes.map(c => `Class ${c}`).join(' â€¢ ')}</div>
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
    container.innerHTML = `<div class="empty-box">à¤…à¤­à¥€ à¤•à¥‹à¤ˆ Plan generate à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤† à¤¹à¥ˆà¥¤</div>`;
    return;
  }

  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">à¤‡à¤¸ filter à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ question à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤</div>`;
    return;
  }

  container.innerHTML = `<div class="loading-box">Questions à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚...</div>`;
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
            <h3>ðŸ“˜ à¤•à¤•à¥à¤·à¤¾ ${esc(cls)} <span>${rs.length} Questions</span></h3>
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
      <b>Question à¤²à¥‹à¤¡ à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤ªà¤¾à¤à¥¤</b><br>${esc(e.message)}
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
  const title = `à¤†à¤œ à¤•à¤¾ à¤—à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¥à¤¨ | à¤•à¤•à¥à¤·à¤¾ ${q.class_level} | à¤…à¤§à¥à¤¯à¤¾à¤¯ ${q.chapter_number}`;
  const caption = [
    `ðŸ“˜ GANIT SETU`,
    `à¤•à¤•à¥à¤·à¤¾ ${q.class_level} | à¤…à¤§à¥à¤¯à¤¾à¤¯ ${q.chapter_number} â€” ${q.chapter_name || ''}`,
    `\nðŸ§® à¤†à¤œ à¤•à¤¾ à¤—à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¥à¤¨:`,
    q.question_text,
    `\nA) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `\nðŸ¤” à¤†à¤ªà¤•à¤¾ à¤‰à¤¤à¥à¤¤à¤° à¤•à¥à¤¯à¤¾ à¤¹à¥ˆ? Comment à¤•à¤°à¤•à¥‡ à¤¬à¤¤à¤¾à¤‡à¤!`
  ].join('\n');
  const description = `${q.question_text}\n\nHint: ${q.hint || 'Comment à¤•à¤°à¤•à¥‡ à¤‰à¤¤à¥à¤¤à¤° à¤¬à¤¤à¤¾à¤‡à¤à¥¤'}\n\nGanit Setu â€” MP Board Mathematics Learning`;
  const hashtags = '#GanitSetu #MPBoard #Mathematics #MathsQuestion #Class' + q.class_level;
  const answerComment = `âœ… à¤¸à¤¹à¥€ à¤‰à¤¤à¥à¤¤à¤°: ${q.correct_option || ''}\nðŸ’¡ Hint: ${q.hint || ''}\nðŸ“– Explanation: ${q.explanation || ''}`;
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
    showNotice('error', 'Question data à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'â³ Facebook à¤ªà¤° publish à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';

  try {
    const existing = await getExistingFacebookQueue(r);
    let mediaUrl = existing?.media_url || '';

    if (r.content_type === 'image' || r.content_type === 'video') {
      if (!mediaUrl) {
        mediaUrl = window.prompt(
          r.content_type === 'image'
            ? 'Facebook à¤ªà¤° publish à¤•à¤°à¤¨à¥‡ à¤µà¤¾à¤²à¥€ IMAGE à¤•à¥€ public HTTPS URL à¤¡à¤¾à¤²à¥‡à¤‚:'
            : 'Facebook à¤ªà¤° publish à¤•à¤°à¤¨à¥‡ à¤µà¤¾à¤²à¥€ VIDEO à¤•à¥€ public HTTPS URL à¤¡à¤¾à¤²à¥‡à¤‚:',
          ''
        )?.trim() || '';
      }
      if (!mediaUrl) {
        throw new Error('Media URL à¤¨à¤¹à¥€à¤‚ à¤¦à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤');
      }
      if (!/^https:\/\//i.test(mediaUrl)) {
        throw new Error('Media URL public HTTPS URL à¤¹à¥‹à¤¨à¤¾ à¤šà¤¾à¤¹à¤¿à¤à¥¤');
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
    if (!session?.access_token) throw new Error('Admin session à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');

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

    button.textContent = 'âœ… Facebook Published';
    button.classList.add('published');
    if (data.external_url) {
      button.title = data.external_url;
    }
    showNotice('success', `Facebook à¤ªà¤° à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• publish à¤¹à¥‹ à¤—à¤¯à¤¾à¥¤${data.external_post_id ? ` Post ID: ${data.external_post_id}` : ''}`);

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
      link.textContent = 'ðŸ”— View Facebook Post';
    }
  } catch (e) {
    button.disabled = false;
    button.textContent = oldText;
    showNotice('error', e.message || 'Facebook publish à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤');
  }
}


/* =========================================================
   INSTAGRAM IMAGE UPLOAD + REAL PUBLISH
   Admin selects an image locally. The browser uploads it
   automatically to the existing public Storage bucket,
   obtains the HTTPS URL internally, and sends it to the
   deployed instagram-publish Edge Function.
   ========================================================= */

const INSTAGRAM_PUBLISH_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/instagram-publish`;

const YOUTUBE_PUBLISH_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/youtube-publish`;

const VERIFY_PLATFORM_FUNCTION =
  `${GS_SUPABASE_URL}/functions/v1/verify-platform-publish`;

const YOUTUBE_UPLOAD_BUCKET = 'home-banners';

// Temporary test storage bucket. The admin never sees or enters this URL.
const INSTAGRAM_TEST_BUCKET = 'home-banners';

function buildInstagramCaption(q) {
  if (!q) return 'Ganit Setu';
  return [
    'ðŸ“˜ GANIT SETU',
    `à¤•à¤•à¥à¤·à¤¾ ${q.class_level} | à¤…à¤§à¥à¤¯à¤¾à¤¯ ${q.chapter_number} â€” ${q.chapter_name || ''}`,
    '',
    'ðŸ§® à¤†à¤œ à¤•à¤¾ à¤—à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¥à¤¨:',
    q.question_text,
    '',
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    '',
    'ðŸ¤” à¤†à¤ªà¤•à¤¾ à¤‰à¤¤à¥à¤¤à¤° à¤•à¥à¤¯à¤¾ à¤¹à¥ˆ?',
    '',
    '#GanitSetu #Maths #MPBoard #Class' + q.class_level
  ].join('\n');
}

async function publishQuestionToInstagram(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'â³ Image à¤šà¥à¤¨à¥‡à¤‚...';

  try {
    // One-click file picker. No URL is requested from the admin.
    const file = await new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const selected = input.files?.[0] || null;
        document.body.removeChild(input);
        resolve(selected);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });

    if (!file) {
      throw new Error('Image select à¤¨à¤¹à¥€à¤‚ à¤•à¥€ à¤—à¤ˆà¥¤');
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('à¤•à¥ƒà¤ªà¤¯à¤¾ à¤•à¥‡à¤µà¤² image file à¤šà¥à¤¨à¥‡à¤‚à¥¤');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image 10 MB à¤¸à¥‡ à¤›à¥‹à¤Ÿà¥€ à¤°à¤–à¥‡à¤‚à¥¤');
    }

    if (!supabase || !authClient) {
      await ensureSupabaseClient();
    }

    const { data: sessionData, error: sessionError } =
      await authClient.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Admin session à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    }

    button.textContent = 'â³ Image upload à¤¹à¥‹ à¤°à¤¹à¥€ à¤¹à¥ˆ...';

    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.');

    const path =
      `instagram-test/${Date.now()}-Q${Number(r.question_id)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(INSTAGRAM_TEST_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(
        `Image upload failed: ${uploadError.message}`
      );
    }

    const { data: publicData } = supabase.storage
      .from(INSTAGRAM_TEST_BUCKET)
      .getPublicUrl(path);

    const mediaUrl = publicData?.publicUrl || '';

    if (!/^https:\/\//i.test(mediaUrl)) {
      throw new Error('Uploaded image à¤•à¤¾ public HTTPS URL à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤');
    }

    button.textContent = 'â³ Instagram à¤ªà¤° publish à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';

    const payload = {
      access_token: sessionData.session.access_token,
      media_url: mediaUrl,
      caption: buildInstagramCaption(q),
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level)
    };

    const response = await fetch(INSTAGRAM_PUBLISH_FUNCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'x-user-access-token': sessionData.session.access_token,
        'apikey': GS_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(
        result?.error || 'Instagram publishing failed.'
      );
    }

    button.textContent = 'âœ… Instagram Published';
    button.classList.add('published');
    button.disabled = true;

    showNotice(
      'success',
      `Instagram à¤ªà¤° image à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• publish à¤¹à¥‹ à¤—à¤ˆà¥¤ Media ID: ${result.media_id || 'available'}`
    );

  } catch (e) {
    const message = e?.message || String(e) || 'Instagram publish à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤';
    console.error('Instagram Publish Error:', e);

    button.disabled = false;
    button.textContent = oldText;

    showNotice(
      'error',
      `âŒ Instagram à¤ªà¤° à¤ªà¥‹à¤¸à¥à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¥€à¥¤<br><br><b>Error:</b> ${esc(message)}`
    );
  }
}


/* =========================================================
   YOUTUBE PUBLISHING
   Admin selects the actual VIDEO file locally.
   The browser uploads it to Supabase Storage internally.
   Admin never enters a URL.
   ========================================================= */

function buildYouTubeContent(q) {
  if (!q) {
    return {
      title: 'Ganit Setu',
      description: 'Ganit Setu â€” MP Board Mathematics Learning',
      tags: ['GanitSetu', 'MPBoard', 'Mathematics']
    };
  }

  const title =
    `à¤•à¤•à¥à¤·à¤¾ ${q.class_level} à¤—à¤£à¤¿à¤¤ | à¤…à¤§à¥à¤¯à¤¾à¤¯ ${q.chapter_number} â€” ${q.chapter_name || ''}`;

  const description = [
    'ðŸ“˜ GANIT SETU',
    `à¤•à¤•à¥à¤·à¤¾ ${q.class_level} | à¤…à¤§à¥à¤¯à¤¾à¤¯ ${q.chapter_number} â€” ${q.chapter_name || ''}`,
    '',
    'ðŸ§® à¤†à¤œ à¤•à¤¾ à¤—à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¥à¤¨:',
    q.question_text,
    '',
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    '',
    `ðŸ’¡ Hint: ${q.hint || ''}`,
    '',
    'Ganit Setu â€” MP Board Mathematics Learning',
    '#GanitSetu #MPBoard #Mathematics'
  ].join('\n');

  return {
    title,
    description,
    tags: [
      'GanitSetu',
      'MPBoard',
      'Mathematics',
      'Maths',
      `Class${q.class_level}`,
      `Chapter${q.chapter_number}`
    ]
  };
}

async function publishQuestionToYouTube(r, q, button) {
  if (!q) {
    showNotice('error', 'Question data à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    return;
  }

  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'â³ Video à¤šà¥à¤¨à¥‡à¤‚...';

  try {
    const file = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const selected = input.files?.[0] || null;
        input.remove();
        resolve(selected);
      }, { once: true });

      document.body.appendChild(input);
      input.click();
    });

    if (!file) {
      throw new Error('Video select à¤¨à¤¹à¥€à¤‚ à¤•à¤¿à¤¯à¤¾ à¤—à¤¯à¤¾à¥¤');
    }

    if (!file.type.startsWith('video/')) {
      throw new Error('à¤•à¥ƒà¤ªà¤¯à¤¾ à¤•à¥‡à¤µà¤² video file à¤šà¥à¤¨à¥‡à¤‚à¥¤');
    }

    if (!supabase || !authClient) {
      await ensureSupabaseClient();
    }

    const { data: sessionData, error: sessionError } =
      await authClient.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('Admin session à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤');
    }

    button.textContent = 'â³ Video Storage à¤®à¥‡à¤‚ upload à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';

    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.');

    const path =
      `youtube-content/${Date.now()}-Q${Number(r.question_id)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(YOUTUBE_UPLOAD_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(
        `Video upload failed: ${uploadError.message}`
      );
    }

    button.textContent = 'â³ YouTube à¤ªà¤° publish à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';

    const meta = buildYouTubeContent(q);

    /*
     * IMPORTANT:
     * Admin à¤•à¥‹ à¤•à¥‹à¤ˆ URL à¤¨à¤¹à¥€à¤‚ à¤¦à¥‡à¤¨à¤¾ à¤¹à¥ˆ.
     * à¤•à¥‡à¤µà¤² internal Supabase Storage path à¤­à¥‡à¤œà¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ.
     */
    const payload = {
      storage_bucket: YOUTUBE_UPLOAD_BUCKET,
      storage_path: path,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      privacy_status: 'private',
      question_id: Number(r.question_id),
      plan_id: r.plan_id || currentPlanId || null,
      class_level: Number(r.class_level)
    };

    const response = await fetch(
      YOUTUBE_PUBLISH_FUNCTION,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${sessionData.session.access_token}`,
          'apikey':
            GS_SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    const result =
      await response.json().catch(() => ({}));

    if (!response.ok || !result?.ok) {
      throw new Error(
        result?.error ||
        'YouTube publishing failed.'
      );
    }

    button.textContent = 'âœ… YouTube Published';
    button.classList.add('published');
    button.disabled = true;

    showNotice(
      'success',
      `YouTube à¤ªà¤° video à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• publish à¤¹à¥‹ à¤—à¤¯à¤¾à¥¤ Video ID: ${result.video_id || 'available'}`
    );

    const card = button.closest('.question-card');

    if (card && result.video_id) {
      card.dataset.youtubeVideoId = result.video_id;
    }

    if (card && result.video_url) {
      let link =
        card.querySelector('.youtube-published-link');

      if (!link) {
        link = document.createElement('a');
        link.className = 'youtube-published-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.querySelector('.q-actions')?.appendChild(link);
      }

      link.href = result.video_url;
      link.textContent = 'ðŸ”— View YouTube Video';
    }

  } catch (e) {
    console.error(
      'YouTube Publish Error:',
      e
    );

    button.disabled = false;
    button.textContent = oldText;

    showNotice(
      'error',
      `âŒ YouTube à¤ªà¤° video publish à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤<br><br><b>Error:</b> ${esc(e?.message || String(e))}`
    );
  }
}

function questionCard(r,q,number) {
  const text = q?.question_text;
  const opts = q ? [
    ['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]
  ] : [];

  const full = q ? [
    `Question ID: Q${q.id}`,
    `Class ${q.class_level} | Chapter ${q.chapter_number} â€” ${q.chapter_name}`,
    ``,
    q.question_text,
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`,
    `Correct Answer: ${q.correct_option}`,
    `Hint: ${q.hint || ''}`,
    `Explanation: ${q.explanation || ''}`
  ].join('\n') : `Question ID: Q${r.question_id}\nChapter ${r.chapter_number} â€” ${r.chapter_name}`;

  return `<article class="question-card">
    <div class="q-top">
      <span class="q-number">${number}</span>
      <span class="type-badge">${typeLabel(r.content_type)}</span>
      <span class="chapter-badge">Chapter ${esc(r.chapter_number)}</span>
      <span class="cycle-badge">Cycle ${esc(r.cycle_number)}</span>
    </div>
    <div class="q-title">Question ID: <b>Q${esc(r.question_id)}</b> <span>â€¢ ${esc(r.chapter_name)}</span></div>
    ${q ? `
      <div class="question-text">${esc(text)}</div>
      <div class="options">
        ${opts.map(([l,v]) => `<div class="option"><b>${l})</b> ${esc(v)}</div>`).join('')}
      </div>
      <div class="answer-box">
        <div>âœ… <b>à¤¸à¤¹à¥€ à¤‰à¤¤à¥à¤¤à¤°:</b> ${esc(q.correct_option || 'à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚')}</div>
        <div>ðŸ’¡ <b>Hint:</b> ${esc(q.hint || 'Hint à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤')}</div>
        <div>ðŸ“– <b>Explanation:</b> ${esc(q.explanation || 'Explanation à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤')}</div>
      </div>
    ` : `<div class="missing-question">Question data à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤ Question ID: Q${esc(r.question_id)}</div>`}
    <div class="prompt-actions">
      <button type="button" class="prompt-btn image" data-prompt-kind="image" data-question-id="${esc(r.question_id)}">ðŸ–¼ï¸ Copy Image Prompt</button>
      <button type="button" class="prompt-btn package" data-prompt-kind="package" data-question-id="${esc(r.question_id)}">ðŸ“¦ Copy Complete Package Prompt</button>
      ${r.content_type === 'video' ? `<button type="button" class="prompt-btn video" data-prompt-kind="video" data-question-id="${esc(r.question_id)}">ðŸŽ¬ Copy Video Prompt</button>` : ''}
      ${r.content_type === 'thumbnail' ? `<button type="button" class="prompt-btn thumb" data-prompt-kind="thumbnail" data-question-id="${esc(r.question_id)}">ðŸ–¼ï¸ Copy Thumbnail Prompt</button>` : ''}
      ${r.content_type === 'image' || r.content_type === 'post' || r.content_type === 'video' ? `<button type="button" class="publish-facebook" data-question-id="${esc(r.question_id)}" data-content-type="${esc(r.content_type)}">ðŸ“˜ Facebook Publish</button>` : ''}
      ${r.content_type === 'image' ? `<button type="button" class="publish-instagram" data-question-id="${esc(r.question_id)}" data-content-type="image">ðŸ“¸ Instagram Publish</button>` : ''}
      ${r.content_type === 'video' ? `<button type="button" class="publish-youtube" data-question-id="${esc(r.question_id)}" data-content-type="video">â–¶ï¸ YouTube Publish</button>` : ''}
      ${r.content_type === 'video' ? `<button type="button" class="verify-youtube" data-question-id="${esc(r.question_id)}" data-content-type="video">ðŸ” Verify YouTube</button>` : ''}
    </div>
  </article>`;
}


function buildIndividualPrompt(kind, q) {
  if (!q) return '';
  const base = [
    `Question ID: Q${q.id}`,
    `Class: ${q.class_level}`,
    `Chapter: ${q.chapter_number} â€” ${q.chapter_name || ''}`,
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
    if (!q) throw new Error('Question data à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤');
    await navigator.clipboard.writeText(buildIndividualPrompt(kind, q));
    const old = button.textContent;
    button.textContent = 'âœ… Copied';
    setTimeout(() => button.textContent = old, 1200);
  } catch (e) {
    showNotice('error', e.message || 'Prompt copy à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤†à¥¤');
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
Chapter: ${q.chapterNumber} â€” ${q.chapterName}

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

  return `GANIT SETU â€” COMPLETE IMAGE BATCH MASTER PROMPT
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

OFFICIAL LOGO â€” MANDATORY REFERENCE
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
à¤•à¤•à¥à¤·à¤¾ ${classLevel}
à¤…à¤§à¥à¤¯à¤¾à¤¯ [SUPPLIED CHAPTER NUMBER AND NAME]

MAIN IMAGE CONTENT
For every question show:
GANIT SETU
à¤•à¤•à¥à¤·à¤¾ [Class]
à¤…à¤§à¥à¤¯à¤¾à¤¯ [Chapter Number â€” Chapter Name]
à¤†à¤œ à¤•à¤¾ à¤—à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¥à¤¨
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
â€œà¤†à¤ªà¤•à¤¾ à¤‰à¤¤à¥à¤¤à¤° à¤•à¥à¤¯à¤¾ à¤¹à¥ˆ? ðŸ¤”â€
â€œComment à¤•à¤°à¤•à¥‡ à¤¬à¤¤à¤¾à¤‡à¤!â€

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
â€œâœ… à¤¸à¤¹à¥€ à¤‰à¤¤à¥à¤¤à¤°: [Correct Option + option text]
ðŸ’¡ Hint: [Hint]
ðŸ“– Explanation: [Explanation]â€

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

QUALITY CONTROL â€” BEFORE DELIVERY
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

SOURCE QUESTIONS â€” CLASS ${classLevel}
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
      <h2>ðŸ–¼ï¸ Complete Image Prompt</h2>
      <p>Class 9 à¤”à¤° Class 10 à¤…à¤²à¤—-à¤…à¤²à¤—à¥¤ à¤à¤• click à¤®à¥‡à¤‚ à¤‰à¤¸ class à¤•à¥‡ à¤¸à¤­à¥€ selected questions à¤•à¤¾ à¤ªà¥‚à¤°à¤¾ Image Master Prompt copy à¤•à¤°à¥‡à¤‚à¥¤</p>
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
    box.innerHTML = '<div class="muted">à¤‡à¤¸ filter à¤®à¥‡à¤‚ selected questions à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¤‚à¥¤</div>';
    return;
  }

  box.innerHTML = classes.map(cls => {
    const uniqueCount = new Set(
      rows.filter(r => Number(r.class_level) === cls).map(r => Number(r.question_id))
    ).size;

    return `
      <div class="complete-image-prompt-class">
        <div>
          <b>ðŸ“˜ Class ${cls}</b>
          <span>${uniqueCount} unique question${uniqueCount > 1 ? 's' : ''}</span>
        </div>
        <button type="button"
          class="primary-btn complete-image-prompt-copy"
          data-image-class="${cls}">
          ðŸ“‹ Copy Class ${cls} Complete Image Prompt
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
      btn.textContent = 'âœ… Complete Prompt Copied';
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
      '<div class="muted">à¤‡à¤¸ filter à¤®à¥‡à¤‚ selected questions à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¤‚à¥¤</div>';
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
    btn.textContent = 'âœ… Copied';
    setTimeout(()=>btn.textContent=old,1200);
  } catch {
    alert('Copy à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤ªà¤¾à¤¯à¤¾à¥¤');
  }
});



document.addEventListener('click', async e => {
  const btn = e.target.closest('.publish-instagram');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;
  const row = currentPlan.find(
    x => Number(x.question_id) === questionId &&
         x.content_type === contentType
  );

  if (!row) {
    showNotice('error', 'à¤‡à¤¸ question à¤•à¤¾ Instagram planning record à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤');
    return;
  }

  try {
    const qmap = await fetchQuestions([questionId]);
    await publishQuestionToInstagram(row, qmap[questionId], btn);
  } catch (err) {
    showNotice('error', err.message || 'Instagram image data load à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤');
  }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.publish-youtube');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;

  const row = currentPlan.find(
    x => Number(x.question_id) === questionId &&
         x.content_type === contentType
  );

  if (!row) {
    showNotice(
      'error',
      'à¤‡à¤¸ question à¤•à¤¾ YouTube planning record à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤'
    );
    return;
  }

  try {
    const qmap = await fetchQuestions([questionId]);

    await publishQuestionToYouTube(
      row,
      qmap[questionId],
      btn
    );
  } catch (err) {
    showNotice(
      'error',
      err.message ||
      'Question data load à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤'
    );
  }
});


document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.verify-youtube');
  if (!btn) return;

  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;

  const row = currentPlan.find(
    x =>
      Number(x.question_id) === questionId &&
      x.content_type === contentType
  );

  if (!row) {
    showNotice(
      'error',
      'à¤‡à¤¸ question à¤•à¤¾ YouTube planning record à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤'
    );
    return;
  }

  const card = btn.closest('.question-card');
  let videoId = card?.dataset.youtubeVideoId || '';

  // If the page was refreshed after publishing, use a manual ID once.
  if (!videoId) {
    videoId = window.prompt(
      'YouTube Video ID à¤¡à¤¾à¤²à¥‡à¤‚:',
      ''
    )?.trim() || '';
  }

  if (!videoId) {
    showNotice(
      'error',
      'YouTube Video ID à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤'
    );
    return;
  }

  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'â³ YouTube verify à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...';

  try {
    const {
      data: { session }
    } = await authClient.auth.getSession();

    if (!session?.access_token) {
      throw new Error(
        'Admin session à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤'
      );
    }

    const response = await fetch(
      VERIFY_PLATFORM_FUNCTION,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization':
            `Bearer ${session.access_token}`,
          'apikey':
            GS_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          platform: 'youtube',
          video_id: videoId,
          question_id: questionId,
          plan_id:
            row.plan_id ||
            currentPlanId ||
            null
        })
      }
    );

    const data = await response.json()
      .catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        'YouTube verification failed.'
      );
    }

    card.dataset.youtubeVideoId = videoId;

    let statusBox =
      card.querySelector('.youtube-verify-status');

    if (!statusBox) {
      statusBox = document.createElement('div');
      statusBox.className = 'youtube-verify-status';
      card.querySelector('.prompt-actions')
        ?.appendChild(statusBox);
    }

    if (data.status === 'published') {
      btn.textContent = 'ðŸŸ¢ YouTube Published';
      btn.classList.add('published');

      statusBox.innerHTML =
        `ðŸŸ¢ <b>YouTube à¤ªà¤° Successfully Published</b><br>` +
        `Video ID: ${esc(data.video_id)}<br>` +
        `Processing: ${esc(data.processing_status || 'succeeded')}<br>` +
        `Privacy: ${esc(data.privacy_status || 'unknown')}<br>` +
        (data.video_url
          ? `<a href="${esc(data.video_url)}" target="_blank" rel="noopener noreferrer">ðŸ”— YouTube Video à¤–à¥‹à¤²à¥‡à¤‚</a>`
          : '');

      showNotice(
        'success',
        'ðŸŸ¢ YouTube à¤ªà¤° video successfully published à¤¹à¥ˆà¥¤'
      );

    } else if (data.status === 'processing') {
      btn.textContent = 'ðŸŸ¡ YouTube Processing';

      statusBox.innerHTML =
        `ðŸŸ¡ <b>YouTube à¤ªà¤° Processing</b><br>` +
        `Video ID: ${esc(data.video_id)}<br>` +
        `Processing Status: ${esc(data.processing_status || 'processing')}`;

      showNotice(
        'success',
        'ðŸŸ¡ YouTube video à¤…à¤­à¥€ processing à¤®à¥‡à¤‚ à¤¹à¥ˆà¥¤'
      );

    } else if (data.status === 'failed') {
      btn.textContent = 'ðŸ”´ YouTube Failed';

      statusBox.innerHTML =
        `ðŸ”´ <b>YouTube Processing Failed</b><br>` +
        `Reason: ${esc(data.failure_reason || 'Unknown')}`;

      showNotice(
        'error',
        'ðŸ”´ YouTube video processing failed.'
      );

    } else if (data.status === 'not_found') {
      btn.textContent = 'âšª YouTube Not Found';

      statusBox.innerHTML =
        `âšª <b>YouTube à¤ªà¤° video à¤…à¤­à¥€ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾</b><br>` +
        `Video ID: ${esc(videoId)}`;

      showNotice(
        'error',
        'YouTube à¤¨à¥‡ à¤…à¤­à¥€ à¤‡à¤¸ Video ID à¤•à¥‹ à¤¨à¤¹à¥€à¤‚ à¤ªà¤¾à¤¯à¤¾à¥¤'
      );
    } else {
      btn.textContent = 'ðŸ” Verify YouTube';

      statusBox.innerHTML =
        `â„¹ï¸ <b>YouTube Status</b><br>` +
        `${esc(data.status || 'unknown')}`;
    }

  } catch (err) {
    console.error(
      'YouTube Verify Error:',
      err
    );

    btn.textContent = oldText;

    showNotice(
      'error',
      `âŒ YouTube verification à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¥€à¥¤<br><br><b>Error:</b> ${esc(err?.message || String(err))}`
    );
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.publish-facebook');
  if (!btn) return;
  const questionId = Number(btn.dataset.questionId);
  const contentType = btn.dataset.contentType;
  const row = currentPlan.find(x => Number(x.question_id) === questionId && x.content_type === contentType);
  if (!row) {
    showNotice('error', 'à¤‡à¤¸ question à¤•à¤¾ planning record à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤');
    return;
  }
  try {
    const qmap = await fetchQuestions([questionId]);
    await publishQuestionToFacebook(row, qmap[questionId], btn);
  } catch (err) {
    showNotice('error', err.message || 'Question data load à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹ à¤¸à¤•à¤¾à¥¤');
  }
});

function typeLabel(t) {
  return t === 'image' ? 'ðŸ–¼ï¸ Image' : t === 'post' ? 'ðŸ“± Post' : 'ðŸŽ¬ Video';
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
