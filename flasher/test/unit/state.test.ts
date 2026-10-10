import { describe, it, expect } from 'vitest';
import { reducer, initialState, canFlash, canCompile, canMonitor, busy, type State } from '../../lib/state';

const imgs = [{ address: 0x10000, name: 'firmware.bin', data: '6Q==' }];
const run = (...actions: Parameters<typeof reducer>[1][]) => actions.reduce((s, a) => reducer(s, a), initialState as State);

describe('flasher UI state', () => {
  it('goes idle → compiling → compiled', () => {
    expect(run({ type: 'COMPILE_START' }).phase).toBe('compiling');
    expect(busy(run({ type: 'COMPILE_START' }))).toBe(true);
    const s = run({ type: 'COMPILE_START' }, { type: 'COMPILE_OK', images: imgs });
    expect(s.phase).toBe('compiled');
    expect(s.images).toEqual(imgs);
  });
  it('enables Flash only after a successful compile AND a selected port', () => {
    expect(canFlash(run({ type: 'COMPILE_OK', images: imgs }))).toBe(false);
    expect(canFlash(run({ type: 'PORT_SELECTED', label: 'CH340' }))).toBe(false);
    expect(canFlash(run({ type: 'COMPILE_OK', images: imgs }, { type: 'PORT_SELECTED', label: 'CH340' }))).toBe(true);
    expect(canFlash(run({ type: 'COMPILE_START' }, { type: 'COMPILE_FAIL', message: 'x' }, { type: 'PORT_SELECTED', label: 'CH340' }))).toBe(false);
  });
  it('editing the code after compiling requires a new compile', () => {
    const s = run({ type: 'COMPILE_OK', images: imgs }, { type: 'PORT_SELECTED', label: 'CH340' }, { type: 'CODE_CHANGED' });
    expect(s.images).toBeNull();
    expect(canFlash(s)).toBe(false);
  });
  it('tracks connecting → flashing → done with progress', () => {
    let s = run({ type: 'COMPILE_OK', images: imgs }, { type: 'PORT_SELECTED', label: 'CH340' }, { type: 'FLASH_START' });
    expect(s.phase).toBe('connecting');
    expect(canCompile(s) || canFlash(s) || canMonitor(s)).toBe(false);
    s = reducer(s, { type: 'FLASH_PROGRESS', pct: 0, message: 'Connecting' });
    expect(s.phase).toBe('connecting');
    s = reducer(s, { type: 'FLASH_PROGRESS', pct: -1, message: 'esptool log line' });
    expect(s.message).toBe('Connecting');
    s = reducer(s, { type: 'FLASH_PROGRESS', pct: 50, message: 'Writing image 2/4' });
    expect([s.phase, s.progress]).toEqual(['flashing', 50]);
    s = reducer(s, { type: 'FLASH_DONE' });
    expect([s.phase, s.progress]).toEqual(['done', 100]);
    expect(canFlash(s)).toBe(true); // can flash again
  });
  it('keeps the images after a failed flash and shows the BOOT hint', () => {
    const s = run({ type: 'COMPILE_OK', images: imgs }, { type: 'PORT_SELECTED', label: 'CH340' }, { type: 'FLASH_START' },
      { type: 'FLASH_FAIL', message: 'Failed to connect', hint: 'Hold the BOOT button…' });
    expect(s.phase).toBe('error');
    expect(s.hint).toContain('BOOT');
    expect(canFlash(s)).toBe(true);
  });
  it('monitor needs a port', () => {
    expect(canMonitor(initialState)).toBe(false);
    expect(canMonitor(run({ type: 'PORT_SELECTED', label: 'CP210x' }))).toBe(true);
    expect(run({ type: 'PORT_SELECTED', label: 'x' }, { type: 'MONITOR', on: true }, { type: 'PORT_CLEARED' }).monitor).toBe(false);
  });
});
