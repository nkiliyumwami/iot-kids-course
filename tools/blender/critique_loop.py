#!/usr/bin/env python3
"""Render-and-critique loop for the two pupils (child.py), a capped pilot.

Each iteration:
  1. builds child_a.glb (boy) and child_b.glb (girl) from child.py in headless Blender,
  2. renders each one (front, 3/4 waving, side, face close-up; render_child.py) and both inside the real story
     scene with the home page's lighting (story_render.mjs),
  3. sends the renders, child.py and a checklist to Claude Opus 5.5, which returns prioritized issues and exact
     search/replace edits to child.py,
  4. applies the edits (only to child.py), rebuilds, and repeats until the critique passes, the iteration cap
     (4) is hit, or the budget cap would be exceeded.

The API key is read ONLY from the environment variable KUNDAKODE_API_KEY and passed explicitly to the client
as api_key. It is never printed, logged or written anywhere. ANTHROPIC_API_KEY is never used.

Every response's token usage is priced and appended to <work>/ledger.json (so the cap holds across restarts),
and the running cost is printed after each call. Before each call the worst case of that call is reserved:
if spent + reserve would pass the cap, the loop stops without calling.

Usage:
  python critique_loop.py --bpy /path/to/python-with-bpy --work /tmp/kk-critique [--three /path/to/three/package]
                          [--cap 10] [--iterations 4] [--dry-run]
--dry-run renders and builds the request but never calls the API and never reads KUNDAKODE_API_KEY.
"""
import argparse, base64, io, json, os, shutil, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CHILD = HERE / 'child.py'
KEY_VAR = 'KUNDAKODE_API_KEY'  # the only place the key comes from (never ANTHROPIC_API_KEY)
MODEL = 'claude-opus-5-5'
# $ per million tokens: input, output, cache read. Cache writes are 1.25 x input.
PRICES = {
    'claude-opus-5-5': (4.0, 20.0, 0.20),
    'claude-opus-5': (5.0, 25.0, 0.50),
    'claude-opus-4-8': (5.0, 25.0, 0.50),
    'claude-fable-5-1': (10.0, 50.0, 1.00),
    'claude-fable-5': (10.0, 50.0, 1.00),
}
WORST = (10.0, 50.0)  # the most a fallback model could charge per MTok
MAX_TOKENS = 64000  # streaming; thinking counts against it (16000 cut round 3 of the first pilot off mid-reply)
MAX_EDITS = 6       # small batches, so a reply always fits
TRI_CAP = 22000

CHECKLIST = [
    'Friendly, appealing proportions for a stylised 10-year-old',
    'One smooth body: no seams, creases or tearing at shoulders, elbows, hips and knees, standing, walking or waving',
    'Readable hands, not blocks',
    'A natural wave: the arm bends at the elbow, slight head and body movement, a relaxed idle arm',
    'A relaxed, natural idle pose',
    'Faces stay readable under scene lighting: skin tone must not go so dark that eyes and mouth disappear',
    "Clothing reads clearly (boy: light blue shirt, navy shorts; girl: white shirt, green skirt; school socks and shoes)",
    "Still matches the story's soft, toy-like style",
]

SYSTEM = """You are a senior character artist reviewing two stylised 3D characters for a free coding course for
children aged 10-15 in Rwanda (IoT for Young Makers by KundaKode). They are primary-school pupils who appear in the
home page's 3D story: a boy (variant 'a': light blue shirt, navy shorts, orange school bag) and a girl (variant 'b':
white shirt, green pleated skirt, hair puffs, blue bag), both with white school socks and shoes. They are built by a
headless Blender (bpy) script, child.py, which you can change only through exact search/replace edits.

How child.py works: soft volumes (capsules, ellipsoids, the head sphere) are fused by a voxel remesh into ONE continuous
body mesh, smoothed, decimated to the triangle budget (BUDGET), cut cleanly at the clothing borders and coloured per
face. Clothes, shoes, face, hair and the bag are separate layers. An armature (bones in BONES) carries everything with
skin weights computed in the script. POSE holds the idle and wave numbers; it is exported in the model and the story
(three.js) and the review renders both animate the bones with it (kid_pose.py), so changing POSE changes the motion
you see in the wave and idle renders.

Hard rules for every edit:
- Edit child.py only. Keep it runnable by itself in Blender 5.2 headless (bpy), using the helpers shown in lib.py.
- Keep the rig contract: bone names Body, Spine, Chest, Neck, Head, Shoulder_L/R, Elbow_L/R, Hand_L/R, Hip_L/R,
  Knee_L/R, Foot_L/R with the same parents; the armature object named Child; the child faces -Y in Blender; _L is the
  child's left (+X); the POSE keys (you may change their values). Keep the export call and the TRIANGLES print.
- Keep each model under 22,000 triangles (BUDGET may not go above 21,600).
- Keep assets generic: no logos, brands, letters or text on clothing or bags.
- Do not change the girl's clothing type (she wears a skirt).
- Keep the soft, rounded, toy-like style of the rest of the story (no realism, no sharp edges).
- Return at most 6 edits per round. Each edit's `old` must be copied exactly from the current child.py, occur exactly
  once in it, and be short (a few lines). Prefer the few highest-impact edits.

If something needs a change outside child.py (the motion formula in kid_pose.py / the story code), describe it in
pose_notes instead of editing.

Judge each checklist item for each child. Set passes = true only if every item passes for both children."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'passes': {'type': 'boolean'},
        'criteria': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'criterion': {'type': 'string'}, 'child': {'type': 'string', 'enum': ['boy', 'girl', 'both']},
            'pass': {'type': 'boolean'}, 'note': {'type': 'string'}},
            'required': ['criterion', 'child', 'pass', 'note'], 'additionalProperties': False}},
        'issues': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'priority': {'type': 'integer'}, 'child': {'type': 'string', 'enum': ['boy', 'girl', 'both']},
            'issue': {'type': 'string'}},
            'required': ['priority', 'child', 'issue'], 'additionalProperties': False}},
        'edits': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'old': {'type': 'string'}, 'new': {'type': 'string'}, 'reason': {'type': 'string'}},
            'required': ['old', 'new', 'reason'], 'additionalProperties': False}},
        'pose_notes': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['passes', 'criteria', 'issues', 'edits', 'pose_notes'],
    'additionalProperties': False,
}


def run(cmd, timeout=1800, env=None):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    return p.returncode, (p.stdout + p.stderr)


def build(args, out):
    """child.py -> child_a.glb, child_b.glb. Returns (ok, triangles, log)."""
    out.mkdir(parents=True, exist_ok=True)
    tris, log = {}, ''
    for v in 'ab':
        code, text = run([args.bpy, str(CHILD), str(out / f'child_{v}.glb'), v])
        tri = [l for l in text.splitlines() if l.startswith('TRIANGLES')]
        if code != 0 or not tri or not (out / f'child_{v}.glb').exists():
            return False, tris, text[-3000:]
        tris[v] = int(tri[-1].split()[1])
        if tris[v] > TRI_CAP:
            return False, tris, f'child_{v}.glb has {tris[v]} triangles, over the {TRI_CAP} limit.'
    return True, tris, log


def site_with(models_dir, site):
    """A copy of the site (symlinks) whose story child models are the ones being checked."""
    if site.exists():
        shutil.rmtree(site)
    (site / 'assets' / 'story' / 'models').mkdir(parents=True)
    for d in (REPO / 'assets').iterdir():
        if d.name != 'story':
            (site / 'assets' / d.name).symlink_to(d)
    for f in (REPO / 'assets' / 'story').iterdir():
        if f.name != 'models':
            (site / 'assets' / 'story' / f.name).symlink_to(f)
    for f in (REPO / 'assets' / 'story' / 'models').iterdir():
        if f.name not in ('child_a.glb', 'child_b.glb'):
            (site / 'assets' / 'story' / 'models' / f.name).symlink_to(f)
    for v in 'ab':
        shutil.copy(models_dir / f'child_{v}.glb', site / 'assets' / 'story' / 'models' / f'child_{v}.glb')


def render(args, it_dir):
    for v, name in (('a', 'boy'), ('b', 'girl')):
        code, text = run([args.bpy, str(HERE / 'render_child.py'), str(it_dir / f'child_{v}.glb'), str(it_dir), name])
        if code != 0 or 'RENDERED' not in text:
            raise RuntimeError(f'Blender render failed for {name}:\n{text[-2000:]}')
    site_with(it_dir, it_dir / 'site')
    cmd = ['node', str(HERE / 'story_render.mjs'), str(it_dir / 'site'), str(it_dir)] + ([args.three] if args.three else [])
    env = dict(os.environ)
    if not env.get('NODE_PATH'):
        code, root = run(['npm', 'root', '-g'])
        env['NODE_PATH'] = root.strip()
    code, text = run(cmd, env=env)
    if 'STORY RENDERED' not in text:
        raise RuntimeError(f'Story render failed:\n{text[-2000:]}')
    shutil.rmtree(it_dir / 'site', ignore_errors=True)


IMAGES = [('boy_front', 'Boy, front, standing'), ('boy_wave34', 'Boy, 3/4 view, waving (the story pose)'),
          ('boy_side', 'Boy, side'), ('boy_face', 'Boy, face close-up'), ('boy_walk', 'Boy, side, mid-stride (the walk)'),
          ('girl_front', 'Girl, front, standing'), ('girl_wave34', 'Girl, 3/4 view, waving (the story pose)'),
          ('girl_side', 'Girl, side'), ('girl_face', 'Girl, face close-up'),
          ('story_wide', 'Both in the real story scene and lighting (girl left, boy right), waving'),
          ('story_faces', 'Closer view in the story scene and lighting')]


def image_block(path):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im.thumbnail((1024, 1024))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88)
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': base64.standard_b64encode(buf.getvalue()).decode()}}


def request(it_dir, history, tris):
    content = []
    for stem, label in IMAGES:
        content.append({'type': 'text', 'text': label + ':'})
        content.append(image_block(it_dir / f'{stem}.png'))
    hist = '\n'.join(history) if history else '(first round)'
    content.append({'type': 'text', 'text':
        'Checklist:\n' + '\n'.join(f'- {c}' for c in CHECKLIST) +
        f'\n\nTriangle counts now: boy {tris.get("a")}, girl {tris.get("b")}.' +
        f'\n\nEarlier rounds:\n{hist}' +
        '\n\nlib.py (helpers, read-only):\n```python\n' + (HERE / 'lib.py').read_text() + '\n```' +
        '\n\nkid_pose.py (the motion formula, read-only):\n```python\n' + (HERE / 'kid_pose.py').read_text() + '\n```' +
        '\n\nchild.py (the file you can edit):\n```python\n' + CHILD.read_text() + '\n```' +
        f'\n\nReview the renders against the checklist and return prioritized issues and at most {MAX_EDITS} exact search/replace edits to child.py.'})
    return [{'role': 'user', 'content': content}]


def price(usage, model):
    inp, out, cread = PRICES.get(model, WORST + (WORST[0] * 0.1,))
    ci = getattr(usage, 'cache_creation_input_tokens', 0) or 0
    cr = getattr(usage, 'cache_read_input_tokens', 0) or 0
    return (usage.input_tokens * inp + ci * inp * 1.25 + cr * cread + usage.output_tokens * out) / 1e6


def load_ledger(path):
    return json.loads(path.read_text()) if path.exists() else []


def spent(ledger):
    return sum(e['cost_usd'] for e in ledger)


def apply_edits(edits):
    src = CHILD.read_text()
    applied, skipped = [], []
    for e in edits:
        n = src.count(e['old'])
        if n == 1 and e['old'] != e['new']:
            src = src.replace(e['old'], e['new']); applied.append(e)
        else:
            skipped.append({**e, 'why_skipped': f'found {n} times' if n != 1 else 'no change'})
    CHILD.write_text(src)
    return applied, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpy', required=True, help='a Python with the bpy module (pip install bpy==5.2.2)')
    ap.add_argument('--work', required=True)
    ap.add_argument('--three', default='', help='local three@0.128.0 npm package (optional)')
    ap.add_argument('--cap', type=float, default=10.0)
    ap.add_argument('--iterations', type=int, default=4)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    work = Path(args.work); work.mkdir(parents=True, exist_ok=True)
    ledger_path = work / 'ledger.json'
    ledger = load_ledger(ledger_path)
    report = work / 'report.md'
    shutil.copy(CHILD, work / 'child.before.py') if not (work / 'child.before.py').exists() else None

    client = None
    if not args.dry_run:
        import anthropic
        key = os.environ.get(KEY_VAR, '').strip()
        if not key:
            sys.exit(f'{KEY_VAR} is not set. Nothing was called.')
        client = anthropic.Anthropic(api_key=key, max_retries=2)  # explicit key; never printed, logged or stored
        del key

    history = []
    print(f'Budget cap ${args.cap:.2f}; already spent ${spent(ledger):.4f} (ledger {ledger_path})', flush=True)
    for i in range(args.iterations):
        it = work / f'iter{i}'
        ok, tris, log = build(args, it)
        if not ok:
            history.append(f'Round {i}: child.py failed to build; reverted its edits. Error tail:\n{log[-1500:]}')
            print('Build failed; reverting the last edits.', flush=True)
            shutil.copy(work / f'child.iter{i-1}.py' if i else work / 'child.before.py', CHILD)
            ok, tris, log = build(args, it)
            if not ok:
                sys.exit('The reverted child.py does not build either; stopping.')
        render(args, it)
        shutil.copy(CHILD, work / f'child.iter{i}.py')
        messages = request(it, history, tris)
        if args.dry_run:
            print(f'[dry run] round {i}: renders in {it}; request built ({len(messages[0]["content"])} blocks). Not calling the API.')
            return
        # reserve the worst case of this call before making it (a refusal plus a fallback rescue, both at full length)
        n_in = client.messages.count_tokens(model=MODEL, system=SYSTEM, messages=messages).input_tokens
        reserve = 2 * (n_in * WORST[0] + MAX_TOKENS * WORST[1]) / 1e6
        if spent(ledger) + reserve > args.cap:
            print(f'Stopping before round {i}: spent ${spent(ledger):.4f} + worst case ${reserve:.2f} would pass the ${args.cap:.2f} cap.', flush=True)
            break
        t0 = time.time()
        with client.beta.messages.stream(
            model=MODEL, max_tokens=MAX_TOKENS, system=SYSTEM, messages=messages,
            thinking={'type': 'adaptive'},
            output_config={'effort': 'high', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
            betas=['server-side-fallback-2026-07-01'], fallbacks='default',
        ) as stream:
            resp = stream.get_final_message()
        served = resp.model
        cost = max(price(resp.usage, served), price(resp.usage, MODEL))
        ledger.append({'round': i, 'model': served, 'input_tokens': resp.usage.input_tokens, 'output_tokens': resp.usage.output_tokens,
                       'cache_read': getattr(resp.usage, 'cache_read_input_tokens', 0) or 0, 'cost_usd': round(cost, 6),
                       'stop_reason': resp.stop_reason, 'seconds': round(time.time() - t0, 1)})
        ledger_path.write_text(json.dumps(ledger, indent=1))
        print(f'Round {i}: {resp.usage.input_tokens} in / {resp.usage.output_tokens} out tokens on {served}: ${cost:.4f}. '
              f'Running total ${spent(ledger):.4f} of ${args.cap:.2f}.', flush=True)
        if resp.stop_reason == 'max_tokens':  # cut off: nothing applied; ask for a smaller batch next round
            print(f'Round {i}: the reply was cut off (max_tokens); nothing applied, asking for fewer, smaller edits.', flush=True)
            history.append(f'Round {i}: your reply was cut off before it finished. Return fewer, shorter edits.')
            continue
        if resp.stop_reason != 'end_turn':
            print(f'Stopping: stop_reason = {resp.stop_reason}.', flush=True)
            break
        data = json.loads(next(b.text for b in resp.content if b.type == 'text'))
        (it / 'critique.json').write_text(json.dumps(data, indent=1))
        with report.open('a') as f:
            f.write(f'\n## Round {i}\n\nPasses: {data["passes"]}\n\n' +
                    ''.join(f'- [{"x" if c["pass"] else " "}] {c["criterion"]} ({c["child"]}): {c["note"]}\n' for c in data['criteria']) +
                    '\nIssues:\n' + ''.join(f'{x["priority"]}. ({x["child"]}) {x["issue"]}\n' for x in sorted(data['issues'], key=lambda x: x['priority'])) +
                    ('\nPose notes (not applied, outside child.py):\n' + ''.join(f'- {p}\n' for p in data['pose_notes']) if data['pose_notes'] else ''))
        if data['passes']:
            print('The critique passes. Done.', flush=True)
            break
        applied, skipped = apply_edits(data['edits'][:MAX_EDITS])
        with report.open('a') as f:
            f.write('\nEdits applied:\n' + ''.join(f'- {e["reason"]}\n' for e in applied) +
                    ('Edits skipped:\n' + ''.join(f'- {e["reason"]} ({e["why_skipped"]})\n' for e in skipped) if skipped else ''))
        history.append(f'Round {i}: issues found: ' + '; '.join(x['issue'] for x in data['issues'][:6]) +
                       f'. Edits applied: {len(applied)}, skipped: {len(skipped)} ' +
                       ('(' + '; '.join(e['why_skipped'] + ' for: ' + e['reason'] for e in skipped) + ')' if skipped else ''))
        print(f'Round {i}: {len(applied)} edits applied, {len(skipped)} skipped.', flush=True)
    else:
        i = args.iterations
    # the final state: build and render once more (no API call) for the before/after images
    final = work / 'final'
    ok, tris, log = build(args, final)
    if ok:
        render(args, final)
        print(f'Final models and renders in {final} (triangles {tris}).')
    else:
        print('The final child.py did not build:\n' + log[-1500:])
    print(f'Total API cost: ${spent(ledger):.4f}')


if __name__ == '__main__':
    main()
