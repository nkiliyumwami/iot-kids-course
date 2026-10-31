"""plant-garden.glb: the garden for "The Thirsty Plant". A raised bed of planks on stone paving in a lawn, a wooden
fence and shrubs behind, the capacitive soil probe from parts.py standing in the soil (2 times real size so it shows),
a cable to a project box on a post with a red lamp, a watering can and one plant the module clones.
Modelled in centimetres (the module's scene counts 1 unit = 1 cm) and exported under a root node scaled 0.01.

Nodes the module uses:
  Garden            root (scale 0.01)
  Yard              everything that never changes
  Soil              the bed's soil (own material: the module darkens it when wet)
  Lamp              the lamp dome on the box (own material: the module lights it)
  Watering_Can      the can, origin in the middle of its body, spout towards -X (the module moves and tips it)
  Plant             one plant, origin at its foot in the soil (the module clones it, hides this one):
    Stem            origin at the foot (the module squashes it a little when thirsty)
    Leaf_0..Leaf_6  origin where the leaf joins the stem, the blade along local +X; each node's rotation is a turn
                    about Y only, so the module can droop it with rotation.z
    Bud             the flower bud, 16.5 cm up

Needs out/soil-probe.glb from parts.py.
Run:  blender -b --factory-startup -P garden.py -- out/plant-garden.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix, Euler

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'plant-garden.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
PROBE = os.path.join(HERE, 'out', 'soil-probe.glb')
reset()

def image(name, a):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h)
    b = np.ones((h, w, 4), dtype=np.float32); b[..., :3] = np.clip(a, 0, 1); im.pixels.foreach_set(b.ravel()); im.pack(); return im

def tex_material(name, img, rough=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

def srgb(c):
    return np.array([lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)], dtype=np.float32)

rnd = np.random.default_rng(11)
def noise(n, scale, octaves=3):
    a = np.zeros((n, n), dtype=np.float32)
    for o in range(octaves):
        k = max(2, int(n / scale * 2 ** o))
        g = rnd.normal(0, 1, (k + 1, k + 1)).astype(np.float32)
        y, x = np.mgrid[0:n, 0:n] * (k / n)
        x0, y0 = x.astype(int), y.astype(int); fx, fy = x - x0, y - y0
        v = (g[y0, x0] * (1 - fx) * (1 - fy) + g[y0, x0 + 1] * fx * (1 - fy) + g[y0 + 1, x0] * (1 - fx) * fy + g[y0 + 1, x0 + 1] * fx * fy)
        a += v / 2 ** o
    return a / np.abs(a).max()

def lawn(n=256):
    a = np.tile(srgb(0x6fa04a), (n, n, 1)) * (1 + 0.12 * noise(n, 40))[..., None] * (1 + 0.06 * rnd.normal(0, 1, (n, n, 1)))
    return a.astype(np.float32)

def paving(n=256):
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0xc9c3b6), (n, n, 1)) * (1 + 0.06 * noise(n, 30))[..., None]
    slab = ((x // 64) * 7 + (y // 64) * 3) % 5
    a *= (0.94 + 0.03 * slab)[..., None]
    a[((x % 64) < 2) | ((y % 64) < 2)] = srgb(0x8f897e)
    return a.astype(np.float32)

def planks(n=256):
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0xbf8a52), (n, n, 1)) * (1 + 0.08 * np.sin(x / 5.0 + 3 * np.sin(y / 31.0)))[..., None] * (1 + 0.05 * noise(n, 50))[..., None]
    return a.astype(np.float32)

LAWN = tex_material('Lawn', image('lawn', lawn()), 0.95)
PAVE = tex_material('Paving', image('paving', paving()), 0.85)
PLANK = tex_material('Bed_Planks', image('planks', planks()), 0.8)
FENCE = material('Fence_Wood', 0xb98a58, rough=0.85)
POST = material('Post_Wood', 0x8a6238, rough=0.85)
SOIL = material('Soil', 0xa8855a, rough=1.0)
SHRUB = material('Shrub', 0x3f7f3a, rough=0.8)
SHRUB2 = material('Shrub_Light', 0x5c9a44, rough=0.8)
TRUNK = material('Trunk', 0x6b4a2b, rough=0.9)
STEM = material('Stem', 0x4f8a34, rough=0.6)
LEAF = material('Leaf', 0x3f9a3a, rough=0.65)
BUD = material('Bud', 0xe9573f, rough=0.5)
BOX = material('Project_Box', 0x2d3a46, rough=0.45)
BOX_LID = material('Project_Lid', 0x3a4956, rough=0.4)
CHROME = material('Bezel', 0xd6d9dc, rough=0.2, metal=1.0)
LAMP = material('Lamp', 0x5a1010, rough=0.15, coat=1.0)
CABLE = material('Cable_Black', 0x15202a, rough=0.5)
CAN = material('Can_Blue', 0x2f7de1, rough=0.35, coat=0.5)
CAN_D = material('Can_Rose', 0x1f5fbf, rough=0.4)
STONE = material('Stepping_Stone', 0xb3ada2, rough=0.9)
PETAL = [material('Petal_' + str(i), c, rough=0.5) for i, c in enumerate((0xf4d03f, 0xf5f5f0, 0xe8708a))]
LABEL = material('Label_White', 0xf4f6f8, rough=0.6)

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

def uv_planar(o, size, axes='xy'):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if axes == 'auto':
                a = (v.x, v.y) if abs(n.z) > 0.6 else ((v.x, v.z) if abs(n.y) > abs(n.x) else (v.y, v.z))
            else:
                a = (v.x, v.y)
            uv[li].uv = (a[0] / size, a[1] / size)
    return o

def lathe(profile, mat, cx=0.0, cy=0.0, cz=0.0, seg=32):
    me = bpy.data.meshes.new('lathe'); bm = bmesh.new(); rings = []
    for r, z in profile:
        rings.append([bm.verts.new((cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, cz + z)) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg; bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    for ring, z, flip in ((rings[0], profile[0][1], True), (rings[-1], profile[-1][1], False)):
        c = bm.verts.new((cx, cy, cz + z))
        for k in range(seg):
            f = (ring[k], ring[(k + 1) % seg], c); bm.faces.new(f[::-1] if flip else f)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('lathe', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(mat)
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    return smooth(o, 50)

def cable(pts, mat, r=0.45):
    cd = bpy.data.curves.new('cable', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('cable', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat); return smooth(o)

def blob(loc, r, mat, squash=0.8, seed=0, sub=2):
    o = prim('ico_sphere', loc=loc, radius=r, subdivisions=sub, mat=mat)
    rr = random.Random(seed)
    for v in o.data.vertices:
        v.co *= 1 + rr.uniform(-0.12, 0.12)
        v.co.z *= squash
    o.data.update()
    return smooth(o)

# ---------- the yard ----------
yard = []
g = box(-600, 600, -600, 600, -1.2, -0.2, LAWN); uv_planar(g, 120); yard.append(g)
p = box(-75, 75, -41, 49, -0.5, 0, PAVE); uv_planar(p, 60); yard.append(p)
# raised bed: four planks (two boards high) and corner posts; soil top at z = 13 (three.js y)
for y0, y1 in ((-23.5, -20.5), (20.5, 23.5)):
    for z0 in (0, 8):
        b = box(-50, 50, y0, y1, z0, z0 + 7.9, PLANK, 0.3); uv_planar(b, 40, 'auto'); yard.append(b)
for x0, x1 in ((-50, -47), (47, 50)):
    for z0 in (0, 8):
        b = box(x0, x1, -20.5, 20.5, z0, z0 + 7.9, PLANK, 0.3); uv_planar(b, 40, 'auto'); yard.append(b)
for x in (-49, 49):
    for y in (-22, 22):
        yard.append(box(x - 2.2, x + 2.2, y - 2.2, y + 2.2, 0, 18, POST, 0.4))
# stepping stones to the bed
rr = random.Random(5)
for k, (x, y) in enumerate(((-20, -55), (-5, -72), (12, -90), (26, -110))):
    st = cyl(x, y, -0.4, 0.8, 7 + rr.uniform(-1, 1), STONE, 18, 0.5); st.scale = (1.2, 0.85, 1); apply_tf(st); yard.append(st)
# fence along the back, shrubs, a small tree, flowers
for k in range(-24, 25):
    x = k * 12.5
    yard.append(box(x - 5.5, x + 5.5, 120, 122, 0, 110 + (3 if k % 2 else 0), FENCE, 0.4))
for z in (25, 85):
    yard.append(box(-305, 305, 122, 125, z, z + 8, POST, 0.3))
for k, (x, y, r) in enumerate(((-140, 100, 26), (-95, 108, 20), (110, 102, 28), (160, 110, 22), (-200, 105, 24), (220, 100, 30))):
    yard.append(blob((x, y, r * 0.7), r, SHRUB if k % 2 else SHRUB2, 0.85, seed=k, sub=3))
yard.append(cyl(-170, 60, 0, 70, 4, TRUNK, 12))
for k, (dx, dy, dz, r) in enumerate(((0, 0, 85, 30), (-18, 6, 72, 20), (16, -5, 76, 22), (2, 10, 102, 18))):
    yard.append(blob((-170 + dx, 60 + dy, dz), r, SHRUB2 if k % 2 else SHRUB, 0.9, seed=20 + k, sub=3))
rr = random.Random(9)
for k in range(28):                                                          # a strip of flowers in front of the fence
    x = rr.uniform(-280, 280); y = rr.uniform(100, 116)
    if abs(x) < 70:
        continue
    yard.append(cyl(x, y, 0, 14, 0.4, STEM, 6))
    yard.append(blob((x, y, 15), 2.2, PETAL[k % 3], 0.5, seed=40 + k, sub=1))

# ---------- the soil: a lumpy top so it looks dug ----------
bpy.ops.mesh.primitive_grid_add(x_subdivisions=36, y_subdivisions=16, size=1, location=(0, 0, 0))
soil = bpy.context.active_object; soil.data.materials.append(SOIL)
rs = random.Random(3)
for v in soil.data.vertices:
    x, y = v.co.x * 94, v.co.y * 41
    edge = min(1, (47 - abs(x)) / 4, (20.5 - abs(y)) / 4)
    v.co = Vector((x, y, 13 + max(0, edge) * (0.6 * math.sin(x / 5.5) * math.sin(y / 4.5) + rs.uniform(-0.25, 0.35))))
soil.data.update(); smooth(soil); soil.name = 'Soil'
sol = soil.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 12; sol.offset = -1; apply_mods(soil)

# ---------- the post, the box and the lamp; the probe and its cable ----------
yard.append(box(50.5, 53.5, -31.5, -28.5, 0, 33, POST, 0.3))
yard.append(box(44, 60, -34, -26, 32.5, 43.5, BOX, 0.7))
yard.append(box(44.4, 59.6, -34.5, -33.8, 33, 43, BOX_LID, 0.4))
for sx, sz in ((45.4, 34), (58.6, 34), (45.4, 42.5), (58.6, 42.5)):
    s = cyl(0, 0, 0, 0.3, 0.55, CHROME, 10); s.data.transform(Matrix.Translation((sx, -34.6, sz)) @ Matrix.Rotation(math.radians(90), 4, 'X')); s.data.update(); yard.append(s)
yard.append(cyl(52, -30, 43.5, 44.6, 4.0, CHROME, 32, 0.3))
lamp = prim('uv_sphere', loc=(52, -30, 46.3), radius=3.0, segments=28, ring_count=14, mat=LAMP); smooth(lamp); lamp.name = 'Lamp'
cd = bpy.data.curves.new('txt', 'FONT'); cd.body = 'ESP32'; cd.size = 1.6; cd.extrude = 0.05; cd.align_x = 'CENTER'; cd.align_y = 'CENTER'
t = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(t); select_only([t]); bpy.ops.object.convert(target='MESH')
t = bpy.context.active_object; t.data.materials.append(LABEL)
t.data.transform(Matrix.Translation((52, -34.9, 36.5)) @ Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))); t.data.update(); yard.append(t)

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=PROBE); bpy.context.view_layer.update()
pr = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
mw = pr.matrix_world.copy(); pr.parent = None; pr.data.transform(mw); pr.matrix_world = Matrix.Identity(4); pr.data.update()
for ca in list(pr.data.color_attributes):
    pr.data.color_attributes.remove(ca)
for o in [o for o in bpy.data.objects if o not in before and o is not pr]:
    bpy.data.objects.remove(o)
# probe: part x (pins end -> tip) -> down, part z (components) -> towards the learner (-Y), part y -> X; 2 x real, in cm
R = Matrix(((0, 1, 0, 0), (0, 0, -1, 0), (-1, 0, 0, 0), (0, 0, 0, 1)))
TOP = 13 + 10.0                                                              # the probe's top edge, 10 cm above the soil
pr.data.transform(Matrix.Translation((10, -8, TOP)) @ R @ Matrix.Scale(200, 4)); pr.data.update()
yard.append(pr)
yard.append(cable([(10, -8.6, TOP + 2.2), (11, -9, TOP + 6), (22, -16, 24), (38, -26, 22), (46, -30, 27), (48, -30, 32.6)], CABLE, 0.45))
yard = join(yard, 'Yard')

# ---------- the watering can (origin in the middle of its body, spout towards -X) ----------
can = [lathe([(5.6, -6), (6.4, -5.6), (6.5, 4.5), (5.4, 6.0), (2.5, 6.6), (0.1, 6.6)], CAN)]
spout = cyl(0, 0, 0, 13, 0.9, CAN, 14); spout.data.transform(Matrix.Translation((-5.4, 0, -3.5)) @ Matrix.Rotation(math.radians(-50), 4, 'Y')); spout.data.update()
can.append(spout)
rose = lathe([(0.9, 0), (2.0, 1.6), (2.1, 2.1), (0.1, 2.15)], CAN_D, seg=20)
rose.data.transform(Matrix.Translation((-5.4 - 13 * math.sin(math.radians(50)), 0, -3.5 + 13 * math.cos(math.radians(50)))) @ Matrix.Rotation(math.radians(-50), 4, 'Y')); rose.data.update()
can.append(rose)
h = prim('torus', loc=(1.5, 0, 6.2), major_radius=4.4, minor_radius=0.6, major_segments=24, minor_segments=8, rot=(math.radians(90), 0, 0), mat=CAN); smooth(h)
bm = bmesh.new(); bm.from_mesh(h.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.2], context='VERTS'); bm.to_mesh(h.data); bm.free()
can.append(h)
can.append(cyl(0, 0, 6.4, 7.0, 2.6, CAN_D, 24, 0.2))
can = join(can, 'Watering_Can')
can.location = (0, 0, 0)

# ---------- one plant: stem, seven leaves, a bud ----------
def leaf_mesh(length, width, curl=0.25):
    me = bpy.data.meshes.new('leaf'); bm = bmesh.new()
    nu, nv = 9, 5
    grid = []
    for i in range(nu):
        u = i / (nu - 1)
        half = width / 2 * math.sin(math.pi * min(1, u * 1.08)) ** 0.8
        row = []
        for j in range(nv):
            v = j / (nv - 1) * 2 - 1
            x = u * length
            z = curl * length * u * u - abs(v) * width * 0.12           # curls up along its length, and folds along the midrib
            row.append(bm.verts.new((x, v * half, z)))
        grid.append(row)
    for i in range(nu - 1):
        for j in range(nv - 1):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('leaf', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(LEAF)
    return smooth(o)

PX, PY = 300.0, 0.0      # build the plant off to the side, then its origin is moved to its foot
stem = lathe([(0.75, 0), (0.62, 8), (0.45, 15.5), (0.25, 16.6)], STEM, PX, PY, 0, 10)
stem.name = 'Stem'
set_origin(stem, (PX, PY, 0))
leaves = []
for k in range(7):
    L = (5.5 - k * 0.35) * 1.9
    lf = leaf_mesh(L, L * 0.62)
    # a short petiole joining the stem
    pet = cyl(0, 0, 0, 1.2, 0.25, STEM, 6); pet.data.transform(Matrix.Rotation(math.radians(90), 4, 'Y')); pet.data.update()
    lf = join([lf, pet], 'Leaf_%d' % k)
    lf.location = (PX, PY, 5 + k * 1.6)
    lf.rotation_euler = Euler((0, 0, k * 2.4), 'XYZ')     # Blender Z = three.js Y: the turn about the stem
    leaves.append(lf)
bud = prim('uv_sphere', loc=(PX, PY, 16.5), radius=1.5, segments=16, ring_count=10, mat=BUD); smooth(bud)
sep = []
for k in range(5):
    s = prim('cone', loc=(0, 0, 0), radius1=0.7, radius2=0.05, depth=2.0, vertices=6, mat=STEM)
    s.data.transform(Matrix.Translation((PX, PY, 15.6)) @ Matrix.Rotation(k * 1.2566, 4, 'Z') @ Matrix.Translation((1.0, 0, 0)) @ Matrix.Rotation(math.radians(60), 4, 'Y')); s.data.update()
    sep.append(s)
bud = join([bud] + sep, 'Bud')
set_origin(bud, (PX, PY, 16.5))
plant = empty('Plant', (PX, PY, 0))

# ---------- AO, hierarchy, export ----------
parts = [yard, soil, lamp, can, stem, bud] + leaves
bake_ao([yard, soil, lamp], rays=20, dist=14.0, strength=0.5, ground=False)
bake_ao([can], rays=12, dist=4.0, strength=0.4, ground=False)
bake_ao([stem, bud] + leaves, rays=12, dist=4.0, strength=0.35, ground=False)
root = empty('Garden', (0, 0, 0))
bpy.context.view_layer.update()
for o in [stem, bud] + leaves:
    parent(o, plant)
for o in [yard, soil, lamp, can, plant]:
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
