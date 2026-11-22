// GANIT SETU - Single-file bilingual 1-mark Objective Questions importer
// Reads one combined Hindi+English CSV and writes only to public.objective_questions.
// Does not access or modify public.questions.
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  // Keep this order identical to the objective_questions table CSV export.
  const HEADERS = [
    'class_level','chapter_number','chapter_name_hi','chapter_name_en',
    'question_text_hi','question_text_en',
    'option_a_hi','option_b_hi','option_c_hi','option_d_hi',
    'option_a_en','option_b_en','option_c_en','option_d_en',
    'correct_option','hint_hi','hint_en','explanation_hi','explanation_en',
    'difficulty','medium','exam_year','paper_set','source_question',
    'source_index','status','is_active',
    'question_type','true_false_answer','fill_blank_answer_hi','fill_blank_answer_en',
    'match_pairs_json','short_answer_hi','short_answer_en',
    'answer_option_a_hi','answer_option_b_hi','answer_option_a_en','answer_option_b_en','answer_correct_option',
    'maths_level'
  ];
  const LEGACY_HEADERS = HEADERS.slice(0, -1);

  let validRows = [];
  let records = [];
  let uploadHistory = [];
  const CSV_ARCHIVE_BUCKET = 'objective-csv-archive';

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
    if (!file) throw new Error('Objective Questions CSV फ़ाइल चुनें।');
    const rows = csvParse(await file.text());
    if (!rows.length) throw new Error('CSV खाली है।');

    const headers = rows[0].map(v => v.trim().replace(/^\ufeff/, ''));
    const isLegacyFormat = headers.join('|') === LEGACY_HEADERS.join('|');
    const isCurrentFormat = headers.join('|') === HEADERS.join('|');
    if (!isLegacyFormat && !isCurrentFormat) {
      throw new Error('CSV का Format या कॉलम क्रम सही नहीं है। 39-कॉलम पुरानी या 40-कॉलम नई पैनल CSV इस्तेमाल करें।');
    }

    const parsed = [];
    const errors = [];
    const seen = new Set();
    const types = ['MCQ','TRUE_FALSE','FILL_BLANK','MATCH','SHORT_ANSWER'];

    rows.slice(1).forEach((cells, index) => {
      if (!cells.some(v => String(v || '').trim())) return;
      const line = index + 2;
      const expectedLength = isLegacyFormat ? LEGACY_HEADERS.length : HEADERS.length;
      if (cells.length !== expectedLength) {
        errors.push(`Row ${line}: ${cells.length} कॉलम मिले, ${expectedLength} चाहिए।`);
        return;
      }

      const activeHeaders = isLegacyFormat ? LEGACY_HEADERS : HEADERS;
      const obj = {};
      activeHeaders.forEach((key, i) => obj[key] = String(cells[i] ?? '').trim());
      if (isLegacyFormat) obj.maths_level = '';

      obj.question_type = (obj.question_type || 'MCQ').toUpperCase();
      if (!types.includes(obj.question_type)) {
        errors.push(`Row ${line}: question_type इनमें से होना चाहिए: ${types.join(', ')}।`);
      }

      if (!obj.source_question) errors.push(`Row ${line}: source_question खाली है।`);
      if (obj.source_question && seen.has(obj.source_question)) {
        errors.push(`Row ${line}: duplicate source_question ${obj.source_question}।`);
      }
      if (obj.source_question) seen.add(obj.source_question);

      if (!['9','10'].includes(obj.class_level)) errors.push(`Row ${line}: class_level 9 या 10 होना चाहिए।`);
      if (!/^\d+$/.test(obj.chapter_number) || Number(obj.chapter_number) < 1) errors.push(`Row ${line}: chapter_number गलत है।`);
      if (!obj.question_text_hi) errors.push(`Row ${line}: Hindi question खाली है।`);
      if (!obj.question_text_en) errors.push(`Row ${line}: English question खाली है।`);
      if (!/^\d{4}$/.test(obj.exam_year)) errors.push(`Row ${line}: exam_year गलत है।`);
      if (!obj.paper_set) errors.push(`Row ${line}: paper_set खाली है।`);
      obj.maths_level = String(obj.maths_level || '').trim();
      if (obj.maths_level) {
        const normalizedLevel = obj.maths_level.toLowerCase();
        if (normalizedLevel === 'basic') obj.maths_level = 'Basic';
        else if (normalizedLevel === 'standard') obj.maths_level = 'Standard';
        else errors.push(`Row ${line}: maths_level खाली, Basic या Standard होना चाहिए।`);
      }
      if (obj.exam_year !== '2026' && obj.maths_level) {
        errors.push(`Row ${line}: maths_level केवल 2026 के पेपर के लिए भरें।`);
      }
      if (obj.class_level !== '10' && obj.maths_level) {
        errors.push(`Row ${line}: maths_level केवल Class 10 के लिए भरें।`);
      }
      if (obj.medium !== 'Both') errors.push(`Row ${line}: bilingual CSV में medium "Both" होना चाहिए।`);

      if (obj.question_type === 'MCQ') {
        for (const option of ['option_a_hi','option_b_hi','option_c_hi','option_d_hi',
                              'option_a_en','option_b_en','option_c_en','option_d_en']) {
          if (!obj[option]) errors.push(`Row ${line}: MCQ के लिए ${option} खाली नहीं हो सकता।`);
        }
        obj.correct_option = obj.correct_option.toUpperCase();
        if (!['A','B','C','D'].includes(obj.correct_option)) {
          errors.push(`Row ${line}: MCQ correct_option A/B/C/D होना चाहिए।`);
        }
      } else {
        obj.correct_option = null;
        ['option_a_hi','option_b_hi','option_c_hi','option_d_hi',
         'option_a_en','option_b_en','option_c_en','option_d_en'].forEach(k => obj[k] = null);
      }

      if (obj.question_type === 'TRUE_FALSE' && !obj.true_false_answer) {
        errors.push(`Row ${line}: TRUE_FALSE के लिए true_false_answer भरें।`);
      }
      if (obj.question_type === 'FILL_BLANK' && !obj.fill_blank_answer_hi) {
        errors.push(`Row ${line}: FILL_BLANK के लिए fill_blank_answer_hi भरें।`);
      }
      if (['FILL_BLANK','SHORT_ANSWER'].includes(obj.question_type)) {
        for (const field of ['answer_option_a_hi','answer_option_b_hi','answer_option_a_en','answer_option_b_en']) {
          if (!obj[field]) errors.push(`Row ${line}: ${obj.question_type} के लिए ${field} खाली नहीं हो सकता।`);
        }
        obj.answer_correct_option = String(obj.answer_correct_option || '').trim().toUpperCase();
        if (!['A','B'].includes(obj.answer_correct_option)) errors.push(`Row ${line}: answer_correct_option A या B होना चाहिए।`);
        if (obj.answer_option_a_hi && obj.answer_option_b_hi && obj.answer_option_a_hi === obj.answer_option_b_hi) {
          errors.push(`Row ${line}: सही और गलत विकल्प अलग-अलग होने चाहिए।`);
        }
      } else {
        obj.answer_option_a_hi = null;
        obj.answer_option_b_hi = null;
        obj.answer_option_a_en = null;
        obj.answer_option_b_en = null;
        obj.answer_correct_option = null;
      }
      if (obj.question_type === 'MATCH') {
        if (!obj.match_pairs_json) {
          errors.push(`Row ${line}: MATCH के लिए match_pairs_json भरें।`);
        } else {
          try {
            const pairs = JSON.parse(obj.match_pairs_json);
            if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('array required');
          } catch (_) {
            errors.push(`Row ${line}: match_pairs_json सही JSON Array होना चाहिए।`);
          }
        }
      }
      if (obj.question_type === 'SHORT_ANSWER' && !obj.short_answer_hi) {
        errors.push(`Row ${line}: SHORT_ANSWER के लिए short_answer_hi भरें।`);
      }

      obj.class_level = Number(obj.class_level);
      obj.chapter_number = Number(obj.chapter_number);
      obj.exam_year = Number(obj.exam_year);
      obj.source_index = obj.source_index ? Number(obj.source_index) : null;
      obj.status = obj.status || 'draft';
      obj.is_active = parseBoolean(obj.is_active, true);

      // Empty optional values are sent as null instead of empty strings.
      for (const key of HEADERS) {
        if (obj[key] === '') obj[key] = null;
      }
      if (obj.match_pairs_json) {
        try { obj.match_pairs_json = JSON.parse(obj.match_pairs_json); }
        catch (_) { /* validation above reports malformed JSON */ }
      }

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
        <td>${esc(row.correct_option || row.true_false_answer || row.fill_blank_answer_hi || row.short_answer_hi || (row.match_pairs_json ? 'Match Pairs' : '—'))}</td>
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
    a.download = 'Ganit_Setu_Objective_40_Column_5_Types_Template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    message('यह 40-कॉलम Template पाँचों Objective Question Types और maths_level को सपोर्ट करता है। पुरानी 39-कॉलम CSV भी स्वीकार होगी।');
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

  function safeFileName(name) {
    return String(name || 'objective-questions.csv').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
  }

  async function archiveOriginalCsv(file, sessionUserId, stats) {
    const client = window.supabaseClient;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${sessionUserId}/${stamp}_${safeFileName(file.name)}`;
    const {error: storageError} = await client.storage
      .from(CSV_ARCHIVE_BUCKET)
      .upload(path, file, {contentType:'text/csv', upsert:false});
    if (storageError) throw new Error(`CSV स्टोरेज में सुरक्षित नहीं हुई: ${storageError.message}. पहले SQL सेटअप चलाएँ और Storage bucket जाँचें।`);

    const {error: historyError} = await client.from('objective_csv_uploads').insert({
      file_name: file.name,
      storage_path: path,
      uploaded_by: sessionUserId,
      file_size: file.size,
      total_rows: stats.total,
      inserted_count: stats.inserted,
      updated_count: stats.updated,
      duplicate_count: stats.duplicate,
      failed_count: stats.failed
    });
    if (historyError) throw new Error(`CSV सुरक्षित हुई, लेकिन हिस्ट्री रिकॉर्ड नहीं बना: ${historyError.message}`);
  }

  async function loadUploadHistory() {
    const client = window.supabaseClient;
    const target = $('oqHistoryRows');
    if (!client) return;
    $('oqHistoryMsg').textContent = 'अपलोड हिस्ट्री लोड हो रही है…';
    try {
      const {data: sessionData, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) throw new Error('पहले Admin Login करें।');
      const {data, error} = await client.from('objective_csv_uploads')
        .select('id,file_name,storage_path,file_size,total_rows,inserted_count,updated_count,duplicate_count,failed_count,created_at')
        .order('created_at', {ascending:true}).range(0, 999);
      if (error) throw error;
      uploadHistory = data || [];
      target.innerHTML = uploadHistory.map((item, index) => `
        <tr>
          <td>${index + 1}</td><td>${esc(item.file_name)}</td>
          <td>${esc(new Date(item.created_at).toLocaleString('hi-IN'))}</td>
          <td>${Number(item.total_rows || 0)}</td><td>${Number(item.inserted_count || 0)}</td>
          <td>${Number(item.duplicate_count || 0)}</td><td>${Number(item.failed_count || 0)}</td>
          <td class="oq-row-actions">
            <button class="oq-btn secondary" data-csv-download="${esc(item.id)}">⬇️ Download</button>
            <button class="oq-btn danger" data-csv-delete="${esc(item.id)}">🗑️ Delete</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="8">अभी कोई CSV अपलोड हिस्ट्री नहीं है।</td></tr>';
      target.querySelectorAll('[data-csv-download]').forEach(btn => btn.addEventListener('click', () => downloadOneCsv(btn.dataset.csvDownload)));
      target.querySelectorAll('[data-csv-delete]').forEach(btn => btn.addEventListener('click', () => deleteOneCsv(btn.dataset.csvDelete)));
      $('oqHistoryMsg').textContent = `${uploadHistory.length} CSV फाइलें सुरक्षित हैं।`;
      $('oqDownloadAll').disabled = uploadHistory.length === 0;
    } catch (error) {
      target.innerHTML = '<tr><td colspan="8">हिस्ट्री उपलब्ध नहीं है।</td></tr>';
      $('oqHistoryMsg').textContent = `हिस्ट्री लोड नहीं हुई: ${error.message || error}`;
      $('oqDownloadAll').disabled = true;
    }
  }

  async function deleteOneCsv(id) {
    const item = uploadHistory.find(row => String(row.id) === String(id));
    if (!item) return;
    const confirmed = confirm(
      `क्या आप "${item.file_name}" को CSV Upload History से हटाना चाहते हैं?\n\nइससे केवल History की CSV फाइल और उसका Storage archive हटेगा। objective_questions टेबल के प्रश्न नहीं हटेंगे।`
    );
    if (!confirmed) return;

    const button = [...document.querySelectorAll('[data-csv-delete]')].find(el => el.dataset.csvDelete === String(id));
    if (button) button.disabled = true;
    $('oqHistoryMsg').textContent = `${item.file_name} हटाई जा रही है…`;
    try {
      const client = window.supabaseClient;
      const {error: storageError} = await client.storage
        .from(CSV_ARCHIVE_BUCKET)
        .remove([item.storage_path]);
      if (storageError) throw storageError;

      const {error: historyError} = await client
        .from('objective_csv_uploads')
        .delete()
        .eq('id', item.id);
      if (historyError) {
        throw new Error(`Storage file हट गई, लेकिन History record नहीं हटा: ${historyError.message}`);
      }

      $('oqHistoryMsg').textContent = `${item.file_name} History से हटा दी गई। Supabase के प्रश्न सुरक्षित हैं।`;
      await loadUploadHistory();
    } catch (error) {
      $('oqHistoryMsg').textContent = `CSV नहीं हटाई जा सकी: ${error.message || error}`;
      if (button) button.disabled = false;
    }
  }

  async function getCsvBlob(item) {
    const {data, error} = await window.supabaseClient.storage.from(CSV_ARCHIVE_BUCKET).download(item.storage_path);
    if (error) throw error;
    return data;
  }

  async function downloadOneCsv(id) {
    const item = uploadHistory.find(row => String(row.id) === String(id));
    if (!item) return;
    try {
      $('oqHistoryMsg').textContent = `${item.file_name} डाउनलोड हो रही है…`;
      const blob = await getCsvBlob(item);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = item.file_name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      $('oqHistoryMsg').textContent = `${item.file_name} डाउनलोड शुरू हो गया।`;
    } catch (error) {
      $('oqHistoryMsg').textContent = `डाउनलोड नहीं हुआ: ${error.message || error}`;
    }
  }

  async function downloadAllCsv() {
    if (!uploadHistory.length || !window.JSZip) return;
    const button = $('oqDownloadAll'); button.disabled = true;
    const zip = new JSZip();
    try {
      for (let i = 0; i < uploadHistory.length; i++) {
        const item = uploadHistory[i];
        $('oqHistoryMsg').textContent = `${i + 1}/${uploadHistory.length} CSV ZIP में जोड़ी जा रही है…`;
        const blob = await getCsvBlob(item);
        const numberedName = `${String(i + 1).padStart(3, '0')}_${safeFileName(item.file_name)}`;
        zip.file(numberedName, blob);
      }
      const result = await zip.generateAsync({type:'blob'});
      const url = URL.createObjectURL(result);
      const a = document.createElement('a'); a.href = url; a.download = 'GANIT_SETU_Objective_All_CSV_Files.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      $('oqHistoryMsg').textContent = `${uploadHistory.length} CSV फाइलों की ZIP डाउनलोड शुरू हो गई।`;
    } catch (error) {
      $('oqHistoryMsg').textContent = `सभी CSV डाउनलोड नहीं हुईं: ${error.message || error}`;
    } finally { button.disabled = uploadHistory.length === 0; }
  }

  $('oqUpload').addEventListener('click', async () => {
    if (!validRows.length) return;
    const sourceCsvFile = $('oqBilingualFile').files[0];
    const client = window.supabaseClient;
    if (!client) {
      message('Supabase client नहीं मिला। Admin Panel configuration जाँचें।', true);
      return;
    }
    if (!confirm(`${validRows.length} bilingual Objective Questions नई objective_questions टेबल में Upload करें?`)) return;

    $('oqUpload').disabled = true;
    let inserted = 0, duplicate = 0, updatedOptions = 0;
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
          // Refresh only existing FILL_BLANK / SHORT_ANSWER rows with their new dropdown choices.
          if (!row.answer_correct_option) {
            duplicate++;
            continue;
          }
          const optionFields = {
            answer_option_a_hi: row.answer_option_a_hi,
            answer_option_b_hi: row.answer_option_b_hi,
            answer_option_a_en: row.answer_option_a_en,
            answer_option_b_en: row.answer_option_b_en,
            answer_correct_option: row.answer_correct_option
          };
          let updateQuery = client
            .from('objective_questions')
            .update(optionFields)
            .eq('source_question', row.source_question)
            .eq('class_level', row.class_level)
            .eq('exam_year', row.exam_year)
            .eq('paper_set', row.paper_set);
          updateQuery = row.maths_level
            ? updateQuery.eq('maths_level', row.maths_level)
            : updateQuery.is('maths_level', null);
          const {data: updatedRows, error: updateError} = await updateQuery.select('id');
          if (updateError) {
            failures.push({source_question:row.source_question,code:updateError.code||null,message:updateError.message||'Duplicate update failed',details:updateError.details||null,hint:updateError.hint||null});
          } else if (updatedRows?.length) {
            updatedOptions++;
          } else {
            duplicate++;
          }
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

      await archiveOriginalCsv(sourceCsvFile, sessionData.session.user.id, {total:validRows.length, inserted, updated:updatedOptions, duplicate, failed:failures.length});
      await loadUploadHistory();

      $('oqSummary').textContent =
        `कुल ${validRows.length} | Insert हुए ${inserted} | विकल्प अपडेट ${updatedOptions} | पहले से मौजूद छोड़े ${duplicate} | Failed ${failures.length}`;

      if (failures.length) {
        console.error('OBJECTIVE QUESTIONS UPLOAD ERRORS:', failures);
        message(`${inserted} प्रश्न Insert हुए, ${updatedOptions} पुराने प्रश्नों के विकल्प अपडेट हुए, ${duplicate} Duplicate छोड़े गए और ${failures.length} असफल हुए। F12 Console में पूरा विवरण देखें।`, true);
      } else {
        message(`Upload पूरा हुआ। ${inserted} प्रश्न Insert हुए, ${updatedOptions} पुराने प्रश्नों के विकल्प अपडेट हुए और ${duplicate} Duplicate छोड़े गए।`);
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
  $('oqHistoryRefresh').addEventListener('click', loadUploadHistory);
  $('oqDownloadAll').addEventListener('click', downloadAllCsv);
  ['oqSearch','oqClassFilter','oqStatusFilter'].forEach(id => {
    $(id).addEventListener(id === 'oqSearch' ? 'input' : 'change', renderList);
  });

  document.addEventListener('DOMContentLoaded', () => { loadList(); loadUploadHistory(); });
})();
