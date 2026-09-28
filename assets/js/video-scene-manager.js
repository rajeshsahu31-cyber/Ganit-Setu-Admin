(function(){
'use strict';
const SUPABASE_URL='https://cbgojvnbkosdehvwerth.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
const BUCKET='content-media';
const scenes=[
 {n:1,name:'Question Intro',desc:'सवाल को ध्यान से पढ़ने के लिए curiosity'},
 {n:2,name:'Options',desc:'विकल्पों को ध्यान से देखने के लिए prompt'},
 {n:3,name:'Hint',desc:'Hint देखने के लिए guidance'},
 {n:4,name:'Answer Reveal',desc:'उत्तर check करने की curiosity'},
 {n:5,name:'CTA',desc:'गणित सेतु Follow / Subscribe CTA'}
];
let sb;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function pathFor(n){return `video-scenes/scene-${n}.mp4`;}
function urlFor(path){return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`;}
function render(){
 const grid=document.getElementById('sceneGrid');
 grid.innerHTML=scenes.map(s=>`<article class="vsm-card" id="scene-card-${s.n}">
  <h3>Scene ${s.n} — ${s.name}</h3><div class="vsm-meta">${s.desc}</div>
  <div class="vsm-preview" id="preview-${s.n}"><div class="vsm-empty">अभी Scene ${s.n} upload नहीं हुआ</div></div>
  <div class="vsm-row"><input id="file-${s.n}" type="file" accept="video/mp4,video/*" hidden><button class="vsm-btn vsm-primary" onclick="document.getElementById('file-${s.n}').click()">⬆️ ${s.n===1?'Upload':'Replace'} Scene ${s.n}</button><button class="vsm-btn vsm-secondary" id="open-${s.n}" style="display:none">▶ Preview</button></div>
  <div class="vsm-status" id="status-${s.n}">Checking…</div><div class="vsm-progress"><span id="progress-${s.n}"></span></div>
  <div class="vsm-small">Fixed storage path: ${esc(pathFor(s.n))}</div>
 </article>`).join('');
 scenes.forEach(s=>document.getElementById(`file-${s.n}`).addEventListener('change',e=>upload(s.n,e.target.files[0])));
}
async function init(){
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 const {data:{session}}=await sb.auth.getSession();
 if(!session){location.href='index.html';return;}
 render();
 await Promise.all(scenes.map(loadScene));
}
async function loadScene(n){
 const status=document.getElementById(`status-${n}`), preview=document.getElementById(`preview-${n}`), open=document.getElementById(`open-${n}`);
 const path=pathFor(n);
 try{
   const {data}=sb.storage.from(BUCKET).getPublicUrl(path);
   const test=await fetch(data.publicUrl,{method:'HEAD',cache:'no-store'});
   if(test.ok){
      const src=urlFor(path);
      preview.innerHTML=`<video controls preload="metadata" src="${src}"></video>`;
      open.style.display='inline-flex'; open.onclick=()=>window.open(src,'_blank');
      status.textContent='✅ Scene ready'; status.className='vsm-status vsm-ok';
   }else{status.textContent='⚪ अभी upload नहीं हुआ';status.className='vsm-status vsm-warn';}
 }catch(e){status.textContent='⚠️ Storage check नहीं हो सका';status.className='vsm-status vsm-warn';}
}
async function upload(n,file){
 if(!file)return;
 if(!file.type.startsWith('video/')){alert('कृपया केवल video file चुनें।');return;}
 const status=document.getElementById(`status-${n}`),bar=document.getElementById(`progress-${n}`);
 status.textContent='⏳ Upload हो रहा है…';status.className='vsm-status vsm-warn';bar.style.width='20%';
 const path=pathFor(n);
 try{
   const {error}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||'video/mp4',upsert:true,cacheControl:'3600'});
   if(error)throw error;
   bar.style.width='100%';
   status.textContent='✅ Scene successfully saved';status.className='vsm-status vsm-ok';
   await loadScene(n);
 }catch(e){console.error(e);bar.style.width='0';status.textContent='❌ Upload failed: '+(e.message||e);status.className='vsm-status vsm-error';}
}
window.addEventListener('DOMContentLoaded',init);
})();
