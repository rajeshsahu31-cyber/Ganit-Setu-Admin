/* Ganit Setu — Facebook Page Connector v5
   Same-tab Facebook Login for Business.
   No popup window.
   Uses the existing Supabase client when available.
*/
(() => {
  'use strict';

  const SUPABASE_URL = 'https://cbgojvnbkosdehvwerth.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/facebook-oauth';

  const REDIRECT_URI =
    new URL('facebook-oauth-callback.html', window.location.href).href;

  let bound = false;

  function getClient() {
    if (
      window.supabaseClient &&
      typeof window.supabaseClient.auth?.getSession === 'function'
    ) {
      return window.supabaseClient;
    }

    if (
      window.gsSupabaseClient &&
      typeof window.gsSupabaseClient.auth?.getSession === 'function'
    ) {
      return window.gsSupabaseClient;
    }

    return null;
  }

  function findButton() {
    return (
      document.getElementById('connectFacebookBtn') ||
      document.querySelector('[data-action="connect-facebook"]') ||
      [...document.querySelectorAll('button, a')].find(el =>
        /connect facebook page/i.test((el.textContent || '').trim())
      )
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
      throw new Error(
        'Supabase client नहीं मिला। Content Planning में existing login session उपलब्ध नहीं है।'
      );
    }

    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    if (!data?.session) {
      throw new Error(
        'Admin login session नहीं मिली। पहले Admin Panel में login करें।'
      );
    }

    return {
      client,
      session: data.session
    };
  }

  // --------------------------------------------------
  // START FACEBOOK OAUTH
  // SAME TAB - NO POPUP
  // --------------------------------------------------

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
          Authorization: 'Bearer ' + session.access_token,
          apikey: session.access_token
        }
      });

      const raw = await res.text();

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        data = {};
      }

      if (!res.ok || !data.url) {
        throw new Error(
          data.error ||
          data.message ||
          ('Facebook OAuth authorize failed (' + res.status + ')')
        );
      }

      /*
       * IMPORTANT:
       * Do NOT use window.open().
       * Facebook opens in the SAME browser tab.
       */
      window.location.href = data.url;

    } catch (e) {
      console.error(
        '[Ganit Setu Facebook] startOAuth:',
        e
      );

      showMessage(
        e.message ||
          'Facebook connection शुरू नहीं हो सका।',
        'error'
      );

      setButtonBusy(btn, false);
    }
  }

  // --------------------------------------------------
  // EXCHANGE FACEBOOK CODE
  // --------------------------------------------------

  async function exchangeCode(code, state) {
    try {
      showMessage(
        'Facebook authorization सफल हुआ। Page connection पूरा किया जा रहा है…',
        'info'
      );

      const { session } = await getSession();

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
          apikey: session.access_token
        },

        body: JSON.stringify({
          action: 'exchange',
          code: code,
          state: state,
          redirect_uri: REDIRECT_URI
        })
      });

      const raw = await res.text();

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
          data.message ||
          ('Facebook token exchange failed (' + res.status + ')')
        );
      }

      const pages = Array.isArray(data.pages)
        ? data.pages
        : [];

      if (!pages.length) {
        showMessage(
          'Facebook login हो गया, लेकिन कोई Facebook Page उपलब्ध नहीं मिला।',
          'warning'
        );
        return;
      }

      renderPages(pages);

      showMessage(
        pages.length +
          ' Facebook Page connect हो गया।',
        'success'
      );

      /*
       * URL से OAuth parameters हटाएँ।
       * इससे code/state browser history में आगे दिखाई नहीं देंगे।
       */
      const cleanUrl =
        window.location.origin +
        window.location.pathname;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );

    } catch (e) {
      console.error(
        '[Ganit Setu Facebook] exchange:',
        e
      );

      showMessage(
        e.message ||
          'Facebook Page connect नहीं हो सका।',
        'error'
      );
    }
  }

  // --------------------------------------------------
  // CHECK CALLBACK PARAMETERS
  // --------------------------------------------------

  async function handleOAuthCallback() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const code =
      params.get('facebook_code');

    const state =
      params.get('facebook_state');

    const error =
      params.get('facebook_error');

    const errorDescription =
      params.get('facebook_error_description');

    if (error) {
      showMessage(
        errorDescription ||
          error ||
          'Facebook authorization failed.',
        'error'
      );

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      return;
    }

    if (!code || !state) {
      return;
    }

    await exchangeCode(
      code,
      state
    );
  }

  // --------------------------------------------------
  // RENDER CONNECTED PAGES
  // --------------------------------------------------

  function renderPages(pages) {
    const container =
      document.getElementById('facebookPages') ||
      document.getElementById('connectedFacebookPages') ||
      document.querySelector('[data-facebook-pages]');

    if (!container) {
      console.log(
        '[Ganit Setu Facebook] Connected pages:',
        pages
      );
      return;
    }

    container.innerHTML = pages
      .map(p => {
        const name =
          String(
            p.name ||
            p.account_name ||
            'Facebook Page'
          );

        const id =
          String(
            p.id ||
            p.page_id ||
            p.account_id ||
            ''
          );

        return `
          <div class="facebook-page-item">
            <strong>${escapeHtml(name)}</strong>
            <small>Page ID: ${escapeHtml(id)}</small>
            <span class="facebook-page-status">
              Connected
            </span>
          </div>
        `;
      })
      .join('');

    container.hidden = false;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );
  }

  // --------------------------------------------------
  // BUTTON BIND
  // --------------------------------------------------

  function bind() {
    if (bound) return true;

    const btn = findButton();

    if (!btn) return false;

    bound = true;

    btn.addEventListener(
      'click',
      e => {
        e.preventDefault();
        e.stopPropagation();

        startOAuth();
      },
      true
    );

    console.log(
      '[Ganit Setu Facebook] Connector v5 ready - SAME TAB'
    );

    return true;
  }

  // --------------------------------------------------
  // BOOT
  // --------------------------------------------------

  async function boot() {

    /*
     * पहले OAuth return check करें।
     */
    await handleOAuthCallback();

    /*
     * फिर Facebook Connect button bind करें।
     */
    if (bind()) return;

    const observer =
      new MutationObserver(() => {
        if (bind()) {
          observer.disconnect();
        }
      });

    observer.observe(
      document.documentElement,
      {
        childList: true,
        subtree: true
      }
    );

    setTimeout(
      () => observer.disconnect(),
      15000
    );
  }

  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      boot,
      { once: true }
    );
  } else {
    boot();
  }

  window.GanitSetuFacebookConnector = {
    startOAuth,
    bind,
    handleOAuthCallback
  };

})();
