(()=>{'use strict';
const $=id=>document.getElementById(id),root=$('bsMain'),crumb=$('bsBreadcrumb');
let cls=10,medium='hi',rows=[],chapterNo=null,exerciseNo=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=s=>window.DOMPurify?DOMPurify.sanitize(String(s||''),{USE_PROFILES:{html:true}}):String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+\s*=\s*(['"]).*?\1/gi,'');
const hi=()=>medium==='hi';
const labels=()=>hi()?{class:'कक्षा',chapters:'अध्याय चुनें',ex:'प्रश्नावली',question:'प्रश्न',solution:'हल',list:'प्रश्नावली के सभी प्रश्न',downloadAll:'पूरी प्रश्नावली PDF डाउनलोड करें',image:'इमेज डाउनलोड',pdf:'PDF डाउनलोड',page:'गणित सेतु • पाठ्यपुस्तक हल'}:{class:'Class',chapters:'Select Chapter',ex:'Exercise',question:'Question',solution:'Solution',list:'All exercise questions',downloadAll:'Download complete exercise PDF',image:'Download image',pdf:'Download PDF',page:'GANIT SETU • TEXTBOOK SOLUTIONS'};
function message(t){root.innerHTML=`<div class="bs-empty">${esc(t)}</div>`;}
function setCrumb(parts){crumb.innerHTML=parts.map((p,i)=>`${i?' › ':''}<button data-i="${i}">${esc(p)}</button>`).join('');crumb.querySelectorAll('button').forEach(b=>b.onclick=()=>{let i=+b.dataset.i;if(i===0)showChapters();else if(i===1)showExercises(chapterNo);});}
async function loadRows(){let {data,error}=await supabaseClient.from('textbook_solutions').select('id,class_level,medium,chapter_number,chapter_title,exercise_number,question_number,question_type,question_html,solution_html,solution_steps,question_image_url,solution_image_url,question_table_html,solution_table_html,marks,sort_order').eq('class_level',cls).eq('medium',medium).eq('is_published',true).order('chapter_number').order('sort_order').order('question_number');if(error)throw error;rows=data||[];}
async function showChapters(){setCrumb([`${labels().class} ${cls}`]);message(hi()?'अध्याय लोड हो रहे हैं…':'Loading chapters…');try{await loadRows();let chapters=[...new Map(rows.map(r=>[r.chapter_number,r])).values()];if(!chapters.length){message(hi()?'इस माध्यम में अभी पाठ्यपुस्तक सामग्री उपलब्ध नहीं है।':'No textbook content is available in this medium yet.');return;}root.innerHTML=`<section class="bs-card"><h2>${labels().chapters}</h2><div class="bs-list">${chapters.map(c=>`<button class="bs-item" data-ch="${c.chapter_number}">${hi()?'अध्याय':'Chapter'} ${c.chapter_number} – ${esc(c.chapter_title)}</button>`).join('')}</div></section>`;root.querySelectorAll('[data-ch]').forEach(b=>b.onclick=()=>showExercises(+b.dataset.ch));}catch(e){message((hi()?'सामग्री लोड नहीं हुई: ':'Could not load content: ')+e.message);}}
function showExercises(ch){chapterNo=ch;let chrow=rows.find(r=>r.chapter_number===ch);setCrumb([`${labels().class} ${cls}`,`${hi()?'अध्याय':'Chapter'} ${ch}`]);let ex=[...new Set(rows.filter(r=>r.chapter_number===ch).map(r=>r.exercise_number))];if(!ex.length){message(hi()?'इस अध्याय में प्रश्नावली उपलब्ध नहीं है।':'No exercises in this chapter.');return;}root.innerHTML=`<section class="bs-card"><h2>${hi()?'अध्याय':'Chapter'} ${ch} – ${esc(chrow.chapter_title)}</h2><div class="bs-list">${ex.map(e=>`<button class="bs-item" data-ex="${esc(e)}">${labels().ex} ${esc(e)}</button>`).join('')}</div></section>`;root.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>showQuestions(b.dataset.ex));}
function formatSolutionSteps(html){
 // Legacy content: preserve author-supplied paragraph/line boundaries.
 // Do not guess step boundaries inside mathematical text.
 return safe(String(html||''));
}
function stepDefaultLabel(type){
 const labels=hi()?{given:'दिया गया',find:'ज्ञात करना है',formula:'सूत्र / प्रमेय',equation:'गणना',calculation:'गणना',hcf:'HCF',lcm:'LCM',verification:'जाँच',conclusion:'निष्कर्ष',prose:'व्याख्या',heading:'हल का चरण'}:{given:'Given',find:'To find',formula:'Formula / Theorem',equation:'Calculation',calculation:'Calculation',hcf:'HCF',lcm:'LCM',verification:'Verification',conclusion:'Conclusion',prose:'Explanation',heading:'Solution step'};
 return labels[type]||'';
}
function renderStructuredSteps(steps){
 if(!Array.isArray(steps)||!steps.length) return '';
 // Render only the authored mathematical/text lines. Step type is used for
 // subtle styling, never converted into repetitive labels such as गणना/व्याख्या.
 return `<div class="bs-structured-steps">${steps.map((step)=>{
   const type=String(step?.type||'equation').toLowerCase();
   const content=safe(step?.html??step?.content??'');
   const cls=['given','find','formula','equation','calculation','hcf','lcm','verification','conclusion','prose','heading'].includes(type)?type:'equation';
   if(!content.trim()) return '';
   return `<div class="bs-step bs-step-${cls}" data-step="${esc(type)}"><div class="bs-step-content">${content}</div></div>`;
 }).join('')}</div>`;
}
function solutionMarkup(q){
 const structured=renderStructuredSteps(q.solution_steps);
 return structured||formatSolutionSteps(q.solution_html);
}
function installStepFormatterStyles(){
 if(document.getElementById('bsAutoStepStyles')) return;
 const style=document.createElement('style');style.id='bsAutoStepStyles';
 style.textContent=`.bs-hand-solution{white-space:normal;word-break:normal;overflow-wrap:normal;line-height:1.9}.bs-hand-solution .bs-auto-step{display:block;margin:0 0 .42em}.bs-hand-solution br{display:block;content:"";margin-bottom:.28em}.bs-hand-solution sup,.bs-hand-solution sub{line-height:0}.bs-hand-solution .bs-punct{font-family:"Noto Sans Devanagari","Nirmala UI",sans-serif;font-style:normal;display:inline-block;margin-left:.04em}.bs-structured-steps{display:flex;flex-direction:column;gap:5px}.bs-step{display:block;line-height:1.8;break-inside:avoid;page-break-inside:avoid}.bs-step-content{white-space:normal}.bs-step-content p{margin:0 0 3px}.bs-step-content p{margin:0 0 4px}.bs-step-equation .bs-step-content,.bs-step-calculation .bs-step-content{padding-left:2px}.bs-step-conclusion .bs-step-content{color:#b42335;font-weight:700}`;
 document.head.appendChild(style);
}
function questionCard(q,i,total){const L=labels();let qi=q.question_image_url?`<img src="${esc(q.question_image_url)}" alt="Question image" loading="lazy">`:'';let si=q.solution_image_url?`<img src="${esc(q.solution_image_url)}" alt="Solution image" loading="lazy">`:'';let qt=q.question_table_html?`<div class="bs-custom-table">${safe(q.question_table_html)}</div>`:'';let st=q.solution_table_html?`<div class="bs-custom-table">${safe(q.solution_table_html)}</div>`:'';return `<article class="bs-hand-card" data-question-card="${i}"><div class="bs-hand-head"><span>${esc(L.page)} · ${esc(q.exercise_number)}</span><span>${L.question} ${esc(q.question_number)}${q.marks?` · ${esc(q.marks)} ${hi()?'अंक':'marks'}`:''}</span></div><div class="bs-hand-paper"><div class="bs-hand-qtitle">${L.question} ${esc(q.question_number)}.</div><div class="bs-hand-question">${safe(q.question_html)}</div>${qi}${qt}<div class="bs-hand-s-title">${L.solution}</div><div class="bs-hand-solution">${solutionMarkup(q)}</div>${si}${st}</div><div class="bs-export-actions"><button type="button" class="bs-export-btn" data-one-image="${i}">⬇ ${L.image}</button><button type="button" class="bs-export-btn" data-one-pdf="${i}">⬇ ${L.pdf}</button></div></article>`;}
function fixHindiPunctuation(scope){
// Keep handwriting for the text, but render Hindi danda marks in a clear
// Devanagari UI font so they cannot be mistaken for the digit 1.
const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT,{acceptNode(node){
 if(!node.nodeValue||!/[।॥]/.test(node.nodeValue))return NodeFilter.FILTER_REJECT;
 if(node.parentElement?.closest('.bs-punct'))return NodeFilter.FILTER_REJECT;
 return NodeFilter.FILTER_ACCEPT;
}});
const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
for(const node of nodes){const parts=node.nodeValue.split(/([।॥])/);const frag=document.createDocumentFragment();
 for(const part of parts){if(part==='।'||part==='॥'){const mark=document.createElement('span');mark.className='bs-punct';mark.textContent=part;frag.appendChild(mark);}else if(part){frag.appendChild(document.createTextNode(part));}}
 node.parentNode.replaceChild(frag,node);
 }
}
function showQuestions(ex){installStepFormatterStyles();exerciseNo=ex;setCrumb([`${labels().class} ${cls}`,`${hi()?'अध्याय':'Chapter'} ${chapterNo}`,`${labels().ex} ${ex}`]);let qs=rows.filter(r=>r.chapter_number===chapterNo&&r.exercise_number===exerciseNo).sort((a,b)=>(a.sort_order-b.sort_order)||(a.question_number-b.question_number));if(!qs.length){message(hi()?'प्रश्न उपलब्ध नहीं हैं।':'No questions available.');return;}root.innerHTML=`<section class="bs-ex-toolbar"><div><b>${labels().list} · ${qs.length}</b><small>${hi()?'प्रत्येक प्रश्न और हल कॉपी-स्टाइल में':'Each question and solution in notebook style'}</small></div><button id="bsAllPdf" class="bs-export-btn bs-all-btn">⬇ ${labels().downloadAll}</button></section><div class="bs-question-list">${qs.map((q,i)=>questionCard(q,i,qs.length)).join('')}</div>`;root.querySelectorAll('.bs-hand-paper').forEach(fixHindiPunctuation);root.querySelectorAll('[data-one-image]').forEach(b=>b.onclick=()=>exportOne(+b.dataset.oneImage,'png',b));root.querySelectorAll('[data-one-pdf]').forEach(b=>b.onclick=()=>exportOne(+b.dataset.onePdf,'pdf',b));$('bsAllPdf').onclick=()=>exportAll(qs.length,$('bsAllPdf'));}
function safeName(s){return String(s||'Ganit_Setu').replace(/[^\w\-]+/g,'_').slice(0,70);}
async function captureCard(card){if(!window.html2canvas)throw new Error('इमेज सुविधा लोड नहीं हुई। इंटरनेट कनेक्शन जाँचें।');if(document.fonts?.ready)await document.fonts.ready;return window.html2canvas(card,{scale:2,useCORS:true,backgroundColor:'#fffef9',logging:false,onclone:doc=>{doc.querySelectorAll('.bs-export-actions').forEach(x=>x.remove());doc.querySelectorAll('.bs-hand-paper').forEach(x=>{x.style.overflow='visible';});}});}
function addCanvasPages(pdf,canvas,firstPage){
// A4 printable area: 190mm wide x 277mm high. Long solutions are split
// vertically across pages, while each question starts on a fresh page.
const pageW=190,pageH=277,scale=pageW/canvas.width,maxSlice=Math.max(1,Math.floor(pageH/scale));
let y=0,page=0;while(y<canvas.height){const h=Math.min(maxSlice,canvas.height-y);const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=h;const ctx=slice.getContext('2d');ctx.fillStyle='#fffef9';ctx.fillRect(0,0,slice.width,slice.height);ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);if(!firstPage||page>0||y>0)pdf.addPage();const mmH=h*scale;pdf.addImage(slice.toDataURL('image/png'),'PNG',10,10,pageW,mmH,undefined,'FAST');y+=h;page++;}
}
async function withBusy(btn,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=hi()?'तैयार हो रहा है…':'Preparing…';try{await fn();}catch(e){console.error(e);alert(e.message||'फाइल तैयार नहीं हो सकी।');}finally{btn.disabled=false;btn.textContent=old;}}
async function exportOne(index,kind,btn){const card=root.querySelector(`[data-question-card="${index}"]`);if(!card)return;await withBusy(btn,async()=>{const canvas=await captureCard(card),q=rows.filter(r=>r.chapter_number===chapterNo&&r.exercise_number===exerciseNo).sort((a,b)=>(a.sort_order-b.sort_order)||(a.question_number-b.question_number))[index],name=safeName(`GanitSetu_Class${cls}_Ch${chapterNo}_Ex${exerciseNo}_Q${q?.question_number}_${medium}`);if(kind==='png'){const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=name+'.png';a.click();}else{const {jsPDF}=window.jspdf||{};if(!jsPDF)throw new Error('PDF सुविधा लोड नहीं हुई।');const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});addCanvasPages(pdf,canvas,true);pdf.save(name+'.pdf');}});}
async function exportAll(count,btn){const cards=[...root.querySelectorAll('[data-question-card]')];if(!cards.length)return;await withBusy(btn,async()=>{const {jsPDF}=window.jspdf||{};if(!jsPDF)throw new Error('PDF सुविधा लोड नहीं हुई।');const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});for(let i=0;i<cards.length;i++){const canvas=await captureCard(cards[i]);addCanvasPages(pdf,canvas,i===0);}pdf.save(safeName(`GanitSetu_Class${cls}_Chapter${chapterNo}_Exercise${exerciseNo}_${medium}_Complete_Solutions`)+'.pdf');});}
document.addEventListener('DOMContentLoaded',()=>{$('bsLoad').onclick=()=>{cls=+$('bsStudentClass').value;medium=$('bsStudentMedium').value;showChapters();};});
})();
