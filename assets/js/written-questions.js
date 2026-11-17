
// GANIT SETU - Separate CSV importer for public.written_questions
// This file does NOT modify or use the objective questions table/importer.

(() => {
  'use strict';

  const FIELDS = [
    'question_id', 'class_level', 'chapter_number', 'chapter_name_hi',
    'chapter_name_en', 'marks', 'question_type', 'difficulty', 'medium',
    'question_text_hi', 'question_text_en', 'given_data_hi', 'given_data_en',
    'required_to_find_hi', 'required_to_find_en', 'solution_steps_hi',
    'solution_steps_en', 'formula_theorem_hi', 'formula_theorem_en',
    'final_answer_hi', 'final_answer_en', 'marking_scheme_json', 'diagram_type',
    'diagram_description_hi', 'diagram_description_en', 'diagram_url',
    'table_data_json', 'graph_data_json', 'exam_year', 'paper_set', 'exam_type',
    'original_question_number', 'source_reference', 'status', 'is_active', 'remarks'
  ];

  const $ = id => document.getElementById(id);
  let validRows = [];
  let parsedRows = [];

  const requiredIds = [
    'fields', 'templateBtn', 'previewBtn', 'uploadBtn',
    'csvFile', 'preview', 'summary', 'msg'
  ];

  const missingIds = requiredIds.filter(id => !$(id));
  if (missingIds.length) {
    console.error('Written Questions Importer: missing HTML elements:', missingIds);
    return;
  }

  $('fields').innerHTML = FIELDS.map((field, index) =>
    `<tr><td>${index + 1}</td><td><code>${escapeHtml(field)}</code></td></tr>`
  ).join('');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function csvParse(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }

    row.push(cell.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
  }

  function normMedium(value) {
    const v = (value || '').trim().toLowerCase();
    if (['hindi', 'hindi medium', 'हिंदी', 'हिंदी माध्यम'].includes(v)) return 'Hindi';
    if (['english', 'english medium', 'अंग्रेज़ी', 'अंग्रेजी'].includes(v)) return 'English';
    if (['both', 'bilingual', 'दोनों'].includes(v)) return 'Both';
    return '';
  }

  function parseBool(value, defaultValue = true) {
    if (value == null || value.trim() === '') return defaultValue;
    return ['true', '1', 'yes', 'हाँ', 'active'].includes(value.trim().toLowerCase());
  }

  function validate(row, rowNumber) {
    const object = {};
    FIELDS.forEach((field, index) => {
      object[field] = (row[index] ?? '').trim();
    });

    const errors = [];

    if (row.length !== FIELDS.length) {
      errors.push(`इस पंक्ति में ${row.length} कॉलम हैं; ${FIELDS.length} होने चाहिए`);
    }
    if (!object.question_id) errors.push('question_id खाली');
    if (!['9', '10'].includes(object.class_level)) errors.push('class_level 9/10 होना चाहिए');
    if (!/^\d+$/.test(object.chapter_number) || Number(object.chapter_number) < 1) {
      errors.push('chapter_number गलत');
    }
    if (!['2', '3', '4'].includes(object.marks)) errors.push('marks 2/3/4 होना चाहिए');

    object.medium = normMedium(object.medium);
    if (!object.medium) errors.push('medium Hindi/English/Both होना चाहिए');
    if (!object.question_text_hi && !object.question_text_en) {
      errors.push('प्रश्न हिंदी/English में जरूरी');
    }

    for (const key of ['marking_scheme_json', 'table_data_json', 'graph_data_json']) {
      if (object[key]) {
        try {
          object[key] = JSON.parse(object[key]);
        } catch (_) {
          errors.push(`${key} का JSON गलत`);
        }
      } else {
        object[key] = null;
      }
    }

    if (object.exam_year) {
      object.exam_year = Number(object.exam_year);
      if (!Number.isInteger(object.exam_year)) errors.push('exam_year गलत');
    } else {
      object.exam_year = null;
    }

    object.class_level = Number(object.class_level);
    object.chapter_number = Number(object.chapter_number);
    object.marks = Number(object.marks);
    object.status = object.status || 'draft';
    object.is_active = parseBool(object.is_active, true);
    object.question_type = object.question_type || 'written';
    object.difficulty = object.difficulty || null;

    return { o: object, errs: errors, n: rowNumber };
  }

  function showMsg(message, isBad = false) {
    $('msg').textContent = message;
    $('msg').className = 'notice ' + (isBad ? 'bad' : 'ok');
  }

  function resetPreview() {
    validRows = [];
    parsedRows = [];
    $('preview').innerHTML = '';
    $('summary').textContent = '';
    $('uploadBtn').disabled = true;
  }

  $('templateBtn').addEventListener('click', () => {
    const csv = FIELDS.join(',') + '\r\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Ganit_Setu_Written_Questions_Template_36_Columns.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });

  $('previewBtn').addEventListener('click', async () => {
    resetPreview();

    try {
      const file = $('csvFile').files[0];
      if (!file) throw new Error('पहले CSV फ़ाइल चुनें।');

      const rows = csvParse(await file.text());
      if (!rows.length) throw new Error('CSV खाली है।');

      const headers = rows[0].map(value => value.trim().replace(/^\ufeff/, ''));
      if (headers.join('|') !== FIELDS.join('|')) {
        throw new Error('CSV के कॉलम या उनका क्रम निर्धारित 36 कॉलम से मेल नहीं खाता। पहले Template डाउनलोड करें।');
      }

      const seen = new Set();
      parsedRows = rows.slice(1)
        .filter(row => row.some(value => String(value || '').trim()))
        .map((row, index) => validate(row, index + 2));

      validRows = [];
      for (const item of parsedRows) {
        if (!item.errs.length && seen.has(item.o.question_id)) {
          item.errs.push('इस CSV में duplicate question_id');
        } else if (!item.errs.length) {
          seen.add(item.o.question_id);
        }
        if (!item.errs.length) validRows.push(item.o);
      }

      $('preview').innerHTML = parsedRows.slice(0, 100).map(item => `
        <tr>
          <td>${item.n}</td>
          <td>${escapeHtml(item.o.question_id)}</td>
          <td>${item.o.class_level || '—'} / ${escapeHtml(item.o.chapter_number || '—')}</td>
          <td>${item.o.marks || '—'}</td>
          <td>${escapeHtml((item.o.question_text_hi || item.o.question_text_en || '').slice(0, 110))}</td>
          <td class="${item.errs.length ? 'bad' : 'ok'}">
            ${item.errs.length ? escapeHtml(item.errs.join('; ')) : 'Valid'}
          </td>
        </tr>
      `).join('');

      $('summary').textContent =
        `कुल ${parsedRows.length} | Valid ${validRows.length} | त्रुटि/Duplicate ${parsedRows.length - validRows.length}`;

      $('uploadBtn').disabled = validRows.length === 0;
      showMsg('Preview तैयार है। Upload से पहले रिकॉर्ड जाँच लें।');
    } catch (error) {
      console.error('Written Questions Preview Error:', error);
      showMsg(error.message || String(error), true);
      $('uploadBtn').disabled = true;
    }
  });

  // INSERT-only uploader. Existing IDs are skipped when PostgreSQL reports
  // unique_violation (23505). No UPSERT / ON CONFLICT request is made.
  $('uploadBtn').addEventListener('click', async () => {
    if (!validRows.length) return;

    const client = window.supabaseClient;
    if (!client) {
      showMsg('Supabase client नहीं मिला। Admin Panel की Supabase configuration जाँचें।', true);
      return;
    }

    if (!confirm(`${validRows.length} Valid प्रश्नों को written_questions में Upload करें?`)) {
      return;
    }

    $('uploadBtn').disabled = true;

    let inserted = 0;
    let skippedDuplicates = 0;
    const failures = [];

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw new Error(`Session जाँचने में समस्या: ${sessionError.message}`);
      if (!sessionData?.session) throw new Error('Admin Login Session उपलब्ध नहीं है। Logout करके दोबारा Login करें।');

      for (let start = 0; start < validRows.length; start += 100) {
        const batch = validRows.slice(start, start + 100);
        const batchNumber = Math.floor(start / 100) + 1;

        const { error: batchError } = await client
          .from('written_questions')
          .insert(batch);

        if (!batchError) {
          inserted += batch.length;
          continue;
        }

        console.warn(`Batch ${batchNumber} INSERT failed; retrying rows individually.`, batchError);

        for (const row of batch) {
          const { error } = await client
            .from('written_questions')
            .insert(row);

          if (!error) {
            inserted++;
          } else if (error.code === '23505') {
            skippedDuplicates++;
          } else {
            failures.push({
              question_id: row.question_id,
              code: error.code || null,
              message: error.message || 'Unknown insert error',
              details: error.details || null,
              hint: error.hint || null
            });
          }
        }
      }

      $('summary').textContent =
        `कुल ${validRows.length} | Insert हुए ${inserted} | पहले से मौजूद छोड़े ${skippedDuplicates} | Failed ${failures.length}`;

      if (failures.length) {
        console.error('WRITTEN QUESTIONS ROW ERRORS:', failures);
        showMsg(
          `${inserted} प्रश्न Insert हुए, ${skippedDuplicates} Duplicate छोड़े गए और ${failures.length} प्रश्न असफल हुए। पूरा विवरण F12 → Console में देखें।`,
          true
        );
      } else {
        showMsg(
          `Upload पूरा हुआ। ${inserted} प्रश्न Insert हुए और ${skippedDuplicates} पहले से मौजूद Duplicate प्रश्न छोड़े गए।`,
          false
        );
      }
    } catch (error) {
      console.error('Written Questions Upload Error:', error);
      showMsg(error.message || String(error), true);
    } finally {
      $('uploadBtn').disabled = validRows.length === 0;
    }
  });
})();
