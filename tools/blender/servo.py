"""sg90-servo.glb: an SG90 micro servo screwed into a little plywood bracket, for the "Servo Says Hello" module.
Real sizes, modelled in millimetres and exported under a root node scaled 0.001 (so the file is in metres, like the
other models; the module scales it by 1000 to sit beside the ESP32 board on the millimetre desk).

The servo stands upright with its output shaft facing the learner (-Y in Blender, +Z in three.js), so the horn sweeps
like a clock hand: angle 0 points right (+X), 90 points up, 180 points left.

Nodes the module uses:
  SG90_Servo        root (scale 0.001)
  Servo_Case        the blue plastic case: caps, mounting tabs, gear bosses
  Servo_Shaft       the white splined output shaft
  Servo_Label       the sticker and the raised "SG90" text
  Horn              the white arm. Pivot on the shaft axis, arm along +X at rest: rotate it about its local Z (three.js)
  Horn_Tip          an empty at the end of the arm (for labels)
  Hand              a cardboard "hello" hand on a stick, child of Horn (the module hides it until Mission 6)
  Wire_Ground, Wire_Power, Wire_Signal   the brown, red and orange wires
  Connector         the black 3-pin plug at the end of the cable
  Sock_Ground, Sock_Power, Sock_Signal   empties at the plug's three sockets (where jumper wires start)
  Stand             the plywood bracket: base, upright panel with a cut-out, two braces and the two screws

Run:  blender -b --factory-startup -P servo.py -- out/sg90-servo.glb
(or ./bpyenv/bin/python servo.py out/sg90-servo.glb). It also renders out/sg90-servo_preview.png."""
import sys, os, math, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'sg90-servo.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
reset()

BLUE = material('Servo_Blue', 0x2c62d6, rough=0.32, coat=0.6)
BLUE_D = material('Servo_Seam', 0x16306b, rough=0.6)
WHITE = material('Nylon_White', 0xf3f1ea, rough=0.45)
STICKER = material('Sticker', 0xe9eef5, rough=0.55)
INK = material('Ink', 0x1b2430, rough=0.6)
SILVER = material('Screw', 0xbfc5cc, rough=0.25, metal=1.0)
PLY = material('Plywood', 0xd8b98c, rough=0.75)
PLY_EDGE = material('Plywood_Edge', 0xb8915e, rough=0.8)
KRAFT = material('Cardboard', 0xc79a5d, rough=0.85)
STICK = material('Lolly_Stick', 0xe8d3a6, rough=0.7)
BROWN = material('Wire_Brown', 0x6b4226, rough=0.45)
RED = material('Wire_Red', 0xc8262c, rough=0.45)
ORANGE = material('Wire_Orange', 0xf08a24, rough=0.45)
PLUG = material('Plug_Black', 0x1d2024, rough=0.5)
HOLE = material('Socket_Hole', 0x050607, rough=0.9)

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0, name=None):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat, name=name)
    if bev:
        bevel(o, bev, 2)
    return o

def cyl(x, y, z0, z1, r, mat, verts=32, bev=0.0):
    o = prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=verts, mat=mat)
    if bev:
        bevel(o, bev, 2)
    return smooth(o, 40)

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o

def text(body, size, mat, extrude=0.06):
    cd = bpy.data.curves.new('txt', 'FONT'); cd.body = body; cd.size = size; cd.extrude = extrude
    cd.align_x = 'CENTER'; cd.align_y = 'CENTER'; cd.resolution_u = 3
    o = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat)
    return o

def place(o, m):
    """Bake the object's own placement, then a matrix, into the mesh (the object ends at the origin, unrotated)."""
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
    o.data.transform(m); o.data.update()
    return o

# ---------- the servo, built "natural": output shaft along +Z, long side along X, body bottom at z = 0 ----------
SX = 5.5   # the output shaft sits 5.5 mm from the middle, towards one end
case = []
case.append(box(-11.4, 11.4, -6.1, 6.1, 0.0, 3.3, BLUE, 0.5))            # bottom cap
case.append(box(-11.25, 11.25, -5.95, 5.95, 3.0, 20.0, BLUE_D))          # dark core: shows as the two seams
case.append(box(-11.4, 11.4, -6.1, 6.1, 3.6, 19.2, BLUE, 0.3))           # middle
tabs = box(-16.2, 16.2, -6.1, 6.1, 15.6, 18.1, BLUE, 0.3)                # mounting tabs
for s in (-1, 1):
    cut(tabs, prim('cylinder', loc=(s * 13.95, 0, 16.85), radius=1.1, depth=6, vertices=20))
    cut(tabs, prim('cube', loc=(s * 15.3, 0, 16.85), scale=(1.1, 0.4, 3)))
case.append(tabs)
case.append(box(-11.4, 11.4, -6.1, 6.1, 19.5, 22.5, BLUE, 0.5))          # top cap
case.append(cyl(SX, 0, 22.4, 26.0, 5.9, BLUE, 40, 0.5))                  # big gear boss over the shaft
case.append(cyl(-1.6, 0, 22.4, 24.8, 3.0, BLUE, 28, 0.4))                # small gear boss
for o in case:
    smooth(o, 35)
case = join(case, 'Servo_Case')

shaft = [cyl(SX, 0, 25.9, 26.6, 3.0, WHITE, 32, 0.2)]                    # collar
spl = prim('cylinder', loc=(SX, 0, 27.7), radius=2.35, depth=2.4, vertices=42, mat=WHITE)
deform(spl, lambda p: (lambda a, r: Vector((SX + math.cos(a) * r * (0.94 if round(a / (2 * math.pi) * 21 * 2) % 2 else 1.0), math.sin(a) * r * (0.94 if round(a / (2 * math.pi) * 21 * 2) % 2 else 1.0), p.z)) if r > 0.5 else p)(math.atan2(p.y, p.x - SX), math.hypot(p.x - SX, p.y)))
shaft.append(spl)
shaft = join(shaft, 'Servo_Shaft')

# the label: a sticker on the side, and "SG90" raised on the top cap beside the gears
label = []
label.append(box(-10.0, 10.0, 6.1, 6.22, 4.4, 13.4, STICKER))
t1 = text('SG90', 3.6, INK); place(t1, Matrix.Translation((0, 6.24, 0)) @ Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1))) @ Matrix.Translation((0, 1.4, 0)))
t2 = text('9g MICRO SERVO', 1.9, INK); place(t2, Matrix.Translation((0, 6.24, 0)) @ Matrix(((0, 1, 0, 0), (0, 0, 1, 0), (1, 0, 0, 0), (0, 0, 0, 1))) @ Matrix.Translation((0, -1.9, 0)))
for t in (t1, t2):   # text lies flat in its XY plane: move it onto the sticker (natural +Y face, reading along Z, up along X)
    deform(t, lambda p: Vector((p.x, p.y, p.z + 8.9)))
t3 = text('SG90', 3.0, WHITE, 0.12); place(t3, Matrix.Translation((-8.1, 0, 22.5)) @ Matrix.Rotation(math.radians(-90), 4, 'Z'))
label += [t1, t2, t3]
label = join(label, 'Servo_Label')

# the horn: hub on the shaft, a tapered arm with six holes along natural -Y (this becomes +X, "pointing right")
HZ0, HZ1 = 28.4, 32.2
hub = cyl(SX, 0, HZ0, HZ1, 3.7, WHITE, 40, 0.35)
arm = bpy.data.meshes.new('arm'); bm = bmesh.new()
L, W0, W1, T0 = 17.0, 3.2, 1.9, 30.6
# outline: straight tapered sides and a round tip
pts = [(SX - W0, 0), (SX - W1, -L)] + [(SX + math.cos(a) * W1, -L + math.sin(a) * W1) for a in [math.pi + math.pi * j / 10 for j in range(1, 10)]] + [(SX + W1, -L), (SX + W0, 0)]
vb = [bm.verts.new((x, y, T0)) for x, y in pts]
vt = [bm.verts.new((x, y, HZ1)) for x, y in pts]
bm.faces.new(vb[::-1]); bm.faces.new(vt)
for i in range(len(pts)):
    j = (i + 1) % len(pts); bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
bm.to_mesh(arm); bm.free()
armo = bpy.data.objects.new('arm', arm); bpy.context.scene.collection.objects.link(armo); armo.data.materials.append(WHITE)
bevel(armo, 0.3, 2, 40); apply_mods(armo)
for k in range(6):
    cut(armo, prim('cylinder', loc=(SX, -6.6 - k * 2.0, 31.4), radius=0.55, depth=4, vertices=14))
screw = cyl(SX, 0, HZ1, HZ1 + 0.6, 1.3, SILVER, 20, 0.2)
horn = join([hub, armo, screw], 'Horn')
smooth(horn, 35)

# a cardboard hand on a lolly stick, glued to the end of the arm, facing the learner
hand = []
hand.append(box(SX - 1.25, SX + 1.25, -L - 6.5, -L + 2.0, HZ1, HZ1 + 0.9, STICK, 0.3))
hand.append(box(SX - 6.2, SX + 6.2, -L - 16.0, -L - 5.0, HZ1 + 0.9, HZ1 + 2.0, KRAFT, 0.8))
for k, (fx, ln) in enumerate([(-4.6, 7.0), (-1.55, 8.6), (1.55, 8.4), (4.6, 6.6)]):
    f = cyl(0, 0, 0, ln, 1.45, KRAFT, 16)
    place(f, Matrix.Translation((SX + fx, -L - 15.0, HZ1 + 1.45)) @ Matrix.Rotation(math.radians(90), 4, 'X'))
    deform(f, lambda p: Vector((p.x, p.y, HZ1 + 0.9 + (p.z - HZ1 - 0.9) * 0.38)))
    hand.append(f)
th = cyl(0, 0, 0, 6.0, 1.5, KRAFT, 16)
place(th, Matrix.Translation((SX + 5.4, -L - 8.5, HZ1 + 1.45)) @ Matrix.Rotation(math.radians(45), 4, 'Z') @ Matrix.Rotation(math.radians(90), 4, 'X'))
deform(th, lambda p: Vector((p.x, p.y, HZ1 + 0.9 + max(0.0, (p.z - HZ1 - 0.9)) * 0.38)))
hand.append(th)
hi = text('HI!', 4.2, INK, 0.08); place(hi, Matrix.Translation((SX, -L - 10.6, HZ1 + 2.02)) @ Matrix.Rotation(math.radians(180), 4, 'Z'))
hand.append(hi)
hand = join(hand, 'Hand')
smooth(hand, 40)

# ---------- the cable and plug (built straight into the mount's coordinates below) ----------
# natural -> Blender: x_b = -y_n, y_b = -z_n, z_b = x_n, then lift so the body's middle is 40 mm above the base
R = Matrix(((0, -1, 0, 0), (0, 0, -1, 0), (1, 0, 0, 40), (0, 0, 0, 1)))
for o in (case, shaft, label, horn, hand):
    place(o, R)

pts = [Vector(p) for p in [(0, -4.5, 28.6), (0, -4.5, 24.0), (0, -5.5, 8.0), (0, -8.5, 1.6), (0, -14.0, 0.6), (3.0, -26.0, 0.55), (14.0, -36.0, 0.55), (28.0, -41.0, 0.55)]]
def side(i):
    t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
    h = math.hypot(t.x, t.y)
    return Vector((-t.y / h, t.x / h, 0)) if h > 0.3 else Vector((1, 0, 0))
wires = {}
for name, k, mat in (('Wire_Ground', -1, BROWN), ('Wire_Power', 0, RED), ('Wire_Signal', 1, ORANGE)):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = 0.52; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for i, (bp, p) in enumerate(zip(sp.bezier_points, pts)):
        bp.co = p + side(i) * (1.08 if i < len(pts) - 1 else 2.0) * k
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat); smooth(o)
    wires[name] = o

d = (pts[-1] - pts[-2]); d.z = 0; d.normalize()
sd = Vector((-d.y, d.x, 0))
ang = math.atan2(d.y, d.x)
plug = [box(0, 14.0, -3.9, 3.9, 0, 2.7, PLUG, 0.25)]
for k in (-1, 0, 1):
    plug.append(box(14.0, 14.08, k * 2.54 - 0.55, k * 2.54 + 0.55, 0.8, 1.9, HOLE))
plug.append(box(4.0, 9.0, -3.95, 3.95, 2.7, 2.9, PLUG, 0.1))            # the little latch ridge
plug = join(plug, 'Connector')
place(plug, Matrix.Translation(pts[-1] + Vector((0, 0, -0.55))) @ Matrix.Rotation(ang, 4, 'Z'))
socks = {}
for name, k in (('Sock_Ground', -1), ('Sock_Power', 0), ('Sock_Signal', 1)):
    p = pts[-1] + Vector((0, 0, -0.55)) + d * 14.1 + sd * (k * 2.54) + Vector((0, 0, 1.35))
    socks[name] = empty(name, p)

# ---------- the plywood bracket ----------
stand = [box(-50, 50, -52, 24, -4, 0, PLY, 0.6)]
panel = box(-44, 44, -15.6, -12.6, 0, 90, PLY, 0.5)
cut(panel, prim('cube', loc=(0, -14.1, 40), scale=(6.6, 4, 11.9)))       # the hole the servo goes through
cut(panel, prim('cube', loc=(0, -14.1, 2.5), scale=(4.2, 4, 3.5)))       # a notch for the cable
stand.append(panel)
for x in (-36, 36):  # two triangular braces behind the panel
    me = bpy.data.meshes.new('brace'); bm = bmesh.new()
    tri = [(-12.6, 0), (20, 0), (-12.6, 56)]
    a = [bm.verts.new((x - 1.5, y, z)) for y, z in tri]; b = [bm.verts.new((x + 1.5, y, z)) for y, z in tri]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3; bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('brace', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(PLY_EDGE)
    stand.append(o)
for s in (-1, 1):  # the two mounting screws through the tabs
    sc = prim('cylinder', loc=(0, -18.7, 40 + s * 13.95), radius=1.7, depth=1.2, vertices=20, rot=(math.radians(90), 0, 0), mat=SILVER)
    bevel(sc, 0.35, 2); smooth(sc, 40); stand.append(sc)
    slot = box(-1.3, 1.3, -19.4, -19.2, 40 + s * 13.95 - 0.22, 40 + s * 13.95 + 0.22, INK); stand.append(slot)
stand = join(stand, 'Stand')

# ---------- pivots, AO, hierarchy, export ----------
set_origin(horn, (0, -HZ0, 40 + SX))   # the shaft axis: rotate here
tip = empty('Horn_Tip', (L, -HZ1, 40 + SX))
root = empty('SG90_Servo', (0, 0, 0))
bake_ao([case, shaft, label, horn, hand, stand, plug] + list(wires.values()), rays=24, dist=7.0, strength=0.7, ground=True)
bpy.context.view_layer.update()
parent(hand, horn); parent(tip, horn)
for o in [case, shaft, label, horn, stand, plug] + list(wires.values()) + list(socks.values()):
    parent(o, root)
root.scale = (0.001, 0.001, 0.001)
bpy.context.view_layer.update()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('triangles:', tri_count(meshes))
select_only([root] + [o for o in bpy.data.objects if o is not root])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_vertex_color='ACTIVE', export_animations=False, export_materials='EXPORT',
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10)
print('wrote', out, os.path.getsize(out), 'bytes')
render_preview(out.replace('.glb', '_preview.png'), target=(0.0, -0.012, 0.045), dist=0.26, elev=16, azim=-30, lens=50, res=(800, 800))
