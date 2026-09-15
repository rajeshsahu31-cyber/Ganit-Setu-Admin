
(() => {
  const $ = id => document.getElementById(id);
  let currentPlanId = null, currentRows = [], settings = {};

  function todayISO(){const d=new Date(),l=new Date(d.getTime()-d.getTimezoneOffset()*60000);return l.toISOString().slice(0,10)}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function dateHi(iso){if(!iso)return '';return new Date(iso+'T00:00:00').toLocaleDateString('hi-IN',{day:'2-digit',month:'long',year:'numeric'})}
  function msg(t,type='success'){const b=$('generateMessage');b.hidden=false;b.className='cp-message '+type;b.textContent=t}
  function status(t,type=''){const e=$('settingsStatus');e.textContent=t;e.className='cp-status'+(type?' '+type:'')}

  async function sessionOK(){
    try{const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;if(!data?.session){location.href='index.html';return false}return true}
    catch(e){console.error(e);location.href='index.html';return false}
  }

  async function loadSettings(){
    status('Settings लोड हो रही हैं...');
    const {data,error}=await supabaseClient.from('content_automation_settings')
      .select('class_level,image_question_count,post_question_count,video_question_count,is_active')
      .eq('is_active',true).order('class_level');
    if(error){console.error(error);status('Settings नहीं मिली','error');msg('Content settings पढ़ी नहीं जा सकीं।','error');return false}
    settings={};(data||[]).forEach(r=>settings[Number(r.class_level)]=r);

    // The planning RPC is the source of truth. If RLS hides the settings rows from
    // the browser, show the already-approved default allocation instead of leaving
    // the UI incomplete. The RPC will still use the actual Supabase values.
    [9,10].forEach(c=>{
      if(!settings[c]) settings[c]={class_level:c,image_question_count:4,post_question_count:4,video_question_count:4,is_active:true,_fallback:true};
      const s=settings[c];
      $(`${c===9?'c9':'c10'}Image`).textContent=s.image_question_count;
      $(`${c===9?'c9':'c10'}Post`).textContent=s.post_question_count;
      $(`${c===9?'c9':'c10'}Video`).textContent=s.video_question_count;
    });
    const fallbackUsed=Boolean(settings[9]?._fallback||settings[10]?._fallback);
    if(fallbackUsed){
      status('Saved allocation: 4 / 4 / 4','ready');
    }else{
      status('Settings Ready','ready');
    }
    return true
  }

  function populateDays(n){$('dayFilter').innerHTML='<option value="all">सभी Days</option>';for(let i=1;i<=n;i++)$('dayFilter').insertAdjacentHTML('beforeend',`<option value="${i}">Day ${i}</option>`)}
  function typeLabel(t){return t==='image'?'🖼️ Image':t==='post'?'📱 Post':'🎬 Video'}
  function copyQuestionText(r){return [`Ganit Setu Question ID: Q${r.question_id}`,`Class: ${r.class_level}`,`Chapter: ${r.chapter_name}`,`Question: ${r.question_text||''}`].join('\n')}

  function render(){
    const df=$('dayFilter').value,cf=$('classFilter').value,tf=$('typeFilter').value;
    const rows=currentRows.filter(r=>(df==='all'||String(r.plan_day)===df)&&(cf==='all'||String(r.class_level)===cf)&&(tf==='all'||r.content_type===tf));
    const days=[...new Set(rows.map(r=>Number(r.plan_day)))].sort((a,b)=>a-b);
    if(!days.length){$('planDays').innerHTML='<div class="cp-empty">इन filters के अनुसार कोई question नहीं मिला।</div>';return}
    $('planDays').innerHTML=days.map(day=>{
      const dr=rows.filter(r=>Number(r.plan_day)===day),date=dr[0]?.content_date||'';
      return `<article class="cp-day"><div class="cp-day-head"><div class="cp-day-title"><span class="cp-day-number">${day}</span><div><h3>Day ${day}</h3><small>${esc(dateHi(date))}</small></div></div><span class="cp-day-total">${dr.length} Questions</span></div>`+
      [9,10].filter(c=>dr.some(r=>Number(r.class_level)===c)).map(c=>{
        const cr=dr.filter(r=>Number(r.class_level)===c).sort((a,b)=>Number(a.selection_order)-Number(b.selection_order));
        return `<div class="cp-class-block"><div class="cp-class-block-head"><b>${c===9?'📘 कक्षा 9':'📕 कक्षा 10'}</b><span class="cp-class-total">${cr.length} Questions</span></div><div class="cp-question-list">`+
        cr.map(r=>`<div class="cp-question"><span class="cp-q-number">${esc(r.selection_order)}</span><div class="cp-q-main"><div class="cp-q-meta"><span class="cp-chip ${esc(r.content_type)}">${typeLabel(r.content_type)}</span><span class="cp-chip">Chapter ${esc(r.chapter_number)}</span><span class="cp-chip">Cycle ${esc(r.cycle_number)}</span></div><div class="cp-q-text">${esc(r.question_text||'Question text उपलब्ध नहीं है।')}</div><div class="cp-q-id">Question ID: <b>Q${esc(r.question_id)}</b> • ${esc(r.chapter_name)}</div></div><button type="button" class="cp-copy-btn" data-copy-id="${esc(r.id)}">📋 Copy Question</button></div>`).join('')+
        `</div></div>`
      }).join('')+`</article>`;
    }).join('');
  }

  async function generate(){
    const start=$('startDate').value,days=Number($('daysCount').value);
    if(!start){msg('कृपया Start Date चुनें।','error');return}
    if(days<1||days>7){msg('Planning Days केवल 1 से 7 के बीच हो सकते हैं।','error');return}
    if(!(await loadSettings()))return;
    const b=$('generatePlanBtn');b.disabled=true;b.textContent='⏳ Plan तैयार हो रहा है...';$('planSummary').hidden=true;$('planWorkspace').hidden=true;msg(`Day 1 से Day ${days} तक unique questions चुने जा रहे हैं...`);
    try{
      const {data,error}=await supabaseClient.rpc('generate_content_plan',{p_start_date:start,p_days:days});
      if(error)throw error;
      currentRows=(data||[]).map(r=>({...r}));if(!currentRows.length)throw new Error('Plan generate हुआ लेकिन कोई question नहीं मिला।');
      currentPlanId=currentRows[0].plan_id;
      const ids=[...new Set(currentRows.map(r=>Number(r.question_id)))];
      const {data:qData,error:qError}=await supabaseClient.from('questions').select('id,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,hint').in('id',ids);
      if(qError)console.warn('Question details:',qError);else{const m=new Map((qData||[]).map(q=>[Number(q.id),q]));currentRows=currentRows.map(r=>({...r,...(m.get(Number(r.question_id))||{})}))}
      $('planTitle').textContent=`Content Plan • ${dateHi(start)}`;$('planMeta').textContent=`Plan ID: ${currentPlanId} • ${days} day${days>1?'s':''}`;$('summaryDays').textContent=days;$('summaryC9').textContent=currentRows.filter(r=>Number(r.class_level)===9).length;$('summaryC10').textContent=currentRows.filter(r=>Number(r.class_level)===10).length;$('summaryQuestions').textContent=currentRows.length;
      $('planSummary').hidden=false;$('planWorkspace').hidden=false;populateDays(days);render();msg(`✅ ${days} दिन का plan तैयार है। कुल ${currentRows.length} unique questions चुने गए।`);$('planSummary').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){console.error(e);msg(e.message||'Content plan generate नहीं हो सका।','error')}
    finally{b.disabled=false;b.textContent='🚀 Content Plan Generate करें'}
  }

  async function copyText(v){try{await navigator.clipboard.writeText(v);return true}catch(_){const t=document.createElement('textarea');t.value=v;document.body.appendChild(t);t.select();const ok=document.execCommand('copy');t.remove();return ok}}

  document.addEventListener('DOMContentLoaded',async()=>{
    if(!(await sessionOK()))return;
    $('startDate').value=todayISO();await loadSettings();
    $('generatePlanBtn').addEventListener('click',generate);
    ['dayFilter','classFilter','typeFilter'].forEach(id=>$(id).addEventListener('change',render));
    $('copyPlanIdBtn').addEventListener('click',async()=>{if(!currentPlanId)return;const ok=await copyText(currentPlanId);$('copyPlanIdBtn').textContent=ok?'✓ Copied':'📋 Plan ID Copy';setTimeout(()=>$('copyPlanIdBtn').textContent='📋 Plan ID Copy',1400)});
    $('planDays').addEventListener('click',async e=>{const b=e.target.closest('[data-copy-id]');if(!b)return;const r=currentRows.find(x=>Number(x.id)===Number(b.dataset.copyId));if(!r)return;const ok=await copyText(copyQuestionText(r));b.textContent=ok?'✓ Copied':'📋 Copy Question';setTimeout(()=>b.textContent='📋 Copy Question',1400)});
  });
})();
