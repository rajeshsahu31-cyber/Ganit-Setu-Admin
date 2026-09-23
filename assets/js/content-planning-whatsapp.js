/* Ganit Setu — WhatsApp Business Connector
   Frontend connector for the Content Day Planning panel.
   The Meta Embedded Signup / Cloud API flow is handled by:
   /functions/v1/whatsapp-connect
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/whatsapp-connect';
  const TABLE = 'social_accounts';
  const PUBLISHABLE_KEY = 'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  const $=id=>document.getElementById(id);
  const client=()=>window.supabaseClient||null;

  function status(t,c=''){const e=$('cpWhatsAppConnectionStatus');if(e){e.textContent=t;e.className='cp-connection-status '+c;}}
  function msg(t,c='info'){const e=$('cpWhatsAppMessage');if(e){e.textContent=t||'';e.className='cp-social-message '+c;}}
  function platform(ok,name=''){
    if($('cpWhatsAppPlatformText'))$('cpWhatsAppPlatformText').textContent=ok?('Connected • '+name):'Ready for connection';
    if($('cpWhatsAppPlatformState'))$('cpWhatsAppPlatformState').textContent=ok?'ACTIVE':'READY';
    const card=document.querySelector('.platform-card.whatsapp');if(card)card.classList.toggle('active',ok);
  }
  function busy(v){const b=$('cpConnectWhatsAppBtn');if(b){b.disabled=v;b.textContent=v?'WhatsApp जोड़ रहा है…':'Connect WhatsApp';}}

  async function loadExisting(){
    const c=client();if(!c)return;
    try{
      const {data,error}=await c.from(TABLE).select('account_id,account_name,status,metadata')
        .eq('platform','whatsapp').eq('status','connected').order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(error||!data){status('Not connected');platform(false);return false;}
      const m=data.metadata&&typeof data.metadata==='object'?data.metadata:{};
      const name=m.display_name||m.phone_number||data.account_name||'WhatsApp Business';
      status('✅ Connected','connected');$('cpWhatsAppAccountName').textContent=name+(data.account_id?' • Account ID: '+data.account_id:'');
      const b=$('cpConnectWhatsAppBtn');if(b)b.textContent='🔄 Refresh WhatsApp';
      msg('WhatsApp Business पहले से connected है।','success');platform(true,name);return true;
    }catch(e){console.warn(e);return false;}
  }

  async function connect(){
    const b=$('cpConnectWhatsAppBtn');if(b?.disabled)return;
    busy(true);status('WhatsApp connect हो रहा है…');msg('Meta WhatsApp Business connection शुरू किया जा रहा है…');
    try{
      const c=client();const {data}=await c.auth.getSession();const token=data?.session?.access_token;
      if(!token)throw new Error('Admin Supabase session नहीं मिली। कृपया Admin Panel में फिर login करें।');
      const r=await fetch(FUNCTION_URL,{method:'POST',headers:{
        'Content-Type':'application/json','apikey':PUBLISHABLE_KEY,'Authorization':'Bearer '+token
      },body:JSON.stringify({action:'authorize'})});
      const out=await r.json().catch(()=>({}));
      if(!r.ok||!out.success)throw new Error(out.error||out.message||`WhatsApp connection failed (${r.status})`);
      if(out.url){location.href=out.url;return;}
      const w=out.whatsapp||{};
      status('✅ Connected','connected');$('cpWhatsAppAccountName').textContent=(w.display_name||w.phone_number||'WhatsApp Business')+(w.id?' • ID: '+w.id:'');
      msg('WhatsApp Business सफलतापूर्वक connected है।','success');platform(true,w.display_name||'WhatsApp Business');
    }catch(e){console.error(e);status('Not connected','error');msg(e.message||'WhatsApp connection failed','error');}
    finally{busy(false);}
  }

  function boot(){const b=$('cpConnectWhatsAppBtn');if(!b)return;b.addEventListener('click',connect);loadExisting();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.GanitSetuWhatsAppConnector={connect,loadExisting};
})();
