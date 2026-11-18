// GANIT SETU - Single-file bilingual 1-mark Objective Questions importer
// Reads one combined Hindi+English CSV and writes only to public.objective_questions.
// Does not access or modify public.questions.
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const HEADERS = [
    'class_level','chapter_number','chapter_name_hi','chapter_name_en',
    'question_text_hi','question_text_en',
    'option_a_hi','option_b_hi','option_c_hi','option_d_hi',
    'option_a_en','option_b_en','option_c_en','option_d_en',
    'correct_option','hint_hi','hint_en','explanation_hi','explanation_en',
    'difficulty','medium','exam_year','paper_set','source_question',
    'source_index','status','is_active'
  ];

  let validRows = [];
  let records = [];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function message(text, bad = false) {
    $('oqMsg').textContent = text;
    $('oqMsg').className = 'oq-notice ' + (bad ? 'oq-bad' : 'oq-ok');
  }

  function csvParse(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"'; i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row); row = []; cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.replace(/\r$/, ''));
    if (row.some(v => v !== '')) rows.push(row);
    return rows;
  }

  function parseBoolean(value, defaultValue = true) {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return defaultValue;
    return ['true','1','yes','हाँ','active'].includes(v);
  }

  async function readBilingualCsv(file) {
    if (!file) throw new Error('एक Bilingual Objective CSV फ़ाइल चुनें।');
    const rows = csvParse(await file.text());
    if (!rows.length) throw new Error('CSV खाली है।');

    const headers = rows[0].map(v => v.trim().replace(/^\ufeff/, ''));
    if (headers.join('|') !== HEADERS.join('|')) {
      throw new Error('CSV का 27-कॉलम Format या क्रम सही नहीं है। इस पैनल का CSV Format डाउनलोड करके उसी क्रम में फ़ाइल बनाएँ।');
    }

    const parsed = [];
    const errors = [];
    const seen = new Set();

    rows.slice(1).forEach((cells, index) => {
      if (!cells.some(v => String(v || '').trim())) return;
      const line = index + 2;
      if (cells.length !== HEADERS.length) {
        errors.push(`Row ${line}: ${cells.length} कॉलम मिले, ${HEADERS.length} चाहिए।`);
        return;
      }

      const obj = {};
      HEADERS.forEach((key, i) => obj[key] = String(cells[i] ?? '').trim());

      if (!obj.source_question) errors.push(`Row ${line}: source_question खाली है।`);
      if (obj.source_question && seen.has(obj.source_question)) {
        errors.push(`Row ${line}: duplicate source_question ${obj.source_question}।`);
      }
      if (obj.source_question) seen.add(obj.source_question);

      if (!['9','10'].includes(obj.class_level)) errors.push(`Row ${line}: class_level 9 या 10 होना चाहिए।`);
      if (!/^\d+$/.test(obj.chapter_number) || Number(obj.chapter_number) < 1) errors.push(`Row ${line}: chapter_number गलत है।`);
      if (!obj.question_text_hi) errors.push(`Row ${line}: Hindi question खाली है।`);
      if (!obj.question_text_en) errors.push(`Row ${line}: English question खाली है।`);

      for (const option of ['option_a_hi','option_b_hi','option_c_hi','option_d_hi',
                            'option_a_en','option_b_en','option_c_en','option_d_en']) {
        if (!obj[option]) errors.push(`Row ${line}: ${option} खाली है।`);
      }

      obj.correct_option = obj.correct_option.toUpperCase();
      if (!['A','B','C','D'].includes(obj.correct_option)) errors.push(`Row ${line}: correct_option A/B/C/D होना चाहिए।`);
      if (!/^\d{4}$/.test(obj.exam_year)) errors.push(`Row ${line}: exam_year गलत है।`);
      if (!obj.paper_set) errors.push(`Row ${line}: paper_set खाली है।`);
      if (obj.medium !== 'Both') errors.push(`Row ${line}: bilingual CSV में medium "Both" होना चाहिए।`);

      obj.class_level = Number(obj.class_level);
      obj.chapter_number = Number(obj.chapter_number);
      obj.exam_year = Number(obj.exam_year);
      obj.source_index = obj.source_index ? Number(obj.source_index) : null;
      obj.status = obj.status || 'draft';
      obj.is_active = parseBoolean(obj.is_active, true);

      if (!['draft','published'].includes(obj.status)) {
        errors.push(`Row ${line}: status draft या published होना चाहिए।`);
      }

      parsed.push(obj);
    });

    return { rows: parsed, errors };
  }

  function renderPreview(rows, errors) {
    $('oqPreviewRows').innerHTML = rows.slice(0, 100).map(row => `
      <tr>
        <td>Valid</td>
        <td>${esc(row.source_question)}</td>
        <td>${esc(row.class_level)} / ${esc(row.chapter_number)}</td>
        <td>${esc(row.question_text_hi)}</td>
        <td>${esc(row.question_text_en)}</td>
        <td>${esc(row.correct_option)}</td>
        <td class="oq-ok">एक CSV में दोनों भाषाएँ</td>
      </tr>
    `).join('') || '<tr><td colspan="7">कोई प्रश्न नहीं मिला।</td></tr>';

    if (errors.length) {
      $('oqPreviewRows').innerHTML += `
        <tr><td colspan="7" class="oq-bad"><b>जाँच में त्रुटियाँ:</b><br>${errors.slice(0, 30).map(esc).join('<br>')}</td></tr>
      `;
    }
    $('oqSummary').textContent =
      `कुल ${rows.length} bilingual प्रश्न | त्रुटियाँ: ${errors.length} | Upload केवल तब होगा जब त्रुटियाँ शून्य हों।`;
  }

  $('oqTemplate').addEventListener('click', () => {
    const sample = HEADERS.join(',') + '\r\n';
    const blob = new Blob(['\ufeff' + sample], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ganit_Setu_Objective_Bilingual_27_Column_Template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    message('यह Template एक ही CSV में Hindi और English दोनों भाषाओं के 27 कॉलम रखता है।');
  });

  $('oqPreview').addEventListener('click', async () => {
    validRows = [];
    $('oqUpload').disabled = true;
    $('oqPreviewRows').innerHTML = '';
    $('oqSummary').textContent = '';

    try {
      message('Bilingual CSV पढ़ी जा रही है…');
      const result = await readBilingualCsv($('oqBilingualFile').files[0]);
      renderPreview(result.rows, result.errors);

      if (result.errors.length) {
        message(`Preview में ${result.errors.length} त्रुटियाँ मिलीं। उन्हें ठीक करके फिर Preview करें।`, true);
        return;
      }

      validRows = result.rows;
      $('oqUpload').disabled = validRows.length === 0;
      message(`${validRows.length} प्रश्नों में Hindi और English दोनों भाषाएँ मिल गईं। अब Upload कर सकते हैं।`);
    } catch (error) {
      console.error('Objective CSV Preview Error:', error);
      message(error.message || String(error), true);
    }
  });

  $('oqUpload').addEventListener('click', async () => {
    if (!validRows.length) return;
    const client = window.supabaseClient;
    if (!client) {
      message('Supabase client नहीं मिला। Admin Panel configuration जाँचें।', true);
      return;
    }
    if (!confirm(`${validRows.length} bilingual Objective Questions नई objective_questions टेबल में Upload करें?`)) return;

    $('oqUpload').disabled = true;
    let inserted = 0, duplicate = 0;
    const failures = [];

    try {
      const {data: sessionData, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) throw new Error('पहले Admin Login करें।');

      for (const row of validRows) {
        const {error} = await client.from('objective_questions').insert(row);
        if (!error) {
          inserted++;
        } else if (error.code === '23505') {
          duplicate++;
        } else {
          failures.push({
            source_question: row.source_question,
            code: error.code || null,
            message: error.message || 'Unknown error',
            details: error.details || null,
            hint: error.hint || null
          });
        }
      }

      $('oqSummary').textContent =
        `कुल ${validRows.length} | Insert हुए ${inserted} | पहले से मौजूद छोड़े ${duplicate} | Failed ${failures.length}`;

      if (failures.length) {
        console.error('OBJECTIVE QUESTIONS UPLOAD ERRORS:', failures);
        message(`${inserted} प्रश्न Insert हुए, ${duplicate} Duplicate छोड़े गए और ${failures.length} असफल हुए। F12 Console में पूरा विवरण देखें।`, true);
      } else {
        message(`Upload पूरा हुआ। ${inserted} प्रश्न Insert हुए और ${duplicate} पहले से मौजूद प्रश्न छोड़े गए।`);
        await loadList();
      }
    } catch (error) {
      console.error('Objective Questions Upload Error:', error);
      message(error.message || String(error), true);
    } finally {
      $('oqUpload').disabled = validRows.length === 0;
    }
  });

  function filteredRecords() {
    const search = $('oqSearch').value.trim().toLowerCase();
    const classFilter = $('oqClassFilter').value;
    const statusFilter = $('oqStatusFilter').value;
    return records.filter(r =>
      (!search || [r.source_question,r.question_text_hi,r.question_text_en].some(v => String(v || '').toLowerCase().includes(search))) &&
      (!classFilter || String(r.class_level) === classFilter) &&
      (!statusFilter || r.status === statusFilter)
    );
  }

  function renderList() {
    $('oqTotal').textContent = records.length;
    $('oqDraft').textContent = records.filter(r => r.status === 'draft').length;
    $('oqPublished').textContent = records.filter(r => r.status === 'published').length;

    $('oqListRows').innerHTML = filteredRecords().map(r => `
      <tr>
        <td>${esc(r.source_question)}</td>
        <td>${esc(r.class_level)}</td>
        <td>${esc(r.chapter_number)}<br><small>${esc(r.chapter_name_hi || '')}</small></td>
        <td>${esc((r.question_text_hi || r.question_text_en || '').slice(0, 130))}</td>
        <td>${esc(r.correct_option)}</td>
        <td>${esc(r.status)}</td>
        <td class="oq-row-actions">
          <button class="oq-btn ${r.status === 'published' ? 'secondary' : ''}" data-toggle="${esc(r.id)}" data-status="${r.status === 'published' ? 'draft' : 'published'}">${r.status === 'published' ? 'Draft करें' : 'Publish'}</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7">कोई प्रश्न नहीं मिला।</td></tr>';

    $('oqListRows').querySelectorAll('[data-toggle]').forEach(button => {
      button.addEventListener('click', () => changeStatus(button.dataset.toggle, button.dataset.status));
    });
  }

  async function loadList() {
    const client = window.supabaseClient;
    if (!client) {
      $('oqListMsg').textContent = 'Supabase client नहीं मिला।';
      return;
    }
    $('oqListMsg').textContent = 'प्रश्न लोड हो रहे हैं…';
    try {
      const {data: sessionData, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) throw new Error('पहले Admin Login करें।');

      const {data, error} = await client
        .from('objective_questions')
        .select('*')
        .order('created_at', {ascending:false})
        .range(0, 999);

      if (error) throw error;
      records = data || [];
      renderList();
      $('oqListMsg').textContent = `${records.length} प्रश्न लोड हुए।`;
    } catch (error) {
      console.error('Objective Questions Load Error:', error);
      $('oqListMsg').textContent = `लोड नहीं हुआ: ${error.message || error}`;
    }
  }

  async function changeStatus(id, status) {
    if (!confirm(`इस प्रश्न की स्थिति ${status} करनी है?`)) return;
    try {
      const {error} = await window.supabaseClient
        .from('objective_questions')
        .update({status, updated_at:new Date().toISOString()})
        .eq('id', id);
      if (error) throw error;
      $('oqListMsg').textContent = `प्रश्न की स्थिति ${status} कर दी गई।`;
      await loadList();
    } catch (error) {
      console.error('Objective Question Status Error:', error);
      $('oqListMsg').textContent = `स्थिति नहीं बदली: ${error.message || error}`;
    }
  }

  $('oqRefresh').addEventListener('click', loadList);
  ['oqSearch','oqClassFilter','oqStatusFilter'].forEach(id => {
    $(id).addEventListener(id === 'oqSearch' ? 'input' : 'change', renderList);
  });

  document.addEventListener('DOMContentLoaded', loadList);
})();
