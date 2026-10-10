/* KundaKode brand for every course page: logo, favicon and page titles, matching the KundaKode landing page.
   Include on every page (lessons: <script src="../../assets/brand.js"></script>).
   - Any element with data-kk-logo gets the full logo (icon + "KundaKode." wordmark).
   - Lesson "← All lessons" links (.home-link, a.back) get the small logo in front of them.
   - Page titles end with "· KundaKode".
   When the landing page has its public address, put it in SITE below: the logo then links there. */
(function () {
  'use strict';
  const SITE = ''; // e.g. 'https://kundakode.com'
  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true" class="kk-icon"><path d="M10 7v26M10 20h9L30 8M19 20l11 12" fill="none" stroke="#0A7480" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="10" cy="7" r="4" fill="#F2B705" stroke="#0A7480" stroke-width="2"/><circle cx="30" cy="8" r="4" fill="#F2B705" stroke="#0A7480" stroke-width="2"/><circle cx="30" cy="32" r="4" fill="#F2B705" stroke="#0A7480" stroke-width="2"/></svg>';
  const WORD = '<span class="kk-word">Kunda<span class="kk-kode">Kode</span><span class="kk-dot">.</span></span>';

  const css = document.createElement('style');
  css.textContent =
    '.kk-logo{display:inline-flex;align-items:center;gap:8px;font-family:"Baloo 2","Trebuchet MS",system-ui,sans-serif;font-weight:800;line-height:1;color:#15202A;text-decoration:none}' +
    '.kk-logo .kk-icon{width:1.25em;height:1.25em;flex:none}.kk-kode{color:#0A7480}.kk-dot{color:#F2B705}' +
    '.kk-mini{display:inline-flex;align-items:center;gap:5px;margin-right:6px;padding-right:8px;border-right:1px solid rgba(21,32,42,.18);font-family:"Baloo 2","Trebuchet MS",system-ui,sans-serif;font-weight:800;color:#15202A}' +
    '.kk-mini .kk-icon{width:16px;height:16px}';
  document.head.appendChild(css);

  function favicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const l = document.createElement('link');
    l.rel = 'icon'; l.type = 'image/svg+xml';
    l.href = 'data:image/svg+xml,' + encodeURIComponent(ICON.replace('aria-hidden="true" class="kk-icon"', 'xmlns="http://www.w3.org/2000/svg"'));
    document.head.appendChild(l);
  }
  function title() {
    const t = document.title.replace(/\s*·\s*IoT for Young Makers\s*$/, '').trim();
    if (!/KundaKode/.test(t)) document.title = (t ? t + ' · ' : '') + 'KundaKode';
  }
  function decorate() {
    document.querySelectorAll('[data-kk-logo]').forEach((el) => {
      if (el.dataset.kkDone) return; el.dataset.kkDone = '1';
      el.classList.add('kk-logo'); el.innerHTML = ICON + WORD;
      el.setAttribute('aria-label', 'KundaKode');
      if (el.tagName === 'A' && SITE && !el.getAttribute('href')) el.href = SITE;
    });
    document.querySelectorAll('a.home-link, a.back').forEach((a) => {
      if (a.dataset.kkDone) return; a.dataset.kkDone = '1';
      a.insertAdjacentHTML('afterbegin', `<span class="kk-mini">${ICON}<span>Kunda<span class="kk-kode">Kode</span></span></span>`);
    });
  }
  favicon(); title();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate); else decorate();
  window.KUNDAKODE = { SITE, ICON, WORD };
})();
