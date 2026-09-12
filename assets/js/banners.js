const SUPABASE_URL = "https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = "home-banners";
const TABLE = "home_banners";

function esc(v){
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function showMessage(text, type='ok'){
  const el=document.getElementById('message');
  el.textContent=text;
  el.className='message '+type;
}

async function loadBanners(){
  const box=document.getElementById('bannerList');
  const count=document.getElementById('bannerCount');
  box.innerHTML='<p class="muted">लोड हो रहा है...</p>';

  const {data,error}=await supabaseClient
    .from(TABLE)
    .select('id,image_url,link_url,display_order,is_active,created_at')
    .order('display_order',{ascending:true})
    .order('created_at',{ascending:false});

  if(error){
    box.innerHTML='<p class="muted">Banners लोड नहीं हो सके: '+esc(error.message)+'</p>';
    count.textContent='लोड नहीं हुआ';
    return;
  }

  count.textContent=(data?.length || 0)+' banner';
  if(!data?.length){
    box.innerHTML='<p class="muted">अभी कोई banner नहीं है। ऊपर से पहला banner upload करें।</p>';
    return;
  }

  box.innerHTML=data.map(b=>`
    <div class="banner-item">
      <img src="${esc(b.image_url)}" alt="">
      <div class="banner-info">
        <b>Order: ${Number(b.display_order)||0} · ${b.is_active ? 'Active' : 'Inactive'}</b>
        <small>${b.link_url ? 'Link: '+esc(b.link_url) : 'कोई link नहीं'}</small>
        <small>${b.created_at ? new Date(b.created_at).toLocaleString('hi-IN') : ''}</small>
      </div>
      <div class="banner-actions">
        <button class="btn ${b.is_active?'btn-light':'btn-primary'}" onclick="toggleBanner('${b.id}',${!b.is_active})">
          ${b.is_active?'Deactivate':'Activate'}
        </button>
        <button class="btn btn-danger" onclick="deleteBanner('${b.id}','${esc(b.image_url)}')">🗑️ Delete</button>
      </div>
    </div>
  `).join('');
}

async function uploadBanner(file){
  const ext=(file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path=`${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const {error:uploadError}=await supabaseClient.storage.from(BUCKET).upload(path,file,{
    cacheControl:'3600',
    upsert:false,
    contentType:file.type
  });
  if(uploadError) throw uploadError;

  const {data:urlData}=supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  if(!urlData?.publicUrl) throw new Error('Public image URL नहीं मिला।');

  return {path,url:urlData.publicUrl};
}

document.getElementById('bannerForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const btn=document.getElementById('saveBtn');
  const file=document.getElementById('bannerImage').files[0];
  if(!file){showMessage('कृपया banner image चुनें।','err');return;}

  btn.disabled=true;
  btn.textContent='⏳ Upload हो रहा है...';

  let uploadedPath=null;
  try{
    const uploaded=await uploadBanner(file);
    uploadedPath=uploaded.path;

    const payload={
      image_url:uploaded.url,
      link_url:document.getElementById('linkUrl').value.trim() || null,
      display_order:Number(document.getElementById('displayOrder').value)||0,
      is_active:document.getElementById('isActive').checked
    };

    const {error}=await supabaseClient.from(TABLE).insert(payload);
    if(error){
      await supabaseClient.storage.from(BUCKET).remove([uploadedPath]);
      throw error;
    }

    showMessage('Banner सफलतापूर्वक upload हो गया।','ok');
    e.target.reset();
    document.getElementById('displayOrder').value=1;
    document.getElementById('isActive').checked=true;
    await loadBanners();
  }catch(err){
    console.error(err);
    showMessage('Banner save नहीं हुआ: '+(err.message||'Unknown error'),'err');
  }finally{
    btn.disabled=false;
    btn.textContent='🖼️ Banner Upload करें';
  }
});

async function toggleBanner(id,active){
  const {error}=await supabaseClient.from(TABLE).update({is_active:active}).eq('id',id);
  if(error){showMessage('Status बदल नहीं सका: '+error.message,'err');return;}
  await loadBanners();
}

async function deleteBanner(id,imageUrl){
  if(!confirm('क्या आप यह banner delete करना चाहते हैं?')) return;

  const {error}=await supabaseClient.from(TABLE).delete().eq('id',id);
  if(error){showMessage('Banner delete नहीं हुआ: '+error.message,'err');return;}

  // Public URL से storage path निकालने की कोशिश; table delete सफल हो तो
  // image orphan हो सकती है, इसलिए नीचे best-effort cleanup है.
  try{
    const marker=`/storage/v1/object/public/${BUCKET}/`;
    const idx=imageUrl.indexOf(marker);
    if(idx>=0){
      const path=decodeURIComponent(imageUrl.slice(idx+marker.length));
      await supabaseClient.storage.from(BUCKET).remove([path]);
    }
  }catch(e){ console.warn('Storage cleanup failed',e); }

  showMessage('Banner delete हो गया।','ok');
  await loadBanners();
}

document.getElementById('refreshBtn').addEventListener('click',loadBanners);
document.addEventListener('DOMContentLoaded',loadBanners);
