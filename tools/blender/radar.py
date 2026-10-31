"""radar-room.glb: the desk for "Radar Scanner". A wooden desk against a wall at night with a desk lamp and a pencil pot,
the radar head (the SG90 from Servo Says Hello, shaft up in a plywood block, with the HC-SR04P from parts.py taped on
its horn) and three things to find: two notebooks, a mug and a cardboard box. Modelled in centimetres and exported
under a root node scaled 0.01. The module's scene counts 1 unit = 10 cm, so it scales the file by 10.
The radar head is shown 2.5 times bigger than real so the sensor can be seen from across the desk.

Nodes the module uses:
  Radar_Room         root (scale 0.01)
  Room               the desk, wall, lamp and pencil pot (the desk top is at z = 0; the radar's centre is the origin)
  Lamp_Bulb          the lamp's bulb (own material, glows)
  Radar_Base         the plywood block with the servo's case in it
  Turret             the horn and the taped-on sensor: pivot on the shaft; it points along +X at rest, turn its local Y
  Thing_Book, Thing_Mug, Thing_Box   centred on their own origin, bottom at 0 (the module places and turns them)

Needs out/sg90-servo.glb (or the one in assets) and out/hc-sr04p.glb from parts.py.
Run:  blender -b --factory-startup -P radar.py -- out/radar-room.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'radar-room.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
SERVO = next(p for p in (os.path.join(HERE, 'out', 'sg90-servo.glb'), os.path.join(HERE, '..', '..', 'assets', 'models', 'modules', 'sg90-servo.glb')) if os.path.exists(p))
SENSOR = os.path.join(HERE, 'out', 'hc-sr04p.glb')
reset()

def image(name, a):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h)
    b = np.ones((h, w, 4), dtype=np.float32); b[..., :3] = a; im.pixels.foreach_set(b.ravel()); im.pack(); return im

def tex_material(name, img, rough=0.6, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

def srgb(c):
    return np.array([lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)], dtype=np.float32)

rnd = np.random.default_rng(7)
def desk_wood(n=512):
    y, x = np.mgrid[0:n, 0:n]
    plank = x // 128
    grain = 1 + 0.07 * np.sin(y / 7.0 + np.sin(x / 23.0 + plank) * 3 + plank * 2)
    a = np.tile(srgb(0xc29468), (n, n, 1)) * (0.92 + 0.1 * ((plank * 29) % 4) / 3)[..., None] * grain[..., None]
    a[(x % 128) < 2] *= 0.7
    return a.astype(np.float32)

def cardboard(n=128):
    a = np.tile(srgb(0xc79a5d), (n, n, 1)) * (1 + rnd.normal(0, 0.03, (n, n, 1)))
    return a.astype(np.float32)

WOOD = tex_material('Desk_Wood', image('desk', desk_wood()), 0.7)
KRAFT = tex_material('Cardboard', image('kraft', cardboard()), 0.85)
WALL = material('Wall_Night', 0x34485a, rough=0.9)
SKIRT = material('Skirting', 0x25333f, rough=0.8)
LEG = material('Desk_Leg', 0x2b2f35, rough=0.5, metal=0.4)
PLY = material('Plywood', 0xd8b98c, rough=0.75)
TAPE = material('Tape', 0xe8d070, rough=0.55)
LAMP = material('Lamp_Metal', 0xe9a23b, rough=0.35, metal=0.3, coat=0.5)
LAMP_IN = material('Lamp_Inside', 0xf6efe0, rough=0.4)
BULB = material('Lamp_Bulb', 0xfff2c8, rough=0.2, emit=0xffe2a0, emit_s=6.0)
STEEL = material('Steel', 0xc9cdd1, rough=0.3, metal=0.6)
POT = material('Pencil_Pot', 0x2f6f9f, rough=0.4, coat=0.4)
PEN = [material('Pencil_' + str(i), c, rough=0.5) for i, c in enumerate((0xe8b923, 0xd8342b, 0x2f7de1, 0x3aa65a))]
GRAPHITE = material('Graphite', 0x30343a, rough=0.5)
WOODTIP = material('Pencil_Wood', 0xe7c79a, rough=0.6)
NOTE1 = material('Notebook_Red', 0xc9342c, rough=0.6)
NOTE2 = material('Notebook_Teal', 0x1f8a8a, rough=0.6)
PAGES = material('Pages', 0xf3efe4, rough=0.8)
MUG = material('Mug_Orange', 0xf08a24, rough=0.3, coat=0.6)
MUG_IN = material('Mug_Inside', 0xf5efe6, rough=0.4)
POSTER = material('Poster', 0xf1e6c8, rough=0.8)
INK = material('Ink_Blue', 0x2c4a6e, rough=0.7)

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat)
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
    apply_mods(o); bpy.data.objects.remove(cutter); return o

def uv_top(o, size):
    """Planar UVs from above: the texture covers `size` cm."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((v.x + size / 2) / size, (v.y + size / 2) / size)
    return o

def rod(a, b, r, mat, verts=12):
    a, b = Vector(a), Vector(b); d = b - a
    o = prim('cylinder', loc=(0, 0, 0), radius=r, depth=d.length, vertices=verts, mat=mat)
    o.data.transform(Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()); o.data.update()
    return smooth(o, 50)

def imported(path, keep):
    """Import a GLB, keep the named meshes (world transform baked into the mesh, colours cleared), drop the rest."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path); bpy.context.view_layer.update()
    new = [o for o in bpy.data.objects if o not in before]
    got = {}
    for o in new:
        base = o.name.split('.')[0]
        if o.type == 'MESH' and base in keep:
            got[base] = o
    for o in got.values():
        mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world = Matrix.Identity(4); o.data.update()
        for ca in list(o.data.color_attributes):
            o.data.color_attributes.remove(ca)
    for o in new:
        if o not in got.values():
            bpy.data.objects.remove(o)
    return got

# ---------- the room (desk top at z = 0; the radar's centre at the origin; the desk's middle is 24 cm behind it) ----------
room = []
top = box(-75, 75, -28.5, 76.5, -3, 0, WOOD, 0.4); uv_top(top, 150); room.append(top)
for x in (-71, 71):
    for y in (-24, 72):
        room.append(box(x - 2, x + 2, y - 2, y + 2, -75, -3, LEG, 0.3))
room.append(box(-160, 160, 80, 82, -75, 140, WALL))
room.append(box(-160, 160, 79, 80, -75, -67, SKIRT))
room.append(box(-60, -24, 78.6, 79.6, 30, 70, POSTER, 0.3))                  # a poster of a ship's radar on the wall
for r in (6, 11, 16):
    ring = cyl(-42, 78.5, 0, 0.2, r, INK, 48); cut(ring, cyl(-42, 78.5, -1, 1, r - 0.5, INK, 48))
    ring.data.transform(Matrix.Translation((-42, 78.4, 50)) @ Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Translation((42, -78.5, 0))); ring.data.update()   # stand it on the wall, facing out
    room.append(ring)
# desk lamp at the back right: base, two arms, shade, bulb
LX, LY = 52.0, 58.0
room.append(cyl(LX, LY, 0, 2.2, 8.0, LAMP, 40, 0.6))
j1 = Vector((LX, LY, 2.2)); j2 = Vector((LX - 8, LY - 6, 34)); j3 = Vector((LX - 20, LY - 16, 40))
room += [rod(j1, j2, 0.9, LAMP), rod(j2, j3, 0.9, LAMP)]
for j in (j1 + Vector((0, 0, 0.6)), j2):
    room.append(prim('uv_sphere', loc=j, radius=1.6, segments=16, ring_count=8, mat=STEEL)); smooth(room[-1])
shade = prim('cone', loc=(0, 0, 0), radius1=8.5, radius2=3.0, depth=10, vertices=40, mat=LAMP); smooth(shade, 40)
sol = shade.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.4; apply_mods(shade)
d = (Vector((LX - 32, LY - 24, 26)) - j3).normalized()
shade.data.transform(Matrix.Translation(j3 + d * 5) @ (-d).to_track_quat('Z', 'Y').to_matrix().to_4x4()); shade.data.update()
room.append(shade)
bulb = prim('uv_sphere', loc=j3 + d * 6.5, radius=2.6, segments=20, ring_count=10, mat=BULB); smooth(bulb); bulb.name = 'Lamp_Bulb'
# pencil pot at the back left
PX, PY = -56.0, 60.0
pot = cyl(PX, PY, 0, 11, 4.2, POT, 32, 0.3); cut(pot, cyl(PX, PY, 1.0, 12, 3.7, POT, 32)); room.append(pot)
rr = random.Random(2)
for i in range(6):
    a = rr.uniform(0, 6.28); tilt = rr.uniform(4, 14)
    base = Vector((PX + math.cos(a) * 1.6, PY + math.sin(a) * 1.6, 1.0)); dirv = Vector((math.cos(a) * math.sin(math.radians(tilt)), math.sin(a) * math.sin(math.radians(tilt)), math.cos(math.radians(tilt))))
    room.append(rod(base, base + dirv * 15, 0.45, PEN[i % 4], 6))
    room.append(rod(base + dirv * 15, base + dirv * 16.6, 0.35, WOODTIP, 6))
room = join(room, 'Room')

# ---------- the radar head: plywood block, the SG90 shaft-up, the HC-SR04P taped on the horn ----------
K = 2.5 * 0.1          # mm -> cm, shown 2.5 x
srv = imported(SERVO, {'Servo_Case', 'Servo_Shaft', 'Servo_Label', 'Horn'})
# the servo model's shaft points at the learner (-Y) on x = 0, z = 45.5 mm (in metres after import: x1000)
ZT = 1.2 + 15.6 * K                                                          # top of the plywood block: the servo's tabs rest on it, its case on the base
M = Matrix.Translation((0, 0, ZT - 15.6 * K)) @ Matrix.Scale(K, 4) @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Translation((0, 0, -45.5)) @ Matrix.Scale(1000, 4)
for o in srv.values():
    o.data.transform(M); o.data.update()
ZH = ZT + (32.2 - 15.6) * K                                                  # top of the horn
base = [box(-6, 6, -6 - 5.5 * K, 6 - 5.5 * K, 0, 1.2, PLY, 0.3)]
blk = box(-3.0, 3.0, -4.6 - 5.5 * K, 4.6 - 5.5 * K, 1.2, ZT, PLY, 0.25)
cut(blk, prim('cube', loc=(0, -5.5 * K, ZT - 2), scale=(6.3 * K, 11.6 * K, 4)))
base.append(blk)
base = join(base + [srv['Servo_Case'], srv['Servo_Shaft'], srv['Servo_Label']], 'Radar_Base')
# the sensor: part z (transducers) -> +X, part y (its long side) stays sideways, part x -> down (pins at the top)
sen = imported(SENSOR, {'Board'})['Board']
R = Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 0, 1)))
sen.data.transform(Matrix.Translation((1.2, 0, ZH + 1.0 + 20.5 * K)) @ R @ Matrix.Scale(1000 * K, 4)); sen.data.update()
turret = [srv['Horn'], sen]
turret.append(box(-2.2, 2.6, -4.5, 4.5, ZH - 0.2, ZH + 1.0, PLY, 0.2))         # a little ply plate glued on the horn
turret.append(box(0.7, 2.1, -4.0, 4.0, ZH + 0.9, ZH + 2.3, TAPE, 0.15))         # a band of tape round the sensor's foot
turret = join(turret, 'Turret')
set_origin(turret, (0, 0, ZH))

# ---------- the three things (built at the origin, bottom at z = 0) ----------
book = [box(-4, 4, -3, 3, 0, 1.6, NOTE1, 0.25), box(-3.8, 3.85, -2.85, 2.85, 0.15, 1.45, PAGES),
        box(-3.9, 3.9, -2.8, 2.8, 1.6, 3.0, NOTE2, 0.25), box(-3.7, 3.75, -2.65, 2.65, 1.75, 2.85, PAGES)]
book = join(book, 'Thing_Book'); book.rotation_euler.z = 0;
mug = cyl(0, 0, 0, 7.0, 3.2, MUG, 40, 0.3); cut(mug, cyl(0, 0, 0.6, 8, 2.8, MUG_IN, 40))
mug_in = cyl(0, 0, 0.6, 0.65, 2.8, MUG_IN, 32)
handle = prim('torus', loc=(0, -3.4, 3.6), major_radius=1.9, minor_radius=0.45, major_segments=24, minor_segments=8, rot=(0, math.radians(90), 0), mat=MUG); smooth(handle)
mug = join([mug, mug_in, handle], 'Thing_Mug')
cb = box(-5, 5, -5, 5, 0, 9, KRAFT, 0.25)
bpy.context.view_layer.objects.active = cb
cbx = [cb, box(-5.05, 5.05, -1.2, 1.2, 8.95, 9.08, TAPE), box(-5.08, -4.98, -1.2, 1.2, 6.5, 9.0, TAPE), box(4.98, 5.08, -1.2, 1.2, 6.5, 9.0, TAPE)]
cbx = join(cbx, 'Thing_Box')

# ---------- AO, hierarchy, export ----------
parts = [room, bulb, base, turret, book, mug, cbx]
bake_ao(parts, rays=20, dist=10.0, strength=0.55, ground=False)
root = empty('Radar_Room', (0, 0, 0))
bpy.context.view_layer.update()
for o in parts:
    parent(o, root)
root.scale = (0.01, 0.01, 0.01)
bpy.context.view_layer.update()
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('triangles:', tri_count(meshes))
select_only([root] + [o for o in bpy.data.objects if o is not root])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_vertex_color='ACTIVE', export_animations=False, export_materials='EXPORT',
                          export_image_format='JPEG', export_jpeg_quality=82,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10)
print('wrote', out, os.path.getsize(out), 'bytes')
