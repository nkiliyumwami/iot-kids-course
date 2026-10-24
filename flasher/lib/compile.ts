/* Runs PlatformIO in Docker for one request. Never runs user code: it only compiles it, inside a
   resource-limited container (no network unless libraries must be downloaded), in a fresh temp dir. */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildIni, readUserIni, type CompileRequest } from './validate';
import type { ApiImage } from './images';

export const DOCKER_IMAGE = process.env.COMPILE_IMAGE || 'kundakode-pio';
export const TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS || 180_000);
const MAX_LOG = 200_000;

export type CompileResult = { ok: true; log: string; images: ApiImage[] } | { ok: false; log: string };

function run(cmd: string, args: string[], timeoutMs: number, onTimeout: () => void): Promise<{ code: number | null; log: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let timedOut = false;
    const add = (d: Buffer) => { log += d.toString(); if (log.length > MAX_LOG) log = log.slice(-MAX_LOG); };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => { timedOut = true; onTimeout(); child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, log: log + `\n${e.message}`, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, log, timedOut }); });
  });
}

export async function compile(req: CompileRequest): Promise<CompileResult> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kk-compile-'));
  const name = 'kk-' + randomUUID();
  try {
    const user = readUserIni(req.files['platformio.ini']);
    const libDeps = [...new Set([...req.libDeps, ...user.libDeps])];
    await writeFile(path.join(dir, 'platformio.ini'), buildIni(req.board, libDeps, user.monitorSpeed));
    for (const [rel, src] of Object.entries(req.files)) {
      if (rel === 'platformio.ini') continue;
      const dest = path.join(dir, rel);
      if (!dest.startsWith(dir + path.sep)) throw new Error('bad path');
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, src);
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 0;
    const args = [
      'run', '--rm', '--name', name,
      '--network', libDeps.length ? 'bridge' : 'none',
      '--cpus', '2', '--memory', '2g', '--pids-limit', '512',
      '-e', 'PLATFORMIO_SETTING_ENABLE_TELEMETRY=No', '-e', 'PLATFORMIO_SETTING_CHECK_PLATFORMIO_INTERVAL=36500',
      '-e', `HOST_UID=${uid}`, '-e', `HOST_GID=${gid}`,
      '-v', `${dir}:/work/project`,
      DOCKER_IMAGE, req.board,
    ];
    const r = await run('docker', args, TIMEOUT_MS, () => { spawn('docker', ['kill', name], { stdio: 'ignore' }); });
    if (r.timedOut) return { ok: false, log: r.log + `\nCompile timed out after ${Math.round(TIMEOUT_MS / 1000)} s` };
    if (r.code !== 0) return { ok: false, log: r.log };
    const manifest = JSON.parse(await readFile(path.join(dir, 'out', 'manifest.json'), 'utf8')) as { images: { name: string; address: number; file: string }[] };
    const images: ApiImage[] = [];
    for (const m of manifest.images) {
      const data = await readFile(path.join(dir, 'out', path.basename(m.file)));
      images.push({ address: m.address, name: m.name, data: data.toString('base64') });
    }
    return { ok: true, log: r.log, images };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
