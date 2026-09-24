/* Ganit Setu — WhatsApp Channel Connector
   Channel: Ganit Setu
   Official Channel API direct publishing is not used.
   This connector prepares the post and opens the Channel for the final Send.
*/
(() => {
  'use strict';
  const CHANNEL_URL='https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D';
  const STORAGE_KEY='ganitSetuWhatsAppChannelUrl';
  const $=id=>document.getElementById(id);
  function status(t,c=''){const e=$('cpWhatsAppConnectionStatus');if(e){e.textContent=t;e.className='cp-connection-status '+c;}}
  function msg(t,c='info'){const e=$('cpWhatsAppMessage');if(e){e.textContent=t||'';e.className='cp-social-message '+c;}}
  function platform(ok,name=''){const text=$('cpWhatsAppPlatformText'),state=$('cpWhatsAppPlatformState');if(text)text.textContent=ok?'Connected • '+name:'Ready for channel link';if(state)state.textContent='READY';const card=document.querySelector('.platform-card.whatsapp');if(card)card.classList.toggle('active',ok);}
  function getChannelUrl(){return localStorage.getItem(STORAGE_KEY)||CHANNEL_URL;}
  async function copyText(text){try{await navigator.clipboard.writeText(text);return true;}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok;}}
  function setConnectedUI(){status('✅ Channel configured','connected');const a=$('cpWhatsAppAccountName');if(a)a.textContent='Ganit Setu • WhatsApp Channel';const b=$('cpConnectWhatsAppBtn');if(b)b.textContent='📲 Open WhatsApp Channel';msg('Ganit Setu WhatsApp Channel तैयार है।','success');platform(true,'Ganit Setu Channel');}
  function openChannel(){window.open(getChannelUrl(),'_blank','noopener,noreferrer');}
  function buildCaptionFromCard(card){const id=card.querySelector('.q-title')?.innerText?.trim()||'';const q=card.querySelector('.question-text')?.innerText?.trim()||'';const opts=[...card.querySelectorAll('.options .option')].map(x=>x.innerText.trim()).filter(Boolean).join('\n');const ch=card.querySelector('.chapter-badge')?.innerText?.trim()||'';return ['📚 Ganit Setu — आज का गणित प्रश्न',id,ch,'',q,opts,'','🤔 आपका उत्तर क्या है? Comment करके बताइए!','','#GanitSetu #Maths #MPBoard #Class9 #Class10 #आजकागणितप्रश्न'].filter(Boolean).join('\n');}
  async function prepareFromCard(btn){const card=btn.closest('.question-card');if(!card)return;const copied=await copyText(buildCaptionFromCard(card));const old=btn.textContent;btn.textContent=copied?'✅ Caption Copied • Open Channel':'📲 Open Channel';btn.classList.add('whatsapp-ready');msg(copied?'Caption clipboard में है। अब WhatsApp Channel खुलेगा—image चुनकर caption paste करें और Send दबाएँ।':'WhatsApp Channel खोलें और caption manually paste करें.',copied?'success':'info');openChannel();setTimeout(()=>{btn.textContent=old;},3000);}
  function injectQuestionButtons(){document.querySelectorAll('.question-card').forEach(card=>{if(card.querySelector('.publish-whatsapp-channel'))return;const actions=card.querySelector('.prompt-actions');if(!actions)return;const btn=document.createElement('button');btn.type='button';btn.className='publish-whatsapp-channel';btn.textContent='📲 WhatsApp Channel';btn.title='Caption copy करके Ganit Setu WhatsApp Channel खोलें';btn.addEventListener('click',()=>prepareFromCard(btn));actions.appendChild(btn);});}
  async function connect(){localStorage.setItem(STORAGE_KEY,CHANNEL_URL);setConnectedUI();msg('Ganit Setu WhatsApp Channel configured है।','success');}
  async function loadExisting(){setConnectedUI();injectQuestionButtons();return true;}
  function boot(){const b=$('cpConnectWhatsAppBtn');if(b)b.addEventListener('click',connect);loadExisting();const observer=new MutationObserver(()=>injectQuestionButtons());observer.observe(document.body,{childList:true,subtree:true});const style=document.createElement('style');style.textContent='.publish-whatsapp-channel{background:#128c7e!important;color:#fff!important;border:0;border-radius:8px;padding:8px 11px;cursor:pointer;font-weight:600}.publish-whatsapp-channel:hover{filter:brightness(.95)}.publish-whatsapp-channel.whatsapp-ready{background:#0b7d3e!important}';document.head.appendChild(style);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.GanitSetuWhatsAppConnector={connect,loadExisting,openChannel,channelUrl:getChannelUrl};
})();
