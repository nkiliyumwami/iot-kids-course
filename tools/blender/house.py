"""smart_house.glb: a modern Rwandan family house that runs itself. 10 x 7 m, front facing -Y (+Z in three.js).
Nodes the code uses: Window_L, Window_R (their glass lights up) and Porch_Lamp."""
import sys, math, bpy, bmesh
import os; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector

T = os.path.join(HERE, 'tex') + '/'
out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else os.path.join(HERE, 'out', 'smart_house.glb')
reset()
W, D, H, O, P = 10.0, 7.0, 3.1, 0.75, 0.42  # width, depth, wall height, roof overhang, roof pitch
tp = math.tan(P)

PLASTER = material('Plaster', 0xffffff, rough=0.92, image=T + 'plaster.jpg')
BAND = material('Band', 0x2f6f8f, rough=0.8)
CONC = material('Concrete', 0xb8b2a8, rough=0.9)
TIN = material('Roof', 0xffffff, rough=0.42, metal=0.55, image=T + 'tin.jpg')
WHITE = material('Trim', 0xf6f5f0, rough=0.5)
FRAME = material('Frame', 0xf2f2ee, rough=0.4)
BARS = material('Bars', 0x23272b, rough=0.45, metal=0.6)
GLASS_L = material('WindowL', 0x1d2a36, rough=0.06, metal=0.3, emit=0xffc477, emit_s=0.0)
GLASS_R = material('WindowR', 0x1d2a36, rough=0.06, metal=0.3, emit=0xffc477, emit_s=0.0)
GLASS = material('Glass', 0x1d2a36, rough=0.06, metal=0.3)
DOOR = material('Door', 0xffffff, rough=0.6, image=T + 'wood.jpg')
STEEL = material('Steel', 0xc0c6cc, rough=0.25, metal=1.0)
LAMP = material('PorchLamp', 0xfff3d6, rough=0.2, emit=0xffd28a, emit_s=0.0)
CELLS = material('Cells', 0xffffff, rough=0.15, metal=0.3, coat=1.0, image=T + 'cells.jpg')
ALU = material('Aluminium', 0xb9c0c7, rough=0.3, metal=0.9)
TANK = material('Tank', 0x1c1d20, rough=0.55)
CAM = material('Camera', 0xf4f4f4, rough=0.3, coat=0.5)

def box(sx, sy, sz, loc, mat, bev=0.0, name=None):
    o = prim('cube', loc=loc, scale=(sx / 2, sy / 2, sz / 2), mat=mat, name=name)
    if bev:
        bevel(o, bev, 2)
    return o

def cut(o, cutters):
    for c in cutters:
        m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'EXACT'
    apply_mods(o)
    for c in cutters:
        bpy.data.objects.remove(c)

def cube_uv(o, size=1.5):
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=size); bpy.ops.object.mode_set(mode='OBJECT')

parts = []
# ---------- plinth, walls and the painted band, cut for windows and the door ----------
parts.append(box(W + 0.3, D + 0.3, 0.2, (0, 0, 0.1), CONC, 0.02))
walls = box(W, D, H, (0, 0, 0.2 + H / 2 - 0.1), PLASTER)
band = box(W + 0.03, D + 0.03, 0.6, (0, 0, 0.2 + 0.3), BAND)
FRONT = -D / 2
WIN = [(-3.2, 'L'), (3.2, 'R')]  # front windows (x, side)
SIDE_WIN = [((s * W / 2), y) for s in (-1, 1) for y in (-1.6, 1.6)]
cutters = [box(1.3, 0.5, 1.2, (x, FRONT, 1.75), WHITE) for x, _ in WIN]
cutters += [box(0.5, 1.2, 1.1, (x, y, 1.8), WHITE) for x, y in SIDE_WIN]
cutters += [box(1.1, 0.5, 2.25, (0, FRONT, 0.2 + 1.1), WHITE)]
cutters2 = [box(1.32, 0.5, 1.22, (x, FRONT, 1.75), WHITE) for x, _ in WIN] + [box(0.5, 1.22, 1.12, (x, y, 1.8), WHITE) for x, y in SIDE_WIN] + [box(1.12, 0.5, 2.27, (0, FRONT, 0.2 + 1.1), WHITE)]
cut(walls, cutters); cut(band, cutters2)
cube_uv(walls, 2.0)
parts += [walls, band]

def window(x, y, w, h, zc, facing, glass, name=None):
    """A recessed window: glass at the back, a white frame with a cross, a sill, and decorative burglar bars."""
    g = []
    n = Vector(facing)  # outward
    t = Vector((-n.y, n.x, 0))  # along the wall
    inset = 0.1
    def at(u, v, d):
        return Vector((x, y, zc)) + t * u + Vector((0, 0, v)) + n * d
    pane = box(w, 0.02, h, at(0, 0, -inset), glass, name=name)
    if abs(n.x) > 0.5:
        pane.rotation_euler = (0, 0, math.pi / 2); apply_tf(pane)
    g.append(pane)
    def bar(u, v, lu, lv, d, mat, th=0.06):
        b = box(lu, th, lv, at(u, v, d), mat, 0.008)
        if abs(n.x) > 0.5:
            b.rotation_euler = (0, 0, math.pi / 2); select_only([b]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        return b
    for u in (-w / 2, w / 2):
        g.append(bar(u, 0, 0.07, h + 0.07, -inset + 0.03, FRAME))
    for v in (-h / 2, h / 2):
        g.append(bar(0, v, w + 0.07, 0.07, -inset + 0.03, FRAME))
    g.append(bar(0, 0, 0.05, h, -inset + 0.03, FRAME)); g.append(bar(0, 0.12, w, 0.05, -inset + 0.03, FRAME))
    g.append(bar(0, -h / 2 - 0.06, w + 0.25, 0.06, 0.05, CONC, th=0.16))  # the sill
    for k in range(1, 6):  # burglar bars with a diamond in the middle
        g.append(bar(-w / 2 + k * w / 6, 0, 0.018, h - 0.02, 0.0, BARS, th=0.018))
    for v in (-h / 4, h / 4):
        g.append(bar(0, v, w - 0.02, 0.018, 0.0, BARS, th=0.018))
    return g

for x, side in WIN:
    parts += window(x, FRONT, 1.3, 1.2, 1.75, (0, -1, 0), GLASS_L if side == 'L' else GLASS_R, name='Window_' + side)
for x, y in SIDE_WIN:
    parts += window(x, y, 1.2, 1.1, 1.8, (1 if x > 0 else -1, 0, 0), GLASS)
# ---------- the door, its frame, two steps and a little canopy ----------
door = box(1.0, 0.06, 2.15, (0, FRONT + 0.08, 0.2 + 1.075), DOOR, 0.01)
parts.append(door)
for zz in (0.62, 1.32, 1.98):
    for xx in (-0.22, 0.22):
        parts.append(box(0.32, 0.03, 0.5 if zz < 1.9 else 0.32, (xx, FRONT + 0.04, zz), DOOR, 0.01))
parts.append(box(0.06, 0.06, 0.06, (0.36, FRONT + 0.0, 1.2), STEEL, 0.01))
for u in (-0.55, 0.55):
    parts.append(box(0.08, 0.14, 2.3, (u, FRONT - 0.02, 0.2 + 1.13), FRAME, 0.01))
parts.append(box(1.18, 0.14, 0.08, (0, FRONT - 0.02, 0.2 + 2.3), FRAME, 0.01))
parts.append(box(1.8, 0.45, 0.2, (0, FRONT - 0.37, 0.1), CONC, 0.02))
parts.append(box(1.5, 0.35, 0.12, (0, FRONT - 0.72, 0.06), CONC, 0.02))
# the porch lamp and a small security camera: this is a smart home
parts.append(box(0.14, 0.05, 0.22, (0.9, FRONT - 0.03, 2.3), BARS, 0.01))
lamp = prim('cylinder', loc=(0.9, FRONT - 0.11, 2.3), radius=0.07, depth=0.2, vertices=20, mat=LAMP, name='Porch_Lamp'); bevel(lamp, 0.02, 2); smooth(lamp, 40)
cam = prim('uv_sphere', loc=(-0.85, FRONT - 0.08, 2.48), radius=0.07, segments=20, ring_count=12, scale=(1, 1, 0.75), mat=CAM); smooth(cam); parts.append(cam)
parts.append(prim('cylinder', loc=(-0.85, FRONT - 0.13, 2.45), radius=0.025, depth=0.03, vertices=16, rot=(math.radians(90), 0, 0), mat=GLASS))
# the smart meter on the right wall
parts.append(box(0.06, 0.32, 0.42, (W / 2 + 0.03, -2.6, 1.6), WHITE, 0.01))
parts.append(box(0.02, 0.16, 0.08, (W / 2 + 0.065, -2.6, 1.68), material('Display', 0x6fd3ff, rough=0.2, emit=0x6fd3ff, emit_s=1.2)))

# ---------- the hip roof of corrugated iron, with ridge and hip caps, fascia, soffit and gutters ----------
Z0 = 0.2 + H - 0.1 - O * tp  # eave height (the roof meets the wall top at the wall line)
ZR = 0.2 + H - 0.1 + (D / 2) * tp
E = [Vector((-(W / 2 + O), -(D / 2 + O), Z0)), Vector(((W / 2 + O), -(D / 2 + O), Z0)), Vector(((W / 2 + O), (D / 2 + O), Z0)), Vector((-(W / 2 + O), (D / 2 + O), Z0))]
R0, R1 = Vector((-(W - D) / 2, 0, ZR)), Vector(((W - D) / 2, 0, ZR))
def roof_face(a, b, c, d_, name):
    """A sheet from eave edge a-b up to ridge edge d_-c, corrugated across the eave direction."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    L = (b - a).length; n = max(2, int(L / 0.038)); rows = 1
    nrm = (b - a).cross(d_ - a).normalized()
    if nrm.z < 0: nrm = -nrm
    uvl = bm.loops.layers.uv.new()
    grid = []
    for i in range(n + 1):
        f = i / n; bot = a.lerp(b, f); top = d_.lerp(c, f); col = []
        for j in range(rows + 1):
            g = j / rows; p = bot.lerp(top, g)
            p = p + nrm * 0.014 * math.sin(f * L / 0.076 * 2 * math.pi)
            col.append((bm.verts.new(p), (f * L / 2.0, g * (top - bot).length / 2.0)))
        grid.append(col)
    for i in range(n):
        for j in range(rows):
            vs = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            try:
                fc = bm.faces.new([v[0] for v in vs])
            except ValueError:
                continue
            for lp, v in zip(fc.loops, vs):
                lp[uvl].uv = v[1]
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); me.materials.append(TIN)
    return smooth(o)  # single sheet: the material is two-sided
roof = [roof_face(E[0], E[1], R1, R0, 'RoofFront'), roof_face(E[2], E[3], R0, R1, 'RoofBack'), roof_face(E[1], E[2], R1, R1, 'RoofRight'), roof_face(E[3], E[0], R0, R0, 'RoofLeft')]
parts += roof
def rod(p0, p1, r, mat, seg=12):
    o = prim('cylinder', loc=(0, 0, 0), radius=r, depth=(p1 - p0).length, vertices=seg, mat=mat)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (p1 - p0).normalized().to_track_quat('Z', 'Y'); o.location = (p0 + p1) / 2
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return smooth(o)
parts.append(rod(R0 + Vector((0, 0, 0.03)), R1 + Vector((0, 0, 0.03)), 0.09, TIN))
for e, r in ((E[0], R0), (E[1], R1), (E[2], R1), (E[3], R0)):
    parts.append(rod(e + Vector((0, 0, 0.03)), r + Vector((0, 0, 0.03)), 0.07, TIN))
for k in range(4):  # fascia boards and gutters
    a, b = E[k], E[(k + 1) % 4]
    mid = (a + b) / 2; L = (b - a).length; along_x = abs(b.x - a.x) > 0.1
    fa = box(L if along_x else 0.04, 0.04 if along_x else L, 0.2, mid - Vector((0, 0, 0.1)), WHITE)
    parts.append(fa)
    if along_x:
        out_dir = Vector((0, -1 if a.y < 0 else 1, 0))
        parts.append(rod(a + out_dir * 0.08 + Vector((0, 0, -0.12)), b + out_dir * 0.08 + Vector((0, 0, -0.12)), 0.06, ALU, 14))
soffit = box(W + 2 * O, D + 2 * O, 0.02, (0, 0, Z0 - 0.19), WHITE); parts.append(soffit)

# ---------- solar panels on the front slope ----------
f = 0.45
for cx in (-2.55, -0.85, 0.85, 2.55):
    p = E[0].lerp(R0, f); p = Vector((cx, p.y, p.z)) + Vector((0, -math.sin(P), math.cos(P))) * 0.09
    fr = box(1.6, 1.05, 0.045, p, ALU, 0.008); fr.rotation_euler = (P, 0, 0); apply_tf(fr)
    select_only([fr]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False); parts.append(fr)
    pl = prim('plane', loc=p + Vector((0, -math.sin(P), math.cos(P))) * 0.025, scale=(0.77, 0.5, 1), rot=(P, 0, 0), mat=CELLS); parts.append(pl)

# ---------- a rainwater tank at the back corner, fed by a downpipe ----------
tank = prim('cylinder', loc=(W / 2 + 1.0, D / 2 - 0.9, 0.35 + 0.7), radius=0.6, depth=1.4, vertices=40, mat=TANK)
deform(tank, lambda q: Vector((q.x, q.y, q.z)) + (Vector((q.x - (W / 2 + 1.0), q.y - (D / 2 - 0.9), 0)).normalized() * 0.02 * (1 if int((q.z - 0.35) / 0.18) % 2 else 0)))
bevel(tank, 0.05, 3); smooth(tank, 35); parts.append(tank)
parts.append(box(1.4, 1.4, 0.35, (W / 2 + 1.0, D / 2 - 0.9, 0.175), CONC, 0.02))
parts.append(rod(Vector((W / 2 + 0.75, D / 2 + O + 0.08, Z0 - 0.15)), Vector((W / 2 + 0.75, D / 2 - 0.4, Z0 - 0.15)), 0.035, ALU))
parts.append(rod(Vector((W / 2 + 0.75, D / 2 - 0.4, Z0 - 0.15)), Vector((W / 2 + 1.0, D / 2 - 0.9, 1.85)), 0.035, ALU))

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    apply_mods(o)
named = {o.name for o in meshes if o.name in ('Window_L', 'Window_R', 'Porch_Lamp')}
rest = [o for o in meshes if o.name not in named]
# merge by material so the house is a handful of draw calls; keep the named parts separate
house = join(rest, 'House')
bpy.context.view_layer.update()
final = [house] + [bpy.data.objects[n] for n in named]
bake_ao(final, rays=18, dist=0.9, strength=0.6)
print('TRIANGLES', tri_count(final), 'NAMED', sorted(named))
export(out, final)
render_preview(out.replace('.glb', '_preview.png'), target=(0, 0, 2.0), dist=17, elev=14, azim=-30, lens=45, res=(1200, 800))
