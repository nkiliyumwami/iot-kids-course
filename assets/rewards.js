/* Lesson rewards: when a lesson's quiz is finished (#quizDone appears), show the lesson badge and a
   "Get your certificate" button, and remember that the lesson is done. Include on every lesson page after
   course.js:  <script src="../../assets/rewards.js"></script> */
(function () {
  'use strict';
  const m = location.pathname.match(/lessons\/([^/]+)\//);
  const slug = m ? m[1] : null;
  function addReward(done) {
    if (!slug || !window.COURSE || done.querySelector('.reward')) return;
    const lesson = window.COURSE.lessonBySlug(slug);
    if (!lesson) return;
    window.COURSE.saveProgress(slug, { done: true });
    const box = document.createElement('div');
    box.className = 'reward';
    box.innerHTML =
      `<img src="${window.COURSE.badgeSrc(lesson, '../../')}" alt="Lesson ${lesson.n} badge" width="96" height="96">` +
      `<div><b>You earned the Lesson ${lesson.n} badge!</b>` +
      `<p>It’s saved on the course home page.</p>` +
      `<a class="btn primary" href="../../certificate.html?lesson=${encodeURIComponent(slug)}">🎓 Get your certificate</a></div>`;
    done.appendChild(box);
  }
  const css = document.createElement('style');
  css.textContent = '.reward{display:flex;gap:12px;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(21,32,42,.2)}' +
    '.reward img{flex:none;animation:badgeIn .7s cubic-bezier(.2,1.6,.4,1)}.reward p{margin:2px 0 8px;font-size:14px}' +
    '.reward a{text-decoration:none}@keyframes badgeIn{0%{transform:scale(.2) rotate(-90deg);opacity:0}100%{transform:none;opacity:1}}' +
    '@media (prefers-reduced-motion: reduce){.reward img{animation:none}}';
  document.head.appendChild(css);
  new MutationObserver(() => { const d = document.getElementById('quizDone'); if (d) addReward(d); })
    .observe(document.documentElement, { subtree: true, childList: true });
})();
