// GANIT SETU - Master Prompt Editor
(function(){
  'use strict';
  const TABLE = 'content_prompt_configurations';
  const ROW_ID = 1;
  const $ = id => document.getElementById(id);

  function setStatus(text, ok){
    const el = $('promptStatus');
    if(!el) return;
    el.textContent = text;
    el.style.background = ok ? '#ecfdf5' : '#f1f5f9';
    el.style.color = ok ? '#166534' : '';
  }
  function showMessage(text, type){
    const el = $('saveMessage');
    if(!el) return;
    el.hidden = false;
    el.className = 'save-message ' + type;
    el.textContent = text;
  }
  function updateCount(){
    const n = ($('masterPromptText')?.value || '').length;
    $('charCount').textContent = n.toLocaleString('en-IN') + ' characters';
  }
  function formatDate(v){
    if(!v) return '—';
    const d = new Date(v);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('hi-IN',{dateStyle:'medium',timeStyle:'short'});
  }

  async function ensureSession(){
    const {data,error} = await window.supabaseClient.auth.getSession();
    if(error || !data?.session){
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function loadPrompt(){
    setStatus('लोड हो रहा है...', false);
    $('saveMessage').hidden = true;
    const {data,error} = await window.supabaseClient
      .from(TABLE)
      .select('id,prompt_name,prompt_text,is_active,updated_at')
      .eq('id', ROW_ID)
      .maybeSingle();
    if(error) throw error;
    if(!data){
      throw new Error('Master Prompt row नहीं मिली।');
    }
    $('promptName').textContent = data.prompt_name || 'Master Prompt';
    $('promptUpdated').textContent = formatDate(data.updated_at);
    $('promptActive').textContent = data.is_active ? 'Yes' : 'No';
    $('masterPromptText').value = data.prompt_text || '';
    updateCount();
    setStatus('Loaded', true);
  }

  async function savePrompt(){
    const btn = $('savePromptBtn');
    const prompt = $('masterPromptText').value.trim();
    if(!prompt){
      showMessage('Master Prompt खाली नहीं हो सकता।', 'error');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus('Saving...', false);
    $('saveMessage').hidden = true;
    try{
      const {data,error} = await window.supabaseClient
        .from(TABLE)
        .update({prompt_text: prompt, is_active: true, updated_at: new Date().toISOString()})
        .eq('id', ROW_ID)
        .select('id,prompt_name,prompt_text,is_active,updated_at')
        .single();
      if(error) throw error;
      $('promptName').textContent = data.prompt_name || 'Master Prompt';
      $('promptUpdated').textContent = formatDate(data.updated_at);
      $('promptActive').textContent = data.is_active ? 'Yes' : 'No';
      $('masterPromptText').value = data.prompt_text || prompt;
      updateCount();
      setStatus('Saved', true);
      showMessage('✅ Master Prompt सफलतापूर्वक Save हो गया।', 'success');
    }catch(error){
      console.error('Master Prompt save error:', error);
      setStatus('Save failed', false);
      showMessage('❌ Save नहीं हुआ: ' + (error.message || 'Unknown error'), 'error');
    }finally{
      btn.disabled = false;
      btn.textContent = '💾 Save Master Prompt';
    }
  }

  document.addEventListener('DOMContentLoaded', async function(){
    $('masterPromptText').addEventListener('input', updateCount);
    $('reloadPromptBtn').addEventListener('click', async function(){
      try{ await loadPrompt(); }catch(e){ console.error(e); showMessage('❌ Prompt load नहीं हुआ: '+(e.message||'Unknown error'),'error'); setStatus('Load failed',false); }
    });
    $('savePromptBtn').addEventListener('click', savePrompt);
    try{
      if(await ensureSession()) await loadPrompt();
    }catch(error){
      console.error('Master Prompt load error:', error);
      setStatus('Load failed', false);
      showMessage('❌ Master Prompt load नहीं हुआ: ' + (error.message || 'Unknown error'), 'error');
    }
  });
})();
