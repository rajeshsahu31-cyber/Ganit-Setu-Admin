/* =========================================================
   Ganit Setu — WhatsApp Channel Connector
   Channel: Ganit Setu
   Direct WhatsApp Business API publishing is NOT used.
   This workflow opens the existing public WhatsApp Channel.
   ========================================================= */

(() => {
  'use strict';

  const CHANNEL_URL =
    'https://whatsapp.com/channel/0029VbDLOBHICVfrePXZ363D';

  const STORAGE_KEY = 'ganitSetuWhatsAppChannelUrl';

  const $ = id => document.getElementById(id);

  /* ---------------------------------------------------------
     Status / Message
     --------------------------------------------------------- */

  function status(text, cls = '') {
    const el = $('cpWhatsAppConnectionStatus');

    if (el) {
      el.textContent = text;
      el.className = 'cp-connection-status ' + cls;
    }
  }

  function msg(text, cls = 'info') {
    const el = $('cpWhatsAppMessage');

    if (el) {
      el.textContent = text || '';
      el.className = 'cp-social-message ' + cls;
    }
  }

  /* ---------------------------------------------------------
     Platform UI
     --------------------------------------------------------- */

  function platform(ok, name = '') {
    const text = $('cpWhatsAppPlatformText');
    const state = $('cpWhatsAppPlatformState');

    if (text) {
      text.textContent = ok
        ? 'Connected • ' + name
        : 'Ready for channel link';
    }

    if (state) {
      state.textContent = 'READY';
    }

    const card = document.querySelector('.platform-card.whatsapp');

    if (card) {
      card.classList.toggle('active', ok);
    }
  }

  /* ---------------------------------------------------------
     Channel URL
     --------------------------------------------------------- */

  function getChannelUrl() {
    return localStorage.getItem(STORAGE_KEY) || CHANNEL_URL;
  }

  /* ---------------------------------------------------------
     Copy text
     --------------------------------------------------------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const textarea = document.createElement('textarea');

        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        const ok = document.execCommand('copy');

        textarea.remove();

        return ok;
      } catch (e) {
        return false;
      }
    }
  }

  /* ---------------------------------------------------------
     Connected UI
     --------------------------------------------------------- */

  function setConnectedUI() {

    status(
      '✅ Channel configured',
      'connected'
    );

    const account = $('cpWhatsAppAccountName');

    if (account) {
      account.textContent =
        'Ganit Setu • WhatsApp Channel';
    }

    const connectBtn = $('cpConnectWhatsAppBtn');

    if (connectBtn) {
      connectBtn.textContent =
        '📲 Open WhatsApp Channel';

      connectBtn.type = 'button';
    }

    msg(
      'Ganit Setu WhatsApp Channel तैयार है।',
      'success'
    );

    platform(
      true,
      'Ganit Setu Channel'
    );
  }

  /* ---------------------------------------------------------
     OPEN CHANNEL
     
     IMPORTANT:
     This opens ONLY the public WhatsApp Channel URL.
     It does NOT open web.whatsapp.com.
     --------------------------------------------------------- */

  function openChannel() {

    const url =
      getChannelUrl() || CHANNEL_URL;

    /*
      Force the exact public channel URL.
      This prevents an old/local WhatsApp Web URL
      from being used.
    */

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );
  }

  /* ---------------------------------------------------------
     Build caption
     --------------------------------------------------------- */

  function buildCaptionFromCard(card) {

    if (!card) return '';

    const id =
      card.querySelector('.q-title')
        ?.innerText
        ?.trim() || '';

    const question =
      card.querySelector('.question-text')
        ?.innerText
        ?.trim() || '';

    const options = [
      ...card.querySelectorAll(
        '.options .option'
      )
    ]
      .map(x => x.innerText.trim())
      .filter(Boolean)
      .join('\n');

    const chapter =
      card.querySelector('.chapter-badge')
        ?.innerText
        ?.trim() || '';

    return [
      '📚 Ganit Setu — आज का गणित प्रश्न',
      id,
      chapter,
      '',
      question,
      options,
      '',
      '🤔 आपका उत्तर क्या है?',
      'Comment करके बताइए!',
      '',
      '#GanitSetu #Maths #MPBoard #Class9 #Class10 #आजकागणितप्रश्न'
    ]
      .filter(Boolean)
      .join('\n');
  }

  /* ---------------------------------------------------------
     Question-level WhatsApp button
     --------------------------------------------------------- */

  async function prepareFromCard(btn) {

    const card =
      btn.closest('.question-card');

    if (!card) {
      openChannel();
      return;
    }

    const caption =
      buildCaptionFromCard(card);

    const copied =
      await copyText(caption);

    const oldText =
      btn.textContent;

    if (copied) {

      btn.textContent =
        '✅ Caption Copied • Open Channel';

      btn.classList.add(
        'whatsapp-ready'
      );

      msg(
        'Caption clipboard में है। अब Ganit Setu WhatsApp Channel खुलेगा। वहाँ image चुनकर caption paste करके Send करें।',
        'success'
      );

    } else {

      btn.textContent =
        '📲 Open Channel';

      msg(
        'Caption copy नहीं हो पाया। WhatsApp Channel खोलें और caption manually paste करें।',
        'info'
      );
    }

    /*
      Open ONLY the public channel.
    */

    openChannel();

    setTimeout(() => {

      btn.textContent =
        oldText;

      btn.classList.remove(
        'whatsapp-ready'
      );

    }, 4000);
  }

  /* ---------------------------------------------------------
     Add question-level buttons
     --------------------------------------------------------- */

  function injectQuestionButtons() {

    document
      .querySelectorAll('.question-card')
      .forEach(card => {

        if (
          card.querySelector(
            '.publish-whatsapp-channel'
          )
        ) {
          return;
        }

        const actions =
          card.querySelector(
            '.prompt-actions'
          );

        if (!actions) return;

        const btn =
          document.createElement('button');

        btn.type = 'button';

        btn.className =
          'publish-whatsapp-channel';

        btn.textContent =
          '📲 WhatsApp Channel';

        btn.title =
          'Caption copy करके Ganit Setu WhatsApp Channel खोलें';

        btn.addEventListener(
          'click',
          () => prepareFromCard(btn)
        );

        actions.appendChild(btn);
      });
  }

  /* ---------------------------------------------------------
     Connect / Configure
     --------------------------------------------------------- */

  async function connect() {

    /*
      Save ONLY the public channel URL.
    */

    localStorage.setItem(
      STORAGE_KEY,
      CHANNEL_URL
    );

    setConnectedUI();

    msg(
      'Ganit Setu WhatsApp Channel configured है।',
      'success'
    );
  }

  /* ---------------------------------------------------------
     Detect existing buttons
     
     This catches buttons whose text is:
       Test WhatsApp Channel
       Open WhatsApp Channel
     --------------------------------------------------------- */

  function bindChannelButtons() {

    document
      .querySelectorAll('button, a')
      .forEach(el => {

        if (el.dataset.gsWhatsAppBound === '1') {
          return;
        }

        const text =
          (el.innerText || el.textContent || '')
            .trim()
            .toLowerCase();

        const isWhatsAppButton =
          text.includes('test whatsapp channel') ||
          text.includes('open whatsapp channel');

        if (!isWhatsAppButton) {
          return;
        }

        /*
          Don't touch question-level button.
        */

        if (
          el.classList.contains(
            'publish-whatsapp-channel'
          )
        ) {
          return;
        }

        el.dataset.gsWhatsAppBound = '1';

        /*
          Remove old click behavior.
        */

        const clone =
          el.cloneNode(true);

        el.parentNode.replaceChild(
          clone,
          el
        );

        clone.dataset.gsWhatsAppBound = '1';

        clone.addEventListener(
          'click',
          function (event) {

            event.preventDefault();
            event.stopPropagation();

            openChannel();

          },
          true
        );
      });
  }

  /* ---------------------------------------------------------
     Existing connection
     --------------------------------------------------------- */

  async function loadExisting() {

    /*
      Always use the official configured
      Ganit Setu Channel URL.
    */

    localStorage.setItem(
      STORAGE_KEY,
      CHANNEL_URL
    );

    setConnectedUI();

    injectQuestionButtons();

    bindChannelButtons();

    return true;
  }

  /* ---------------------------------------------------------
     CSS
     --------------------------------------------------------- */

  function injectStyle() {

    if (
      document.getElementById(
        'ganitsetu-whatsapp-style'
      )
    ) {
      return;
    }

    const style =
      document.createElement('style');

    style.id =
      'ganitsetu-whatsapp-style';

    style.textContent = `

      .publish-whatsapp-channel {
        background: #128c7e !important;
        color: #fff !important;
        border: 0 !important;
        border-radius: 8px !important;
        padding: 8px 11px !important;
        cursor: pointer !important;
        font-weight: 600 !important;
      }

      .publish-whatsapp-channel:hover {
        filter: brightness(.95);
      }

      .publish-whatsapp-channel.whatsapp-ready {
        background: #0b7d3e !important;
      }

    `;

    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------
     BOOT
     --------------------------------------------------------- */

  function boot() {

    const connectBtn =
      $('cpConnectWhatsAppBtn');

    if (connectBtn) {

      /*
        Prevent old handler from opening
        anything other than our channel.
      */

      connectBtn.type = 'button';

      connectBtn.addEventListener(
        'click',
        function (event) {

          event.preventDefault();
          event.stopPropagation();

          connect();

        },
        true
      );
    }

    injectStyle();

    loadExisting();

    /*
      Watch dynamically generated content.
    */

    const observer =
      new MutationObserver(() => {

        injectQuestionButtons();
        bindChannelButtons();

      });

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true
      }
    );

    /*
      Public functions
    */

    window.GanitSetuWhatsAppConnector = {

      connect,

      loadExisting,

      openChannel,

      getChannelUrl,

      channelUrl: CHANNEL_URL

    };
  }

  /* ---------------------------------------------------------
     Start
     --------------------------------------------------------- */

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

})();
