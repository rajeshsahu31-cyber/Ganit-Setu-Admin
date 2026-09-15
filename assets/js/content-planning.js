(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  let supabase = null;
  let currentPlan = [];
  let currentPlanId = null;

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function dateHi(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('hi-IN', {
      day:'2-digit', month:'long', year:'numeric'
    });
  }

  function showNotice(type, text) {
    const box = $('notice');
    if (!box) return;
    box.hidden = false;
    box.className = `notice ${type || ''}`;
    box.textContent = text;
  }

  async function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    throw new Error('Supabase library उपलब्ध नहीं है।');
  }

  async function init() {
    try {
      supabase = await getClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data?.session) {
        location.href = 'index.html';
        return;
      }

      if ($('startDate') && !$('startDate').value) $('startDate').value = todayISO();
      if ($('questionsPerType')) $('questionsPerType').value = '1';

      populateDayFilter();
      bindEvents();
      await loadPoolStatus();
    } catch (e) {
      console.error(e);
      showNotice('error', e.message || 'Content Planning शुरू नहीं हो सका।');
    }
  }

  function populateDayFilter() {
    const f = $('dayFilter');
    const n = Number($('days')?.value || 1);
    if (!f) return;
    f.innerHTML = '<option value="all">सभी Days</option>' +
      Array.from({length:n}, (_,i) => `<option value="${i+1}">Day ${i+1}</option>`).join('');
  }

  function bindEvents() {
    $('generateBtn')?.addEventListener('click', () => generatePlan(false));
    $('replaceBtn')?.addEventListener('click', () => generatePlan(true));
    $('days')?.addEventListener('change', () => { populateDayFilter(); renderPlan(); });
    $('startDate')?.addEventListener('change', loadPoolStatus);
    ['dayFilter','classFilter','typeFilter'].forEach(id => {
      $(id)?.addEventListener('change', renderPlan);
    });
  }

  async function loadPoolStatus() {
    const box = $('poolStatus');
    if (!box) return;
    box.innerHTML = '<div class="muted">Pool status लोड हो रहा है...</div>';
    try {
      const startDate = $('startDate')?.value || todayISO();
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
      console.error(e);
      box.innerHTML = `<div class="error-box">Pool status नहीं पढ़ा जा सका: ${esc(e.message)}</div>`;
    }
  }

  async function generatePlan(replaceExisting) {
    const startDate = $('startDate')?.value;
    const days = Number($('days')?.value || 1);
    const questionsPerType = Number($('questionsPerType')?.value || 1);

    if (!startDate) {
      showNotice('error', 'Start Date चुनिए।');
      return;
    }
    if (questionsPerType < 1 || questionsPerType > 5) {
      showNotice('error', 'Questions / Class / Type केवल 1 से 5 तक हो सकते हैं।');
      return;
    }
    if (days < 1 || days > 7) {
      showNotice('error', 'Days केवल 1 से 7 तक हो सकते हैं।');
      return;
    }

    const btn = replaceExisting ? $('replaceBtn') : $('generateBtn');
    if (btn) {
      btn.disabled = true;
      btn.dataset.oldText = btn.textContent;
      btn.textContent = '⏳ Plan बनाया जा रहा है...';
    }

    try {
      if (replaceExisting && !confirm(`${dateHi(startDate)} से ${days} दिन का पुराना generated plan replace करके नया random set बनाना है?`)) return;

      const { data, error } = await supabase.rpc('generate_content_plan_safe', {
        p_start_date: startDate,
        p_days: days,
        p_replace_existing: replaceExisting,
        p_questions_per_type: questionsPerType
      });
      if (error) throw error;

      currentPlan = data || [];
      currentPlanId = currentPlan[0]?.plan_id || null;
      if (!currentPlan.length) throw new Error('Plan generate हुआ लेकिन कोई question नहीं मिला।');

      showNotice('success', `${replaceExisting ? 'पुराना plan replace करके' : 'Content Plan'} नया set तैयार है: ${questionsPerType} Image + ${questionsPerType} Post + ${questionsPerType} Video प्रति class/day.`);
      updatePlanSummary(questionsPerType);
      populateDayFilter();
      await renderPlan();
      await loadPoolStatus();
    } catch (e) {
      console.error(e);
      showNotice('error', e.message || 'Content Plan generate नहीं हो सका।');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.oldText || (replaceExisting ? '♻️ Replace Existing Plan → नया Set' : '🚀 Generate New Plan');
      }
    }
  }

  function updatePlanSummary(questionsPerType) {
    const summary = $('planSummary');
    if (!summary) return;
    const classes = [...new Set(currentPlan.map(x => Number(x.class_level)))].sort();
    const days = [...new Set(currentPlan.map(x => Number(x.plan_day)))].length;
    summary.innerHTML = `
      <div><b>✅ Plan तैयार है</b></div>
      <div>${days} Day${days > 1 ? 's' : ''} • ${classes.map(c => `Class ${c}`).join(' • ')}</div>
      <div>${currentPlan.length} total entries • ${questionsPerType} Image + ${questionsPerType} Post + ${questionsPerType} Video per class/day</div>
      ${currentPlanId ? `<div class="plan-id">Plan ID: <code>${esc(currentPlanId)}</code></div>` : ''}
    `;
  }

  function filteredRows() {
    const day = $('dayFilter')?.value || 'all';
    const cls = $('classFilter')?.value || 'all';
    const type = $('typeFilter')?.value || 'all';
    return currentPlan.filter(x =>
      (day === 'all' || String(x.plan_day) === day) &&
      (cls === 'all' || String(x.class_level) === cls) &&
      (type === 'all' || x.content_type === type)
    );
  }

  async function fetchQuestions(ids) {
    const unique = [...new Set(ids.map(Number))];
    if (!unique.length) return {};
    const { data, error } = await supabase
      .from('questions')
      .select('id,class_level,chapter_number,chapter_name,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint')
      .in('id', unique);
    if (error) throw error;
    return Object.fromEntries((data || []).map(q => [Number(q.id), q]));
  }

  async function renderPlan() {
    const container = $('planResults');
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
      rows.forEach(r => (grouped[r.plan_day] ||= []).push(r));

      container.innerHTML = Object.entries(grouped)
        .sort((a,b) => Number(a[0]) - Number(b[0]))
        .map(([day, items]) => {
          const byClass = {};
          items.forEach(r => (byClass[r.class_level] ||= []).push(r));
          return `<section class="day-section">
            <div class="day-heading"><h2>Day ${esc(day)}</h2><span>${esc(items[0]?.content_date || '')}</span></div>
            ${Object.entries(byClass).sort((a,b)=>Number(a[0])-Number(b[0])).map(([cls, rs]) => `
              <div class="class-section">
                <div class="class-heading"><h3>📘 Class ${esc(cls)}</h3><span>${rs.length} Questions</span></div>
                ${rs.sort((a,b)=>Number(a.selection_order)-Number(b.selection_order)).map(r => {
                  const q = qmap[Number(r.question_id)] || {};
                  const type = r.content_type === 'image' ? '🖼️ Image' : r.content_type === 'post' ? '📱 Post' : '🎬 Video';
                  return `<article class="question-card">
                    <div class="question-top"><span>${type}</span><span>Chapter ${esc(r.chapter_number)}</span><span>Q${esc(r.question_id)}</span></div>
                    <div class="question-text"><b>प्रश्न:</b> ${esc(q.question_text || 'Question text उपलब्ध नहीं है।')}</div>
                    <div class="options">
                      <div>A) ${esc(q.option_a || '')}</div><div>B) ${esc(q.option_b || '')}</div>
                      <div>C) ${esc(q.option_c || '')}</div><div>D) ${esc(q.option_d || '')}</div>
                    </div>
                  </article>`;
                }).join('')}
              </div>
            `).join('')}
          </section>`;
        }).join('');
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="error-box">Questions पढ़ने में समस्या: ${esc(e.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
