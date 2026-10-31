"""too-hot-kitchen.glb: the kitchen for "Too Hot in Here". A tiled corner with a window, base cabinets with a wooden
worktop, a ceramic hob with a steel pot, an upper cabinet, a kettle and a few things on the side, the DHT11 on a wall
plate and the ESP32 project box with a red and a green lamp. Modelled in centimetres (the module's scene counts 1 unit
= 1 cm) and exported under a root node scaled 0.01. The learner looks from the front (-Y).

Nodes the module uses:
  Kitchen            root (scale 0.01)
  Room               everything that never changes
  Hob_Ring           the big cooking ring (own material: the module makes it glow)
  Pot                the pot on the big ring
  Lamp_Red, Lamp_Green   the two lamp domes on the project box (own materials: the module lights them)
  DHT11              the sensor on its wall plate (the DHT11 from parts.py, shown 2.5 times bigger so it can be seen)
  Steam_Spot         an empty above the pot (where the steam starts)

Needs out/dht11.glb from parts.py.
Run:  blender -b --factory-startup -P kitchen.py -- out/too-hot-kitchen.glb"""
import sys, os, math, random, bpy, bmesh
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'too-hot-kitchen.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
reset()

# ---------- small painted textures (numpy, no downloads) ----------
def image(name, w, h, rgb):
    im = bpy.data.images.new(name, w, h)
    a = np.ones((h, w, 4), dtype=np.float32); a[..., :3] = rgb
    im.pixels.foreach_set(a.ravel()); im.pack()
    return im

def tex_material(name, img, rough=0.6, repeat=(1, 1), coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (repeat[0], repeat[1], 1)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

rnd = np.random.default_rng(4)
def srgb(c):
    return np.array([lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)], dtype=np.float32)

def floor_tiles(n=256):                       # 2 x 2 big tiles per image, warm stone, grey grout
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0xd9cdb6), (n, n, 1)) * (1 + rnd.normal(0, 0.025, (n, n, 1))).astype(np.float32)
    tile = ((x // (n // 2)) + (y // (n // 2))) % 2
    a *= np.where(tile[..., None] == 1, 0.95, 1.0).astype(np.float32)
    g = ((x % (n // 2)) < 2) | ((y % (n // 2)) < 2)
    a[g] = srgb(0x9c948a)
    return a

def subway(n=256):                            # white brick-bond wall tiles, 8 rows
    y, x = np.mgrid[0:n, 0:n]
    a = np.tile(srgb(0xf4f2ec), (n, n, 1)) * (1 + rnd.normal(0, 0.012, (n, n, 1))).astype(np.float32)
    rh = n // 8; row = y // rh; off = (row % 2) * (n // 8)
    g = ((y % rh) < 2) | (((x + off) % (n // 4)) < 2)
    a[g] = srgb(0xc9c5bd)
    return a

def butcher(n=256):                           # a wooden worktop: long strips along X
    y, x = np.mgrid[0:n, 0:n]
    strip = (y // 32)
    base = srgb(0xc8955c)
    shade = (0.9 + 0.12 * ((strip * 37) % 5) / 4)[..., None]
    grain = 1 + 0.05 * np.sin(x / 6.0 + np.sin(y / 9.0) * 2 + strip * 3)[..., None]
    a = (np.tile(base, (n, n, 1)) * shade * grain).astype(np.float32)
    a[(y % 32) < 1] *= 0.8
    return a

def sky(n=256):                               # the view out of the window: sky, a hill, two trees
    y, x = np.mgrid[0:n, 0:n] / n
    a = (srgb(0xbfe3f7) * (1 - y[..., None]) * 0.0 + srgb(0x8fcaf0) * (1 - (1 - y[..., None]) * 0.0)).astype(np.float32)
    a = a * (0.75 + 0.35 * y[..., None])      # brighter towards the top (image rows go bottom to top)
    hill = y < 0.32 + 0.06 * np.sin(x * 5.0)
    a[hill] = srgb(0x7fb069)
    for cx, cy, r in ((0.25, 0.45, 0.12), (0.72, 0.4, 0.09)):
        t = (x - cx) ** 2 + (y - cy) ** 2 < r * r
        a[t] = srgb(0x4f8f45)
        a[(abs(x - cx) < 0.012) & (y < cy) & (y > 0.25)] = srgb(0x6b4a2b)
    return a.astype(np.float32)

FLOOR = tex_material('Floor_Tiles', image('floor', 256, 256, floor_tiles()), 0.7)
TILES = tex_material('Wall_Tiles', image('tiles', 256, 256, subway()), 0.35, coat=0.3)
WOOD = tex_material('Worktop_Wood', image('wood', 256, 256, butcher()), 0.55)
SKY = tex_material('Window_View', image('sky', 256, 256, sky()), 0.9)
WALL = material('Wall_Paint', 0xf3ecdc, rough=0.9)
WALL2 = material('Wall_Paint_Side', 0xece3cf, rough=0.9)
CAB = material('Cabinet_Sage', 0x7f9c8c, rough=0.55)
CAB_D = material('Cabinet_Shadow', 0x5b7266, rough=0.7)
UPPER = material('Upper_Cabinet', 0xe9e4d8, rough=0.55)
PLINTH = material('Plinth', 0x3b3f44, rough=0.7)
STEEL = material('Steel', 0xd3d7db, rough=0.3, metal=0.55)
GLASS_BLACK = material('Hob_Glass', 0x15181c, rough=0.08, coat=1.0)
RING_MARK = material('Hob_Marking', 0x5b6168, rough=0.4)
RING = material('Hob_Ring', 0x3a3f45, rough=0.35)
FRAME = material('Window_Frame', 0xf7f7f4, rough=0.5)
SILL = material('Sill', 0xdedad2, rough=0.5)
KETTLE = material('Kettle_Cream', 0xf2ead8, rough=0.35, coat=0.5)
BLACK = material('Plastic_Black', 0x1d2024, rough=0.45)
TERRA = material('Terracotta', 0xc0673c, rough=0.8)
LEAF = material('Leaf', 0x4f9a48, rough=0.6)
BOARD = material('Cutting_Board', 0xd9b07a, rough=0.6)
TOMATO = material('Tomato', 0xd8352a, rough=0.3, coat=0.4)
CROCK = material('Crock_Blue', 0x2f6f9f, rough=0.35, coat=0.4)
SPOON = material('Spoon_Wood', 0xc9955c, rough=0.6)
BOX = material('Project_Box', 0x2d3a46, rough=0.45)
BOX_LID = material('Project_Lid', 0x3a4956, rough=0.4)
CHROME = material('Bezel', 0xd6d9dc, rough=0.2, metal=1.0)
LAMP_R = material('Lamp_Red', 0x5a1010, rough=0.15, coat=1.0)
LAMP_G = material('Lamp_Green', 0x0f4a22, rough=0.15, coat=1.0)
LABEL = material('Label_White', 0xf4f6f8, rough=0.6)
PLATE = material('Wall_Plate', 0xf7f5ef, rough=0.5)
CABLE = material('Cable_Black', 0x15202a, rough=0.5)
SOCKET = material('Socket_White', 0xf4f3ef, rough=0.4)

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0, seg=2):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat)
    if bev:
        bevel(o, bev, seg)
    return o

def cyl(x, y, z0, z1, r, mat, verts=32, bev=0.0):
    o = prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=verts, mat=mat)
    if bev:
        bevel(o, bev, 2)
    return smooth(o, 40)

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o); bpy.data.objects.remove(cutter); return o

def lathe(profile, mat, cx, cy, seg=40):
    me = bpy.data.meshes.new('lathe'); bm = bmesh.new(); rings = []
    for r, z in profile:
        rings.append([bm.verts.new((cx + math.cos(2 * math.pi * k / seg) * r, cy + math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg; bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    for ring, z, flip in ((rings[0], profile[0][1], True), (rings[-1], profile[-1][1], False)):
        c = bm.verts.new((cx, cy, z))
        for k in range(seg):
            f = (ring[k], ring[(k + 1) % seg], c); bm.faces.new(f[::-1] if flip else f)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('lathe', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(mat)
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    return smooth(o, 50)

def uv_box(o, scale):
    """Box-project UVs in world units / scale (so textures keep their size on every face)."""
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=scale); bpy.ops.object.mode_set(mode='OBJECT')
    return o

def cable(pts, mat, r=0.45):
    cd = bpy.data.curves.new('cable', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('cable', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat); return smooth(o)

def text(body, size, mat, m, extrude=0.05):
    cd = bpy.data.curves.new('txt', 'FONT'); cd.body = body; cd.size = size; cd.extrude = extrude; cd.align_x = 'CENTER'; cd.align_y = 'CENTER'
    o = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH'); o = bpy.context.active_object; o.data.materials.append(mat)
    o.data.transform(m); o.data.update(); return o

FACE = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # text standing up, facing the learner (-Y)

room = []
# ---------- floor and walls (the back wall's front face is at y = 48.5) ----------
room.append(uv_box(box(-110, 190, -70, 50, -2, 0, FLOOR), 60))
wall = box(-110, 190, 48.5, 51.5, 0, 150, WALL)
cut(wall, box(-80, -40, 47, 53, 46, 78, WALL))                             # the window opening
room.append(wall)
room.append(box(-111.5, -108.5, -50, 50, 0, 150, WALL2))
room.append(box(-82, -38, 53.5, 54, 40, 84, SKY))                          # the view, outside
room.append(box(-110, 190, 48.4, 48.5, 0, 6, WALL2))                       # skirting
# window: frame, middle bar, sill
for x0, x1, z0, z1 in ((-82, -78, 44, 80), (-42, -38, 44, 80), (-82, -38, 76, 80), (-61, -59, 46, 78), (-80, -40, 61, 62.5)):
    room.append(box(x0, x1, 47.0, 50.5, z0, z1, FRAME, 0.3))
room.append(box(-84, -36, 43.0, 50.5, 44, 46, SILL, 0.4))
# splashback tiles between worktop and upper cabinet
room.append(uv_box(box(-55, 95, 48.2, 48.5, 39, 70, TILES), 40))

# ---------- base cabinets, worktop ----------
room.append(box(-55, 95, 22, 48.2, 0, 8, PLINTH))
room.append(box(-55, 95, 20.6, 48.2, 8, 36, CAB_D))
for k in range(4):                                                          # four doors, each with a steel bar handle
    x0 = -55 + k * 37.5 + 0.3
    room.append(box(x0, x0 + 36.9, 19.8, 20.8, 8.3, 35.6, CAB, 0.35))
    hx = x0 + (31 if k % 2 == 0 else 6)
    room.append(cyl(0, 0, -6, 6, 0.55, STEEL, 12)); h = room[-1]
    h.data.transform(Matrix.Translation((hx, 18.4, 28.5))); h.data.update()   # an upright bar
    for dz in (-5, 5):
        room.append(box(hx - 0.4, hx + 0.4, 18.4, 19.8, 28.5 + dz - 0.4, 28.5 + dz + 0.4, STEEL))
room.append(uv_box(box(-57, 97, 18.5, 48.5, 36, 39, WOOD, 0.4), 50))
# hob: black glass with ring markings and touch controls
room.append(box(15, 65, 22, 46, 39, 39.7, GLASS_BLACK, 0.2))
for (rx, ry, r) in ((57, 40, 5.0), (57, 28, 4.2), (27, 40, 4.5)):
    t = cyl(rx, ry, 39.7, 39.74, r, RING_MARK, 32); cut(t, cyl(rx, ry, 39.6, 39.8, r - 0.35, RING_MARK, 32)); room.append(t)
for k in range(5):
    room.append(cyl(22 + k * 2.6, 24.5, 39.7, 39.74, 0.5, RING_MARK, 12))
hob_ring = cyl(40, 34, 39.7, 39.78, 9.0, RING, 48)
hob_ring.name = 'Hob_Ring'
t = cyl(40, 34, 39.78, 39.8, 9.3, RING_MARK, 48); cut(t, cyl(40, 34, 39.7, 39.9, 8.9, RING_MARK, 48)); room.append(t)

# ---------- the pot ----------
pot = [lathe([(8.6, 40.5), (9.3, 40.9), (9.5, 42), (9.5, 51.3), (9.9, 51.5), (9.9, 51.9), (9.1, 51.9), (9.1, 41.3), (0.1, 41.3)], STEEL, 40, 34, 48)]
pot.append(lathe([(9.7, 51.6), (9.7, 52.0), (7.5, 53.2), (2.0, 53.6), (0.1, 53.6)], STEEL, 40, 34, 48))
pot.append(lathe([(1.0, 53.5), (1.6, 54.4), (1.4, 55.4), (0.1, 55.6)], BLACK, 40, 34, 20))
for s in (-1, 1):
    pot.append(box(40 + s * 9.3 - 0.6, 40 + s * 12.2, 33, 35, 49.2, 50.2, BLACK, 0.4))
pot = join(pot, 'Pot')

# ---------- upper cabinet ----------
room.append(box(20, 90, 33, 48.5, 70, 94, UPPER, 0.3))
for k in range(2):
    x0 = 20 + k * 35 + 0.3
    room.append(box(x0, x0 + 34.4, 32.2, 33.2, 70.3, 93.7, UPPER, 0.35))
    hx = x0 + (31 if k == 0 else 3.4)
    room.append(box(hx - 0.5, hx + 0.5, 31.0, 32.2, 72, 78, STEEL, 0.2))

# ---------- things on the worktop and the sill ----------
kettle = [lathe([(6.5, 39.0), (7.6, 39.6), (7.8, 44), (7.0, 52), (5.2, 56), (3.5, 57), (0.1, 57.2)], KETTLE, -40, 34, 40)]
kettle.append(cyl(-40, 34, 39.0, 39.8, 7.2, BLACK, 32))
kettle.append(cyl(-40, 34, 57.0, 58.6, 1.6, BLACK, 16, 0.3))
kettle.append(cable([(-34.5, 34, 54.5), (-30, 34, 54.0), (-29.5, 34, 45.0), (-32.8, 34, 41.5)], BLACK, 1.0))
spout = cyl(0, 0, 0, 7, 1.3, KETTLE, 16); spout.data.transform(Matrix.Translation((-48.0, 34, 49.5)) @ Matrix.Rotation(math.radians(-55), 4, 'Y')); spout.data.update()
kettle.append(spout)
room += kettle
room.append(box(-22, 2, 26, 40, 39, 40.4, BOARD, 0.4))                     # cutting board and two tomatoes
for tx, ty in ((-15, 33), (-9, 30)):
    tm = prim('uv_sphere', loc=(tx, ty, 42.4), radius=2.4, segments=20, ring_count=12, mat=TOMATO); tm.scale = (1, 1, 0.85); apply_tf(tm); smooth(tm); room.append(tm)
    room.append(cyl(tx, ty, 44.2, 44.8, 0.6, LEAF, 8))
room.append(lathe([(4.0, 39.0), (4.4, 39.5), (4.6, 50), (4.2, 50.4), (3.6, 50.4), (3.6, 39.8), (0.1, 39.8)], CROCK, 82, 40, 32))
for a, l in ((-12, 14), (8, 15), (20, 13)):                                 # wooden spoons in the crock
    sp = [cyl(0, 0, 0, l, 0.45, SPOON, 10)]
    bowl = prim('uv_sphere', loc=(0, 0, l + 1.2), radius=1.6, segments=14, ring_count=8, mat=SPOON); bowl.scale = (1, 0.5, 1.3); apply_tf(bowl); sp.append(smooth(bowl))
    sp = join(sp, 'spoon'); sp.data.transform(Matrix.Translation((82, 40, 41)) @ Matrix.Rotation(math.radians(a), 4, 'Y') @ Matrix.Rotation(math.radians(a * 0.6), 4, 'X')); sp.data.update()
    room.append(sp)
room.append(lathe([(3.4, 46), (4.2, 46.2), (4.6, 52), (4.9, 52.4), (0.1, 52.4)], TERRA, -70, 47, 28))   # herbs on the sill
rr = random.Random(3)
for k in range(9):
    lf = prim('uv_sphere', loc=(-70 + rr.uniform(-3, 3), 47 + rr.uniform(-2, 2), 54.5 + rr.uniform(0, 4)), radius=2.0, segments=10, ring_count=6, mat=LEAF)
    lf.scale = (1, 0.7, 1.3); apply_tf(lf); smooth(lf); room.append(lf)

# ---------- the project box (ESP32 + two lamps) and the sensor on the wall ----------
room.append(box(-20, 4, 41.0, 48.5, 82.5, 97.5, BOX, 0.8))
room.append(box(-19.4, 3.4, 40.4, 41.2, 83.1, 96.9, BOX_LID, 0.5))
for sx, sy in ((-18.3, 84.6), (1.7, 84.6), (-18.3, 95.4), (1.7, 95.4)):
    room.append(cyl(0, 0, 0, 0.3, 0.6, CHROME, 12)); s = room[-1]
    s.data.transform(Matrix.Translation((sx, 40.3, sy)) @ Matrix.Rotation(math.radians(90), 4, 'X')); s.data.update()
room.append(text('ESP32', 1.6, LABEL, Matrix.Translation((-8, 40.3, 85.0)) @ FACE, 0.05))
lamps = {}
for name, x, mat in (('Lamp_Red', -14, LAMP_R), ('Lamp_Green', -2, LAMP_G)):
    bz = cyl(0, 0, 0, 1.2, 4.2, CHROME, 32, 0.25); bz.data.transform(Matrix.Translation((x, 40.4, 90)) @ Matrix.Rotation(math.radians(90), 4, 'X')); bz.data.update(); room.append(bz)
    d = prim('uv_sphere', loc=(x, 39.2, 90), radius=3.4, segments=28, ring_count=14, mat=mat); d.scale = (1, 0.75, 1); apply_tf(d); smooth(d)
    d.name = name; lamps[name] = d
# a wooden wall plate under the sensor, and the cables: sensor up to the box, box down to a wall socket
room.append(box(-14, -2, 47.6, 48.5, 54, 70, PLATE, 0.4))
room.append(cable([(-8, 46.8, 70.2), (-6.5, 46.0, 74), (-9, 45.5, 79), (-8, 45.5, 82.4)], CABLE, 0.45))
room.append(box(-34, -26, 47.6, 48.5, 40.5, 48.5, SOCKET, 0.5))
for dx in (-1.6, 1.6):
    room.append(box(-30 + dx - 0.3, -30 + dx + 0.3, 47.5, 47.6, 44, 46, BLACK))
room.append(cable([(-19.8, 46, 83), (-24, 46.5, 76), (-29, 46.8, 62), (-30, 47, 50), (-30, 47.2, 47)], CABLE, 0.45))
room = join(room, 'Room')

# the DHT11 from parts.py, standing on the plate, its grille facing the learner, 2.5 x real size so it shows
DHT = os.path.join(HERE, 'out', 'dht11.glb')
bpy.ops.import_scene.gltf(filepath=DHT); bpy.context.view_layer.update()
dmesh = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Board') and o not in (room,)]
d = dmesh[0]
mw = d.matrix_world.copy(); d.parent = None; d.matrix_world = mw
for o in list(bpy.data.objects):
    if o.name.startswith(('DHT11', 'Pin_')) and o.type == 'EMPTY':
        bpy.data.objects.remove(o)
for ca in list(d.data.color_attributes):
    d.data.color_attributes.remove(ca)
# module: x along its length (pins at x < 0), y across, z up; stand it up so its length runs up the wall (pins down)
R = Matrix(((0, -1, 0, 0), (0, 0, -1, 0), (1, 0, 0, 0), (0, 0, 0, 1)))   # module x -> up, module z (its top) -> towards the learner
d.data.transform(Matrix.Translation((-8, 47.6, 62 - 14 * 0.25)) @ R @ Matrix.Scale(250, 4) @ d.matrix_world)   # metres -> cm, x 2.5
d.matrix_world = Matrix.Identity(4); d.data.update(); d.name = 'DHT11'

# ---------- AO, hierarchy, export ----------
parts = [room, hob_ring, pot, d] + list(lamps.values())
bake_ao(parts, rays=20, dist=12.0, strength=0.55, ground=False)
root = empty('Kitchen', (0, 0, 0))
spot = empty('Steam_Spot', (40, 34, 55))
bpy.context.view_layer.update()
for o in parts + [spot]:
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
