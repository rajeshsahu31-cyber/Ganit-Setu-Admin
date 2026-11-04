const ids={youtube:"youtube_url",facebook:"facebook_url",whatsapp:"whatsapp_url",instagram:"instagram_url"};
function normalizeUrl(v){v=String(v||"").trim();return v&&!/^https?:\/\//i.test(v)?"https://"+v:v;}
async function loadContactSettings(){
 try{
  const {data,error}=await supabaseClient.from("contact_settings").select("youtube_url,facebook_url,whatsapp_url,instagram_url").eq("id",1).maybeSingle();
  if(error) throw error;
  if(data) Object.keys(ids).forEach(k=>document.getElementById(k).value=data[ids[k]]||"");
  document.getElementById("status").textContent="सेटिंग्स लोड हो गईं";
 }catch(e){console.error(e);document.getElementById("status").textContent="लोड नहीं हुआ: "+(e.message||"Unknown error");}
}
async function saveContactSettings(){
 const btn=document.getElementById("saveBtn"), status=document.getElementById("status");
 btn.disabled=true; status.textContent="सेव हो रहा है...";
 const row={id:1,updated_at:new Date().toISOString()};
 Object.keys(ids).forEach(k=>row[ids[k]]=normalizeUrl(document.getElementById(k).value));
 try{
  const {error}=await supabaseClient.from("contact_settings").upsert(row,{onConflict:"id"});
  if(error) throw error;
  status.textContent="✅ Social links सफलतापूर्वक सेव हो गए।";
 }catch(e){console.error(e);status.textContent="❌ सेव नहीं हुआ: "+(e.message||"Unknown error");}
 finally{btn.disabled=false;}
}
document.addEventListener("DOMContentLoaded",()=>{loadContactSettings();document.getElementById("saveBtn").addEventListener("click",saveContactSettings);});
