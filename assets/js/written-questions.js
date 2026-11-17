// Separate CSV importer for public.written_questions. Does not touch objective questions.
(() => {
const FIELDS = ['question_id', 'class_level', 'chapter_number', 'chapter_name_hi', 'chapter_name_en', 'marks', 'question_type', 'difficulty', 'medium', 'question_text_hi', 'question_text_en', 'given_data_hi', 'given_data_en', 'required_to_find_hi', 'required_to_find_en', 'solution_steps_hi', 'solution_steps_en', 'formula_theorem_hi', 'formula_theorem_en', 'final_answer_hi', 'final_answer_en', 'marking_scheme_json', 'diagram_type', 'diagram_description_hi', 'diagram_description_en', 'diagram_url', 'table_data_json', 'graph_data_json', 'exam_year', 'paper_set', 'exam_type', 'original_question_number', 'source_reference', 'status', 'is_active', 'remarks'];
const $=id=>document.getElementById(id); let validRows=[]; let parsedRows=[];
$('fields').innerHTML=FIELDS.map((f,i)=>`<tr><td>${i+1}</td><td><code>${f}</code></td></tr>`).join('');
function csvParse(text){let rows=[],row=[],cell='',quoted=false; for(let i=0;i<text.length;i++){let c=text[i]; if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else{if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}} row.push(cell.replace(/\r$/,'')); if(row.some(x=>x!==''))rows.push(row); return rows;}
function normMedium(v){v=(v||'').trim().toLowerCase(); if(['hindi','hindi medium','हिंदी','हिंदी माध्यम'].includes(v))return 'Hindi';if(['english','english medium','अंग्रेज़ी','अंग्रेजी'].includes(v))return 'English';if(['both','bilingual','दोनों'].includes(v))return 'Both';return '';}
function parseBool(v,def=true){if(v==null||v.trim()==='')return def;return ['true','1','yes','हाँ','active'].includes(v.trim().toLowerCase());}
function validate(row,n){let o={};FIELDS.forEach((f,i)=>o[f]=(row[i]??'').trim());let errs=[];if(!o.question_id)errs.push('question_id खाली');if(!['9','10'].includes(o.class_level))errs.push('class_level 9/10 होना चाहिए');if(!/^\d+$/.test(o.chapter_number)||Number(o.chapter_number)<1)errs.push('chapter_number गलत');if(!['2','3','4'].includes(o.marks))errs.push('marks 2/3/4 होना चाहिए');o.medium=normMedium(o.medium);if(!o.medium)errs.push('medium Hindi/English/Both होना चाहिए');if(!o.question_text_hi&&!o.question_text_en)errs.push('प्रश्न हिंदी/English में जरूरी');for(let k of ['marking_scheme_json','table_data_json','graph_data_json']){if(o[k]){try{o[k]=JSON.parse(o[k]);}catch(e){errs.push(k+' का JSON गलत');}}else o[k]=null;}if(o.exam_year){o.exam_year=Number(o.exam_year);if(!Number.isInteger(o.exam_year))errs.push('exam_year गलत');}else o.exam_year=null;o.class_level=Number(o.class_level);o.chapter_number=Number(o.chapter_number);o.marks=Number(o.marks);o.status=o.status||'published';o.is_active=parseBool(o.is_active,true);o.question_type=o.question_type||'written';o.difficulty=o.difficulty||null;return {o,errs,n};}
function showMsg(s,bad=false){$('msg').textContent=s;$('msg').className='notice '+(bad?'bad':'ok');}
$('templateBtn').onclick=()=>{let csv=FIELDS.join(',')+'\r\n';let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='Ganit_Setu_Written_Questions_Template_36_Columns.csv';a.click();URL.revokeObjectURL(a.href);};
$('previewBtn').onclick=async()=>{try{let file=$('csvFile').files[0];if(!file)throw Error('पहले CSV फ़ाइल चुनें।');let rows=csvParse(await file.text());if(!rows.length)throw Error('CSV खाली है।');let headers=rows[0].map(x=>x.trim().replace(/^\ufeff/,''));if(headers.join('|')!==FIELDS.join('|'))throw Error('CSV के कॉलम या उनका क्रम निर्धारित 36 कॉलम से मेल नहीं खाता। पहले Template डाउनलोड करें।');let seen=new Set();parsedRows=rows.slice(1).filter(r=>r.some(x=>String(x||'').trim())).map((r,i)=>validate(r,i+2));validRows=[];let dup=0;for(let x of parsedRows){if(!x.errs.length&&seen.has(x.o.question_id)){x.errs.push('इस CSV में duplicate question_id');dup++;}else if(!x.errs.length)seen.add(x.o.question_id);if(!x.errs.length)validRows.push(x.o);} $('preview').innerHTML=parsedRows.slice(0,100).map(x=>`<tr><td>${x.n}</td><td>${esc(x.o.question_id)}</td><td>${x.o.class_level||'—'} / ${esc(x.o.chapter_number||'—')}</td><td>${x.o.marks||'—'}</td><td>${esc((x.o.question_text_hi||x.o.question_text_en||'').slice(0,110))}</td><td class="${x.errs.length?'bad':'ok'}">${x.errs.length?esc(x.errs.join('; ')):'Valid'}</td></tr>`).join('');$('summary').textContent=`कुल ${parsedRows.length} | Valid ${validRows.length} | त्रुटि/Duplicate ${parsedRows.length-validRows.length}`;$('uploadBtn').disabled=!validRows.length;showMsg('Preview तैयार है। Upload से पहले रिकॉर्ड जाँच लें।');}catch(e){showMsg(e.message,true);$('uploadBtn').disabled=true;}};

$('uploadBtn').onclick = async () => {
  if (!validRows.length) return;

  if (!confirm(`${validRows.length} प्रश्न written_questions टेबल में upload करें?`)) {
    return;
  }

  $('uploadBtn').disabled = true;

  let done = 0;
  let failed = [];

  try {
    const { data: sessionData, error: sessionError } =
      await window.supabaseClient.auth.getSession();

    if (sessionError || !sessionData.session) {
      throw new Error('Admin Login Session उपलब्ध नहीं है।');
    }

    for (let i = 0; i < validRows.length; i += 100) {
      const batch = validRows.slice(i, i + 100);

      const { error } = await window.supabaseClient
        .from('written_questions')
        .upsert(batch, {
          onConflict: 'question_id',
          ignoreDuplicates: true
        });

      if (error) {
        console.error('FULL UPLOAD ERROR:', error);

        failed.push({
          batch: Math.floor(i / 100) + 1,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
      } else {
        done += batch.length;
      }
    }

    $('summary').textContent =
      `Upload request complete: ${done} rows processed.`;

    if (failed.length) {
      console.error('FAILED BATCH DETAILS:', failed);

      showMsg(
        `कुछ batches upload नहीं हुए: ${JSON.stringify(failed)}`,
        true
      );
    } else {
      showMsg(
        `${done} प्रश्नों का Upload request सफल रहा।`,
        false
      );
    }

  } catch (error) {
    console.error('UPLOAD ERROR:', error);
    showMsg(error.message, true);
  } finally {
    $('uploadBtn').disabled = validRows.length === 0;
  }
};

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();
