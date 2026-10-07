(function(){
  const MAX=5, STORAGE='ganitSetuSelectedQuestionIds';
  let allQuestions=[], selected=new Set(JSON.parse(localStorage.getItem(STORAGE)||'[]').map(String));
  const $=id=>document.getElementById(id);
  const supa=window.supabaseClient;
  const classSelect=$('classSelect'), chapterSelect=$('chapterSelect'), search=$('questionSearch'), list=$('questionList'), status=$('questionStatus'), count=$('selectionCount');
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
  function updateCount(){count.textContent=`Selected Questions: ${selected.size} / ${MAX}`}
  function render(){
    const term=(search.value||'').trim().toLowerCase(); const ch=chapterSelect.value;
    const rows=allQuestions.filter(q=>{
      const hay=`${q.id} ${q.question_text||''} ${q.chapter_name||''}`.toLowerCase();
      return (ch==='all'||String(q.chapter_number)===ch) && (!term||hay.includes(term));
    });
    if(!rows.length){list.innerHTML='<div class="empty-box">इस filter में कोई Question नहीं मिला।</div>';return;}
    list.innerHTML=rows.map(q=>{const id=String(q.id), is=selected.has(id);return `<article class="question-card ${is?'selected':''}"><div class="q-top"><div><span class="q-id">Q${esc(q.id)}</span><span class="q-meta"> • कक्षा ${esc(q.class_level)} • Chapter ${esc(q.chapter_number)} — ${esc(q.chapter_name||'')}</span></div><button type="button" class="q-select ${is?'selected':''}" data-id="${esc(q.id)}">${is?'✓ Selected':'Select ✓'}</button></div><div class="q-text">${esc(q.question_text||'')}</div></article>`}).join('');
    list.querySelectorAll('.q-select').forEach(btn=>btn.addEventListener('click',()=>toggle(btn.dataset.id)));
  }
  function toggle(id){if(selected.has(id)) selected.delete(id); else {if(selected.size>=MAX){alert('अधिकतम 5 Questions ही चुन सकते हैं।');return;} selected.add(id)} updateCount(); render();}
  function save(){localStorage.setItem(STORAGE,JSON.stringify([...selected])); alert(`${selected.size} Question Selection save हो गया।`)}
  async function load(){
    status.textContent='Questions लोड हो रहे हैं...'; list.innerHTML='';
    const cls=Number(classSelect.value);
    const {data,error}=await supa.from('questions').select('id,class_level,chapter_number,chapter_name,question_text').eq('class_level',cls).order('id',{ascending:true}).limit(500);
    if(error){console.error(error);status.textContent='❌ Questions लोड नहीं हो सके: '+error.message;return;}
    allQuestions=data||[]; const chapters=[...new Map(allQuestions.map(q=>[String(q.chapter_number),q.chapter_name])).entries()].sort((a,b)=>Number(a[0])-Number(b[0]));
    chapterSelect.innerHTML='<option value="all">सभी Chapters</option>'+chapters.map(([n,name])=>`<option value="${esc(n)}">Chapter ${esc(n)} — ${esc(name||'')}</option>`).join('');
    status.textContent=`${allQuestions.length} Questions उपलब्ध हैं`; render();
  }
  $('clearSelection').addEventListener('click',()=>{selected.clear();localStorage.removeItem(STORAGE);updateCount();render()});
  $('saveSelection').addEventListener('click',save);
  $('continueCreation').addEventListener('click',()=>{if(!selected.size){alert('पहले कम से कम 1 Question चुनें।');return;} save(); location.href='content-planning.html?selected='+encodeURIComponent([...selected].join(','));});
  classSelect.addEventListener('change',load); chapterSelect.addEventListener('change',render); search.addEventListener('input',render);
  updateCount(); load();
})();
