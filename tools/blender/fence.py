"""goat-garden.glb: the vegetable garden for "Don't Touch the Fence". A lawn with a gravel path, a vegetable bed of
cabbages and staked tomatoes behind a rustic wooden fence, a crinkled kitchen-foil panel on the fence (the pretend
touch sensor), a weatherproof box with the buzzer on the last post, the wire between them, a hedge and two trees,
and a goat the module walks up to the fence. Modelled in metres (like the module's scene); root scale 1.

Nodes the module uses:
  Goat_Garden       root
  Yard              everything that never changes
  Foil              the foil panel (own material: the module makes it glow on an alarm)
  Buzzer_Disc       the buzzer's face on the box, origin at its middle (the module pulses its scale)
  Goat              the goat, origin between its feet, facing +Z in three.js (the module moves and turns it)
    Goat_Head       pivot at the neck, 0.85 m up and 0.55 m forward (the module lowers it at the fence)
    Leg_0..Leg_3    pivots at the hips: (-x, back), (+x, back), (-x, front), (+x, front); swing them about X

Run:  blender -b --factory-startup -P fence.py -- out/goat-garden.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'goat-garden.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
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

rnd = np.random.default_rng(21)
def noise(n, scale, octaves=3):
    a = np.zeros((n, n), dtype=np.float32)
    for o in range(octaves):
        k = max(2, int(n / scale * 2 ** o)); g = rnd.normal(0, 1, (k + 1, k + 1)).astype(np.float32)
        y, x = np.mgrid[0:n, 0:n] * (k / n); x0, y0 = x.astype(int), y.astype(int); fx, fy = x - x0, y - y0
        a += (g[y0, x0] * (1 - fx) * (1 - fy) + g[y0, x0 + 1] * fx * (1 - fy) + g[y0 + 1, x0] * (1 - fx) * fy + g[y0 + 1, x0 + 1] * fx * fy) / 2 ** o
    return a / np.abs(a).max()

LAWN = tex_material('Lawn', image('lawn', (np.tile(srgb(0x5d9a3c), (256, 256, 1)) * (1 + 0.14 * noise(256, 40))[..., None] * (1 + 0.06 * rnd.normal(0, 1, (256, 256, 1)))).astype(np.float32)), 0.95)
GRAVEL = tex_material('Gravel', image('gravel', (np.tile(srgb(0xbcae90), (128, 128, 1)) * (1 + 0.18 * rnd.normal(0, 1, (128, 128, 1)))).astype(np.float32)), 0.95)
SOILT = tex_material('Bed_Soil', image('soil', (np.tile(srgb(0x6b4a30), (128, 128, 1)) * (1 + 0.15 * noise(128, 16))[..., None]).astype(np.float32)), 1.0)
WOOD = material('Fence_Wood', 0x8a5a35, rough=0.85)
WOOD_D = material('Fence_Wood_Dark', 0x6e4528, rough=0.9)
EDGE = material('Bed_Edge', 0x9b7a55, rough=0.85)
FOIL = material('Foil', 0xe6e9ee, rough=0.25, metal=0.9)
TAPE = material('Tape', 0xe8d070, rough=0.55)
BOXM = material('Box_Grey', 0x3a4450, rough=0.5)
LID = material('Box_Lid', 0x4a5562, rough=0.45)
BUZZ = material('Buzzer_Black', 0x181818, rough=0.4)
WIRE = material('Wire_Blue', 0x2f7de1, rough=0.45)
CAB_O = material('Cabbage_Outer', 0x5f9e4a, rough=0.6)
CAB_I = material('Cabbage_Inner', 0xa8d08a, rough=0.55)
TOM = material('Tomato', 0xd8342b, rough=0.3, coat=0.4)
TOMLEAF = material('Tomato_Leaf', 0x3e8a35, rough=0.7)
STAKE = material('Cane', 0xc9a66b, rough=0.8)
HEDGE = material('Hedge', 0x2f6b2e, rough=0.85)
HEDGE2 = material('Hedge_Light', 0x4f8a3a, rough=0.85)
TRUNK = material('Trunk', 0x6b4a2b, rough=0.9)
FUR = material('Goat_Fur', 0xf2ede0, rough=0.9)
PATCH = material('Goat_Patch', 0x8a5a36, rough=0.9)
HOOF = material('Goat_Hoof', 0x3a2e24, rough=0.6)
HORN = material('Goat_Horn', 0x9c8a6a, rough=0.6)
EYE = material('Goat_Eye', 0x15120f, rough=0.2, coat=0.8)
NOSE = material('Goat_Nose', 0xd9a59a, rough=0.6)

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

def ball(loc, r, mat, scale=(1, 1, 1), seg=16, rings=10):
    o = prim('uv_sphere', loc=(0, 0, 0), radius=r, segments=seg, ring_count=rings, mat=mat)
    o.data.transform(Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1))); o.data.update()
    return smooth(o)

def blob(loc, r, mat, squash=0.85, seed=0, sub=3):
    o = prim('ico_sphere', loc=loc, radius=r, subdivisions=sub, mat=mat)
    rr = random.Random(seed)
    for v in o.data.vertices:
        d = v.co - Vector(loc); d *= 1 + rr.uniform(-0.1, 0.1); d.z *= squash; v.co = Vector(loc) + d
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

# three.js (x, y, z) -> Blender (x, -z, y)
def B(x, y, z):
    return (x, -z, y)

# ---------- the yard ----------
yard = []
g = box(-60, 60, -60, 60, -0.05, 0, LAWN); uv_planar(g, 6); yard.append(g)
p = box(-1.3, 1.3, -14.4, -0.4, 0, 0.02, GRAVEL, 0.01); uv_planar(p, 1.5); yard.append(p)           # the path (three z 0.4 .. 14.4)
for x in (-1.32, 1.32):                                                                               # edging boards along it
    yard.append(box(x - 0.03, x + 0.03, -14.4, -0.4, 0, 0.06, EDGE))
# the vegetable bed behind the fence (three z -0.5 .. -3.9)
yard.append(box(-4.5, 4.5, 0.5, 3.9, 0, 0.14, EDGE, 0.01))
s = box(-4.42, 4.42, 0.58, 3.82, 0.1, 0.16, SOILT); uv_planar(s, 1.2); yard.append(s)
rr = random.Random(4)
for i in range(5):
    for j in range(2):
        x, zt = -3.4 + i * 1.7, -2.9 + j * 1.4
        bx, by = x, -zt
        if j == 1:      # cabbages in the front row
            yard.append(ball((bx, by, 0.3), 0.28, CAB_I, (1, 1, 0.85)))
            for k in range(6):
                a = k * 1.047 + rr.uniform(-0.2, 0.2)
                yard.append(ball((bx + math.cos(a) * 0.2, by + math.sin(a) * 0.2, 0.26), 0.2, CAB_O, (1.3, 0.5, 0.9)))
                yard[-1].data.transform(Matrix.Translation((bx, by, 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.5, 4, 'Y') @ Matrix.Rotation(-a, 4, 'Z') @ Matrix.Translation((-bx, -by, 0))); yard[-1].data.update()
        else:           # staked tomatoes at the back
            yard.append(rod((bx, by, 0.1), (bx + 0.02, by, 1.25), 0.015, STAKE, 6))
            for k in range(5):
                h = 0.3 + k * 0.18
                yard.append(blob((bx + rr.uniform(-0.12, 0.12), by + rr.uniform(-0.1, 0.1), h), 0.16, TOMLEAF, 0.7, seed=i * 10 + k, sub=1))
            for k in range(4):
                yard.append(ball((bx + rr.uniform(-0.15, 0.15), by - 0.12 + rr.uniform(-0.05, 0.05), 0.35 + rr.uniform(0, 0.6)), 0.075, TOM))
# the fence along three z = 0: five posts, two rails, and pickets
for i in range(5):
    x = -3.6 + i * 1.8
    yard.append(box(x - 0.08, x + 0.08, -0.08, 0.08, 0, 1.5, WOOD, 0.015))
    yard.append(prim('cone', loc=(x, 0, 1.55), radius1=0.11, radius2=0.0, depth=0.1, vertices=4, rot=(0, 0, math.radians(45)), mat=WOOD))
for ry in (0.55, 1.1):
    yard.append(box(-3.7, 3.7, 0.04, 0.11, ry - 0.05, ry + 0.05, WOOD_D, 0.01))
for k in range(37):
    x = -3.55 + k * 0.197
    if -1.15 < x < 1.15:      # no pickets behind the foil
        continue
    yard.append(box(x - 0.05, x + 0.05, 0.11, 0.135, 0.15, 1.22 + 0.04 * (k % 2), WOOD, 0.008))
# the foil's backing card and its tape
yard.append(box(-1.12, 1.12, -0.04, 0.0, 0.48, 1.32, material('Card', 0xc79a5d, rough=0.85), 0.01))
for x in (-1.0, 1.0):
    yard.append(box(x - 0.06, x + 0.06, -0.075, -0.06, 0.46, 1.34, TAPE))
# the box on the last post, the wire from the foil, a hedge and two trees behind
yard.append(box(3.37, 3.83, -0.22, -0.06, 1.22, 1.68, BOXM, 0.03))
yard.append(box(3.39, 3.81, -0.235, -0.215, 1.24, 1.66, LID, 0.02))
cd = bpy.data.curves.new('wire', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = 0.022; cd.bevel_resolution = 2
sp = cd.splines.new('BEZIER'); pts = [B(1.1, 0.9, 0.1), B(1.8, 1.2, 0.12), B(2.8, 1.25, 0.14), B(3.38, 1.4, 0.16)]
sp.bezier_points.add(len(pts) - 1)
for bp, q in zip(sp.bezier_points, pts):
    bp.co = q; bp.handle_left_type = bp.handle_right_type = 'AUTO'
w = bpy.data.objects.new('wire', cd); bpy.context.scene.collection.objects.link(w); select_only([w]); bpy.ops.object.convert(target='MESH')
w = bpy.context.active_object; w.data.materials.append(WIRE); yard.append(smooth(w))
yard.append(ball(B(1.1, 0.9, 0.1), 0.05, material('Clip_Red', 0xd23a33, rough=0.4), (1.6, 0.7, 0.9)))   # a crocodile clip on the foil
for k, x in enumerate(np.linspace(-9, 9, 10)):
    yard.append(blob((float(x) + rr.uniform(-0.3, 0.3), 6.2 + rr.uniform(-0.3, 0.3), 0.7), 1.0 + rr.uniform(-0.1, 0.2), HEDGE if k % 2 else HEDGE2, 0.8, seed=60 + k))
for tx, ty in ((-7.5, 9.0), (8.0, 10.0)):
    yard.append(cyl(tx, ty, 0, 2.6, 0.18, TRUNK, 10))
    for k, (dx, dy, dz, r) in enumerate(((0, 0, 3.2, 1.4), (-0.8, 0.3, 2.7, 0.9), (0.8, -0.2, 2.8, 1.0), (0.1, 0.4, 4.0, 0.9))):
        yard.append(blob((tx + dx, ty + dy, dz), r, HEDGE2 if k % 2 else HEDGE, 0.9, seed=80 + k + int(tx)))
yard = join(yard, 'Yard')

# ---------- the foil: a crinkled sheet on the card, facing the path ----------
bpy.ops.mesh.primitive_grid_add(x_subdivisions=44, y_subdivisions=16, size=1, location=(0, 0, 0))
foil = bpy.context.active_object; foil.data.materials.append(FOIL)
rf = random.Random(8)
for v in foil.data.vertices:
    x, z = v.co.x * 2.2, 0.9 + v.co.y * 0.8
    v.co = Vector((x, -0.045 - rf.uniform(0, 0.012), z))
foil.data.update(); smooth(foil); foil.name = 'Foil'

# ---------- the buzzer's face on the box (three.js (3.6, 1.45, 0.3)) ----------
disc = cyl(0, 0, -0.05, 0.05, 0.17, BUZZ, 32, 0.01)
cut_c = cyl(0, 0, 0.03, 0.08, 0.03, BUZZ, 12)
m = disc.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cut_c; m.solver = 'EXACT'; apply_mods(disc); bpy.data.objects.remove(cut_c)
disc.data.transform(Matrix.Rotation(math.radians(90), 4, 'X')); disc.data.update()          # its face looks at -Y (three.js +Z)
disc.location = B(3.6, 1.45, 0.27); disc.name = 'Buzzer_Disc'

# ---------- the goat (built facing -Y in Blender = +Z in three.js; origin between its feet) ----------
goat_parts = []
body = ball((0, 0, 0.62), 1.0, FUR, (0.25, 0.5, 0.23), seg=24, rings=14)
goat_parts.append(body)
goat_parts.append(ball((0.0, 0.1, 0.72), 1.0, PATCH, (0.2, 0.22, 0.1)))      # a brown patch on its back
goat_parts.append(ball((0.0, -0.38, 0.72), 0.13, FUR, (1, 1.3, 1.2)))            # chest
goat_parts.append(rod((0, -0.36, 0.7), (0, -0.5, 0.86), 0.09, FUR, 12))        # neck
tail = rod((0, 0.46, 0.72), (0, 0.55, 0.86), 0.035, FUR, 8); goat_parts.append(tail)
goat_body = join(goat_parts, 'Goat_Body')
# head: pivot at (0, -0.55, 0.85) in Blender
H = Vector((0, -0.55, 0.85))
hp = [ball(H + Vector((0, 0, 0)), 0.14, FUR, (0.95, 1.15, 1.0)),
      ball(H + Vector((0, -0.17, -0.05)), 0.1, FUR, (0.85, 1.2, 0.85)),
      ball(H + Vector((0, -0.27, -0.07)), 0.055, NOSE, (1.2, 0.8, 0.9)),
      ball(H + Vector((0, -0.12, -0.2)), 0.04, PATCH, (0.7, 0.7, 1.6))]                 # beard
for sx in (-1, 1):
    hp.append(ball(H + Vector((sx * 0.1, -0.08, 0.06)), 0.025, EYE))
    ear = ball(H + Vector((sx * 0.19, 0.02, 0.04)), 0.09, FUR, (1.0, 0.4, 0.35)); hp.append(ear)
    horn = [rod(H + Vector((sx * 0.06, 0.02, 0.12)), H + Vector((sx * 0.09, 0.1, 0.27)), 0.025, HORN, 8),
            rod(H + Vector((sx * 0.09, 0.1, 0.27)), H + Vector((sx * 0.11, 0.2, 0.31)), 0.018, HORN, 8)]
    hp += horn
head = join(hp, 'Goat_Head')
set_origin(head, H)
legs = []
for k, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):     # three.js (x, z) signs, z > 0 is the front
    hip = Vector((sx * 0.15, -sz * 0.35, 0.42 + 0.06))
    lg = [rod(hip, hip + Vector((0, 0, -0.42)), 0.045, FUR, 10), rod(hip + Vector((0, 0, -0.38)), hip + Vector((0, 0, -0.48)), 0.04, HOOF, 10)]
    lg = join(lg, 'Leg_%d' % k)
    set_origin(lg, hip - Vector((0, 0, 0.06)))
    legs.append(lg)
goat = empty('Goat', (0, 0, 0))

# ---------- AO, hierarchy, export ----------
bake_ao([yard, foil, disc], rays=16, dist=0.6, strength=0.5, ground=False)
bake_ao([goat_body, head] + legs, rays=16, dist=0.25, strength=0.45, ground=True)
root = empty('Goat_Garden', (0, 0, 0))
bpy.context.view_layer.update()
for o in [goat_body, head] + legs:
    parent(o, goat)
for o in (yard, foil, disc, goat):
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
