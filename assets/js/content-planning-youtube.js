/* Ganit Setu — YouTube Connector
   Frontend connector for the Content Day Planning panel.
   OAuth/token exchange is handled by the Supabase Edge Function:
   /functions/v1/youtube-connect
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/youtube-connect';
  const TABLE = 'social_accounts';
  const PUBLISHABLE_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  const $ = id => document.getElementById(id);
  const client = () => window.supabaseClient || null;

  function status(text, cls='') {
    const el=$('cpYouTubeConnectionStatus'); if(!el)return;
    el.textContent=text; el.className='cp-connection-status '+cls;
  }
  function msg(text, cls='info') {
    const el=$('cpYouTubeMessage'); if(!el)return;
    el.textContent=text||''; el.className='cp-social-message '+cls;
  }
  function busy(v) {
    const b=$('cpConnectYouTubeBtn'); if(!b)return;
    b.disabled=v; b.textContent=v?'YouTube जोड़ रहा है…':'Connect YouTube';
  }
  function platform(connected, name='') {
    if($('cpYouTubePlatformText')) $('cpYouTubePlatformText').textContent=connected?('Connected • '+name):'Ready for connection';
    if($('cpYouTubePlatformState')) $('cpYouTubePlatformState').textContent=connected?'ACTIVE':'READY';
    const card=document.querySelector('.platform-card.youtube'); if(card) card.classList.toggle('active',connected);
  }

  async function loadExisting() {
    const c=client(); if(!c)return;
    try {
      const {data,error}=await c.from(TABLE).select('account_id,account_name,status,metadata')
        .eq('platform','youtube').eq('status','connected').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(error||!data){status('Not connected');platform(false);return false;}
      const m=data.metadata&&typeof data.metadata==='object'?data.metadata:{};
      const name=m.channel_title||data.account_name||'YouTube Channel';
      status('✅ Connected','connected');
      $('cpYouTubeAccountName').textContent=name+(data.account_id?' • Channel ID: '+data.account_id:'');
      const b=$('cpConnectYouTubeBtn'); if(b)b.textContent='🔄 Refresh YouTube';
      msg('YouTube channel पहले से connected है।','success'); platform(true,name); return true;
    } catch(e){console.warn(e);return false;}
  }

  async function connect() {
    const b=$('cpConnectYouTubeBtn'); if(b?.disabled)return;
    busy(true); status('YouTube connect हो रहा है…'); msg('Google/YouTube authorization शुरू किया जा रहा है…');
    try {
      const c=client(); const {data}=await c.auth.getSession(); const token=data?.session?.access_token;
      if(!token) throw new Error('Admin Supabase session नहीं मिली। कृपया Admin Panel में फिर login करें।');
      const r=await fetch(FUNCTION_URL,{method:'POST',headers:{
        'Content-Type':'application/json','apikey':PUBLISHABLE_KEY,'Authorization':'Bearer '+token
      },body:JSON.stringify({action:'authorize'})});
      const out=await r.json().catch(()=>({}));
      if(!r.ok||!out.success) throw new Error(out.error||out.message||`YouTube connection failed (${r.status})`);
      if(out.url){ location.href=out.url; return; }
      const y=out.youtube||{};
      status('✅ Connected','connected'); $('cpYouTubeAccountName').textContent=(y.title||'YouTube Channel')+(y.id?' • Channel ID: '+y.id:'');
      msg('YouTube channel सफलतापूर्वक connected है।','success'); platform(true,y.title||'YouTube');
    } catch(e){console.error(e);status('Not connected','error');msg(e.message||'YouTube connection failed','error');}
    finally{busy(false);}
  }

  function boot(){const b=$('cpConnectYouTubeBtn');if(!b)return;b.addEventListener('click',connect);loadExisting();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.GanitSetuYouTubeConnector={connect,loadExisting};
})();
