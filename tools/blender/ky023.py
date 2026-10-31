"""ky023-joystick.glb: the KY-023 thumb joystick module (two potentiometers and a push switch under a PS2-style stick),
for the "Joystick crane" module. Real sizes, modelled in millimetres and exported under a root node scaled 0.001.

The board lies flat (PCB bottom at z = 0), its 5-pin right-angle header on the left (-X), the stick in the middle.

Nodes the module uses:
  KY023_Joystick    root (scale 0.001)
  Board             the blue PCB, silkscreen, header, potentiometers, switch, the gimbal's black base and metal cage
  Stick             the black thumb cap on its shaft. Pivot at the gimbal's centre: tilt it about its local X / Z (three.js)
  Pin_GND, Pin_5V, Pin_VRx, Pin_VRy, Pin_SW   empties at the tips of the header pins (where jumper wires start)

Run:  blender -b --factory-startup -P ky023.py -- out/ky023-joystick.glb
It also renders out/ky023-joystick_preview.png."""
import sys, os, math, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = next((a for a in args if a.endswith('.glb')), os.path.join(HERE, 'out', 'ky023-joystick.glb'))
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
reset()

PCB = material('PCB_Blue', 0x1f4fae, rough=0.4, coat=0.4)
SILK = material('Silkscreen', 0xf4f6f8, rough=0.6)
TIN = material('Tin', 0xc9ccd0, rough=0.3, metal=1.0)
GOLD = material('Pin_Gold', 0xd8b04a, rough=0.3, metal=1.0)
BLACK = material('Plastic_Black', 0x1c1f24, rough=0.45)
CAP = material('Cap_Black', 0x22262c, rough=0.62)
STEEL = material('Steel', 0xc4c9cf, rough=0.35, metal=0.6)
SMD = material('SMD_Black', 0x121417, rough=0.5)

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

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o

def lathe(profile, mat, cx=0.0, cy=0.0, seg=40, ridge=None):
    """Spin a (radius, z) profile around the vertical axis at (cx, cy). ridge(angle, z) -> radius factor."""
    me = bpy.data.meshes.new('lathe'); bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            f = ridge(a, z) if ridge else 1.0
            ring.append(bm.verts.new((cx + math.cos(a) * r * f, cy + math.sin(a) * r * f, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            j = (k + 1) % seg
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    for ring, z, flip in ((rings[0], profile[0][1], True), (rings[-1], profile[-1][1], False)):   # close each end with a fan
        c = bm.verts.new((cx, cy, z))
        for k in range(seg):
            f = (ring[k], ring[(k + 1) % seg], c)
            bm.faces.new(f[::-1] if flip else f)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('lathe', me); bpy.context.scene.collection.objects.link(o); o.data.materials.append(mat)
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    return smooth(o, 50)

def text(body, size, mat, extrude=0.03):
    cd = bpy.data.curves.new('txt', 'FONT'); cd.body = body; cd.size = size; cd.extrude = extrude
    cd.align_x = 'CENTER'; cd.align_y = 'CENTER'; cd.resolution_u = 2
    o = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat)
    return o

T = 1.6            # PCB thickness
GX = 3.0           # the gimbal sits a little right of the middle, away from the header
PITCH = 2.54
PINS = ['GND', '5V', 'VRx', 'VRy', 'SW']   # top (+Y, back) to bottom (-Y, front)

# ---------- the board ----------
board = []
pcb = box(-17.0, 17.0, -13.1, 13.1, 0, T, PCB, 0.4)
for hx, hy in ((-13.5, 10.0), (13.5, 10.0), (-13.5, -10.0), (13.5, -10.0)):
    cut(pcb, prim('cylinder', loc=(hx, hy, T / 2), radius=1.6, depth=4, vertices=20))
    ring = prim('cylinder', loc=(hx, hy, T + 0.02), radius=2.6, depth=0.06, vertices=24, mat=TIN)
    cut(ring, prim('cylinder', loc=(hx, hy, T), radius=1.6, depth=1, vertices=20))
    board.append(ring)
board.append(smooth(pcb, 30))

# right-angle header on the left edge: black spacer, pins bent out to the left
board.append(box(-16.6, -14.1, -6.35, 6.35, T, T + 2.5, BLACK, 0.15))
pin_tips = {}
for i, n in enumerate(PINS):
    y = (2 - i) * PITCH
    board.append(box(-15.67, -15.03, y - 0.32, y + 0.32, -2.8, T + 1.25 + 0.32, GOLD))     # down through the board
    board.append(box(-23.0, -15.03, y - 0.32, y + 0.32, T + 0.93, T + 1.57, GOLD))          # bent out to the left
    board.append(cyl(-15.35, y, T, T + 0.05, 1.0, TIN, 12))                               # solder pad
    pin_tips[n] = Vector((-23.0, y, T + 1.25))

# silkscreen: pin names beside the header, the part name, an outline round the gimbal
for i, n in enumerate(PINS):
    t = text({'5V': '+5V'}.get(n, n), 1.35, SILK)
    t.location = (-11.3, (2 - i) * PITCH, T + 0.01); board.append(t)
t = text('KY-023', 1.7, SILK); t.location = (GX, -11.0, T + 0.01); board.append(t)
frame = box(GX - 11.5, GX + 11.5, -9.6, 9.6, T, T + 0.03, SILK)
cut(frame, box(GX - 11.15, GX + 11.15, -9.25, 9.25, T - 1, T + 1, SILK))
board.append(frame)

# a pull-up resistor and its pads for the switch
board.append(box(-9.6, -7.6, -11.6, -10.4, T, T + 0.5, SMD, 0.08))
for x in (-9.75, -7.45):
    board.append(box(x - 0.3, x + 0.3, -11.6, -10.4, T, T + 0.52, TIN))

# ---------- the thumb joystick: base, two potentiometers, switch, metal cage ----------
board.append(box(GX - 8.0, GX + 8.0, -8.0, 8.0, T, T + 4.0, BLACK, 0.4))                  # gimbal base
for sx, sy, w, d in ((0, -1, 10.0, 4.2), (1, 0, 4.2, 10.0)):                                # the X pot (front) and Y pot (right)
    cx, cy = GX + sx * 10.2, sy * 10.2
    board.append(box(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, T, T + 9.6, BLACK, 0.3))
    board.append(box(cx - w / 2 - 0.1, cx + w / 2 + 0.1, cy - d / 2 - 0.1, cy + d / 2 + 0.1, T + 7.4, T + 9.8, STEEL, 0.15))
board.append(box(GX - 4.0, GX + 4.0, 8.2, 11.4, T, T + 3.6, BLACK, 0.3))                    # push switch at the back
board.append(box(GX - 1.3, GX + 1.3, 9.2, 10.4, T + 3.6, T + 4.4, STEEL, 0.1))
cage = box(GX - 8.6, GX + 8.6, -8.6, 8.6, T + 11.2, T + 11.7, STEEL, 0.1)                   # the cage's top plate
cut(cage, prim('cylinder', loc=(GX, 0, T + 11.5), radius=6.6, depth=3, vertices=40))
board.append(cage)
for s in (-1, 1):                                                                           # its two side legs
    board.append(box(GX + s * 8.6 - 0.25, GX + s * 8.6 + 0.25, -5.0, 5.0, T + 4.0, T + 11.7, STEEL, 0.05))
    board.append(box(GX - 5.0, GX + 5.0, s * 8.6 - 0.25, s * 8.6 + 0.25, T + 4.0, T + 11.7, STEEL, 0.05))
PZ = T + 9.0                                                                                # pivot: the middle of the dome
dome = prim('uv_sphere', loc=(GX, 0, PZ), radius=6.2, segments=32, ring_count=16, mat=BLACK); smooth(dome)
board.append(dome)
board = join(board, 'Board')

# ---------- the stick: shaft and a PS2-style thumb cap with grip ridges and a dished top ----------
shaft = lathe([(2.1, PZ + 4.0), (2.1, PZ + 12.5)], CAP, GX, 0, 24)
C0 = PZ + 11.0
prof = [(2.4, C0), (7.0, C0 + 0.2), (9.6, C0 + 1.4), (10.4, C0 + 3.0), (10.5, C0 + 6.5), (10.2, C0 + 8.2), (9.4, C0 + 8.9),
        (8.0, C0 + 8.75), (5.0, C0 + 8.45), (2.0, C0 + 8.35)]
grip = lambda a, z: 1.0 + (0.035 * (0.5 + 0.5 * math.cos(a * 18)) if C0 + 2.6 < z < C0 + 7.0 else 0.0)
cap = lathe(prof, CAP, GX, 0, 72, grip)
stick = join([shaft, cap], 'Stick')
set_origin(stick, (GX, 0, PZ))

# ---------- AO, hierarchy, export ----------
bake_ao([board, stick], rays=24, dist=6.0, strength=0.65, ground=True)
root = empty('KY023_Joystick', (0, 0, 0))
bpy.context.view_layer.update()
marks = [empty('Pin_' + n, p) for n, p in pin_tips.items()]
bpy.context.view_layer.update()   # the empties' world matrices must be current before they are parented
for e in marks:
    parent(e, root)
for o in (board, stick):
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
render_preview(out.replace('.glb', '_preview.png'), target=(0.0, 0.0, 0.008), dist=0.12, elev=38, azim=-25, lens=50, res=(800, 800))
