"""Small sensor-module parts for the "Pick a sensor" wiring desks, one GLB each, at real sizes.
Modelled in millimetres and exported under a root node scaled 0.001 (so the files are in metres, like the other models).

Every part lies flat on the desk (bottom at z = 0) with its header pins sticking out to the left (-X), so a module
turns the part's local +X away from the ESP32 and the pins face the board. Each pin tip is an empty named Pin_<NAME>
(where a jumper wire starts). A few parts have other nodes the modules use; they are listed below.

  dht11.glb          DHT11 on its little module: Pin_DATA, Pin_VCC, Pin_GND
  soil-probe.glb     capacitive soil moisture probe v1.2: Pin_AOUT, Pin_VCC, Pin_GND
  raindrop.glb       rain plate + comparator board joined by a 2-wire lead: Pin_VCC, Pin_GND, Pin_DO, Pin_AO;
                     nodes Rain_Plate, Rain_Board
  ir-obstacle.glb    IR obstacle sensor (FC-51 style): Pin_OUT, Pin_GND, Pin_VCC; node LED_Obstacle (green status LED)
  buzzer.glb         12 mm passive buzzer lying on its side, legs out to the left: Pin_PLUS, Pin_MINUS
  hc-sr04p.glb       HC-SR04P ultrasonic sensor, transducers facing up: Pin_VCC, Pin_TRIG, Pin_ECHO, Pin_GND
  breadboard.glb     a 170-point mini breadboard with two LEDs and two 330 ohm resistors:
                     LED_Red, LED_Green, Resistor_A, Resistor_B (hide what you don't use);
                     Hole_A, Hole_B (the row each resistor starts in: wire it from a GPIO), Hole_Rail (the - rail)
  foil-card.glb      a cardboard "fence" with kitchen foil taped on and a crocodile clip: Pin_FOIL (the clip's tail)

Run:  blender -b --factory-startup -P parts.py -- out/ [names...]   (no names = all of them)
It also renders out/<name>_preview.png for each part."""
import sys, os, math, random, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = next((a for a in args if a.endswith('/') or os.path.isdir(a)), os.path.join(HERE, 'out'))
WANT = [a for a in args if a != OUT]
os.makedirs(OUT, exist_ok=True)
PITCH = 2.54

# ---------- helpers (materials are made per part, after each reset) ----------
def mats():
    global M
    M = dict(
        blue=material('PCB_Blue', 0x1f4fae, rough=0.4, coat=0.4), black_pcb=material('PCB_Black', 0x17191d, rough=0.4, coat=0.4),
        green_pcb=material('PCB_Green', 0x1d6b3e, rough=0.4, coat=0.4), silk=material('Silkscreen', 0xf4f6f8, rough=0.6),
        tin=material('Tin', 0xc9ccd0, rough=0.3, metal=1.0), gold=material('Pin_Gold', 0xd8b04a, rough=0.3, metal=1.0),
        black=material('Plastic_Black', 0x1c1f24, rough=0.45), smd=material('SMD_Black', 0x121417, rough=0.5),
        pot=material('Trimpot_Blue', 0x2f6fd0, rough=0.4), brass=material('Brass', 0xc9a14a, rough=0.35, metal=1.0),
        steel=material('Steel', 0xc4c9cf, rough=0.3, metal=0.8), mesh=material('Mesh_Dark', 0x3a3f45, rough=0.8),
        white=material('Plastic_White', 0xf1efe8, rough=0.5), clear=material('IR_Clear', 0xdff2ff, rough=0.08, coat=1.0),
        led_r=material('LED_Red', 0xe8352d, rough=0.15, emit=0xff2a1f, emit_s=0.0, coat=1.0),
        led_g=material('LED_Green', 0x2bbf5a, rough=0.15, emit=0x30ff6a, emit_s=0.0, coat=1.0),
        res=material('Resistor_Body', 0xd9b27c, rough=0.6), brown=material('Band_Brown', 0x7a3f1d, rough=0.5),
        orange=material('Band_Orange', 0xe2731e, rough=0.5), goldb=material('Band_Gold', 0xc9a14a, rough=0.35, metal=0.8),
        bb=material('Breadboard', 0xf3f1ec, rough=0.6), hole=material('Hole', 0x2a2d31, rough=0.9),
        rail_r=material('Rail_Red', 0xd23a33, rough=0.5), rail_b=material('Rail_Blue', 0x2f6fd0, rough=0.5),
        dht=material('DHT11_Blue', 0x2f7de1, rough=0.5), kraft=material('Cardboard', 0xc79a5d, rough=0.85),
        foil=material('Foil', 0xdfe3e8, rough=0.22, metal=1.0), tape=material('Tape', 0xe8d070, rough=0.55),
        wire_r=material('Wire_Red', 0xc8262c, rough=0.45), wire_k=material('Wire_Black', 0x22252a, rough=0.45),
        clip=material('Clip_Red', 0xd23a33, rough=0.4), nickel=material('Nickel', 0xd5d8db, rough=0.25, metal=1.0),
    )

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

def turn(o, m):
    o.data.transform(m); o.data.update(); return o

def cut(o, cutter):
    m = o.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o

def text(body, size, mat, x, y, z, rot=0.0, extrude=0.03):
    cd = bpy.data.curves.new('txt', 'FONT'); cd.body = body; cd.size = size; cd.extrude = extrude
    cd.align_x = 'CENTER'; cd.align_y = 'CENTER'; cd.resolution_u = 2
    o = bpy.data.objects.new('txt', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat)
    turn(o, Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z'))
    return o

def cable(pts, mat, r=0.55):
    cd = bpy.data.curves.new('wire', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2; cd.resolution_u = 8
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = Vector(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('wire', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.append(mat)
    return smooth(o)

def pcb(x0, x1, y0, y1, mat, t=1.6, holes=(), hole_r=1.5):
    o = box(x0, x1, y0, y1, 0, t, mat, 0.35)
    parts = [smooth(o, 30)]
    for hx, hy in holes:
        cut(o, prim('cylinder', loc=(hx, hy, t / 2), radius=hole_r, depth=4, vertices=20))
        ring = prim('cylinder', loc=(hx, hy, t + 0.02), radius=hole_r + 1.0, depth=0.06, vertices=24, mat=M['tin'])
        cut(ring, prim('cylinder', loc=(hx, hy, t), radius=hole_r, depth=1, vertices=20))
        parts.append(ring)
    return parts

def header(names, x_edge, yc=0.0, t=1.6, labels=True, label_size=1.2, reach=7.5):
    """A right-angle header on the PCB's left edge (at x_edge), pins out to -X. Returns (meshes, {name: tip})."""
    n = len(names); out, tips = [], {}
    y0 = yc + (n - 1) / 2 * PITCH
    out.append(box(x_edge + 0.4, x_edge + 2.9, yc - n * PITCH / 2, yc + n * PITCH / 2, t, t + 2.5, M['black'], 0.15))
    for i, nm in enumerate(names):
        y = y0 - i * PITCH; px = x_edge + 1.65
        out.append(box(px - 0.32, px + 0.32, y - 0.32, y + 0.32, -2.6, t + 1.57, M['gold']))
        out.append(box(x_edge - reach, px + 0.32, y - 0.32, y + 0.32, t + 0.93, t + 1.57, M['gold']))
        tips[nm] = Vector((x_edge - reach, y, t + 1.25))
        if labels:
            out.append(text(nm, label_size, M['silk'], x_edge + 3.0 + len(nm) * label_size * 0.33 + 0.6, y, t + 0.01))
    return out, tips

def smd(x, y, w=2.0, d=1.2, t=1.6):
    return [box(x - w / 2 + 0.3, x + w / 2 - 0.3, y - d / 2, y + d / 2, t, t + 0.5, M['smd'], 0.08),
            box(x - w / 2, x - w / 2 + 0.3, y - d / 2, y + d / 2, t, t + 0.52, M['tin']), box(x + w / 2 - 0.3, x + w / 2, y - d / 2, y + d / 2, t, t + 0.52, M['tin'])]

def trimpot(x, y, t=1.6):
    p = [box(x - 3.4, x + 3.4, y - 3.4, y + 3.4, t, t + 4.6, M['pot'], 0.3), cyl(x, y, t + 4.6, t + 5.6, 2.2, M['brass'], 20, 0.2)]
    p.append(box(x - 1.5, x + 1.5, y - 0.25, y + 0.25, t + 5.5, t + 5.7, M['smd']))
    return p

def chip(x, y, t=1.6, w=5.0, d=4.0, legs=4):
    p = [box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, t + 0.2, t + 1.6, M['smd'], 0.15)]
    for k in range(legs):
        lx = x - w / 2 + 0.6 + k * (w - 1.2) / max(1, legs - 1)
        for s in (-1, 1):
            p.append(box(lx - 0.2, lx + 0.2, y + s * d / 2, y + s * (d / 2 + 0.7), t, t + 0.9, M['tin']))
    return p

def smd_led(x, y, mat, t=1.6):
    return [box(x - 0.8, x + 0.8, y - 0.5, y + 0.5, t, t + 0.6, M['white'], 0.05), box(x - 0.6, x + 0.6, y - 0.35, y + 0.35, t + 0.6, t + 0.7, mat)]

def finish(name, objs, tips, extra=None, preview=dict(target=(0, 0, 0.004), dist=0.11, elev=40, azim=-25), prefix='Pin_'):
    """Join the meshes, bake AO, add the pin empties under a root, export with Draco and render a preview."""
    named = extra or {}
    body = join([o for o in objs if o.type == 'MESH'], 'Board')
    parts = [body] + list(named.values())
    bake_ao(parts, rays=20, dist=6.0, strength=0.6, ground=True)
    root = empty(name, (0, 0, 0))
    marks = [empty(prefix + n, p) for n, p in tips.items()]
    bpy.context.view_layer.update()
    for o in parts + marks:
        parent(o, root)
    root.scale = (0.001, 0.001, 0.001)
    bpy.context.view_layer.update()
    path = os.path.join(OUT, name.lower().replace('_', '-') + '.glb') if '/' not in name else name
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    select_only([root] + [o for o in bpy.data.objects if o is not root])
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_vertex_color='ACTIVE', export_animations=False, export_materials='EXPORT',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    print('PART', os.path.basename(path), tri_count(meshes), 'triangles', os.path.getsize(path), 'bytes')
    render_preview(path.replace('.glb', '_preview.png'), res=(700, 700), lens=50, **preview)

# ---------- the parts ----------
def dht11():
    o = pcb(0, 28, -7.5, 7.5, M['blue'], holes=[(25.5, 5.0)], hole_r=1.3)
    h, tips = header(['DATA', 'VCC', 'GND'], 0, labels=False)
    o += h
    for i, s in enumerate(['S', '+', '-']):
        o.append(text(s, 1.4, M['silk'], 4.4, PITCH - i * PITCH, 1.61))
    o += smd(7.8, -4.8) + smd_led(7.8, 4.8, M['led_r'])
    # the DHT11 itself: a blue grille box standing on four legs, the grille facing up
    x0, x1, y0, y1, z0, z1 = 9.5, 24.5, -6.0, 6.0, 2.6, 8.4
    shell = box(x0, x1, y0, y1, z0, z1, M['dht'], 0.4)
    for i in range(5):
        for j in range(4):
            cut(shell, prim('cube', loc=(x0 + 2.2 + i * 2.6, y0 + 2.3 + j * 2.5, z1), scale=(0.8, 0.75, 0.6)))
    o.append(smooth(shell, 30))
    o.append(box(x0 + 0.6, x1 - 0.6, y0 + 0.6, y1 - 0.6, z0 + 0.4, z1 - 0.7, M['white']))           # the white sensor face under the grille
    for k in range(4):
        o.append(box(x0 - 2.0, x0 + 0.2, -3.8 + k * 2.54 - 0.25, -3.8 + k * 2.54 + 0.25, 1.6, 3.2, M['tin']))
    o.append(text('DHT11', 1.5, M['silk'], 17.0, -6.6, 1.61))
    finish('DHT11', o, tips, preview=dict(target=(0.008, 0, 0.004), dist=0.085, elev=40, azim=-25))

def soil_probe():
    T = 1.6; L = 98.0
    me = bpy.data.meshes.new('probe'); bm = bmesh.new()                    # the outline: square top, pointed tip
    pts = [(0, -11.5), (L - 8, -11.5), (L, -2.0), (L, 2.0), (L - 8, 11.5), (0, 11.5)]
    vb = [bm.verts.new((x, y, 0)) for x, y in pts]; vt = [bm.verts.new((x, y, T)) for x, y in pts]
    bm.faces.new(vb[::-1]); bm.faces.new(vt)
    for i in range(len(pts)):
        j = (i + 1) % len(pts); bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bm.to_mesh(me); bm.free()
    p = bpy.data.objects.new('probe', me); bpy.context.scene.collection.objects.link(p); p.data.materials.append(M['black_pcb'])
    bevel(p, 0.3, 2); apply_mods(p); smooth(p, 30)
    o = [p]
    h, tips = header(['AOUT', 'VCC', 'GND'], 0, labels=False)
    o += h
    for i, s in enumerate(['AOUT', 'VCC', 'GND']):
        o.append(text(s, 1.3, M['silk'], 6.0, PITCH - i * PITCH, T + 0.01))
    o += chip(13.5, -4.0, legs=4) + smd(13.5, 4.5) + smd(17.5, 4.5) + smd(20.5, -4.0) + smd(21.5, 4.0)
    o.append(box(9.0, 10.0, -4.4, -2.6, T, T + 1.2, M['smd'], 0.1))
    o.append(box(28.0, 30.0, -11.4, 11.4, T, T + 0.04, M['silk']))          # the white "don't push past here" line
    o.append(text('Capacitive Soil Moisture Sensor v1.2', 1.55, M['silk'], 62.0, 0, T + 0.01))
    finish('Soil_Probe', o, tips, preview=dict(target=(0.045, 0, 0.003), dist=0.16, elev=50, azim=-20))

def raindrop():
    o = []
    # the comparator board, pins out to the left; its two plate pins on the right
    o += pcb(0, 30, -8, 8, M['blue'], holes=[(27.0, 0)], hole_r=1.4)
    h, tips = header(['VCC', 'GND', 'DO', 'AO'], 0, labels=False)
    o += h
    for i, s in enumerate(['VCC', 'GND', 'DO', 'AO']):
        o.append(text(s, 1.15, M['silk'], 5.4, 1.5 * PITCH - i * PITCH, 1.61))
    o += trimpot(14.0, 3.0) + chip(14.5, -4.3, legs=4) + smd_led(21.0, 5.6, M['led_r']) + smd_led(21.0, -6.2, M['led_g']) + smd(9.0, -5.6)
    for k in (-1, 1):                                                        # two straight pins for the plate's lead
        o.append(box(23.6, 24.2, k * 1.27 - 0.3, k * 1.27 + 0.3, 1.6, 9.0, M['gold']))
    o.append(box(22.6, 25.2, -2.8, 2.8, 1.6, 4.1, M['black'], 0.15))
    board = join(o, 'Rain_Board')
    # the rain plate: a 54 x 40 board with an interleaved nickel comb, 40 mm to the right
    PX = 70.0
    q = pcb(PX - 27, PX + 27, -20, 20, M['black_pcb'], holes=[(PX - 23, 16.5), (PX - 23, -16.5)], hole_r=1.4)
    for k in range(-7, 8):                                                   # the comb's fingers
        y = k * 2.5
        q.append(box(PX - 18.5 + (2.0 if k % 2 else 0), PX + 24.0 - (0 if k % 2 else 2.0), y - 0.55, y + 0.55, 1.6, 1.66, M['nickel']))
    q.append(box(PX - 20, PX - 18.5, -18.0, 18.0, 1.6, 1.66, M['nickel'])); q.append(box(PX + 24, PX + 25.5, -18.0, 18.0, 1.6, 1.66, M['nickel']))
    for k in (-1, 1):
        q.append(box(PX - 26.0, PX - 24.0, k * 1.27 - 0.3, k * 1.27 + 0.3, 1.6, 9.0, M['gold']))
    q.append(box(PX - 26.8, PX - 23.2, -2.8, 2.8, 1.6, 4.1, M['black'], 0.15))
    plate = join(q, 'Rain_Plate')
    # the two-wire lead between them
    lead = []
    for k, mat in ((-1, M['wire_k']), (1, M['wire_r'])):
        y = k * 1.27
        lead.append(cable([(23.9, y, 9.0), (25, y, 13), (35, y * 2.5 + 3, 6), (PX - 32, y * 2 - 3, 5), (PX - 25, y, 13), (PX - 25.0, y, 9.0)], mat, 0.5))
    lead = join(lead, 'Rain_Lead')
    finish('Raindrop', [lead], tips, extra={'Rain_Board': board, 'Rain_Plate': plate},
           preview=dict(target=(0.04, 0, 0.003), dist=0.15, elev=50, azim=-20))

def ir_obstacle():
    o = pcb(0, 32, -7.0, 7.0, M['blue'], holes=[(17.0, 0)], hole_r=1.5)
    h, tips = header(['OUT', 'GND', 'VCC'], 0, labels=False)
    o += h
    for i, s in enumerate(['OUT', 'GND', 'VCC']):
        o.append(text(s, 1.15, M['silk'], 5.2, PITCH - i * PITCH, 1.61))
    o += trimpot(11.0, -2.4) + chip(23.0, -3.0, legs=4) + smd(23.0, 4.0) + smd(19.5, 4.6) + smd_led(8.5, 4.6, M['led_r'])
    status = join(smd_led(12.5, 4.6, M['led_g']), 'LED_Obstacle')
    # the IR LED (clear) and the receiver (black) lying down at the front edge, looking along +X
    for y, mat in ((2.9, M['clear']), (-2.9, M['black'])):
        e = cyl(0, 0, 0, 5.4, 2.5, mat, 24, 0.2); dome = prim('uv_sphere', loc=(0, 0, 5.4), radius=2.5, segments=24, ring_count=12, mat=mat); smooth(dome)
        e = join([e, dome], 'eye'); turn(e, Matrix.Translation((32.0, y, 4.3)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
        o.append(e)
        for s in (-0.6, 0.6):
            o.append(box(29.0, 32.0, y + s - 0.2, y + s + 0.2, 1.6, 4.4, M['tin']))
    finish('IR_Obstacle', o, tips, extra={'LED_Obstacle': status}, preview=dict(target=(0.012, 0, 0.004), dist=0.085, elev=40, azim=-25))

def buzzer():
    o = []
    body = cyl(0, 0, -4.25, 4.25, 6.0, M['black'], 40, 0.4)              # 12 mm round, 8.5 mm tall, lying on its side
    cut(body, prim('cylinder', loc=(0, 0, 4.25), radius=1.0, depth=1.2, vertices=16))
    o.append(body)
    o.append(text('+', 2.2, M['silk'], -2.6, 2.6, 4.26, extrude=0.05))
    for o2 in o:
        turn(o2, Matrix.Translation((8.0, 0, 6.0)) @ Matrix.Rotation(math.radians(-90), 4, 'Y'))
    tips = {}
    for nm, y, ln in (('PLUS', 1.9, 9.0), ('MINUS', -1.9, 9.0)):          # the legs come out of the back, bent down and out
        o.append(cable([(3.8, y, 6.0), (1.5, y, 5.0), (0.0, y, 1.6), (-3.0, y, 1.0), (-ln, y, 1.0)], M['tin'], 0.3))
        tips[nm] = Vector((-ln, y, 1.0))
    finish('Buzzer', o, tips, preview=dict(target=(0.003, 0, 0.005), dist=0.06, elev=30, azim=-35))

def hcsr04p():
    o = pcb(0, 20.5, -22.5, 22.5, M['blue'], holes=[(18.0, 20.0), (18.0, -20.0), (2.5, 20.0), (2.5, -20.0)], hole_r=1.0)
    h, tips = header(['VCC', 'TRIG', 'ECHO', 'GND'], 0, labels=False)
    o += h
    for i, s in enumerate(['Vcc', 'Trig', 'Echo', 'Gnd']):
        o.append(text(s, 1.1, M['silk'], 5.4, 1.5 * PITCH - i * PITCH, 1.61))
    for sy, ch in ((13.0, 'T'), (-13.0, 'R')):                               # the two transducers
        can = cyl(10.5, sy, 1.6, 13.6, 8.0, M['steel'], 48, 0.4)
        cut(can, prim('cylinder', loc=(10.5, sy, 13.6), radius=7.0, depth=1.6, vertices=40))
        o.append(can)
        o.append(cyl(10.5, sy, 12.0, 12.9, 7.0, M['mesh'], 40))
        o.append(text(ch, 2.0, M['silk'], 19.0, sy, 1.61))
    o.append(box(14.5, 18.5, -3.0, 3.0, 1.6, 4.6, M['steel'], 0.8))         # crystal
    o += chip(8.0, 0.0, w=4.4, d=4.6, legs=4)
    o.append(text('HC-SR04P', 1.3, M['silk'], 2.6, -14.5, 1.61, rot=math.radians(90)))
    finish('HC-SR04P', o, tips, preview=dict(target=(0.01, 0, 0.006), dist=0.11, elev=45, azim=-25))

def breadboard():
    W, D, H = 46.0, 35.0, 8.5                                                # a 170-point board turned so its rows run along X
    o = []
    bbx = box(-W / 2, W / 2, -D / 2, D / 2, 0, H, M['bb'], 0.6)
    cut(bbx, prim('cube', loc=(0, 0, H), scale=(W / 2 - 1.5, 1.2, 1.2)))      # the middle channel
    o.append(smooth(bbx, 30))
    cols = 17
    for i in range(cols):                                                    # holes: 17 columns of 5, each side of the channel
        x = (i - (cols - 1) / 2) * PITCH
        for side in (-1, 1):
            for j in range(5):
                y = side * (2.9 + j * PITCH)
                o.append(box(x - 0.5, x + 0.5, y - 0.5, y + 0.5, H - 0.05, H + 0.02, M['hole']))
    # LEDs, resistors: row A on the back half, row B on the front half; each resistor feeds an LED whose cathode drops into the - rail
    named, holes = {}, {}
    railx = W / 2 + 2.5
    rail = box(W / 2, W / 2 + 6.0, -D / 2, D / 2, 0, H - 0.6, M['bb'], 0.5)
    o.append(rail)
    o.append(box(W / 2 + 0.6, W / 2 + 1.0, -D / 2 + 1, D / 2 - 1, H - 0.6, H - 0.55, M['rail_b']))
    for j in range(6):
        o.append(box(railx - 0.5, railx + 0.5, -D / 2 + 3 + j * 5.5 - 0.5, -D / 2 + 3 + j * 5.5 + 0.5, H - 0.65, H - 0.58, M['hole']))
    holes['Rail'] = Vector((railx, D / 2 - 3, H))
    for key, sd, led_mat in (('A', 1, M['led_r']), ('B', -1, M['led_g'])):
        hy = lambda j: sd * (2.9 + j * PITCH)                                # hole j (0 = by the channel) on this side
        y = hy(2)
        xr0, xr1 = 2 * PITCH, 7 * PITCH                                      # the resistor bridges two strips, 5 holes apart
        r = [cyl(0, 0, -3.1, 3.1, 1.15, M['res'], 16, 0.3)]
        for dz, m in ((-1.8, M['orange']), (-0.9, M['orange']), (0.0, M['brown']), (1.6, M['goldb'])):
            r.append(cyl(0, 0, dz - 0.3, dz + 0.3, 1.2, m, 16))
        r = join(r, 'res'); turn(r, Matrix.Translation(((xr0 + xr1) / 2, y, H + 3.0)) @ Matrix.Rotation(math.radians(90), 4, 'Y'))
        legs = [cable([(xr0, y, H), (xr0, y, H + 3.0), ((xr0 + xr1) / 2 - 3, y, H + 3.0)], M['tin'], 0.25),
                cable([((xr0 + xr1) / 2 + 3, y, H + 3.0), (xr1, y, H + 3.0), (xr1, y, H)], M['tin'], 0.25)]
        named['Resistor_' + key] = join([r] + legs, 'Resistor_' + key)
        ay = hy(3)                                                           # the LED's long leg shares the resistor's strip; short leg in the - rail
        cx, cy = (xr1 + railx) / 2, ay
        led = cyl(cx, cy, H + 6.0, H + 10.6, 2.5, led_mat, 28)
        dome = prim('uv_sphere', loc=(cx, cy, H + 10.6), radius=2.5, segments=28, ring_count=14, mat=led_mat); smooth(dome)
        flange = cyl(cx, cy, H + 6.0, H + 6.8, 2.9, led_mat, 28)
        lg = [cable([(xr1, ay, H), (xr1, ay, H + 2.5), (cx - 1.27, cy, H + 6.0)], M['tin'], 0.22),
              cable([(railx, ay, H - 0.6), (railx, ay, H + 2.5), (cx + 1.27, cy, H + 6.0)], M['tin'], 0.22)]
        named['LED_' + ('Red' if key == 'A' else 'Green')] = join([led, dome, flange] + lg, 'LED_' + ('Red' if key == 'A' else 'Green'))
        holes[key] = Vector((xr0, hy(0), H))
    finish('Breadboard', o, holes, extra=named, preview=dict(target=(0.002, 0, 0.008), dist=0.11, elev=45, azim=-25), prefix='Hole_')

def foil_card():
    o = [box(0, 40, -14, 14, 0, 1.8, M['kraft'], 0.3)]
    # crinkled foil: a subdivided plane with a little random height
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=28, y_subdivisions=20, size=1, location=(0, 0, 0))
    f = bpy.context.active_object; f.data.materials.append(M['foil'])
    rnd = random.Random(5)
    for v in f.data.vertices:
        v.co = Vector((20.5 + v.co.x * 32, v.co.y * 23, 1.95 + rnd.uniform(0, 0.35)))
    o.append(smooth(f))
    for x in (4.5, 36.5):                                                    # two strips of tape holding the foil
        o.append(box(x - 2.5, x + 2.5, -14.4, 14.4, 2.0, 2.45, M['tape'], 0.1))
    # a red crocodile clip biting the foil's left edge, its tail pointing left
    clip = [box(-6, 8, -2.6, 2.6, 2.0, 4.6, M['clip'], 1.0), box(-8, -4, -1.6, 1.6, 2.4, 4.2, M['clip'], 0.6)]
    for k in range(5):
        clip.append(box(5.0 + k * 0.7, 5.3 + k * 0.7, -2.4, 2.4, 1.6, 2.1, M['steel']))
    o += clip
    finish('Foil_Card', o, {'FOIL': Vector((-8.0, 0, 3.3))}, preview=dict(target=(0.016, 0, 0.002), dist=0.09, elev=45, azim=-25))

BUILD = {'dht11': dht11, 'soil-probe': soil_probe, 'raindrop': raindrop, 'ir-obstacle': ir_obstacle, 'buzzer': buzzer,
         'hc-sr04p': hcsr04p, 'breadboard': breadboard, 'foil-card': foil_card}
for name, fn in BUILD.items():
    if WANT and name not in WANT:
        continue
    reset(); mats(); fn()
