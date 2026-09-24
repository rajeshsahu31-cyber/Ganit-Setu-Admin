/* Ganit Setu — Instagram Connector
   Uses the already-connected Facebook Page and the deployed
   instagram-connect Supabase Edge Function.
*/
(() => {
  'use strict';

  const SUPABASE_URL =
    'https://cbgojvnbkosdehvwerth.supabase.co';

  const FUNCTION_URL =
    SUPABASE_URL + '/functions/v1/instagram-connect';

  const CONNECTIONS_TABLE = 'social_accounts';

  const SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';

  function getClient() {
    return window.supabaseClient ||
           window.gsSupabaseClient ||
           null;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, type = '') {
    const el = $('cpInstagramConnectionStatus');
    if (!el) return;

    el.textContent = text;
    el.className = type
      ? `cp-connection-status ${type}`
      : 'cp-connection-status';
  }

  function setMessage(text, type = 'info') {
    const el = $('cpInstagramMessage');
    if (!el) return;

    el.textContent = text || '';
    el.className = `cp-social-message ${type}`;
  }

  function setBusy(busy) {
    const btn = $('cpConnectInstagramBtn');
    if (!btn) return;

    btn.disabled = busy;

    if (busy) {
      btn.textContent = 'Instagram जोड़ रहा है…';
    }
  }

  // ---------------------------------------------------------
  // EXISTING INSTAGRAM CONNECTION CHECK
  // ---------------------------------------------------------
  async function loadExisting() {
    const client = getClient();

    if (!client) {
      console.warn(
        '[Ganit Setu Instagram] Supabase client नहीं मिला'
      );
      return false;
    }

    try {

      // Current logged-in Admin user
      const {
        data: sessionData,
        error: sessionError
      } = await client.auth.getSession();

      if (sessionError) {
        console.warn(
          '[Ganit Setu Instagram] session error:',
          sessionError
        );
        return false;
      }

      const session = sessionData?.session;

      if (!session?.user?.id) {
        setStatus('Not connected');
        return false;
      }

      const userId = session.user.id;

      console.log(
        '[Ganit Setu Instagram] Checking connection for user:',
        userId
      );

      // IMPORTANT:
      // status filter intentionally removed.
      // We first find the Instagram account belonging
      // to the currently logged-in user.
      const {
        data,
        error
      } = await client
        .from(CONNECTIONS_TABLE)
        .select(
          'id,user_id,account_id,account_name,status,metadata,updated_at'
        )
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .order('updated_at', {
          ascending: false
        })
        .limit(1)
        .maybeSingle();

      console.log(
        '[Ganit Setu Instagram] existing row:',
        data,
        error
      );

      if (error) {
        console.warn(
          '[Ganit Setu Instagram] database check failed:',
          error
        );

        setStatus('Not connected');
        return false;
      }

      if (!data) {
        setStatus('Not connected');
        return false;
      }

      const metadata =
        data.metadata &&
        typeof data.metadata === 'object'
          ? data.metadata
          : {};

      const username =
        metadata.username ||
        metadata.instagram_username ||
        data.account_name ||
        '';

      const instagramId =
        metadata.instagram_id ||
        metadata.instagram_user_id ||
        data.account_id ||
        '';

      // We have an Instagram record.
      setStatus('✅ Connected', 'connected');

      const accountEl =
        $('cpInstagramAccountName');

      if (accountEl) {
        accountEl.textContent =
          (username
            ? (username.startsWith('@')
                ? username
                : '@' + username)
            : 'Instagram') +
          (
            instagramId
              ? ` • Instagram ID: ${instagramId}`
              : ''
          );
      }

      const btn =
        $('cpConnectInstagramBtn');

      if (btn) {
        btn.textContent =
          '🔄 Refresh Instagram';
      }

      setMessage(
        'Instagram account पहले से connected है।',
        'success'
      );

      return true;

    } catch (e) {

      console.warn(
        '[Ganit Setu Instagram] existing connection check failed:',
        e
      );

      return false;
    }
  }

  // ---------------------------------------------------------
  // CONNECT INSTAGRAM
  // ---------------------------------------------------------
  async function connectInstagram() {

    if ($('cpConnectInstagramBtn')?.disabled) {
      return;
    }

    setBusy(true);

    setStatus(
      'Instagram account खोजा जा रहा है…'
    );

    setMessage(
      'Facebook Page से linked Instagram account खोजा जा रहा है…',
      'info'
    );

    try {

      const client = getClient();

      let accessToken = '';

      if (client?.auth) {

        const {
          data: sessionData
        } = await client.auth.getSession();

        accessToken =
          sessionData?.session?.access_token || '';
      }

      if (!accessToken) {

        throw new Error(
          'Admin Supabase session नहीं मिली। कृपया Admin Panel से logout करके फिर login करें।'
        );
      }

      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization':
          `Bearer ${accessToken}`
      };

      const response =
        await fetch(FUNCTION_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'connect'
          })
        });

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !result.success
      ) {

        throw new Error(
          result.error ||
          result.details?.error?.message ||
          'Instagram connection failed'
        );
      }

      const ig =
        result.instagram || {};

      setStatus(
        '✅ Connected',
        'connected'
      );

      const accountEl =
        $('cpInstagramAccountName');

      if (accountEl) {

        accountEl.textContent =
          (
            ig.username
              ? (
                  ig.username.startsWith('@')
                    ? ig.username
                    : '@' + ig.username
                )
              : (
                  ig.name ||
                  'Instagram'
                )
          ) +
          (
            ig.id
              ? ` • Instagram ID: ${ig.id}`
              : ''
          );
      }

      const btn =
        $('cpConnectInstagramBtn');

      if (btn) {
        btn.textContent =
          '🔄 Refresh Instagram';
      }

      setMessage(
        'Instagram account सफलतापूर्वक connected है।',
        'success'
      );

      // IMPORTANT:
      // Database में save होने के बाद एक बार फिर
      // existing connection check कर लेते हैं.
      setTimeout(() => {
        loadExisting();
      }, 500);

    } catch (error) {

      console.error(
        '[Ganit Setu Instagram]',
        error
      );

      setStatus(
        'Not connected',
        'error'
      );

      setMessage(
        error?.message ||
        'Instagram connection failed',
        'error'
      );

    } finally {

      setBusy(false);

      const btn =
        $('cpConnectInstagramBtn');

      if (btn) {

        btn.textContent =
          '🔄 Refresh Instagram';
      }
    }
  }

  // ---------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------
  function boot() {

    const btn =
      $('cpConnectInstagramBtn');

    if (!btn) return;

    btn.addEventListener(
      'click',
      connectInstagram
    );

    loadExisting();
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

  window.GanitSetuInstagramConnector = {
    connectInstagram,
    loadExisting
  };

})();
