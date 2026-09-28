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
const sceneVersions={1:[],2:[],3:[],4:[],5:[]};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function prefixFor(n){ return `video-scenes/scene-${n}/`; }
function fileNameFor(file){ return `${Date.now()}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_')}`; }
function publicUrl(path){ return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}?v=${Date.now()}`; }

function render(){
 const grid=document.getElementById('sceneGrid');

 grid.innerHTML=scenes.map(s=>`
 <article class="vsm-card" id="scene-card-${s.n}">
   <div class="vsm-card-head">
     <div>
       <h3>Scene ${s.n} — ${s.name}</h3>
       <div class="vsm-meta">${esc(s.desc)}</div>
     </div>
     ${s.n===1?'<span class="vsm-trial">🧪 CURRENT TRIAL</span>':''}
   </div>

   <div class="vsm-preview" id="preview-${s.n}">
     <div class="vsm-empty">अभी कोई version upload नहीं हुआ</div>
   </div>

   <div class="vsm-row">
     <input id="file-${s.n}" type="file" accept="video/mp4,video/*" multiple hidden>
     <button class="vsm-btn vsm-primary" onclick="document.getElementById('file-${s.n}').click()">
       ⬆️ ${s.n===1?'Upload':'Add'} Scene ${s.n}
     </button>
     <span class="vsm-help">एक साथ कई versions भी चुन सकते हैं</span>
   </div>

   <div class="vsm-status" id="status-${s.n}">Checking…</div>
   <div class="vsm-progress"><span id="progress-${s.n}"></span></div>

   <div class="vsm-versions" id="versions-${s.n}">
     <div class="vsm-small">Versions load हो रहे हैं…</div>
   </div>
 </article>`).join('');

 scenes.forEach(s=>{
   document.getElementById(`file-${s.n}`).addEventListener('change',e=>{
     uploadMany(s.n,Array.from(e.target.files||[]));
     e.target.value='';
   });
 });
}

async function init(){
 if(!window.supabase){ alert('Supabase library load नहीं हुई।'); return; }
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
 const {data:{session}}=await sb.auth.getSession();
 if(!session){location.href='index.html';return;}
 render();
 await Promise.all(scenes.map(loadScene));
}

async function listVersions(n){
 const {data,error}=await sb.storage.from(BUCKET).list(`video-scenes/scene-${n}`,{
   limit:100,offset:0,sortBy:{column:'created_at',order:'desc'}
 });
 if(error) throw error;
 return (data||[]).filter(x=>x.name && !x.name.endsWith('/'));
}

async function loadScene(n){
 const status=document.getElementById(`status-${n}`);
 try{
   const list=await listVersions(n);
   sceneVersions[n]=list;
   const dbActiveName=await dbActive(n);
   if(dbActiveName) localStorage.setItem(`gs-vsm-active-${n}`,dbActiveName);
   renderVersions(n,list);
   if(list.length){
     status.textContent=`✅ ${list.length}/5 version saved`;
     status.className='vsm-status vsm-ok';
   }else{
     status.textContent='⚪ अभी upload नहीं हुआ';
     status.className='vsm-status vsm-warn';
   }
 }catch(e){
   status.textContent='⚠️ Storage check नहीं हो सका';
   status.className='vsm-status vsm-warn';
   console.error(e);
 }
}

function activeKey(n){
 return localStorage.getItem(`gs-vsm-active-${n}`) || '';
}

async function dbActive(n){
 if(!sb) return null;
 try{
   const {data}=await sb.from('video_scene_versions')
     .select('file_name')
     .eq('scene_number',n)
     .eq('is_active',true)
     .maybeSingle();
   return data?.file_name || null;
 }catch(e){ return null; }
}

async function setActive(n,name){
 try{
   const {data:row}=await sb.from('video_scene_versions')
     .select('id')
     .eq('scene_number',n)
     .eq('file_name',name)
     .maybeSingle();

   if(!row) throw new Error('इस version की database entry नहीं मिली।');

   const {error:clearErr}=await sb.from('video_scene_versions')
     .update({is_active:false,updated_at:new Date().toISOString()})
     .eq('scene_number',n);
   if(clearErr) throw clearErr;

   const {error:setErr}=await sb.from('video_scene_versions')
     .update({is_active:true,updated_at:new Date().toISOString()})
     .eq('id',row.id);
   if(setErr) throw setErr;

   localStorage.setItem(`gs-vsm-active-${n}`,name);
   await loadScene(n);
 }catch(e){
   alert('Active version save नहीं हो सका: '+(e.message||e));
 }
}

function renderVersions(n,list){
 const box=document.getElementById(`versions-${n}`);
 const preview=document.getElementById(`preview-${n}`);
 const active=activeKey(n);

 if(!list.length){
   box.innerHTML='<div class="vsm-small">अभी कोई version नहीं है।</div>';
   preview.innerHTML='<div class="vsm-empty">अभी कोई video upload नहीं हुआ</div>';
   return;
 }

 const selected=list.find(x=>x.name===active) || list[0];
 if(!active) localStorage.setItem(`gs-vsm-active-${n}`,selected.name);

 preview.innerHTML=`<video controls preload="metadata" src="${publicUrl(`video-scenes/scene-${n}/${encodeURIComponent(selected.name)}`)}"></video>`;

 box.innerHTML=list.map((f,i)=>{
   const isActive=(f.name===(active||selected.name));
   const path=`video-scenes/scene-${n}/${f.name}`;
   return `<div class="vsm-version ${isActive?'active':''}">
      <div class="vsm-version-info">
        <b>${isActive?'⭐ ACTIVE':'Version '+(i+1)}</b>
        <span>${esc(f.name)}</span>
      </div>
      <div class="vsm-version-actions">
        <button class="vsm-mini" onclick="window.open('${publicUrl(path)}','_blank')">▶ Preview</button>
        ${isActive?'':'<button class="vsm-mini" onclick="setActive('+n+',\''+String(f.name).replace(/'/g,"\\\\'")+'\')">✓ Set Active</button>'}
        <button class="vsm-mini danger" onclick="deleteVersion(${n},'${String(f.name).replace(/'/g,"\\\\'")}')">Delete</button>
      </div>
   </div>`;
 }).join('');
}

async function uploadMany(n,files){
 if(!files.length)return;
 const status=document.getElementById(`status-${n}`);
 const bar=document.getElementById(`progress-${n}`);
 const total=files.length;
 let done=0;

 for(const file of files){
   if(!file.type.startsWith('video/')){
     alert(`${file.name}: केवल video file चुनें।`);
     continue;
   }
   status.textContent=`⏳ ${done+1}/${total} upload हो रहा है…`;
   bar.style.width=Math.max(5,Math.round(done/total*100))+'%';

   try{
     const current=sceneVersions[n]||[];
     if(current.length + (total-done) > 5){
       alert(`Scene ${n} में अधिकतम 5 versions रख सकते हैं। पहले कोई version delete करें।`);
       break;
     }
     const used=new Set(current.map(x=>x.name));
     const path=`video-scenes/scene-${n}/${fileNameFor(file)}`;
     const {error}=await sb.storage.from(BUCKET).upload(path,file,{
       contentType:file.type||'video/mp4',
       upsert:false,
       cacheControl:'3600'
     });
     if(error)throw error;

     const {data:existing}=await sb.from('video_scene_versions')
       .select('version_number')
       .eq('scene_number',n)
       .order('version_number',{ascending:false})
       .limit(1);

     const nextVersion=(existing && existing.length ? existing[0].version_number : 0)+1;
     if(nextVersion>5){
       await sb.storage.from(BUCKET).remove([path]);
       throw new Error('इस scene में अधिकतम 5 versions की सीमा पूरी हो चुकी है।');
     }

     const {error:dbErr}=await sb.from('video_scene_versions').insert({
       scene_number:n,
       version_number:nextVersion,
       file_name:path.split('/').pop(),
       storage_path:path,
       is_active:false
     });
     if(dbErr){
       await sb.storage.from(BUCKET).remove([path]);
       throw dbErr;
     }

     done++;
     bar.style.width=Math.round(done/total*100)+'%';
   }catch(e){
     console.error(e);
     alert(`${file.name} upload failed: ${e.message||e}`);
   }
 }

 status.textContent=`✅ ${done} version saved`;
 status.className='vsm-status vsm-ok';
 await loadScene(n);
}

async function deleteVersion(n,name){
 if(!confirm(`क्या आप यह video version delete करना चाहते हैं?\n\n${name}`))return;
 const path=`video-scenes/scene-${n}/${name}`;
 try{
   const {error}=await sb.storage.from(BUCKET).remove([path]);
   if(error)throw error;
   await sb.from('video_scene_versions').delete().eq('scene_number',n).eq('file_name',name);
   if(activeKey(n)===name) localStorage.removeItem(`gs-vsm-active-${n}`);
   await loadScene(n);
 }catch(e){
   alert('Delete failed: '+(e.message||e));
 }
}

window.setActive=setActive;
window.deleteVersion=deleteVersion;

window.addEventListener('DOMContentLoaded',init);
})();
