
/* Ganit Setu - Content Planning Facebook Connector
 * Facebook connection is intentionally scoped to Content Planning.
 * It does not modify Social Media Manager.
 */
(function () {
  'use strict';

  const statusEl = () => document.getElementById('cpFacebookConnectionStatus');
  const pageEl = () => document.getElementById('cpFacebookPageName');
  const msgEl = () => document.getElementById('cpFacebookMessage');
  const btnEl = () => document.getElementById('cpConnectFacebookBtn');

  function render() {
    const connected = localStorage.getItem('ganitSetuFacebookConnected') === 'true';
    const page = localStorage.getItem('ganitSetuFacebookPageName') || '';
    if (statusEl()) statusEl().textContent = connected ? 'Connected' : 'Not connected';
    if (pageEl()) pageEl().textContent = connected && page ? `Page: ${page}` : '';
    if (btnEl()) btnEl().textContent = connected ? 'Reconnect Facebook Page' : 'Connect Facebook Page';
  }

  async function connect() {
    if (msgEl()) msgEl().textContent = 'Opening Facebook connection…';
    try {
      // Reuse the existing callback/Edge Function URL if the supplied package defines it.
      const supabaseUrl =
        window.SUPABASE_URL ||
        window.supabaseUrl ||
        (window.GANIT_SETU_CONFIG && window.GANIT_SETU_CONFIG.supabaseUrl);

      const projectRef = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//,'').split('.')[0] : '';
      const fnUrl = projectRef
        ? `https://${projectRef}.supabase.co/functions/v1/facebook-oauth`
        : '';

      if (fnUrl) {
        const r = await fetch(fnUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          if (data.auth_url) {
            window.location.href = data.auth_url;
            return;
          }
        }
      }

      // Fallback: use an existing global OAuth starter, if the package provides one.
      if (typeof window.startFacebookOAuth === 'function') {
        window.startFacebookOAuth({ source: 'content-planning' });
        return;
      }

      if (msgEl()) msgEl().textContent =
        'Facebook OAuth function/configuration is not available yet. Deploy the facebook-oauth Edge Function and set its secrets first.';
    } catch (e) {
      console.error(e);
      if (msgEl()) msgEl().textContent = 'Facebook connection could not be started.';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();
    const b = btnEl();
    if (b) b.addEventListener('click', connect);
  });

  window.addEventListener('message', function (event) {
    if (!event || !event.data) return;
    if (event.data.type === 'GANIT_SETU_FACEBOOK_CONNECTED') {
      localStorage.setItem('ganitSetuFacebookConnected', 'true');
      if (event.data.pageId) localStorage.setItem('ganitSetuFacebookPageId', event.data.pageId);
      if (event.data.pageName) localStorage.setItem('ganitSetuFacebookPageName', event.data.pageName);
      render();
      if (msgEl()) msgEl().textContent = 'Facebook Page connected successfully.';
    }
  });
})();
