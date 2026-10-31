"""joystick-crane.glb: the tabletop crane for the "Joystick crane" module. A plywood tower with the SG90 from Servo Says
Hello sitting shaft-up in its top, a yellow lattice jib on the servo's horn, a load on a hook, two trays (left = 0°,
right = 180°) and a plywood controller paddle for the KY-023 joystick and the ESP32. Real sizes in millimetres,
exported under a root node scaled 0.001. The desk's middle is the origin; the learner looks from the front (-Y).

Nodes the module uses:
  Joystick_Crane    root (scale 0.001)
  Tower             plywood base plate and tower, with the servo's case, shaft and label in its top
  Boom              everything that turns: the horn, turntable, jib, counter-jib, cab, trolley, rope, hook and load.
                    Pivot on the servo's shaft, jib along +X at rest: rotate it about its local Y (three.js)
  Boom_Tip          an empty over the hook (for labels)
  Tray_Left, Tray_Right   the red (0°) and green (180°) trays
  Paddle            the controller board, its four standoffs, the servo cable and its plug
  Joystick_Mount    where the KY-023's origin goes (its PCB bottom, on the standoffs)
  ESP32_Mount       where the ESP32 board sits (middle of its underside)
  Sock_Ground, Sock_Power, Sock_Signal   empties at the servo plug's sockets (where jumper wires start)

Needs out/sg90-servo.glb (or assets/models/modules/sg90-servo.glb).
Run:  blender -b --factory-startup -P crane.py -- out/joystick-crane.glb
It also renders out/joystick-crane_preview.png."""
import sys, os, math, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'joystick-crane.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
SERVO = next((p for p in (os.path.join(HERE, 'out', 'sg90-servo.glb'), os.path.join(HERE, '..', '..', 'assets', 'models', 'modules', 'sg90-servo.glb')) if os.path.exists(p)))
reset()

PLY = material('Plywood', 0xd8b98c, rough=0.75)
PLY_EDGE = material('Plywood_Edge', 0xb8915e, rough=0.8)
YELLOW = material('Crane_Yellow', 0xf2b705, rough=0.42, coat=0.3)
STEEL = material('Steel_Dark', 0x3a4049, rough=0.4, metal=0.5)
CONCRETE = material('Concrete', 0x9a9d9f, rough=0.9)
WHITE = material('Cab_White', 0xf3f1ea, rough=0.5)
GLASS = material('Cab_Glass', 0x2f4f6e, rough=0.15, metal=0.2)
HAZARD = material('Hazard_Black', 0x1d2024, rough=0.5)
RED = material('Tray_Red', 0xd23a33, rough=0.35, coat=0.4)
GREEN = material('Tray_Green', 0x1f9a55, rough=0.35, coat=0.4)
CRATE = material('Crate_Wood', 0xc9874a, rough=0.7)
CRATE_D = material('Crate_Slat', 0x9c6332, rough=0.75)
NYLON = material('Standoff_Nylon', 0xf1ede2, rough=0.5)
BROWN = material('Wire_Brown', 0x6b4226, rough=0.45)
WRED = material('Wire_Red', 0xc8262c, rough=0.45)
ORANGE = material('Wire_Orange', 0xf08a24, rough=0.45)
PLUG = material('Plug_Black', 0x1d2024, rough=0.5)
HOLE = material('Socket_Hole', 0x050607, rough=0.9)

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat)
    if bev:
        bevel(o, bev, 2)
    return o

def cyl(x, y, z0, z1, r, mat, verts=24, bev=0.0):
    o = prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=verts, mat=mat)
    if bev:
        bevel(o, bev, 2)
    return smooth(o, 40)

def rod(a, b, r, mat, verts=8):
    """A thin round bar from point a to point b."""
    a, b = Vector(a), Vector(b); d = b - a
    o = prim('cylinder', loc=(0, 0, 0), radius=r, depth=d.length, vertices=verts, mat=mat)
    o.data.transform(Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()); o.data.update()
    return smooth(o, 50)

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o

def cable(pts, mat, r=0.55, name='wire'):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat)
    return smooth(o)

CY = 56.0            # the crane stands 56 mm behind the desk's middle (three.js z = -1.4 at 1 unit = 40 mm)
TW = 42.0            # tower width
ZT = 62.0            # tower top
REACH = 156.0        # from the shaft to the hook (three.js 3.9 units)

# ---------- the SG90, imported from Servo Says Hello and stood shaft-up in the tower ----------
bpy.ops.import_scene.gltf(filepath=SERVO)
bpy.context.view_layer.update()
keep = {'Servo_Case': None, 'Servo_Shaft': None, 'Servo_Label': None, 'Horn': None}
for o in list(bpy.data.objects):
    base = o.name.split('.')[0]
    if base in keep and o.type == 'MESH':
        keep[base] = o
for o in keep.values():
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for ca in list(o.data.color_attributes):   # its baked AO is redone below, for the whole crane
        o.data.color_attributes.remove(ca)
for o in list(bpy.data.objects):
    if o not in keep.values():
        bpy.data.objects.remove(o)
# in the servo model the shaft points at the learner (-Y) on the line x = 0, z = 45.5 mm; turn it to point up (+Z),
# then lift it so the mounting tabs (15.6 mm above the case bottom) rest on the tower top
M = Matrix.Translation((0, CY, ZT - 15.6)) @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Translation((0, 0, -45.5)) @ Matrix.Scale(1000, 4)
for o in keep.values():
    o.data.transform(M @ o.matrix_world); o.matrix_world = Matrix.Identity(4); o.data.update()
ZH = ZT - 15.6 + 32.2   # the horn's top face

# ---------- the tower ----------
tower = [box(-50, 50, CY - 50, CY + 50, 0, 5, PLY, 0.6)]
TY = CY - 5.5            # the servo case is off-centre from its shaft: centre the tower on the case
t = box(-TW / 2, TW / 2, TY - TW / 2, TY + TW / 2, 5, ZT, PLY, 0.5)
cut(t, prim('cube', loc=(0, TY, ZT - 10), scale=(6.4, 11.6, 12)))                     # the slot the servo drops into
cut(t, prim('cube', loc=(0, TY - TW / 2, 9), scale=(4, 6, 4)))                       # a notch for the cable at the front
tower.append(t)
for sx in (-1, 1):                                                                   # darker corner strips: glued-on battens
    for sy in (-1, 1):
        tower.append(box(sx * TW / 2 - 2.2 if sx > 0 else -TW / 2 - 0.4, sx * TW / 2 + 0.4 if sx > 0 else -TW / 2 + 2.2,
                         TY + sy * TW / 2 - (2.2 if sy > 0 else -0.0) - (0.4 if sy < 0 else 0), TY + sy * TW / 2 + (0.4 if sy > 0 else 2.2),
                         5, ZT, PLY_EDGE, 0.3))
for k in range(7):                                                                   # a black-and-yellow hazard band on the front
    x0 = -TW / 2 + k * TW / 7
    tower.append(box(x0, x0 + TW / 7, TY - TW / 2 - 0.5, TY - TW / 2, ZT - 9, ZT - 3, YELLOW if k % 2 == 0 else HAZARD))
tower = join(tower + [keep['Servo_Case'], keep['Servo_Shaft'], keep['Servo_Label']], 'Tower')

# ---------- the boom: everything on the horn ----------
boom = [keep['Horn']]
boom.append(cyl(0, CY, ZH, ZH + 3, 13, PLY, 40, 0.4))                                # plywood turntable glued to the horn
J0 = ZH + 9.0            # bottom chords of the jib
JH = 11.0                # jib height (top chord)
boom.append(box(-6, 6, CY - 6, CY + 6, ZH + 3, J0 + JH + 22, YELLOW, 0.5))           # the slewing mast up to the apex
APEX = Vector((0, CY, J0 + JH + 22))
X0, X1 = -6.0, REACH + 8
for y in (-6, 6):
    boom.append(rod((X0, CY + y, J0), (X1, CY + y, J0), 1.0, YELLOW))
boom.append(rod((X0, CY, J0 + JH), (X1 - 6, CY, J0 + JH), 1.0, YELLOW))
n = 14
for i in range(n + 1):
    x = X0 + (X1 - 6 - X0) * i / n
    boom.append(rod((x, CY - 6, J0), (x, CY + 6, J0), 0.6, YELLOW, 6))
    if i < n:
        xn = X0 + (X1 - 6 - X0) * (i + 1) / n
        for y in (-6, 6):
            boom.append(rod((x, CY + y, J0), (xn, CY, J0 + JH), 0.6, YELLOW, 6) if i % 2 == 0 else rod((x, CY, J0 + JH), (xn, CY + y, J0), 0.6, YELLOW, 6))
boom.append(rod((X1 - 6, CY, J0 + JH), (X1, CY - 6, J0), 0.7, YELLOW, 6)); boom.append(rod((X1 - 6, CY, J0 + JH), (X1, CY + 6, J0), 0.7, YELLOW, 6))
# counter-jib, counterweight, tie rods, cab
CX = -62.0
for y in (-7, 7):
    boom.append(rod((X0, CY + y, J0), (CX, CY + y, J0), 1.0, YELLOW))
for i in range(5):
    x = X0 + (CX - X0) * i / 4
    boom.append(rod((x, CY - 7, J0), (x, CY + 7, J0), 0.6, YELLOW, 6))
boom.append(box(CX + 2, CX + 18, CY - 10, CY + 10, J0 - 14, J0 + 1, CONCRETE, 0.8))
boom.append(box(CX + 2.5, CX + 17.5, CY - 10.4, CY + 10.4, J0 - 9, J0 - 7, CONCRETE, 0.3))
boom.append(rod(APEX, (REACH * 0.7, CY, J0 + JH), 0.45, STEEL, 6))
boom.append(rod(APEX, (CX + 8, CY - 5, J0), 0.45, STEEL, 6)); boom.append(rod(APEX, (CX + 8, CY + 5, J0), 0.45, STEEL, 6))
boom.append(box(-4, 4, CY - 4, CY + 4, APEX.z, APEX.z + 3, YELLOW, 0.4))
cab = box(6, 20, CY - 19, CY - 7, J0 - 12, J0, WHITE, 1.2)
boom.append(cab)
boom.append(box(7.5, 18.5, CY - 19.3, CY - 18.6, J0 - 9.5, J0 - 2.5, GLASS, 0.3))
boom.append(box(19.6, 20.3, CY - 17.5, CY - 8.5, J0 - 9.5, J0 - 2.5, GLASS, 0.3))
# trolley, rope, hook block, hook, slings and the load
boom.append(box(REACH - 7, REACH + 7, CY - 8, CY + 8, J0 - 4, J0 - 0.8, STEEL, 0.5))
for x in (REACH - 5, REACH + 5):
    for y in (-6.5, 6.5):
        boom.append(cyl(0, 0, -1.2, 1.2, 1.8, STEEL, 12)); o = boom[-1]
        o.data.transform(Matrix.Translation((x, CY + y, J0 - 1)) @ Matrix.Rotation(math.radians(90), 4, 'X')); o.data.update()
HB = 64.0                                                                            # hook block top
for x in (REACH - 2, REACH + 2):
    boom.append(rod((x, CY, J0 - 4), (x, CY, HB), 0.35, STEEL, 6))
boom.append(box(REACH - 5, REACH + 5, CY - 3.5, CY + 3.5, HB - 9, HB, YELLOW, 1.0))
boom.append(cyl(REACH, CY, HB - 11, HB - 9, 1.0, STEEL, 12))
hook = prim('torus', loc=(REACH, CY, HB - 14.5), major_radius=3.2, minor_radius=0.9, major_segments=24, minor_segments=8, rot=(math.radians(90), 0, 0), mat=STEEL)
cut(hook, prim('cube', loc=(REACH - 3.2, CY, HB - 11.5), scale=(2.5, 3, 2.5)))
boom.append(smooth(hook, 50))
L0, LS = 22.0, 22.0                                                                  # the load: a little wooden crate
boom.append(box(REACH - LS / 2, REACH + LS / 2, CY - LS / 2, CY + LS / 2, L0, L0 + LS, CRATE, 0.6))
for z in (L0 + 2, L0 + LS - 2):
    boom.append(box(REACH - LS / 2 - 0.4, REACH + LS / 2 + 0.4, CY - LS / 2 - 0.4, CY + LS / 2 + 0.4, z - 1.6, z + 1.6, CRATE_D, 0.3))
for sx in (-1, 1):
    for sy in (-1, 1):
        boom.append(rod((REACH, CY, HB - 17.5), (REACH + sx * (LS / 2 - 2), CY + sy * (LS / 2 - 2), L0 + LS), 0.3, STEEL, 5))
boom = join(boom, 'Boom')

# ---------- the trays ----------
trays = {}
for name, x, mat in (('Tray_Left', -REACH, RED), ('Tray_Right', REACH, GREEN)):
    t = box(x - 32, x + 32, CY - 32, CY + 32, 0, 14, mat, 2.0)
    cut(t, box(x - 29.5, x + 29.5, CY - 29.5, CY + 29.5, 2.5, 20, mat))
    smooth(t, 35); t.name = name; trays[name] = t

# ---------- the controller paddle: KY-023 on standoffs, room for the ESP32, the servo cable and its plug ----------
PY = -100.0
JX, EX = -45.0, 28.0
paddle = [box(-92, 92, PY - 36, PY + 36, 0, 6, PLY, 0.8)]
for hx, hy in ((-13.5, 10.0), (13.5, 10.0), (-13.5, -10.0), (13.5, -10.0)):           # the KY-023's mounting holes
    paddle.append(cyl(JX + hx, PY + hy, 6, 12, 2.2, NYLON, 16, 0.3))
for x in (EX - 20, EX + 20):                                                          # two foam pads under the ESP32
    paddle.append(box(x - 5, x + 5, PY - 12, PY + 12, 6, 9, HAZARD, 0.8))
# the servo cable: out of the tower's notch, across the base plate and the desk, onto the paddle beside the ESP32
PX, PYp = 66.0, PY + 4.0
path = [(0, TY - TW / 2 + 3, 9), (0, TY - TW / 2 - 6, 5.6), (6, CY - 60, 0.6), (40, -10, 0.6), (70, -50, 0.6), (PX - 12, PYp + 20, 6.6), (PX, PYp, 6.6)]
d = (Vector(path[-1]) - Vector(path[-2])); d.z = 0; d.normalize()
sd = Vector((-d.y, d.x, 0))
for name, k, mat in (('Ground', -1, BROWN), ('Power', 0, WRED), ('Signal', 1, ORANGE)):
    pts = [Vector(p) + sd * k * (1.1 if i < len(path) - 1 else 2.54) for i, p in enumerate(path)]
    paddle.append(cable(pts, mat, 0.55))
ang = math.atan2(d.y, d.x)
plug = [box(0, 14.0, -3.9, 3.9, 0, 2.7, PLUG, 0.25), box(4.0, 9.0, -3.95, 3.95, 2.7, 2.9, PLUG, 0.1)]
for k in (-1, 0, 1):
    plug.append(box(14.0, 14.08, k * 2.54 - 0.55, k * 2.54 + 0.55, 0.8, 1.9, HOLE))
plug = join(plug, 'plug')
plug.data.transform(Matrix.Translation(Vector((PX, PYp, 6.05))) @ Matrix.Rotation(ang, 4, 'Z')); plug.data.update()
paddle.append(plug)
paddle = join(paddle, 'Paddle')
socks = {}
for name, k in (('Sock_Ground', -1), ('Sock_Power', 0), ('Sock_Signal', 1)):
    socks[name] = Vector((PX, PYp, 6.05)) + d * 14.1 + sd * (k * 2.54) + Vector((0, 0, 1.35))

# ---------- AO, hierarchy, export ----------
parts = [tower, boom, paddle] + list(trays.values())
bake_ao(parts, rays=24, dist=14.0, strength=0.6, ground=True)
set_origin(boom, (0, CY, ZH))
root = empty('Joystick_Crane', (0, 0, 0))
bpy.context.view_layer.update()
tip = empty('Boom_Tip', (REACH, CY, J0 + JH + 4))
marks = [empty(n, p) for n, p in list(socks.items()) + [('Joystick_Mount', Vector((JX, PY, 12))), ('ESP32_Mount', Vector((EX, PY, 9)))]]
bpy.context.view_layer.update()   # the empties' world matrices must be current before they are parented
parent(tip, boom)
for e in marks:
    parent(e, root)
for o in parts:
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
render_preview(out.replace('.glb', '_preview.png'), target=(0.0, 0.0, 0.04), dist=0.62, elev=28, azim=-20, lens=50, res=(900, 700))
