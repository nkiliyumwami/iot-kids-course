/* Officer Ohm's voice. Plays a ready-made ElevenLabs MP3 for a line of text when there is one
   (assets/voice/en/<id>.mp3, where <id> is a fingerprint of the text), and otherwise falls back to the
   browser's own speech so nothing is ever silent. Nothing plays until the visitor asks for sound.

   Usage: KKVoice.say('Meet the ESP32. A tiny computer…', { base: '', onend })
          KKVoice.stop(); KKVoice.speaking; KKVoice.id(text)
   tools/voice/collect.mjs lists every line the course says (assets/voice/lines.json); see tools/voice/README.md. */
(function () {
  'use strict';
  // the same text always gives the same id, so a changed sentence simply needs a new file
  function clean(text) {
    const d = document.createElement('div'); d.innerHTML = String(text);
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  function id(text) {
    const t = clean(text); let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  let audio = null, utter = null, token = 0;
  function stop() {
    token++;
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; }
    if (utter && window.speechSynthesis) { utter.onend = null; window.speechSynthesis.cancel(); utter = null; }
  }
  function browserVoice(t, done) {
    if (!window.speechSynthesis) { done(); return; }
    utter = new SpeechSynthesisUtterance(t);
    const vs = window.speechSynthesis.getVoices();
    utter.voice = vs.find((v) => /en-GB|en-US/.test(v.lang) && /Google|Natural|Samantha|Daniel/.test(v.name)) || vs.find((v) => /^en/.test(v.lang)) || null;
    utter.rate = 0.95; utter.pitch = 1.05;
    utter.onend = utter.onerror = () => { utter = null; done(); };
    window.speechSynthesis.speak(utter);
  }
  function say(text, o) {
    o = o || {}; stop();
    const my = ++token, t = clean(text), done = () => { if (my === token && o.onend) o.onend(); };
    if (!t) { done(); return; }
    audio = new Audio((o.base || '') + 'assets/voice/en/' + id(t) + '.mp3');
    audio.onended = () => { audio = null; done(); };
    audio.onerror = () => { audio = null; if (my === token) browserVoice(t, done); }; // no file yet: the browser reads it
    const p = audio.play(); if (p && p.catch) p.catch(() => { if (my === token && audio) { audio = null; browserVoice(t, done); } });
  }
  window.KKVoice = { say, stop, id, clean, get speaking() { return !!(audio || utter); } };
})();
