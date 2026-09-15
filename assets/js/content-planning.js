(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  const $ = (selector) => document.querySelector(selector);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  let supabase = null;
  let currentPlan = [];
  let currentPlanId = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (window.supabase && typeof window.supabase.createClient === 'function') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Supabase library load नहीं हो सकी।'));
      document.head.appendChild(script);
    });
  }

  async function getSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      await loadScript(SUPABASE_CDN);
    }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase library उपलब्ध नहीं है।');
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      supabase = await getSupabaseClient();
    } catch (e) {
      console.error(e);
      showNotice('error', e.message || 'Supabase client उपलब्ध नहीं है।');
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data?.session) {
        location.href = 'index.html';
        return;
      }

      const start = $('#startDate');
      if (start && !start.value) start.value = todayISO();

      await loadSettings();
      await loadPoolStatus();
      populateDayFilter();
      bindEvents();
    } catch (e) {
      console.error(e);
      showNotice('error', e.message || 'Content Planning शुरू नहीं हो सका।');
    }
  }

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function showNotice(kind, message) {
    const box = $('#notice');
    if (!box) {
      console[kind === 'error' ? 'error' : 'log'](message);
      return;
    }
    box.className = `notice ${kind}`;
    box.textContent = message;
    box.hidden = false;
  }

  function populateDayFilter() {
    const f = $('#dayFilter');
    const n = Number($('#days')?.value || 1);
    if (!f) return;
    f.innerHTML = '<option value="all">सभी Days</option>' +
      Array.from({ length:n }, (_, i) => `<option value="${i+1}">Day ${i+1}</option>`).join('');
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
        .in('class_level', [9,10])
        .order('class_level');
      if (error) throw error;

      const byClass = Object.fromEntries((data || []).map(x => [Number(x.class_level), x]));
      if (box) {
        box.innerHTML = [9,10].map(c => {
          const s = byClass[c];
          return `<div class="setting-card">
            <div class="setting-title">कक्षा ${c}</div>
            ${s ? `<div class="setting-values">
              <span>🖼️ Image <b>${esc(s.image_question_count)}</b></span>
              <span>📱 Post <b>${esc(s.post_question_count)}</b></span>
              <span>🎬 Video <b>${esc(s.video_question_count)}</b></span>
            </div>` : `<div class="setting-missing">Settings उपलब्ध नहीं हैं</div>`}
          </div>`;
        }).join('');
      }
    } catch (e) {
      console.error('Settings:', e);
      if (box) box.innerHTML = `<div class="error-box">Settings पढ़ी नहीं जा सकीं: ${esc(e.message)}</div>`;
    }
  }

  async function loadPoolStatus() {
    const box = $('#poolStatus');
    if (!box) return;
    try {
      const startDate = $('#startDate')?.value || todayISO();
      const { data, error } = await supabase.rpc('get_content_question_pool_status', { p_date: startDate });
      if (error) throw error;

      const rows = data || [];
      box.innerHTML = rows.map(r => `
        <div class="pool-card">
          <div class="pool-title">📘 कक्षा ${esc(r.class_level)}</div>
          <div class="pool-grid">
            <div><small>कुल Eligible</small><strong>${esc(r.total_eligible)}</strong></div>
            <div><small>Cycle में Used</small><strong>${esc(r.used_in_cycle)}</strong></div>
            <div><small>शेष</small><strong>${esc(r.remaining_in_cycle)}</strong></div>
            <div><small>Current Cycle</small><strong>${esc(r.current_cycle)}</strong></div>
          </div>
          <div class="pool-chapter">इस महीने: Chapter ${esc(r.chapter_from)}–${esc(r.chapter_to)}</div>
        </div>
      `).join('') || '<div class="muted">Pool status उपलब्ध नहीं है।</div>';
    } catch (e) {
      console.error('Pool status:', e);
      box.innerHTML = `<div class="error-box">Pool status नहीं पढ़ा जा सका: ${esc(e.message)}</div>`;
    }
  }

  async function generatePlan(replaceExisting) {
    const startDate = $('#startDate')?.value;
    const days = Number($('#days')?.value || 1);
    if (!startDate) {
      showNotice('error', 'Start Date चुनिए।');
      return;
    }
    if (days < 1 || days > 7) {
      showNotice('error', 'Planning Days केवल 1 से 7 के बीच हो सकते हैं।');
      return;
    }

    const btn = replaceExisting ? $('#replaceBtn') : $('#generateBtn');
    if (btn) {
      btn.disabled = true;
      btn.dataset.oldText = btn.textContent;
      btn.textContent = '⏳ Plan बनाया जा रहा है...';
    }

    try {
      const { data, error } = await supabase.rpc('generate_content_plan_safe', {
        p_start_date: startDate,
        p_days: days,
        p_replace_existing: replaceExisting
      });
      if (error) throw error;

      currentPlan = Array.isArray(data) ? data : [];
      currentPlanId = currentPlan[0]?.plan_id || null;

      if (!currentPlan.length) throw new Error('Plan generate हुआ लेकिन कोई question नहीं मिला।');

      showNotice('success', replaceExisting
        ? 'पुराना generated plan सुरक्षित रखते हुए नया random set बनाया गया है।'
        : 'Content Plan successfully generate हो गया।');

      updatePlanSummary();
      await renderPlan();
      await loadPoolStatus();
    } catch (e) {
      console.error('Generate plan:', e);
      const msg = e.message || 'Plan generate नहीं हो सका।';
      if (/Not enough unique questions/i.test(msg)) {
        showNotice('error', msg + ' यदि इसी तारीख का पुराना generated plan replace करना है, तो “♻️ Replace Existing Plan → नया Set” दबाएँ।');
      } else {
        showNotice('error', msg);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.oldText || (replaceExisting ? '♻️ Replace Existing Plan → नया Set' : 'Generate Plan');
      }
    }
  }

  function updatePlanSummary() {
    const summary = $('#planSummary');
    if (!summary) return;

    const classes = [...new Set(currentPlan.map(x => Number(x.class_level)))].sort((a,b) => a-b);
    const days = [...new Set(currentPlan.map(x => Number(x.plan_day)))].length;
    summary.innerHTML = `
      <div><b>Plan तैयार है</b></div>
      <div>${days} Day${days === 1 ? '' : 's'} • ${classes.map(c => `Class ${c}`).join(' • ')}</div>
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
      container.innerHTML = '<div class="empty-box">अभी कोई Plan generate नहीं हुआ है।</div>';
      return;
    }

    const rows = filteredRows();
    if (!rows.length) {
      container.innerHTML = '<div class="empty-box">इस filter में कोई question नहीं है।</div>';
      return;
    }

    container.innerHTML = '<div class="loading-box">Questions लोड हो रहे हैं...</div>';
    try {
      const qmap = await fetchQuestions(rows.map(x => x.question_id));
      const grouped = {};
      for (const r of rows) {
        const key = String(r.plan_day);
        (grouped[key] ||= []).push(r);
      }

      container.innerHTML = Object.entries(grouped)
        .sort((a,b) => Number(a[0]) - Number(b[0]))
        .map(([day, items]) => {
          const byClass = {};
          items.forEach(r => (byClass[r.class_level] ||= []).push(r));
          return `<section class="day-section">
            <div class="day-heading">
              <h2>Day ${esc(day)}</h2>
              <span>${esc(items[0]?.content_date || '')}</span>
            </div>
            ${Object.entries(byClass).sort((a,b) => Number(a[0]) - Number(b[0])).map(([cls, rs]) => `
              <div class="class-section">
                <h3>📘 कक्षा ${esc(cls)} <span>${rs.length} Questions</span></h3>
                <div class="question-grid">
                  ${rs.sort((a,b) => Number(a.selection_order) - Number(b.selection_order)).map((r,idx) => questionCard(r, qmap[Number(r.question_id)], idx+1)).join('')}
                </div>
              </div>
            `).join('')}
          </section>`;
        }).join('');
    } catch (e) {
      console.error('Questions:', e);
      container.innerHTML = `<div class="error-box"><b>Question लोड नहीं हो पाए।</b><br>${esc(e.message)}</div>`;
    }
  }

  function questionCard(r, q, number) {
    const opts = q ? [['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]] : [];
    const full = q ? [
      `Question ID: Q${q.id}`,
      `Class: ${q.class_level}`,
      `Chapter ${q.chapter_number} — ${q.chapter_name}`,
      '',
      q.question_text,
      `A) ${q.option_a}`,
      `B) ${q.option_b}`,
      `C) ${q.option_c}`,
      `D) ${q.option_d}`
    ].join('\n') : `Question ID: Q${r.question_id}\nChapter ${r.chapter_number} — ${r.chapter_name}`;

    return `<article class="question-card">
      <div class="q-top">
        <span class="q-number">${esc(number)}</span>
        <span class="type-badge">${typeLabel(r.content_type)}</span>
        <span class="chapter-badge">Chapter ${esc(r.chapter_number)}</span>
        <span class="cycle-badge">Cycle ${esc(r.cycle_number)}</span>
      </div>
      <div class="q-title">Question ID: <b>Q${esc(r.question_id)}</b> <span>• ${esc(r.chapter_name)}</span></div>
      ${q ? `<div class="question-text">${esc(q.question_text)}</div>
        <div class="options">${opts.map(([l,v]) => `<div class="option"><b>${l})</b> ${esc(v)}</div>`).join('')}</div>`
        : `<div class="missing-question">Question data नहीं मिला। Question ID: Q${esc(r.question_id)}</div>`}
      <div class="q-actions">
        <button type="button" class="copy-question" data-copy="${encodeURIComponent(full)}">📋 Copy Question</button>
        <button type="button" class="copy-prompt" data-prompt="${encodeURIComponent(buildImagePrompt(q,r))}">🎨 Copy Image Prompt</button>
      </div>
    </article>`;
  }

  function buildImagePrompt(q, r) {
    if (!q) return `Ganit Setu Image Prompt\nQuestion ID: Q${r.question_id}\nQuestion data पहले load करें।`;
    return `Create a professional educational social-media image for Ganit Setu.

Question ID: Q${q.id}
Class: ${q.class_level}
Chapter: ${q.chapter_number} — ${q.chapter_name}

PRESERVE THE QUESTION EXACTLY:
${q.question_text}

OPTIONS EXACTLY:
A) ${q.option_a}
B) ${q.option_b}
C) ${q.option_c}
D) ${q.option_d}

Do not change, paraphrase, solve, or add any answer information.
Use the finalized official Ganit Setu logo exactly as provided.
Clean, premium, student-friendly Hindi educational design.`;
  }

  document.addEventListener('click', async (e) => {
    const qBtn = e.target.closest('[data-copy]');
    const pBtn = e.target.closest('[data-prompt]');
    const btn = qBtn || pBtn;
    if (!btn) return;
    const value = decodeURIComponent(btn.dataset.copy || btn.dataset.prompt || '');
    try {
      await navigator.clipboard.writeText(value);
      const old = btn.textContent;
      btn.textContent = '✅ Copied';
      setTimeout(() => btn.textContent = old, 1200);
    } catch (err) {
      console.error(err);
      showNotice('error', 'Copy नहीं हो पाया।');
    }
  });

  function typeLabel(t) {
    return t === 'image' ? '🖼️ Image' : t === 'post' ? '📱 Post' : '🎬 Video';
  }

  function copyPlanId() {
    if (!currentPlanId) return;
    navigator.clipboard.writeText(currentPlanId)
      .then(() => showNotice('success', 'Plan ID copied.'))
      .catch(() => showNotice('error', 'Plan ID copy नहीं हो पाया।'));
  }
})();
