"""Breadboard prototype parts for the "Breadboard" tab of the sensor modules, at real sizes.
Modelled in millimetres and exported under a root node scaled 0.001 (files in metres, like parts.py).

  proto-board.glb    a 400-point half-size breadboard, 82.5 x 53.3 mm: 30 columns of 5-hole strips (rows a-e, f-j)
                     with a + and a - rail along each long side. The holes, letters, numbers and rail stripes are a
                     texture. Board frame: columns run along +X (column c at x = (c - 15.5) * 2.54), rows a..e at
                     y = +13.97 .. +3.81, f..j at -3.81 .. -13.97, rails at y = +-18.8 (- rail) and +-21.34 (+ rail),
                     top surface at z = 8.5. Two of these side by side (centres 53.34 mm apart) take an ESP32 DevKit,
                     which is too wide for one board: one header goes in row j of the back board, the other in row a
                     of the front board.
  proto-buzzer.glb   a 12 mm passive buzzer standing on its legs, 3 holes (7.62 mm) apart: Pin_PLUS, Pin_MINUS
                     (leg tips, 6 mm below the buzzer's base, so they sit in the holes)
  proto-led.glb      a 5 mm LED, legs 1 hole apart: Pin_LONG (+, anode), Pin_SHORT (-, cathode); node Lens (recolour it)
  proto-resistor.glb a 330 ohm resistor bent to span 4 holes (10.16 mm): Pin_A, Pin_B

Run:  blender -b --factory-startup -P proto.py -- out/ [names...]   (no names = all of them)"""
import sys, os, math, bpy
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = next((a for a in args if a.endswith('/') or os.path.isdir(a)), os.path.join(HERE, 'out'))
WANT = [a for a in args if a != OUT]
os.makedirs(OUT, exist_ok=True)
PITCH = 2.54
L, W, H = 82.5, 53.3, 8.5
ROWS = {r: (13.97 - i * PITCH if i < 5 else -3.81 - (i - 5) * PITCH) for i, r in enumerate('abcdefghij')}
RAIL_MINUS, RAIL_PLUS = 18.8, 21.34
RAIL_COLS = [c for g in range(5) for c in range(2 + g * 6, 7 + g * 6)]   # 5 groups of 5 holes per rail

def col_x(c):
    return (c - 15.5) * PITCH

def box(x0, x1, y0, y1, z0, z1, mat, bev=0.0):
    o = prim('cube', loc=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale=((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), mat=mat)
    if bev:
        bevel(o, bev, 2)
    return o

def cyl(x, y, z0, z1, r, mat, verts=24):
    return smooth(prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=verts, mat=mat), 40)

def leg(x, y, z0, z1, mat, r=0.25):
    return prim('cylinder', loc=(x, y, (z0 + z1) / 2), radius=r, depth=z1 - z0, vertices=8, mat=mat)

def image(name, a):
    h, w = a.shape[:2]; im = bpy.data.images.new(name, w, h)
    b = np.ones((h, w, 4), dtype=np.float32); b[..., :3] = np.clip(a, 0, 1); im.pixels.foreach_set(b.ravel()); im.pack(); return im

def srgb(c):
    return np.array([lin(((c >> 16) & 255) / 255), lin(((c >> 8) & 255) / 255), lin((c & 255) / 255)], dtype=np.float32)

# a 3 x 5 pixel font, enough for the board's printing
GLYPH = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    'a': '000111001111111', 'b': '100100111101111', 'c': '000111100100111', 'd': '001001111101111', 'e': '111101111100111',
    'f': '011010111010010', 'g': '111101111001110', 'h': '100100111101101', 'i': '010000010010010', 'j': '001000001101111',
    '+': '000010111010000', '-': '000000111000000',
}

def board_texture(px_mm=14):
    w, h = int(L * px_mm), int(W * px_mm)
    a = np.empty((h, w, 3), np.float32); a[:] = srgb(0xf2f0ea)
    to_px = lambda x, y: ((x + L / 2) * px_mm, (y + W / 2) * px_mm)   # image row 0 is the board's -Y edge
    def rect(x, y, sx, sy, c):
        cx, cy = to_px(x, y)
        a[max(0, int(cy - sy * px_mm / 2)):int(cy + sy * px_mm / 2), max(0, int(cx - sx * px_mm / 2)):int(cx + sx * px_mm / 2)] = c
    def hole(x, y):
        rect(x, y, 1.45, 1.45, srgb(0xc9c6bd)); rect(x, y, 1.05, 1.05, srgb(0x26292d))
    def write(s, x, y, size=1.5, c=srgb(0x6d7075)):
        px = size / 5
        x0 = x - (len(s) * 4 - 1) * px / 2
        for k, ch in enumerate(s):
            g = GLYPH[ch]
            for i in range(15):
                if g[i] == '1':
                    r, cc = divmod(i, 3)        # glyph rows go down the page: the board's +Y is "up" when read from the a side
                    rect(x0 + (k * 4 + cc) * px + px / 2, y + (2 - r) * px, px * 1.02, px * 1.02, c)
    for c in range(1, 31):
        for r, y in ROWS.items():
            hole(col_x(c), y)
        if c == 1 or c % 5 == 0:
            write(str(c), col_x(c), 16.1); write(str(c), col_x(c), -16.1)
    for r, y in ROWS.items():
        write(r, -L / 2 + 2.6, y); write(r, L / 2 - 2.6, y)
    for s in (1, -1):
        for c in RAIL_COLS:
            hole(col_x(c), s * RAIL_MINUS); hole(col_x(c), s * RAIL_PLUS)
        rect(0, s * 17.15, 74, 0.45, srgb(0x2f6fd0))           # blue line by the - rail, red line by the + rail
        rect(0, s * 23.15, 74, 0.45, srgb(0xd23a33))
        for x in (-L / 2 + 2.6, L / 2 - 2.6):
            write('-', x, s * RAIL_MINUS, c=srgb(0x2f6fd0)); write('+', x, s * RAIL_PLUS, c=srgb(0xd23a33))
    rect(0, 0, 76, 2.4, srgb(0xdedbd2))                         # the middle channel, a little shaded
    return a

def uv_top(o):
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = ((v.x + L / 2) / L, (v.y + W / 2) / W)

def export_part(name, objs, tips, extra=None, ao=True):
    body = join([o for o in objs if o.type == 'MESH'], 'Body')
    parts = [body] + list((extra or {}).values())
    if ao:
        bake_ao(parts, rays=16, dist=6.0, strength=0.5, ground=True)
    root = empty(name, (0, 0, 0))
    marks = [empty(k, p) for k, p in tips.items()]
    bpy.context.view_layer.update()
    for o in parts + marks:
        parent(o, root)
    root.scale = (0.001, 0.001, 0.001)
    bpy.context.view_layer.update()
    path = os.path.join(OUT, name + '.glb')
    select_only([root] + [o for o in bpy.data.objects if o is not root])
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_vertex_color='ACTIVE', export_animations=False, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=84,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    print('PART', os.path.basename(path), tri_count([o for o in bpy.data.objects if o.type == 'MESH']), 'triangles', os.path.getsize(path), 'bytes')
    return path

def proto_board():
    m = bpy.data.materials.new('Breadboard'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.62
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image('breadboard', board_texture()); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    o = box(-L / 2, L / 2, -W / 2, W / 2, 0, H, m, 0.6)
    ch = prim('cube', loc=(0, 0, H), scale=(38.0, 1.2, 1.4))
    mod = o.modifiers.new('cut', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.object = ch; mod.solver = 'EXACT'
    apply_mods(o); bpy.data.objects.remove(ch)
    uv_top(o)
    tips = {'Grid_a1': Vector((col_x(1), ROWS['a'], H)), 'Grid_j30': Vector((col_x(30), ROWS['j'], H))}
    path = export_part('proto-board', [o], tips, ao=False)
    render_preview(path.replace('.glb', '_preview.png'), target=(0, 0, 0.004), dist=0.13, elev=55, azim=-20, res=(800, 700))

def proto_buzzer():
    blk, tin = material('Buzzer_Black', 0x1c1f24, rough=0.45), material('Tin', 0xc9ccd0, rough=0.3, metal=1.0)
    gold = material('Label', 0xe9e4d6, rough=0.6)
    base = 0.6                                                     # it stands a little above the board on its legs
    o = [cyl(0, 0, base, base + 8.5, 6.0, blk, 40), cyl(0, 0, base + 8.5, base + 8.9, 5.4, blk, 40),
         cyl(0, 0, base + 8.9, base + 9.0, 1.0, material('Hole_Dark', 0x050607, rough=0.9), 16)]
    o.append(text_mark('+', 2.6, gold, 3.2, 0, base + 8.92))
    half = 3 * PITCH / 2
    o += [leg(-half, 0, base - 6.0, base + 0.2, tin), leg(half, 0, base - 6.0, base + 0.2, tin)]
    path = export_part('proto-buzzer', o, {'Pin_PLUS': Vector((half, 0, base - 6.0)), 'Pin_MINUS': Vector((-half, 0, base - 6.0))})
    render_preview(path.replace('.glb', '_preview.png'), target=(0, 0, 0.004), dist=0.06, elev=35, azim=-25, res=(600, 600))

def text_mark(body, size, mat, x, y, z):
    cd = bpy.data.curves.new('txt', 'FONT'); cd.body = body; cd.size = size; cd.extrude = 0.03
    cd.align_x = 'CENTER'; cd.align_y = 'CENTER'
    t = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(t)
    select_only([t]); bpy.ops.object.convert(target='MESH')
    t = bpy.context.active_object; t.data.materials.append(mat); t.data.transform(Matrix.Translation((x, y, z))); return t

def proto_led():
    tin = material('Tin', 0xc9ccd0, rough=0.3, metal=1.0)
    lens = material('LED_Lens', 0xe8352d, rough=0.12, emit=0xff2a1f, emit_s=0.0, coat=1.0)
    z0 = 3.0                                                       # the LED sits 3 mm above the board
    body = [cyl(0, 0, z0, z0 + 5.6, 2.5, lens, 32), cyl(0, 0, z0, z0 + 1.0, 2.9, lens, 32)]
    dome = prim('uv_sphere', loc=(0, 0, z0 + 5.6), radius=2.5, segments=32, ring_count=16, mat=lens); smooth(dome); body.append(dome)
    lensobj = join(body, 'Lens')
    half = PITCH / 2
    legs = [leg(half, 0, -6.0, z0 + 0.5, tin), leg(-half, 0, -6.0, z0 + 0.5, tin)]
    export_part('proto-led', legs, {'Pin_LONG': Vector((half, 0, -6.0)), 'Pin_SHORT': Vector((-half, 0, -6.0))}, extra={'Lens': lensobj})

def proto_resistor():
    tin = material('Tin', 0xc9ccd0, rough=0.3, metal=1.0)
    bodym = material('Resistor_Body', 0xd9b27c, rough=0.6)
    bands = [material('Band_Orange', 0xe2731e, rough=0.5), material('Band_Orange2', 0xe2731e, rough=0.5),
             material('Band_Brown', 0x7a3f1d, rough=0.5), material('Band_Gold', 0xc9a14a, rough=0.35, metal=0.8)]
    zc = 3.2
    r = [cyl(0, 0, -3.1, 3.1, 1.15, bodym, 16)]
    for dz, m in zip((-1.8, -0.9, 0.0, 1.6), bands):
        r.append(cyl(0, 0, dz - 0.3, dz + 0.3, 1.2, m, 16))
    r = join(r, 'Res'); r.data.transform(Matrix.Translation((0, 0, zc)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
    half = 4 * PITCH / 2
    legs = [leg(-half, 0, -6.0, zc, tin), leg(half, 0, -6.0, zc, tin),
            prim('cylinder', loc=(-(half + 3.1) / 2, 0, zc), radius=0.25, depth=half - 3.1, rot=(0, math.pi / 2, 0), vertices=8, mat=tin),
            prim('cylinder', loc=((half + 3.1) / 2, 0, zc), radius=0.25, depth=half - 3.1, rot=(0, math.pi / 2, 0), vertices=8, mat=tin)]
    export_part('proto-resistor', [r] + legs, {'Pin_A': Vector((-half, 0, -6.0)), 'Pin_B': Vector((half, 0, -6.0))})

BUILD = {'proto-board': proto_board, 'proto-buzzer': proto_buzzer, 'proto-led': proto_led, 'proto-resistor': proto_resistor}
for name, fn in BUILD.items():
    if WANT and name not in WANT:
        continue
    reset(); fn()
