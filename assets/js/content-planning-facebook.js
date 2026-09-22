/* Ganit Setu — Facebook Page Connector v4
   Uses the existing Supabase client when available.
   IMPORTANT: does NOT create another GoTrueClient.
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/facebook-oauth';
  const REDIRECT_URI = new URL('facebook-oauth-callback.html', window.location.href).href;

  let bound = false;
  let oauthPopup = null;

  function getClient() {
    if (window.supabaseClient && typeof window.supabaseClient.auth?.getSession === 'function') {
      return window.supabaseClient;
    }
    if (window.gsSupabaseClient && typeof window.gsSupabaseClient.auth?.getSession === 'function') {
      return window.gsSupabaseClient;
    }
    return null;
  }

  function findButton() {
    return document.getElementById('connectFacebookBtn') ||
           document.querySelector('[data-action="connect-facebook"]') ||
           [...document.querySelectorAll('button, a')].find(el =>
             /connect facebook page/i.test((el.textContent || '').trim())
           );
  }

  function setButtonBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.dataset.gsFbBusy = busy ? '1' : '0';
    if (busy) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Facebook जोड़ रहा है…';
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }

  function showMessage(message, type = 'info') {
    const box =
      document.getElementById('facebookStatus') ||
      document.getElementById('fbStatus') ||
      document.querySelector('[data-facebook-status]');
    if (box) {
      box.textContent = message;
      box.dataset.type = type;
      box.hidden = false;
    } else {
      alert(message);
    }
  }

  async function getSession() {
    const client = getClient();
    if (!client) {
      throw new Error('Supabase client नहीं मिला। Content Planning में existing login session उपलब्ध नहीं है।');
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('Admin login session नहीं मिली। पहले Admin Panel में login करें।');
    return { client, session: data.session };
  }

  async function startOAuth() {
    const btn = findButton();
    if (btn?.dataset.gsFbBusy === '1') return;

    try {
      setButtonBusy(btn, true);

      const { session } = await getSession();

      const url = new URL(FUNCTION_URL);
      url.searchParams.set('action', 'authorize');
      url.searchParams.set('redirect_uri', REDIRECT_URI);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': session.access_token
        }
      });

      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }

      if (!res.ok || !data.url) {
        throw new Error(data.error || data.message || ('Facebook OAuth authorize failed (' + res.status + ')'));
      }

      oauthPopup = window.open(
        data.url,
        'GanitSetuFacebookOAuth',
        'width=700,height=800,left=100,top=50,resizable=yes,scrollbars=yes'
      );

      if (!oauthPopup) {
        showMessage('Popup block हो गया। Facebook authorization खोलने के लिए इस button को फिर दबाएँ और browser में Pop-up Allow करें।', 'warning');
        // Do not navigate away automatically; this keeps Content Planning intact.
        return;
      }

      showMessage('Facebook authorization window खुल रही है…', 'info');
    } catch (e) {
      console.error('[Ganit Setu Facebook] startOAuth:', e);
      showMessage(e.message || 'Facebook connection शुरू नहीं हो सका।', 'error');
    } finally {
      setButtonBusy(btn, false);
    }
  }

  async function exchangeCode(message) {
    try {
      const { session } = await getSession();

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': session.access_token
        },
        body: JSON.stringify({
          action: 'exchange',
          code: message.code,
          state: message.state,
          redirect_uri: REDIRECT_URI
        })
      });

      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }

      if (!res.ok) {
        throw new Error(data.error || data.message || ('Facebook token exchange failed (' + res.status + ')'));
      }

      const pages = Array.isArray(data.pages) ? data.pages : [];

      if (!pages.length) {
        showMessage('Facebook login हो गया, लेकिन कोई Facebook Page उपलब्ध नहीं मिला।', 'warning');
        return;
      }

      renderPages(pages);
      showMessage(pages.length + ' Facebook Page connect हो गए।', 'success');
    } catch (e) {
      console.error('[Ganit Setu Facebook] exchange:', e);
      showMessage(e.message || 'Facebook Page connect नहीं हो सका।', 'error');
    }
  }

  function renderPages(pages) {
    const container =
      document.getElementById('facebookPages') ||
      document.getElementById('connectedFacebookPages') ||
      document.querySelector('[data-facebook-pages]');

    if (!container) {
      console.log('[Ganit Setu Facebook] Connected pages:', pages);
      return;
    }

    container.innerHTML = pages.map(p => {
      const name = String(p.name || p.account_name || 'Facebook Page');
      const id = String(p.id || p.account_id || '');
      return `<div class="facebook-page-item">
        <strong>${escapeHtml(name)}</strong>
        <small>Page ID: ${escapeHtml(id)}</small>
        <span class="facebook-page-status">Connected</span>
      </div>`;
    }).join('');
    container.hidden = false;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
    }[c]));
  }

  function bind() {
    if (bound) return;
    const btn = findButton();
    if (!btn) return false;

    bound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startOAuth();
    }, true);

    console.log('[Ganit Setu Facebook] Connector v4 ready.');
    return true;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== 'GS_FACEBOOK_OAUTH_CALLBACK') return;

    if (data.error) {
      showMessage(data.errorDescription || data.error || 'Facebook authorization cancelled/failed.', 'error');
      return;
    }
    if (data.code && data.state) exchangeCode(data);
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (!bind()) {
      const observer = new MutationObserver(() => {
        if (bind()) observer.disconnect();
      });
      observer.observe(document.documentElement, {childList:true, subtree:true});
      setTimeout(() => observer.disconnect(), 10000);
    }
  });

  window.GanitSetuFacebookConnector = { startOAuth, bind };
})();
