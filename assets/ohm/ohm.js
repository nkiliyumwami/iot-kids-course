/* Officer Ohm, the course guide. Include this script on any lesson page:
     <script src="../../assets/ohm/ohm.js"></script>
   It replaces the small drawing in the lesson's guide panel with the illustrated character and
   changes his pose to match what is happening: waving on the first step, pointing while you build,
   thinking when a "Why?" answer opens, thumbs-up for a right answer, encouraging after a wrong one,
   celebrating when the lesson is finished. Poses: wave, point, thumbs, think, traffic, celebrate,
   encourage, magnify. A lesson can force a pose with window.OHM.set('traffic'). */
(function () {
  'use strict';
  const me = document.currentScript;
  const base = me ? me.src.replace(/ohm\.js(\?.*)?$/, '') : '../../assets/ohm/';
  const POSES = ['wave', 'point', 'thumbs', 'think', 'traffic', 'celebrate', 'encourage', 'magnify'];
  POSES.forEach((p) => { const i = new Image(); i.src = base + p + '.svg'; }); // preload, no flicker
  let img = null, current = '', hold = 0;

  function set(pose, ms) {
    if (!img || POSES.indexOf(pose) < 0) return;
    if (ms) hold = Date.now() + ms;
    if (pose === current) return;
    current = pose;
    img.src = base + pose + '.svg';
    img.alt = 'Officer Ohm';
    img.classList.remove('ohm-pop'); void img.offsetWidth; img.classList.add('ohm-pop');
  }
  function stepPose() {
    const title = (document.getElementById('stepTitle') || {}).textContent || '';
    const prog = (document.getElementById('progressText') || {}).textContent || '';
    if (/^Step 1 of/.test(prog)) return 'wave';
    if (/quiz/i.test(title)) return 'think';
    if (/LED|look closely/i.test(title)) return 'magnify';
    return 'point';
  }
  function react() {
    if (document.getElementById('quizDone')) return set('celebrate');
    const fb = document.querySelector('.feedback.good, .feedback.try');
    if (fb && fb.dataset.ohmSeen !== '1') { fb.dataset.ohmSeen = '1'; return set(fb.classList.contains('good') ? 'thumbs' : 'encourage', 4000); }
    if (Date.now() < hold) return;
    const why = document.querySelector('.why-item.now .ans:not([hidden])');
    if (why && why.dataset.ohmSeen !== '1') { why.dataset.ohmSeen = '1'; return set('think', 3500); }
    set(stepPose());
  }
  function init() {
    const guide = document.querySelector('.guide');
    if (!guide) return;
    const old = guide.querySelector('svg');
    img = document.createElement('img');
    img.className = 'ohm';
    img.width = 72; img.height = 84;
    if (old) old.replaceWith(img); else guide.prepend(img);
    const css = document.createElement('style');
    css.textContent = '.guide{grid-template-columns:72px minmax(0,1fr)!important}.guide img.ohm{width:72px;height:auto;display:block}' +
      '.ohm-pop{animation:ohmPop .35s ease-out}@keyframes ohmPop{0%{transform:scale(.85) rotate(-4deg)}60%{transform:scale(1.06)}100%{transform:none}}' +
      '@media (prefers-reduced-motion: reduce){.ohm-pop{animation:none}}';
    document.head.appendChild(css);
    set(stepPose());
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; react(); });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    setInterval(react, 1000); // releases timed poses even when nothing else changes
  }
  window.OHM = { set: (p, ms) => set(p, ms || 6000), poses: POSES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
