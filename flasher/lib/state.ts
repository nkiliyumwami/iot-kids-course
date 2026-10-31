/* Pure UI state for the flasher bar (spec Step 4): idle → compiling → compiled → connecting → flashing → done/error. */
import type { ApiImage } from './images';

export type Phase = 'idle' | 'compiling' | 'compiled' | 'connecting' | 'flashing' | 'done' | 'error';
export type State = { phase: Phase; images: ApiImage[] | null; port: string | null; progress: number; message: string; hint: string | null; monitor: boolean };
export type Action =
  | { type: 'COMPILE_START' } | { type: 'COMPILE_OK'; images: ApiImage[] } | { type: 'COMPILE_FAIL'; message: string }
  | { type: 'CODE_CHANGED' }
  | { type: 'PORT_SELECTED'; label: string } | { type: 'PORT_CLEARED' }
  | { type: 'FLASH_START' } | { type: 'FLASH_PROGRESS'; pct: number; message: string }
  | { type: 'FLASH_DONE' } | { type: 'FLASH_FAIL'; message: string; hint?: string | null }
  | { type: 'MONITOR'; on: boolean };

export const initialState: State = { phase: 'idle', images: null, port: null, progress: 0, message: '', hint: null, monitor: false };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'COMPILE_START': return { ...s, phase: 'compiling', images: null, progress: 0, message: 'Compiling…', hint: null };
    case 'COMPILE_OK': return { ...s, phase: 'compiled', images: a.images, message: `Compiled: ${a.images.length} images ready`, hint: null };
    case 'COMPILE_FAIL': return { ...s, phase: 'error', images: null, message: a.message, hint: null };
    case 'CODE_CHANGED': return s.images ? { ...s, phase: 'idle', images: null, message: 'Code changed: compile again before flashing', hint: null } : s;
    case 'PORT_SELECTED': return { ...s, port: a.label };
    case 'PORT_CLEARED': return { ...s, port: null, monitor: false };
    case 'FLASH_START': return { ...s, phase: 'connecting', progress: 0, message: 'Connecting…', hint: null };
    case 'FLASH_PROGRESS': return a.pct < 0 ? s : { ...s, phase: a.pct >= 5 ? 'flashing' : 'connecting', progress: Math.min(100, a.pct), message: a.message };
    case 'FLASH_DONE': return { ...s, phase: 'done', progress: 100, message: 'Flashed! The board restarted with your program.' };
    case 'FLASH_FAIL': return { ...s, phase: 'error', message: a.message, hint: a.hint ?? null };
    case 'MONITOR': return { ...s, monitor: a.on };
  }
}

export const busy = (s: State) => s.phase === 'compiling' || s.phase === 'connecting' || s.phase === 'flashing';
export const canCompile = (s: State) => !busy(s);
export const canFlash = (s: State) => !busy(s) && !!s.images && !!s.port;
export const canMonitor = (s: State) => !busy(s) && !!s.port;
