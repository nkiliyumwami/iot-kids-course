// Progress is saved in this browser only, under the lab's own key. Broken or blocked storage must never crash the lab.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../../../assets/virtual-lab/progress.js');

const IDS = ['welcome', 'meet-kit', 'hidden-strips', 'unplug', 'red-resistor'];
function memory(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };

test('uses its own versioned key, not the course progress map', () => {
  assert.equal(P.KEY, 'iotkids.virtualLab.trafficLight.v1');
  assert.notEqual(P.KEY, 'iotkids.progress');
});

test('saves and resumes step, mode and finished steps', () => {
  const s = memory();
  const a = P.create({ stepIds: IDS, storage: s, now: () => 42 });
  a.load();
  a.save({ mode: 'guided', currentStep: 2 });
  a.complete('welcome'); a.complete('meet-kit'); a.complete('meet-kit');
  const b = P.create({ stepIds: IDS, storage: s }).load();
  assert.equal(b.mode, 'guided');
  assert.equal(b.currentStep, 2);
  assert.deepEqual(b.completedStepIds, ['welcome', 'meet-kit']);
  assert.equal(b.updatedAt, 42);
});

test('reset clears only this lab', () => {
  const s = memory({ 'iotkids.progress': '{"lab1-light-it-up":{"done":true}}' });
  const a = P.create({ stepIds: IDS, storage: s });
  a.save({ currentStep: 3 });
  a.reset();
  assert.equal(s.getItem(P.KEY), null);
  assert.equal(s.getItem('iotkids.progress'), '{"lab1-light-it-up":{"done":true}}');
  assert.deepEqual(a.state, P.fresh());
});

test('corrupted or foreign data loads as a fresh start', () => {
  for (const bad of ['not json{', '[]', '"x"', '{"schemaVersion":99,"currentStep":3}', 'null']) {
    const st = P.create({ stepIds: IDS, storage: memory({ [P.KEY]: bad }) }).load();
    assert.deepEqual(st, P.fresh(), `input ${bad}`);
  }
});

test('out-of-range or unknown values are dropped, good ones kept', () => {
  const raw = { schemaVersion: 1, mode: 'hacker', currentStep: 99, completedStepIds: ['welcome', 'nope', 7, 'welcome'], solvedErrors: ['x', 1], quizCorrect: 'q1', updatedAt: 'soon' };
  const st = P.create({ stepIds: IDS, storage: memory({ [P.KEY]: JSON.stringify(raw) }) }).load();
  assert.equal(st.mode, null);
  assert.equal(st.currentStep, 0);
  assert.deepEqual(st.completedStepIds, ['welcome']);
  assert.deepEqual(st.solvedErrors, ['x']);
  assert.deepEqual(st.quizCorrect, []);
  assert.equal(st.updatedAt, 0);
});

test('blocked storage: nothing throws, the lab just does not remember', () => {
  const a = P.create({ stepIds: IDS, storage: throwing });
  assert.doesNotThrow(() => { a.load(); a.save({ currentStep: 1 }); a.complete('welcome'); a.reset(); });
  assert.equal(a.available, false);
});

test('no storage at all (null) works too', () => {
  const a = P.create({ stepIds: IDS, storage: null });
  assert.equal(a.available, false);
  assert.equal(a.save({ currentStep: 2 }).currentStep, 2);
});
