"""rain-yard.glb: the yard for "Rain, Rain, Go Away" (the house itself is the story's smart_house.glb, placed by the
module). A lawn with a gravel path, a washing line on two steel T-poles with rails on top, clothes pegged on the line,
a corrugated clear roof panel that slides along the rails, the SG90 from Servo Says Hello on the far pole (8 times
real size so it shows), the raindrop plate and its comparator board from parts.py on a post (10 times real size), a
laundry basket and trees. Modelled in metres (like the module's scene); root scale 1.

Nodes the module uses:
  Rain_Yard         root
  Yard              everything that never changes
  Roof_Panel        the sliding roof, origin in its middle (the module moves it along Z)
  Servo_Horn        the servo's horn, pivot on the shaft, facing the learner (the module turns it about its local Z)
  Cloth_0..Cloth_4  the clothes, origin where they hang on the line (the module sways them about Z)
  Rain_Plate        the sensor plate (the module's wet drops sit on it)

Needs out/sg90-servo.glb (or the one in assets) and out/raindrop.glb from parts.py.
Run:  blender -b --factory-startup -P washing.py -- out/rain-yard.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'rain-yard.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
SERVO = next(p for p in (os.path.join(HERE, 'out', 'sg90-servo.glb'), os.path.join(HERE, '..', '..', 'assets', 'models', 'modules', 'sg90-servo.glb')) if os.path.exists(p))
RAIN = os.path.join(HERE, 'out', 'raindrop.glb')
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

rnd = np.random.default_rng(41)
def noise(n, scale, octaves=3):
    a = np.zeros((n, n), dtype=np.float32)
    for o in range(octaves):
        k = max(2, int(n / scale * 2 ** o)); g = rnd.normal(0, 1, (k + 1, k + 1)).astype(np.float32)
        y, x = np.mgrid[0:n, 0:n] * (k / n); x0, y0 = x.astype(int), y.astype(int); fx, fy = x - x0, y - y0
        a += (g[y0, x0] * (1 - fx) * (1 - fy) + g[y0, x0 + 1] * fx * (1 - fy) + g[y0 + 1, x0] * (1 - fx) * fy + g[y0 + 1, x0 + 1] * fx * fy) / 2 ** o
    return a / np.abs(a).max()

LAWN = tex_material('Lawn', image('lawn', (np.tile(srgb(0x5b8c3c), (256, 256, 1)) * (1 + 0.14 * noise(256, 40))[..., None] * (1 + 0.05 * rnd.normal(0, 1, (256, 256, 1)))).astype(np.float32)), 0.95)
GRAVEL = tex_material('Gravel', image('gravel', (np.tile(srgb(0xb59a74), (128, 128, 1)) * (1 + 0.18 * rnd.normal(0, 1, (128, 128, 1)))).astype(np.float32)), 0.95)
STEEL = material('Galvanised', 0x9aa1a8, rough=0.35, metal=0.7)
LINE = material('Line', 0xf2f2f2, rough=0.5)
PEG = material('Peg', 0xd98a3a, rough=0.5)
CLOTH = [material('Cloth_' + str(i), c, rough=0.95) for i, c in enumerate((0xe0524d, 0x3c7be0, 0xf2c744, 0x4cae6b, 0xf4f4f0))]
STRIPE = material('Towel_Stripe', 0xf4f4f0, rough=0.95)
ROOF = material('Roof_Clear_Blue', 0x2a63c9, rough=0.25)
ROOF_F = material('Roof_Frame', 0xe9eef2, rough=0.4, metal=0.3)
POST = material('Post', 0x7b7f85, rough=0.5, metal=0.4)
BOXM = material('Box_Grey', 0xeef0f2, rough=0.45)
BASKET = material('Basket', 0xc9a66b, rough=0.85)
TRUNK = material('Trunk', 0x6b4226, rough=0.9)
LEAF = material('Tree_Leaf', 0x3b6b29, rough=0.85)
LEAF2 = material('Tree_Leaf_Light', 0x568a3a, rough=0.85)
CABLE = material('Cable_Black', 0x22252a, rough=0.5)

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

def rod(a, b, r, mat, verts=8):
    a, b = Vector(a), Vector(b); d = b - a
    o = prim('cylinder', loc=(0, 0, 0), radius=r, depth=d.length, vertices=verts, mat=mat)
    o.data.transform(Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()); o.data.update()
    return smooth(o, 50)

def blob(loc, r, mat, squash=0.85, seed=0, sub=3):
    o = prim('ico_sphere', loc=loc, radius=r, subdivisions=sub, mat=mat)
    rr = random.Random(seed)
    for v in o.data.vertices:
        d = v.co - Vector(loc); d *= 1 + rr.uniform(-0.08, 0.08); d.z *= squash; v.co = Vector(loc) + d
    o.data.update(); return smooth(o)

def uv_planar(o, size):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co; uv[li].uv = (v.x / size, v.y / size)
    return o

def B(x, y, z):          # three.js (x, y, z) -> Blender (x, -z, y)
    return Vector((x, -z, y))

def imported(path, keep):
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

yard = []
g = box(-60, 60, -60, 60, -0.05, 0, LAWN); uv_planar(g, 6); yard.append(g)
p = box(-4.5, 9.5, -5.9, -4.5, 0, 0.03, GRAVEL); uv_planar(p, 1.5); yard.append(p)          # three.js path at z 4.5 .. 5.9

# ---------- the washing line: two T-poles with rails along Z, a line along X ----------
POLES, LZ = (0.6, 6.0), 2.0
for px in POLES:
    yard.append(cyl(px, -LZ, 0, 2.75, 0.06, STEEL, 16))
    yard.append(box(px - 0.06, px + 0.06, -(LZ + 3.0), -(LZ - 1.2), 2.65, 2.75, STEEL, 0.01))   # a rail along the slide
    yard.append(rod((px, -LZ + 0.6, 2.2), (px, -LZ, 2.65), 0.025, STEEL))                       # braces
    yard.append(rod((px, -LZ - 0.6, 2.2), (px, -LZ, 2.65), 0.025, STEEL))
    yard.append(cyl(px, -LZ, 0, 0.12, 0.16, material('Concrete', 0x9a9d9f, rough=0.9), 16))
yard.append(rod((POLES[0], -LZ, 2.15), (POLES[1], -LZ, 2.15), 0.008, LINE, 6))
# clothes: a T-shirt, shorts, a striped towel, a dress and a pair of socks, each its own node hanging from the line
def sheet(outline, mat, depth=0.02):
    me = bpy.data.meshes.new('cloth'); bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in outline]
    f = bm.faces.new(vs); bmesh.ops.triangulate(bm, faces=[f])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('cloth', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(mat)
    for v in o.data.vertices:
        v.co.y = 0.03 * math.sin(v.co.x * 7) * (1 - v.co.z / 1.2)
    o.data.update()
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = depth; apply_mods(o)
    return smooth(o)
shapes = [
    [(-0.35, 0), (0.35, 0), (0.55, -0.22), (0.4, -0.32), (0.3, -0.22), (0.3, -0.85), (-0.3, -0.85), (-0.3, -0.22), (-0.4, -0.32), (-0.55, -0.22)],   # T-shirt
    [(-0.27, 0), (0.27, 0), (0.3, -0.62), (0.05, -0.62), (0.0, -0.25), (-0.05, -0.62), (-0.3, -0.62)],                                            # shorts
    [(-0.4, 0), (0.4, 0), (0.4, -0.95), (-0.4, -0.95)],                                                                                           # towel
    [(-0.2, 0), (0.2, 0), (0.26, -0.3), (0.38, -0.8), (-0.38, -0.8), (-0.26, -0.3)],                                                             # dress
    [(-0.32, 0), (-0.14, 0), (-0.14, -0.45), (-0.02, -0.6), (-0.1, -0.68), (-0.32, -0.5)],                                                       # a sock (and its pair)
]
xs = [1.4, 2.3, 3.3, 4.3, 5.2]
cloths = []
for i, (x, shp) in enumerate(zip(xs, shapes)):
    parts = [sheet(shp, CLOTH[i])]
    if i == 2:
        for z in (-0.18, -0.77):
            parts.append(box(-0.401, 0.401, -0.014, 0.014, z - 0.04, z + 0.04, STRIPE))
    if i == 4:
        s2 = sheet([(-x_, z_) for x_, z_ in shp], CLOTH[i]); parts.append(s2)
    w = max(abs(a) for a, _ in shp)
    for px in ((-w + 0.08, w - 0.08) if i != 4 else (-0.23, 0.23)):
        parts.append(box(px - 0.012, px + 0.012, -0.018, 0.018, -0.04, 0.06, PEG))
    c = join(parts, 'Cloth_%d' % i)
    c.data.transform(Matrix.Translation(B(x, 2.15, LZ))); c.data.update()
    set_origin(c, B(x, 2.15, LZ))
    cloths.append(c)
yard.append(box(1.8, 2.6, -(LZ + 0.9), -(LZ + 0.4), 0, 0.32, BASKET, 0.04))                    # a laundry basket under the line
yard.append(box(1.85, 2.55, -(LZ + 0.85), -(LZ + 0.45), 0.26, 0.31, CLOTH[4], 0.02))

# ---------- the sliding roof: a clear blue corrugated sheet in an aluminium frame ----------
bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=2, size=1, location=(0, 0, 0))
sheet_o = bpy.context.active_object; sheet_o.data.materials.append(ROOF)
for v in sheet_o.data.vertices:
    x, y = v.co.x * 6.2, v.co.y * 2.4
    v.co = Vector((x, y, 0.025 * math.sin(x * 2 * math.pi / 0.2)))
sheet_o.data.update(); smooth(sheet_o)
sol = sheet_o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.008; apply_mods(sheet_o)
frame = [box(-3.15, 3.15, -1.24, -1.16, -0.04, 0.04, ROOF_F, 0.01), box(-3.15, 3.15, 1.16, 1.24, -0.04, 0.04, ROOF_F, 0.01),
         box(-3.15, -3.07, -1.24, 1.24, -0.04, 0.04, ROOF_F, 0.01), box(3.07, 3.15, -1.24, 1.24, -0.04, 0.04, ROOF_F, 0.01)]
for px in POLES:                                                                                     # runners that sit on the rails
    frame.append(box(px - 3.3 - 0.08, px - 3.3 + 0.08, -0.6, 0.6, -0.1, -0.04, ROOF_F, 0.01))
roof = join([sheet_o] + frame, 'Roof_Panel')
roof.data.transform(Matrix.Translation(B(3.3, 2.82, -0.1))); roof.data.update()
set_origin(roof, B(3.3, 2.82, -0.1))

# ---------- the servo on the far pole, 8 x real size, facing the learner ----------
K = 8.0
srv = imported(SERVO, {'Servo_Case', 'Servo_Shaft', 'Servo_Label', 'Horn'})
SP = B(POLES[1] + 0.3, 2.45, LZ - 0.1)
# in the servo model the shaft is on x = 0, z = 45.5 mm and points at the learner (-Y); the bracket's base is at z = -4 mm
M = Matrix.Translation(SP) @ Matrix.Scale(K, 4) @ Matrix.Translation((0, 0, -0.0455))
for o in srv.values():
    o.data.transform(M); o.data.update()
horn = srv.pop('Horn'); horn.name = 'Servo_Horn'
set_origin(horn, SP + Vector((0, -0.0284 * K, 0)))
servo = join(list(srv.values()), 'servo')
yard.append(servo)
yard.append(box(SP.x - 0.16, SP.x + 0.16, SP.y - 0.24, SP.y + 0.06, SP.z - 0.2, SP.z - 0.175, STEEL, 0.01))   # a shelf under the case
yard.append(rod((POLES[1], -LZ, SP.z - 0.19), (SP.x - 0.16, SP.y - 0.05, SP.z - 0.19), 0.025, STEEL))
yard.append(rod((SP.x, SP.y + 0.03, SP.z - 0.2), (POLES[1] + 0.05, -LZ, 1.2), 0.012, CABLE, 6))

# ---------- the raindrop sensor on a post in the open, 10 x real size ----------
RP = B(7.4, 1.18, 3.6)
yard.append(cyl(RP.x, RP.y, 0, 1.12, 0.04, POST, 12))
rain = imported(RAIN, {'Rain_Plate', 'Rain_Board'})   # (its lead is in 'Board', which is dropped: the post carries two wires instead)
KR = 10.0
# the plate sits on the post (its middle at the post top), tilted towards the learner; the board hangs in a box below
Mp = Matrix.Translation(RP + Vector((0, 0, 0.05))) @ Matrix.Rotation(0.6, 4, 'X') @ Matrix.Scale(KR, 4) @ Matrix.Translation((-0.070, 0, 0))   # tilted towards the learner
rain['Rain_Plate'].data.transform(Mp); rain['Rain_Plate'].data.update()
plate = rain['Rain_Plate']; plate.name = 'Rain_Plate'
set_origin(plate, RP + Vector((0, 0, 0.05)))
yard.append(box(RP.x - 0.18, RP.x + 0.18, RP.y - 0.06, RP.y + 0.06, 0.62, 0.9, BOXM, 0.02))             # the comparator board's little box
Mb = Matrix.Translation(Vector((RP.x - 0.15, RP.y - 0.062, 0.68))) @ Matrix.Rotation(math.radians(90), 4, 'X') @ Matrix.Scale(KR, 4)
rain['Rain_Board'].data.transform(Mb); rain['Rain_Board'].data.update()
yard.append(rain['Rain_Board'])
yard.append(rod((RP.x - 0.05, RP.y - 0.02, 0.9), (RP.x - 0.05, RP.y, 1.15), 0.01, CABLE, 6))
yard.append(rod((RP.x + 0.05, RP.y - 0.02, 0.9), (RP.x + 0.05, RP.y, 1.15), 0.01, material('Wire_Red', 0xc8262c, rough=0.45), 6))

# ---------- trees and flowers ----------
for k, (tx, tz, s) in enumerate(((10, -4, 1.3), (12.5, 1, 1), (-9, -2, 1.5), (-10, 5, 1.1), (4, -9, 1.6), (-2, -11, 1.2))):
    c = B(tx, 0, tz)
    yard.append(cyl(c.x, c.y, 0, 1.6 * s, 0.17 * s, TRUNK, 10))
    for j, (dx, dy, dz, r) in enumerate(((0, 0, 2.3, 1.15), (-0.7, 0.2, 1.9, 0.75), (0.7, -0.2, 2.0, 0.8), (0.1, 0.3, 2.9, 0.7))):
        yard.append(blob((c.x + dx * s, c.y + dy * s, dz * s), r * s, LEAF2 if j % 2 else LEAF, 0.9, seed=k * 10 + j))
yard = join(yard, 'Yard')

# ---------- AO, hierarchy, export ----------
bake_ao([yard, roof, horn, plate] + cloths, rays=16, dist=0.8, strength=0.45, ground=False)
root = empty('Rain_Yard', (0, 0, 0))
bpy.context.view_layer.update()
for o in [yard, roof, horn, plate] + cloths:
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
