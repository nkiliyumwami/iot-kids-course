"""front-porch.glb: the front door at night for "Who's at the Door?". A plastered house front on a brick plinth, a
panelled front door with a frame, knob and letterbox, two windows glowing warm behind curtains, a tiled porch canopy on
two posts with a lantern, a concrete step with a door mat, potted plants, a paved path across the lawn, and on the door
frame the IR obstacle sensor from parts.py (shown 6 times real size so it can be seen from the path) on a shelf and a
buzzer box with their cable up to a little project box. Modelled in metres (like the module's scene).

Nodes the module uses:
  Front_Porch       root
  House             everything that never changes
  Lamp_Glow         the lantern's glass (glows)
  Sensor_LED        the IR sensor's status LED (the module lights it red when it sees someone)
  Buzzer_Disc       the buzzer's face, origin at its middle, facing the path (the module pulses its scale)

Needs out/ir-obstacle.glb from parts.py.
Run:  blender -b --factory-startup -P porch.py -- out/front-porch.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'front-porch.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
IR = os.path.join(HERE, 'out', 'ir-obstacle.glb')
reset()

def image(name, a):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h)
    b = np.ones((h, w, 4), dtype=np.float32); b[..., :3] = np.clip(a, 0, 1); im.pixels.foreach_set(b.ravel()); im.pack(); return im

def tex_material(name, img, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

def srgb(c):
    return np.array([lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)], dtype=np.float32)

rnd = np.random.default_rng(31)
def noise(n, scale, octaves=3):
    a = np.zeros((n, n), dtype=np.float32)
    for o in range(octaves):
        k = max(2, int(n / scale * 2 ** o)); g = rnd.normal(0, 1, (k + 1, k + 1)).astype(np.float32)
        y, x = np.mgrid[0:n, 0:n] * (k / n); x0, y0 = x.astype(int), y.astype(int); fx, fy = x - x0, y - y0
        a += (g[y0, x0] * (1 - fx) * (1 - fy) + g[y0, x0 + 1] * fx * (1 - fy) + g[y0 + 1, x0] * (1 - fx) * fy + g[y0 + 1, x0 + 1] * fx * fy) / 2 ** o
    return a / np.abs(a).max()

def bricks(n=256):
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0x9a4f35), (n, n, 1)) * (1 + 0.08 * noise(n, 20))[..., None]
    row = y // 32; off = (row % 2) * 32
    shade = ((((x + off) // 64) * 13 + row * 7) % 5) / 5
    a *= (0.88 + 0.16 * shade)[..., None]
    a[((y % 32) < 3) | (((x + off) % 64) < 3)] = srgb(0xb9b0a2)
    return a.astype(np.float32)

def pavers(n=256):
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0x9a8d78), (n, n, 1)) * (1 + 0.07 * noise(n, 30))[..., None]
    a *= (0.92 + 0.08 * (((x // 64) * 3 + (y // 128) * 5) % 4) / 3)[..., None]
    a[((y % 128) < 3) | ((x % 64) < 3)] = srgb(0x5f584c)
    return a.astype(np.float32)

PLASTER = tex_material('Plaster', image('plaster', (np.tile(srgb(0xe8dcc4), (256, 256, 1)) * (1 + 0.04 * noise(256, 24))[..., None]).astype(np.float32)), 0.9)
BRICK = tex_material('Brick', image('brick', bricks()), 0.9)
PAVE = tex_material('Pavers', image('pavers', pavers()), 0.9)
LAWN = tex_material('Lawn_Night', image('lawn', (np.tile(srgb(0x2f5a2c), (256, 256, 1)) * (1 + 0.15 * noise(256, 40))[..., None]).astype(np.float32)), 0.95)
DOOR = material('Door_Wood', 0x6b4226, rough=0.55, coat=0.3)
DOOR_D = material('Door_Panel', 0x5a361e, rough=0.6)
FRAME = material('Frame_White', 0xf4efe6, rough=0.5)
BRASS = material('Brass', 0xd9b04a, rough=0.3, metal=1.0)
GLASS = material('Window_Glow', 0xffe0a0, rough=0.3, emit=0xffd890, emit_s=2.5)
CURTAIN = material('Curtain', 0xd9774f, rough=0.9)
ROOF = material('Roof_Tiles', 0x9b4a2c, rough=0.7)
ROOF_D = material('Roof_Edge', 0x7d3a22, rough=0.75)
CONC = material('Concrete', 0x8a8274, rough=0.95)
MAT = material('Door_Mat', 0x7a5a3a, rough=1.0)
POT = material('Pot', 0xc0673c, rough=0.8)
LEAF = material('Leaf', 0x3f7f3a, rough=0.7)
LAMP_M = material('Lantern', 0x1e2226, rough=0.4, metal=0.6)
LAMP_G = material('Lamp_Glow', 0xfff0c0, rough=0.2, emit=0xffe0a0, emit_s=6.0)
BOXM = material('Box_White', 0xeef0f2, rough=0.45)
CABLE = material('Cable_White', 0xe6e6e2, rough=0.5)
BUZZ = material('Buzzer_Black', 0x181818, rough=0.4)
LED = material('Sensor_LED', 0x4a1010, rough=0.2)

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat)
    if bev:
        bevel(o, bev, 2)
    return o

def cyl(x, y, z0, z1, r, mat, verts=16, bev=0.0):
    o = prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=verts, mat=mat)
    if bev:
        bevel(o, bev, 2)
    return smooth(o, 40)

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o); bpy.data.objects.remove(cutter); return o

def uv_box(o, size):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a = (v.x, v.y) if abs(n.z) > 0.6 else ((v.x, v.z) if abs(n.y) > abs(n.x) else (v.y, v.z))
            uv[li].uv = (a[0] / size, a[1] / size)
    return o

def blob(loc, r, mat, squash=0.85, seed=0, sub=2):
    o = prim('ico_sphere', loc=loc, radius=r, subdivisions=sub, mat=mat)
    rr = random.Random(seed)
    for v in o.data.vertices:
        d = v.co - Vector(loc); d *= 1 + rr.uniform(-0.12, 0.12); d.z *= squash; v.co = Vector(loc) + d
    o.data.update(); return smooth(o)

def cable(pts, mat, r=0.012):
    cd = bpy.data.curves.new('cable', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('cable', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH'); o = bpy.context.active_object; o.data.materials.append(mat); return smooth(o)

def B(x, y, z):          # three.js (x, y, z) -> Blender (x, -z, y)
    return Vector((x, -z, y))

house = []
# ---------- ground, path, step ----------
g = box(-60, 60, -60, 60, -0.05, 0, LAWN); uv_box(g, 6); house.append(g)
p = box(-0.9, 0.9, -16, -2.2, 0, 0.04, PAVE); uv_box(p, 1.2); house.append(p)
s = box(-2.1, 2.1, -2.2, 0, 0, 0.16, CONC, 0.02); house.append(s)
house.append(box(-0.5, 0.5, -1.0, -0.25, 0.16, 0.175, MAT, 0.01))
# ---------- the house front: wall (front face at three.js z = 0), plinth, door, windows ----------
wall = box(-4.5, 4.5, 0, 0.4, 0, 3.6, PLASTER)
cut(wall, box(-0.66, 0.66, -0.1, 0.5, 0.16, 2.45, PLASTER))                 # the door opening
for wx in (-3.2, 3.2):
    cut(wall, box(wx - 0.62, wx + 0.62, -0.1, 0.5, 1.37, 2.43, PLASTER))     # the window openings
uv_box(wall, 2.0); house.append(wall)
pl = box(-4.55, 4.55, -0.03, 0.4, 0, 0.5, BRICK)
cut(pl, box(-0.66, 0.66, -0.2, 0.5, 0.16, 0.6, BRICK))
uv_box(pl, 0.9); house.append(pl)
house.append(box(-4.6, 4.6, -0.06, 0.4, 3.5, 3.62, FRAME, 0.01))           # the fascia under the main roof
# door frame and door with four panels, knob, letterbox, number
for x0, x1, z0, z1 in ((-0.74, -0.62, 0.16, 2.52), (0.62, 0.74, 0.16, 2.52), (-0.74, 0.74, 2.42, 2.54)):
    house.append(box(x0, x1, -0.06, 0.05, z0, z1, FRAME, 0.01))
door = box(-0.6, 0.6, 0.0, 0.05, 0.17, 2.41, DOOR, 0.01)
house.append(door)
for px in (-0.3, 0.3):
    for z0, z1 in ((0.32, 1.12), (1.32, 2.25)):
        house.append(box(px - 0.22, px + 0.22, -0.012, 0.0, z0, z1, DOOR_D, 0.008))
house.append(cyl(0, 0, 0, 0.05, 0.035, BRASS, 16)); k = house[-1]; k.data.transform(Matrix.Translation((0.48, -0.06, 1.2)) @ Matrix.Rotation(math.radians(90), 4, 'X')); k.data.update()
house.append(box(-0.17, 0.17, -0.02, 0.0, 1.17, 1.23, BRASS, 0.005))
cd = bpy.data.curves.new('num', 'FONT'); cd.body = '7'; cd.size = 0.16; cd.extrude = 0.008; cd.align_x = 'CENTER'
t = bpy.data.objects.new('num', cd); bpy.context.scene.collection.objects.link(t); select_only([t]); bpy.ops.object.convert(target='MESH')
t = bpy.context.active_object; t.data.materials.append(BRASS); t.data.transform(Matrix.Translation((0, -0.015, 2.0)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))); t.data.update(); house.append(t)
# windows: glowing panes, curtains, frames, sills
for wx in (-3.2, 3.2):
    house.append(box(wx - 0.6, wx + 0.6, 0.12, 0.14, 1.38, 2.42, GLASS))
    for s_ in (-1, 1):
        house.append(box(wx + s_ * 0.6 - s_ * 0.22 - 0.11, wx + s_ * 0.6 - s_ * 0.22 + 0.11, 0.08, 0.11, 1.4, 2.4, CURTAIN, 0.01))
    for x0, x1, z0, z1 in ((wx - 0.64, wx - 0.56, 1.36, 2.44), (wx + 0.56, wx + 0.64, 1.36, 2.44), (wx - 0.64, wx + 0.64, 2.36, 2.44), (wx - 0.64, wx + 0.64, 1.36, 1.44), (wx - 0.03, wx + 0.03, 1.4, 2.4), (wx - 0.6, wx + 0.6, 1.87, 1.93)):
        house.append(box(x0, x1, 0.02, 0.1, z0, z1, FRAME, 0.005))
    house.append(box(wx - 0.72, wx + 0.72, -0.1, 0.1, 1.3, 1.37, FRAME, 0.01))
# ---------- the porch: two posts, a tiled canopy, a lantern ----------
for px in (-1.9, 1.9):
    house.append(cyl(px, -2.3, 0.16, 3.0, 0.07, FRAME, 16))
    house.append(box(px - 0.11, px + 0.11, -2.41, -2.19, 0.16, 0.3, FRAME, 0.01))
me = bpy.data.meshes.new('canopy'); bm = bmesh.new()
v = [bm.verts.new(p) for p in ((-2.2, 0.0, 3.32), (2.2, 0.0, 3.32), (2.2, -2.5, 2.98), (-2.2, -2.5, 2.98))]
bm.faces.new(v); bm.to_mesh(me); bm.free()
can = bpy.data.objects.new('canopy', me); bpy.context.scene.collection.objects.link(can); can.data.materials.append(ROOF)
sol = can.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.06; apply_mods(can); house.append(can)
for k in range(10):                                                          # tile courses
    y = -0.15 - k * 0.24; z = 3.32 - (0.34 * (k * 0.24 + 0.15) / 2.5)
    house.append(box(-2.22, 2.22, y - 0.03, y + 0.03, z + 0.02, z + 0.05, ROOF_D))
house.append(box(-2.2, 2.2, -2.56, -2.44, 2.86, 2.98, FRAME, 0.01))          # the beam at the front
house.append(box(-0.05, 0.05, -0.9, -0.82, 2.75, 3.2, LAMP_M))               # lantern hanger
lan = [box(-0.1, 0.1, -1.1, -0.9, 2.82, 2.86, LAMP_M), box(-0.12, 0.12, -1.12, -0.88, 3.04, 3.08, LAMP_M)]
for sx in (-0.095, 0.095):
    for sy in (-1.095, -0.905):
        lan.append(box(sx - 0.008, sx + 0.008, sy - 0.008, sy + 0.008, 2.86, 3.04, LAMP_M))
house += lan
lamp = box(-0.085, 0.085, -1.085, -0.915, 2.86, 3.04, LAMP_G); lamp.name = 'Lamp_Glow'
# pots with plants either side of the step
for px in (-1.55, 1.55):
    house.append(cyl(px, -0.45, 0.16, 0.55, 0.2, POT, 20, 0.02))
    for k in range(4):
        house.append(blob((px + 0.08 * math.cos(k * 1.6), -0.45 + 0.08 * math.sin(k * 1.6), 0.7 + 0.08 * k), 0.17, LEAF, 1.0, seed=k + int(px * 10)))
# a hedge along the house, either side
for k, x in enumerate(np.linspace(-4.3, -2.6, 3).tolist() + np.linspace(2.6, 4.3, 3).tolist()):
    house.append(blob((x, -0.45, 0.42), 0.48, LEAF, 0.85, seed=40 + k))

# ---------- on the door frame: the IR sensor and the buzzer box, 4 x real size, and their cable ----------
S4 = 6.0
SEN = B(1.0, 1.25, 0.1)
house.append(box(SEN.x - 0.12, SEN.x + 0.12, -0.33, 0.0, SEN.z - 0.014, SEN.z - 0.002, BOXM, 0.004))   # a white shelf under the sensor
house.append(box(SEN.x - 0.12, SEN.x + 0.12, -0.02, 0.0, SEN.z - 0.12, SEN.z + 0.02, BOXM, 0.004))
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=IR); bpy.context.view_layer.update()
new = [o for o in bpy.data.objects if o not in before]
ir = next(o for o in new if o.type == 'MESH' and o.name.startswith('Board'))
led = next(o for o in new if o.type == 'MESH' and o.name.startswith('LED_Obstacle'))
for o in (ir, led):
    mw = o.matrix_world.copy(); o.parent = None; o.data.transform(mw); o.matrix_world = Matrix.Identity(4); o.data.update()
    for ca in list(o.data.color_attributes):
        o.data.color_attributes.remove(ca)
for o in new:
    if o not in (ir, led):
        bpy.data.objects.remove(o)
led.data.materials.clear(); led.data.materials.append(LED)
# the part lies flat with its eyes along +X and pins at -X: turn it so it sticks out from the frame on a little shelf,
# pins at the wall, components up, eyes looking down the path (-Y)
R = Matrix(((0, 1, 0, 0), (-1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))       # part x -> -Y, part y -> +X, part z -> up
for o in (ir, led):
    o.data.transform(Matrix.Translation((SEN.x, -0.095, SEN.z)) @ R @ Matrix.Scale(S4, 4)); o.data.update()
led.name = 'Sensor_LED'
house.append(ir)
BZ = B(1.0, 1.8, 0.1)
house.append(box(BZ.x - 0.1, BZ.x + 0.1, -0.06, -0.0, BZ.z - 0.1, BZ.z + 0.1, BOXM, 0.012))
disc = cyl(0, 0, -0.022, 0.022, 0.07, BUZZ, 32, 0.006)
cut(disc, cyl(0, 0, 0.015, 0.05, 0.013, BUZZ, 12))
disc.data.transform(Matrix.Rotation(math.radians(90), 4, 'X')); disc.data.update()
disc.location = (BZ.x, -0.082, BZ.z); disc.name = 'Buzzer_Disc'
house.append(box(1.25, 1.55, -0.07, 0.0, 2.15, 2.37, BOXM, 0.015))           # the ESP32's little box above
house.append(cable([(SEN.x, -0.03, SEN.z + 0.02), (SEN.x - 0.05, -0.03, SEN.z + 0.3), (BZ.x - 0.13, -0.03, BZ.z - 0.05), (BZ.x - 0.12, -0.03, BZ.z + 0.25), (1.32, -0.03, 2.15)], CABLE))
house.append(cable([(BZ.x + 0.05, -0.03, BZ.z + 0.1), (BZ.x + 0.15, -0.03, BZ.z + 0.25), (1.42, -0.03, 2.15)], CABLE))
house = join(house, 'House')

# ---------- AO, hierarchy, export ----------
bake_ao([house, lamp, led, disc], rays=16, dist=0.5, strength=0.5, ground=False)
root = empty('Front_Porch', (0, 0, 0))
bpy.context.view_layer.update()
for o in (house, lamp, led, disc):
    parent(o, root)
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
