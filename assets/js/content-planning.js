
(() => {
  const $ = (id) => document.getElementById(id);
  let currentPlanId = null;
  let currentRows = [];
  let settings = {};

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0,10);
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('hi-IN', {
      day:'2-digit', month:'long', year:'numeric'
    });
  }

  function showMessage(message, type='success') {
    const box = $('generateMessage');
    box.hidden = false;
    box.className = 'cp-message ' + type;
    box.textContent = message;
  }

  function setSettingsStatus(text, type='') {
    const el = $('settingsStatus');
    el.textContent = text;
    el.className = 'cp-status' + (type ? ' ' + type : '');
  }

  async function ensureSession() {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data?.session) {
        location.href = 'index.html';
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      location.href = 'index.html';
      return false;
    }
  }

  async function loadSettings() {
    setSettingsStatus('Settings लोड हो रही हैं...');
    const { data, error } = await supabaseClient
      .from('content_automation_settings')
      .select('class_level,image_question_count,post_question_count,video_question_count,is_active')
      .eq('is_active', true)
      .order('class_level');

    if (error) {
      console.error('Settings error:', error);
      setSettingsStatus('Settings नहीं मिली', 'error');
      showMessage('Content settings पढ़ी नहीं जा सकीं। यदि table पर RLS policy नहीं है, तो authenticated Admin के लिए access policy जोड़नी होगी।', 'error');
      return false;
    }

    settings = {};
    (data || []).forEach(row => { settings[Number(row.class_level)] = row; });

    [9,10].forEach(cls => {
      const s = settings[cls];
      if (!s) return;
      $(cls === 9 ? 'c9Image' : 'c10Image').textContent = s.image_question_count;
      $(cls === 9 ? 'c9Post' : 'c10Post').textContent = s.post_question_count;
      $(cls === 9 ? 'c9Video' : 'c10Video').textContent = s.video_question_count;
    });

    if (!settings[9] || !settings[10]) {
      setSettingsStatus('Class 9/10 settings अधूरी हैं', 'error');
      return false;
    }

    setSettingsStatus('Settings Ready', 'ready');
    return true;
  }

  function populateDayFilter(days) {
    const select = $('dayFilter');
    select.innerHTML = '<option value="all">सभी Days</option>';
    for (let i=1; i<=days; i++) {
      select.insertAdjacentHTML('beforeend', `<option value="${i}">Day ${i}</option>`);
    }
  }

  function questionTextForCopy(row) {
    return [
      `Ganit Setu Question ID: Q${row.question_id}`,
      `Class: ${row.class_level}`,
      `Chapter: ${row.chapter_name}`,
      `Question: ${row.question_text || ''}`
    ].join('\n');
  }

  function typeLabel(type) {
    return type === 'image' ? '🖼️ Image' : type === 'post' ? '📱 Post' : '🎬 Video';
  }

  function renderPlan() {
    const dayFilter = $('dayFilter').value;
    const classFilter = $('classFilter').value;
    const typeFilter = $('typeFilter').value;

    const filtered = currentRows.filter(r =>
      (dayFilter === 'all' || String(r.plan_day) === dayFilter) &&
      (classFilter === 'all' || String(r.class_level) === classFilter) &&
      (typeFilter === 'all' || r.content_type === typeFilter)
    );

    const days = [...new Set(filtered.map(r => Number(r.plan_day)))].sort((a,b)=>a-b);
    const box = $('planDays');

    if (!days.length) {
      box.innerHTML = '<div class="cp-empty">इन filters के अनुसार कोई question नहीं मिला।</div>';
      return;
    }

    box.innerHTML = days.map(day => {
      const dayRows = filtered.filter(r => Number(r.plan_day) === day);
      const date = dayRows[0]?.content_date || '';
      const classes = [9,10].filter(c => dayRows.some(r => Number(r.class_level) === c));

      return `
        <article class="cp-day">
          <div class="cp-day-head">
            <div class="cp-day-title">
              <span class="cp-day-number">${day}</span>
              <div>
                <h3>Day ${day}</h3>
                <small>${escapeHtml(formatDate(date))}</small>
              </div>
            </div>
            <span class="cp-day-total">${dayRows.length} Questions</span>
          </div>

          ${classes.map(cls => {
            const rows = dayRows
              .filter(r => Number(r.class_level) === cls)
              .sort((a,b)=>Number(a.selection_order)-Number(b.selection_order));

            return `
              <div class="cp-class-block">
                <div class="cp-class-block-head">
                  <b>${cls === 9 ? '📘 कक्षा 9' : '📕 कक्षा 10'}</b>
                  <span class="cp-class-total">${rows.length} Questions</span>
                </div>
                <div class="cp-question-list">
                  ${rows.map(row => `
                    <div class="cp-question">
                      <span class="cp-q-number">${escapeHtml(row.selection_order)}</span>
                      <div class="cp-q-main">
                        <div class="cp-q-meta">
                          <span class="cp-chip ${escapeHtml(row.content_type)}">${typeLabel(row.content_type)}</span>
                          <span class="cp-chip">Chapter ${escapeHtml(row.chapter_number)}</span>
                          <span class="cp-chip">Cycle ${escapeHtml(row.cycle_number)}</span>
                        </div>
                        <div class="cp-q-text">${escapeHtml(row.question_text || 'Question text उपलब्ध नहीं है।')}</div>
                        <div class="cp-q-id">Question ID: <b>Q${escapeHtml(row.question_id)}</b> • ${escapeHtml(row.chapter_name)}</div>
                      </div>
                      <button type="button" class="cp-copy-btn" data-copy-id="${escapeHtml(row.id)}">📋 Copy Question</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </article>
      `;
    }).join('');
  }

  async function generatePlan() {
    const startDate = $('startDate').value;
    const days = Number($('daysCount').value);

    if (!startDate) {
      showMessage('कृपया Start Date चुनें।', 'error');
      return;
    }
    if (!(days >= 1 && days <= 7)) {
      showMessage('Planning Days केवल 1 से 7 के बीच हो सकते हैं।', 'error');
      return;
    }

    const ok = await loadSettings();
    if (!ok) return;

    const btn = $('generatePlanBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Plan तैयार हो रहा है...';
    $('planSummary').hidden = true;
    $('planWorkspace').hidden = true;
    showMessage(`Day 1 से Day ${days} तक unique questions चुने जा रहे हैं...`, 'success');

    try {
      const { data, error } = await supabaseClient.rpc('generate_content_plan', {
        p_start_date: startDate,
        p_days: days
      });

      if (error) throw error;

      currentRows = (data || []).map(row => ({...row}));
      if (!currentRows.length) throw new Error('Plan generate हुआ लेकिन कोई question नहीं मिला।');

      currentPlanId = currentRows[0].plan_id;

      // Fetch full question text/options only for this generated plan.
      const ids = [...new Set(currentRows.map(r => Number(r.question_id)))];
      const { data: qData, error: qError } = await supabaseClient
        .from('questions')
        .select('id,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint')
        .in('id', ids);

      if (qError) {
        console.warn('Question detail fetch failed:', qError);
      } else {
        const map = new Map((qData || []).map(q => [Number(q.id), q]));
        currentRows = currentRows.map(r => ({...r, ...(map.get(Number(r.question_id)) || {})}));
      }

      const totalC9 = currentRows.filter(r => Number(r.class_level) === 9).length;
      const totalC10 = currentRows.filter(r => Number(r.class_level) === 10).length;

      $('planTitle').textContent = `Content Plan • ${formatDate(startDate)}`;
      $('planMeta').textContent = `Plan ID: ${currentPlanId} • ${days} day${days > 1 ? 's' : ''}`;
      $('summaryDays').textContent = days;
      $('summaryC9').textContent = totalC9;
      $('summaryC10').textContent = totalC10;
      $('summaryQuestions').textContent = currentRows.length;

      $('planSummary').hidden = false;
      $('planWorkspace').hidden = false;
      populateDayFilter(days);
      renderPlan();

      showMessage(`✅ ${days} दिन का plan तैयार है। कुल ${currentRows.length} unique questions चुने गए।`, 'success');
      $('planSummary').scrollIntoView({behavior:'smooth', block:'start'});

    } catch (error) {
      console.error('Generate Content Plan error:', error);
      showMessage(error.message || 'Content plan generate नहीं हो सका।', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Content Plan Generate करें';
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!(await ensureSession())) return;

    $('startDate').value = todayISO();

    await loadSettings();

    $('generatePlanBtn').addEventListener('click', generatePlan);

    ['dayFilter','classFilter','typeFilter'].forEach(id => {
      $(id).addEventListener('change', renderPlan);
    });

    $('copyPlanIdBtn').addEventListener('click', async () => {
      if (!currentPlanId) return;
      const ok = await copyText(currentPlanId);
      $('copyPlanIdBtn').textContent = ok ? '✓ Copied' : '📋 Copy Plan ID';
      setTimeout(() => $('copyPlanIdBtn').textContent = '📋 Plan ID Copy', 1400);
    });

    $('planDays').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-copy-id]');
      if (!btn) return;
      const id = Number(btn.dataset.copyId);
      const row = currentRows.find(r => Number(r.id) === id);
      if (!row) return;

      const ok = await copyText(questionTextForCopy(row));
      btn.textContent = ok ? '✓ Copied' : '📋 Copy Question';
      setTimeout(() => btn.textContent = '📋 Copy Question', 1400);
    });
  });
})();
