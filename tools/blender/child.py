"""child.glb: an 11-year-old Rwandan primary-school pupil, stylised (big friendly eyes, soft shapes).
Jointed, not skinned: each joint is a node with its pivot at the joint, so three.js turns it directly.
Nodes: Child > Body (hips) > Torso > Head, Shoulder_L > Elbow_L, Shoulder_R > Elbow_R; Body > Hip_L > Knee_L, Hip_R > Knee_R.
Faces -Y in Blender (+Z in three.js). _L is the child's left (+X). Usage: python child.py out.glb [variant]"""
import sys, math, bpy
import os; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector

out = sys.argv[-2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'child.glb')
variant = sys.argv[-1] if len(sys.argv) > 2 else 'a'
V = {
    'a': dict(skin=0x5b3a24, shirt=0x8cc4ee, shorts=0x253556, bag=0xf08a24, hair='short', shoes=0x1d1d1f),
    'b': dict(skin=0x4a2e1c, shirt=0xf4f0e2, shorts=0x2f6b45, bag=0x2b7fd8, hair='puffs', shoes=0x5a2e1a, skirt=True),
}[variant]
reset()
SKIN = material('Skin', V['skin'], rough=0.55)
SHIRT = material('Shirt', V['shirt'], rough=0.85)
SHORTS = material('Shorts', V['shorts'], rough=0.85)
SOCK = material('Sock', 0xf2f2f2, rough=0.9)
SHOE = material('Shoe', V['shoes'], rough=0.45, coat=0.4)
SOLE = material('Sole', 0xf4f4f4, rough=0.6)
HAIR = material('Hair', 0x121212, rough=0.95)
WHITE = material('EyeWhite', 0xffffff, rough=0.2)
IRIS = material('Iris', 0x3b2314, rough=0.15)
PUPIL = material('Pupil', 0x050505, rough=0.1)
SHINE = material('Shine', 0xffffff, rough=0.1, emit=0xffffff, emit_s=1.5)
LIP = material('Lip', 0x6a2a24, rough=0.5)
BROW = material('Brow', 0x161010, rough=0.9)
BAG = material('Bag', V['bag'], rough=0.55)
BAGD = material('BagDark', 0x2a2a2e, rough=0.6)
BUTTON = material('Button', 0xffffff, rough=0.3)

def capsule(r, p0, p1, mat, seg=16):
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    o = prim('uv_sphere', loc=(0, 0, 0), radius=r, segments=seg, ring_count=10, mat=mat)
    for v in o.data.vertices:
        v.co.z += L / 2 if v.co.z > 0 else -L / 2
    q = (p1 - p0).normalized().to_track_quat('Z', 'Y')
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = (p0 + p1) / 2
    apply_tf(o); select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return smooth(o)

def tube(r0, r1, z0, z1, x, mat, y=0.0, seg=24, sy=1.0):
    o = prim('cone', loc=(x, y, (z0 + z1) / 2), radius1=r0, radius2=r1, depth=abs(z1 - z0), vertices=seg, end_fill_type='NOTHING', mat=mat)
    o.scale = (1, sy, 1); apply_tf(o)
    m = o.modifiers.new('sol', 'SOLIDIFY'); m.thickness = 0.008; m.offset = 0
    subsurf(o, 1)
    return smooth(o)

def curve_strap(pts, r, mat):
    cd = bpy.data.curves.new('strap', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 2
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('strap', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.clear(); o.data.materials.append(mat)
    o.scale = (1, 0.5, 1) if False else (1, 1, 1)
    return smooth(o)

HIP = 0.66
# ---------- hips and shorts (Body) ----------
hips = prim('cylinder', loc=(0, 0, HIP + 0.05), radius=0.15, depth=0.2, vertices=32, scale=(1, 0.76, 1), mat=SHORTS)
bevel(hips, 0.035, 4); smooth(hips)
if V.get('skirt'):  # a pleated school skirt
    sk = prim('cone', loc=(0, 0, HIP - 0.04), radius1=0.215, radius2=0.15, depth=0.3, vertices=48, end_fill_type='NOTHING', mat=SHORTS)
    deform(sk, lambda p: Vector((p.x * (1 + 0.035 * math.sin(math.atan2(p.y, p.x) * 16)), p.y * 0.85 * (1 + 0.035 * math.sin(math.atan2(p.y, p.x) * 16)), p.z)))
    sk.modifiers.new('sol', 'SOLIDIFY').thickness = 0.01; smooth(sk); hips = join([hips, sk])
band = prim('torus', major_segments=28, minor_segments=8, loc=(0, 0, HIP + 0.14), major_radius=0.148, minor_radius=0.012, scale=(1, 0.78, 1), mat=SHORTS); smooth(band)
body = join([hips, band], 'Body'); set_origin(body, (0, 0, HIP))

# ---------- torso: shirt with collar, buttons and a pocket, neck, school bag ----------
shirt = capsule(0.15, (0, 0, HIP + 0.1), (0, 0, HIP + 0.36), SHIRT)
def shirt_shape(p):
    z = p.z - (HIP + 0.03)  # 0 at the waist .. 0.42 at the shoulders
    sx = 1.0 + 0.12 * max(0, min(1, (z - 0.24) / 0.12)) - 0.04 * max(0, 1 - z / 0.12)
    sy = 0.7 + 0.04 * math.sin(min(1, max(0, z) / 0.4) * math.pi)
    zz = p.z if z < 0.34 else HIP + 0.37 + (p.z - HIP - 0.37) * 0.45  # flatter shoulders
    return Vector((p.x * sx, p.y * sy, max(zz, HIP + 0.0)))
deform(shirt, shirt_shape); smooth(shirt)
collar = prim('torus', major_segments=28, minor_segments=8, loc=(0, -0.005, HIP + 0.445), major_radius=0.062, minor_radius=0.016, scale=(1.05, 0.95, 0.6), mat=SHIRT); smooth(collar)
flaps = []
for s in (-1, 1):
    f = prim('cube', loc=(s * 0.035, -0.09, HIP + 0.42), scale=(0.035, 0.008, 0.028), rot=(math.radians(-25), 0, s * math.radians(30)), mat=SHIRT)
    bevel(f, 0.006, 2); flaps.append(smooth(f))
buttons = [smooth(prim('uv_sphere', loc=(0, -0.107, HIP + 0.38 - i * 0.075), radius=0.008, segments=10, ring_count=6, scale=(1, 0.5, 1), mat=BUTTON)) for i in range(4)]
pocket = prim('cube', loc=(0.07, -0.107, HIP + 0.34), scale=(0.035, 0.004, 0.035), mat=SHIRT); bevel(pocket, 0.004, 2); smooth(pocket)
neck = capsule(0.05, (0, 0, HIP + 0.42), (0, 0, HIP + 0.49), SKIN)
bag = prim('cube', loc=(0, 0.16, HIP + 0.27), scale=(0.13, 0.065, 0.16), mat=BAG); bevel(bag, 0.04, 4); smooth(bag)
pk = prim('cube', loc=(0, 0.228, HIP + 0.21), scale=(0.095, 0.022, 0.07), mat=BAG); bevel(pk, 0.02, 3); smooth(pk)
zip_ = prim('cube', loc=(0, 0.235, HIP + 0.275), scale=(0.08, 0.008, 0.004), mat=BAGD); smooth(zip_)
straps = [curve_strap([(s * 0.09, 0.112, HIP + 0.3), (s * 0.095, 0.075, HIP + 0.378), (s * 0.1, -0.03, HIP + 0.388), (s * 0.105, -0.104, HIP + 0.32), (s * 0.1, -0.11, HIP + 0.2)], 0.011, BAGD) for s in (-1, 1)]
torso = join([shirt, collar] + flaps + buttons + [pocket, neck, bag, pk, zip_] + straps, 'Torso'); set_origin(torso, (0, 0, HIP + 0.04))

# ---------- head: face, eyes, eyebrows, nose, smile, ears, hair ----------
HC = Vector((0, -0.005, HIP + 0.62))
skull = prim('uv_sphere', loc=HC, radius=0.125, segments=32, ring_count=18, mat=SKIN)
def head_shape(p):
    d = p - HC
    k = max(0.0, -d.z / 0.125)  # the jaw: narrower towards the chin
    return HC + Vector((d.x * (1 - 0.16 * k * k), d.y * 0.94 * (1 - 0.08 * k), d.z * 1.07))
deform(skull, head_shape); smooth(skull)
parts = [skull]
for s in (-1, 1):
    ear = prim('uv_sphere', loc=HC + Vector((s * 0.121, 0.005, -0.01)), radius=0.03, segments=16, ring_count=10, scale=(0.45, 0.8, 1.1), mat=SKIN); parts.append(smooth(ear))
    ex, ez = s * 0.043, HC.z + 0.012
    parts.append(smooth(prim('uv_sphere', loc=(ex, HC.y - 0.1, ez), radius=0.026, segments=20, ring_count=14, scale=(0.95, 0.55, 1.15), mat=WHITE)))
    parts.append(smooth(prim('uv_sphere', loc=(ex, HC.y - 0.111, ez - 0.002), radius=0.017, segments=18, ring_count=12, scale=(1, 0.5, 1.1), mat=IRIS)))
    parts.append(smooth(prim('uv_sphere', loc=(ex, HC.y - 0.117, ez - 0.002), radius=0.009, segments=14, ring_count=10, scale=(1, 0.5, 1.1), mat=PUPIL)))
    parts.append(smooth(prim('uv_sphere', loc=(ex + 0.006, HC.y - 0.121, ez + 0.007), radius=0.0045, segments=10, ring_count=6, mat=SHINE)))
    brow = prim('torus', major_segments=28, minor_segments=8, loc=(ex, HC.y - 0.108, ez + 0.045), major_radius=0.026, minor_radius=0.0045, rot=(math.radians(90), 0, 0), mat=BROW)
    deform(brow, lambda p, ez=ez: p if p.z > ez + 0.05 else Vector((p.x, p.y, ez + 0.05)))
    parts.append(smooth(brow))
nose = prim('uv_sphere', loc=(0, HC.y - 0.118, HC.z - 0.025), radius=0.019, segments=16, ring_count=10, scale=(1.25, 0.75, 0.85), mat=SKIN); parts.append(smooth(nose))
smile = prim('torus', major_segments=28, minor_segments=8, loc=(0, HC.y - 0.108, HC.z - 0.052), major_radius=0.032, minor_radius=0.0065, rot=(math.radians(90), 0, 0), mat=LIP)
select_only([smile]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
for v in smile.data.vertices:
    v.select = v.co.z > -0.004
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.delete(type='VERT'); bpy.ops.object.mode_set(mode='OBJECT')
deform(smile, lambda p: Vector((p.x, p.y - 0.012 * (1 - (p.x / 0.035) ** 2), p.z)))  # follows the round face
parts.append(smooth(smile))
if V['hair'] == 'short':
    hair = prim('uv_sphere', loc=HC + Vector((0, 0.004, 0.006)), radius=0.132, segments=32, ring_count=18, mat=HAIR)
    deform(hair, head_shape)
    def keep(w):
        d = w - HC
        front = max(0.0, -d.y / 0.13)
        return d.z > 0.045 * front + (-0.03 if d.y > 0 else 0.0) - 0.035 * (1 - front)
    select_only([hair]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for v in hair.data.vertices:
        v.select = not keep(hair.matrix_world @ v.co)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.delete(type='VERT'); bpy.ops.object.mode_set(mode='OBJECT')
    tex = bpy.data.textures.new('curls', 'CLOUDS'); tex.noise_scale = 0.012
    d = hair.modifiers.new('curls', 'DISPLACE'); d.texture = tex; d.strength = 0.007; d.mid_level = 0.3
    hair.modifiers.new('sol', 'SOLIDIFY').thickness = 0.006
    parts.append(smooth(hair))
else:  # two puffs of hair
    for s in (-1, 1):
        pf = prim('uv_sphere', loc=HC + Vector((s * 0.085, 0.03, 0.1)), radius=0.06, segments=24, ring_count=16, mat=HAIR)
        tex = bpy.data.textures.new('curls', 'CLOUDS'); tex.noise_scale = 0.01
        d = pf.modifiers.new('curls', 'DISPLACE'); d.texture = tex; d.strength = 0.012; d.mid_level = 0.3
        parts.append(smooth(pf))
    cap = prim('uv_sphere', loc=HC + Vector((0, 0.004, 0.01)), radius=0.129, segments=32, ring_count=18, mat=HAIR)
    deform(cap, head_shape)
    select_only([cap]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    for v in cap.data.vertices:
        d = cap.matrix_world @ v.co - HC; v.select = d.z < 0.05 * max(0.0, -d.y / 0.13) - 0.02
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.delete(type='VERT'); bpy.ops.object.mode_set(mode='OBJECT')
    cap.modifiers.new('sol', 'SOLIDIFY').thickness = 0.005
    parts.append(smooth(cap))
head = join(parts, 'Head'); set_origin(head, (0, 0, HIP + 0.49))

# ---------- arms ----------
SH_Z = HIP + 0.385
arms = {}
for s, tag in ((1, 'L'), (-1, 'R')):
    x = s * 0.185
    sleeve = capsule(0.058, (x, 0, SH_Z - 0.01), (x, 0, SH_Z - 0.08), SHIRT)
    deform(sleeve, lambda p, x=x: Vector((x + (p.x - x) * 1.0, p.y * 0.95, p.z)))
    upper = capsule(0.041, (x, 0, SH_Z), (x, 0, SH_Z - 0.2), SKIN)
    sh = join([sleeve, upper], 'Shoulder_' + tag); set_origin(sh, (x, 0, SH_Z))
    fore = capsule(0.037, (x, 0, SH_Z - 0.21), (x, -0.005, SH_Z - 0.38), SKIN)
    palm = prim('uv_sphere', loc=(x, -0.008, SH_Z - 0.43), radius=0.045, segments=18, ring_count=12, scale=(0.62, 0.9, 1.15), mat=SKIN); smooth(palm)
    thumb = capsule(0.013, (x - s * 0.018, -0.03, SH_Z - 0.41), (x - s * 0.012, -0.045, SH_Z - 0.45), SKIN)
    el = join([fore, palm, thumb], 'Elbow_' + tag); set_origin(el, (x, 0, SH_Z - 0.205))
    arms[tag] = (sh, el)

# ---------- legs ----------
legs = {}
for s, tag in ((1, 'L'), (-1, 'R')):
    x = s * 0.076
    short_leg = None if V.get('skirt') else tube(0.074, 0.078, HIP + 0.02, HIP - 0.15, x, SHORTS, sy=0.92)
    thigh = capsule(0.054, (x, 0, HIP), (x, 0, HIP - 0.3), SKIN)
    hp = join([short_leg, thigh], 'Hip_' + tag); set_origin(hp, (x, 0, HIP))
    shin = capsule(0.047, (x, 0, HIP - 0.31), (x, 0, 0.1), SKIN)
    sock = tube(0.051, 0.049, 0.16, 0.07, x, SOCK)
    shoe = prim('cube', loc=(x, -0.03, 0.045), scale=(0.05, 0.1, 0.035), mat=SHOE)
    deform(shoe, lambda p, x=x: Vector((p.x, p.y, p.z - (0.012 if p.y < -0.09 else 0))))
    bevel(shoe, 0.02, 3); smooth(shoe)
    sole = prim('cube', loc=(x, -0.03, 0.008), scale=(0.048, 0.098, 0.008), mat=SOLE); bevel(sole, 0.008, 2); smooth(sole)
    lace = prim('cube', loc=(x, -0.065, 0.074), scale=(0.022, 0.03, 0.004), rot=(math.radians(-20), 0, 0), mat=SOLE); smooth(lace)
    kn = join([shin, sock, shoe, sole, lace], 'Knee_' + tag); set_origin(kn, (x, 0, HIP - 0.305))
    legs[tag] = (hp, kn)

# ---------- the hierarchy ----------
root = empty('Child', (0, 0, 0))
bpy.context.view_layer.update()
parent(body, root); parent(torso, body); parent(head, torso)
for tag in 'LR':
    parent(arms[tag][0], torso); parent(arms[tag][1], arms[tag][0])
    parent(legs[tag][0], body); parent(legs[tag][1], legs[tag][0])
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    apply_mods(o)
bpy.context.view_layer.update()
bake_ao(meshes, rays=24, dist=0.12, strength=0.7)
print('TRIANGLES', tri_count(meshes))
export(out, meshes + [root])
if '--preview' in sys.argv or True:
    render_preview(out.replace('.glb', '_preview.png'), target=(0, 0, 0.75), dist=2.6, elev=8, azim=-28)
