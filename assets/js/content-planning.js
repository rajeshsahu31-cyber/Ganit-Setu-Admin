
const supabase = window.supabaseClient;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

let currentPlan = [];
let currentPlanId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!supabase) {
    alert('Supabase client उपलब्ध नहीं है। कृपया Admin Panel को सामान्य तरीके से खोलें।');
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
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
}

function populateDayFilter() {
  const f = $('#dayFilter');
  const n = Number($('#days')?.value || 1);
  if (!f) return;
  f.innerHTML = '<option value="all">सभी Days</option>' +
    Array.from({length:n}, (_,i) => `<option value="${i+1}">Day ${i+1}</option>`).join('');
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
  const questionsPerType = Number($('#questionsPerType')?.value || 1);
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

    updatePlanSummary(questionsPerType);
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

function updatePlanSummary(questionsPerType = Number($('#questionsPerType')?.value || 1)) {
  const summary = $('#planSummary');
  if (!summary) return;

  const classes = [...new Set(currentPlan.map(x => x.class_level))];
  const days = [...new Set(currentPlan.map(x => x.plan_day))].length;
  summary.innerHTML = `
    <div><b>Plan तैयार है</b></div>
    <div>${days} Day • ${classes.map(c => `Class ${c}`).join(' • ')}</div>
    <div>${currentPlan.length} total content-question entries • ${questionsPerType} Image + ${questionsPerType} Post + ${questionsPerType} Video per class/day</div>
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

function questionCard(r,q,number) {
  const text = q?.question_text;
  const opts = q ? [
    ['A',q.option_a],['B',q.option_b],['C',q.option_c],['D',q.option_d]
  ] : [];

  const full = q ? [
    `Question ID: Q${q.id}`,
    `Chapter ${q.chapter_number} — ${q.chapter_name}`,
    ``,
    q.question_text,
    `A) ${q.option_a}`,
    `B) ${q.option_b}`,
    `C) ${q.option_c}`,
    `D) ${q.option_d}`
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
    ` : `<div class="missing-question">Question data नहीं मिला। Question ID: Q${esc(r.question_id)}</div>`}
    <div class="q-actions">
      <button type="button" class="copy-question" data-copy="${encodeURIComponent(full)}">📋 Copy Question</button>
      <button type="button" class="copy-prompt" data-prompt="${encodeURIComponent(buildImagePrompt(q,r))}">🎨 Copy Image Prompt</button>
    </div>
  </article>`;
}

function buildImagePrompt(q,r) {
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
