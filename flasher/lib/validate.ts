/* Checks and normalises a POST /api/compile request. Pure functions: covered by unit tests. */

export const BOARDS: Record<string, { platform: string; framework: string }> = {
  // v1: classic ESP32 boards (DevKit V1 / DevKitC / WROOM). S3/C3 come in v2.
  esp32dev: { platform: 'espressif32', framework: 'arduino' },
};

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const FILE_RE = /^src\/[A-Za-z0-9_\-./]{1,120}\.(cpp|c|h|hpp|ino)$/;
// registry libraries only ("owner/Name@version"): no URLs, git repos or local paths
const LIB_RE = /^[A-Za-z0-9_.\-]{1,60}\/[A-Za-z0-9_.\- ]{1,80}(@[\^~<>=0-9A-Za-z.*\s-]{1,30})?$/;

export type CompileRequest = { board: string; files: Record<string, string>; libDeps: string[] };
export type Invalid = { ok: false; error: string };

export function validateRequest(body: unknown): { ok: true; value: CompileRequest } | Invalid {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const board = typeof b.board === 'string' ? b.board : 'esp32dev';
  if (!BOARDS[board]) return { ok: false, error: `Unsupported board "${board}". Supported: ${Object.keys(BOARDS).join(', ')}` };

  if (!b.files || typeof b.files !== 'object') return { ok: false, error: '"files" must be an object of path → source' };
  const files: Record<string, string> = {};
  let total = 0;
  for (const [path, src] of Object.entries(b.files as Record<string, unknown>)) {
    if (typeof src !== 'string') return { ok: false, error: `File "${path}" must be a string` };
    if (path !== 'platformio.ini' && (!FILE_RE.test(path) || path.includes('..') || path.includes('//'))) {
      return { ok: false, error: `File path "${path}" is not allowed (use src/<name>.cpp|.h|.c|.hpp|.ino)` };
    }
    total += Buffer.byteLength(src, 'utf8');
    files[path] = src;
  }
  if (!Object.keys(files).some((p) => p.startsWith('src/'))) return { ok: false, error: 'At least one source file under src/ is required' };
  if (total > MAX_SOURCE_BYTES) return { ok: false, error: `Sources are too large (${total} bytes, max ${MAX_SOURCE_BYTES})` };

  const libDeps: string[] = [];
  if (b.libDeps !== undefined) {
    if (!Array.isArray(b.libDeps) || b.libDeps.length > 20) return { ok: false, error: '"libDeps" must be a list of at most 20 libraries' };
    for (const d of b.libDeps) {
      if (typeof d !== 'string' || !LIB_RE.test(d.trim())) return { ok: false, error: `Library "${String(d)}" is not allowed (use "owner/Name@version" from the PlatformIO registry)` };
      libDeps.push(d.trim());
    }
  }
  return { ok: true, value: { board, files, libDeps } };
}

/* We always write platformio.ini ourselves. From a user-supplied one we only take lib_deps and monitor_speed:
   options like extra_scripts or custom platforms would run code on the server. */
export function readUserIni(ini: string | undefined): { libDeps: string[]; monitorSpeed?: number } {
  if (!ini) return { libDeps: [] };
  const libDeps: string[] = [];
  let monitorSpeed: number | undefined;
  const lines = ini.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(lib_deps|monitor_speed)\s*=\s*(.*)$/);
    if (!m) continue;
    if (m[1] === 'monitor_speed') { const n = parseInt(m[2], 10); if (n > 0 && n <= 2000000) monitorSpeed = n; continue; }
    const vals = [m[2]];
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s*[a-z_]+\s*=/.test(lines[i + 1])) vals.push(lines[++i]);
    for (const v of vals.join('\n').split(/[\n,]/)) { const t = v.trim(); if (t && LIB_RE.test(t)) libDeps.push(t); }
  }
  return { libDeps, monitorSpeed };
}

export function buildIni(board: string, libDeps: string[], monitorSpeed = 115200): string {
  const b = BOARDS[board];
  const lines = [`[env:${board}]`, `platform = ${b.platform}`, `board = ${board}`, `framework = ${b.framework}`, `monitor_speed = ${monitorSpeed}`];
  if (libDeps.length) lines.push('lib_deps =', ...libDeps.map((d) => `    ${d}`));
  return lines.join('\n') + '\n';
}
