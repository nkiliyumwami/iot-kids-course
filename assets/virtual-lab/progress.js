/* Virtual Traffic Light Lab: remembers where a learner got to, in this browser only.
   Its own versioned key, so it never touches the course's 'iotkids.progress' map. Nothing personal is stored.
   If storage is blocked or the saved data is broken, the lab still works; it just doesn't remember.
   Works in the browser (window.VLabProgress) and in Node (require) for tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLabProgress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'iotkids.virtualLab.trafficLight.v1';
  const SCHEMA = 1;
  const MODES = ['guided', 'practice'];

  const fresh = () => ({ schemaVersion: SCHEMA, mode: null, currentStep: 0, completedStepIds: [], helpedStepIds: [], build: {}, workshop: null, program: null, solvedErrors: [], helpedErrors: [], quizCorrect: [], quizFirst: [], updatedAt: 0 });

  // Keep only what we understand: known step ids, a step number in range, a known mode, and (with cleanBuild) a
  // well-formed circuit. "helped" steps were finished with "Do it for me": done, but not counted as mastered.
  function clean(raw, stepIds, cleanBuild, cleanProgram) {
    const s = fresh();
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== SCHEMA) return s;
    if (MODES.includes(raw.mode)) s.mode = raw.mode;
    const n = Number(raw.currentStep);
    if (Number.isInteger(n) && n >= 0 && n < stepIds.length) s.currentStep = n;
    const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
    s.completedStepIds = [...new Set(strings(raw.completedStepIds).filter((id) => stepIds.includes(id)))];
    s.helpedStepIds = [...new Set(strings(raw.helpedStepIds).filter((id) => stepIds.includes(id)))];
    s.build = cleanBuild ? cleanBuild(raw.build) : {};
    // a fix-it round in progress: its own temporary copy of the circuit (the learner's build above is never touched)
    const w = raw.workshop;
    s.workshop = w && typeof w === 'object' && typeof w.id === 'string' && /^[a-z0-9-]{1,40}$/.test(w.id) && cleanBuild ? { id: w.id, build: cleanBuild(w.build) } : null;
    s.solvedErrors = [...new Set(strings(raw.solvedErrors))];
    s.quizCorrect = [...new Set(strings(raw.quizCorrect))];
    s.quizFirst = [...new Set(strings(raw.quizFirst))];
    s.helpedErrors = [...new Set(strings(raw.helpedErrors))];
    s.program = cleanProgram && raw.program ? cleanProgram(raw.program) : null;
    s.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;
    return s;
  }

  // storage: anything with getItem/setItem/removeItem (window.localStorage by default). It may throw at any time.
  function create(opts) {
    const stepIds = opts.stepIds, cleanBuild = opts.cleanBuild || null, cleanProgram = opts.cleanProgram || null;
    const now = opts.now || (() => Date.now());
    let storage = opts.storage;
    if (storage === undefined) { try { storage = typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { storage = null; } }
    let ok = !!storage;
    let state = fresh();

    function load() {
      state = fresh();
      if (!storage) return state;
      try { state = clean(JSON.parse(storage.getItem(KEY) || 'null'), stepIds, cleanBuild, cleanProgram); } catch (e) { ok = false; state = fresh(); }
      return state;
    }
    function save(patch) {
      state = clean(Object.assign({}, state, patch, { schemaVersion: SCHEMA, updatedAt: now() }), stepIds, cleanBuild, cleanProgram);
      if (!storage) return state;
      try { storage.setItem(KEY, JSON.stringify(state)); ok = true; } catch (e) { ok = false; }
      return state;
    }
    function complete(id) {
      if (!stepIds.includes(id) || state.completedStepIds.includes(id)) return state;
      return save({ completedStepIds: state.completedStepIds.concat(id) });
    }
    // Reset Lab: forget this lab only.
    function reset() {
      state = fresh();
      if (!storage) return state;
      try { storage.removeItem(KEY); ok = true; } catch (e) { ok = false; }
      return state;
    }
    return { load, save, complete, reset, get state() { return state; }, get available() { return ok; } };
  }

  return { KEY, SCHEMA, create, clean, fresh };
});
