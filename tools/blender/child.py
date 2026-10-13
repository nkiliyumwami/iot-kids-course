"""child.glb: an 11-year-old Rwandan primary-school pupil, stylised (big friendly eyes, soft toy-like shapes).
One continuous body mesh (torso, neck, head, ears, nose, arms, hands, legs), fused from soft volumes with a voxel remesh,
smoothed and decimated, then skinned to an armature. Clothes, shoes, hair and the face sit on top as separate layers
that follow the same bones. Usage: python child.py out.glb [variant]   (variant a: the boy, b: the girl)

Bones (glTF nodes; the story turns them): Child (the armature) > Body (hips) > Spine > Chest > Neck > Head,
Chest > Shoulder_L > Elbow_L > Hand_L (and _R), Body > Hip_L > Knee_L > Foot_L (and _R). The child faces -Y in Blender
(+Z in three.js); _L is the child's left (+X). The arms rest a little away from the body (REST_ARM), so they never fuse.
POSE holds the idle and wave numbers; it is exported in the armature's extras (kk_pose) and read by the story
(assets/story/future-world.js, wireSkinned) and by render_child.py, so the model and its motion are tuned in one place."""
import sys, os, math, json, bpy, bmesh
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

out = sys.argv[-2] if len(sys.argv) > 2 else os.path.join(HERE, 'out', 'child.glb')
variant = sys.argv[-1] if len(sys.argv) > 2 else 'a'
V = {
    'a': dict(skin=0x5b3a24, shirt=0x8cc4ee, shorts=0x253556, bag=0xf08a24, hair='short', shoes=0x1d1d1f),
    'b': dict(skin=0x4a2e1c, shirt=0xf4f0e2, skirt=0x2f6b45, bag=0x2b7fd8, hair='puffs', shoes=0x5a2e1a),
}[variant]
SKIRT = 'skirt' in V  # variant b wears a pleated skirt, variant a shorts

# the motion, in radians and seconds (see the module docstring). Angles are about the child's own axes:
# x = side to side (a forward/back swing), z = front to back (raise to the side), y = up (turn).
POSE = dict(
    rest_arm=0.19,        # the modelled arm angle out from the body
    idle_arm=0.08,        # the relaxed arm angle out from the body
    idle_elbow=0.22,      # a soft bend at the elbow when the arm hangs
    idle_sway=0.035,      # the arms swing a little while standing
    breathe=0.02,         # chest rise and fall
    look=0.1,             # the head looks around a little while standing
    weight_shift=0.02,    # the hips shift from foot to foot
    wave_raise=2.3,       # the shoulder lifts the arm up and out (not straight up)
    wave_forward=0.28,    # and a little forward, so the palm faces the viewer
    wave_bend=0.38,       # the elbow stays bent...
    wave_swing=0.3,       # ...and the forearm swings around that bend
    wave_rate=9.0,        # wave speed (radians per second)
    wave_wrist=0.18,      # the hand follows a little behind the forearm
    wave_head_tilt=0.11,  # the head tilts towards the waving hand
    wave_lean=0.045,      # the body leans away from the raised arm
    wave_bob=0.04,        # a small happy nod while waving
)

reset()
SKIN = material('Skin', V['skin'], rough=0.55)
SHIRT = material('Shirt', V['shirt'], rough=0.85)
BOTTOMS = material('Skirt', V['skirt'], rough=0.85) if SKIRT else material('Shorts', V['shorts'], rough=0.85)
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
BODY_MATS = [SKIN, SHIRT, BOTTOMS, SOCK]  # material slots of the body mesh, in this order

def capsule(r, p0, p1, mat=None, seg=16, r1=None):
    """A rounded tube from p0 to p1 (radius r, or tapering to r1)."""
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    o = prim('uv_sphere', loc=(0, 0, 0), radius=r, segments=seg, ring_count=10, mat=mat)
    r1 = r if r1 is None else r1
    for v in o.data.vertices:
        top = v.co.z > 0
        if not top and r1 != r:
            k = r1 / r; v.co.x *= k; v.co.y *= k; v.co.z *= k
        v.co.z += -L / 2 if not top else L / 2
    q = (p0 - p1).normalized().to_track_quat('Z', 'Y')  # +z (the r end) at p0
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = (p0 + p1) / 2
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o

def ellipsoid(c, r, mat=None, seg=24, rings=14):
    return prim('uv_sphere', loc=c, radius=1, segments=seg, ring_count=rings, scale=r, mat=mat)

def tube(r0, r1, p0, p1, mat, seg=20, sy=1.0, thick=0.008):
    """An open cloth tube (a sleeve or a shorts leg) from p0 (radius r0) to p1 (radius r1)."""
    p0, p1 = Vector(p0), Vector(p1)
    o = prim('cone', loc=(0, 0, 0), radius1=r1, radius2=r0, depth=(p1 - p0).length, vertices=seg, end_fill_type='NOTHING', mat=mat)
    o.scale = (1, sy, 1); apply_tf(o)
    q = (p0 - p1).normalized().to_track_quat('Z', 'Y')
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = q; o.location = (p0 + p1) / 2
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    m = o.modifiers.new('sol', 'SOLIDIFY'); m.thickness = thick; m.offset = 0
    return smooth(o)

def ring(c, axis, R, r, mat, seg=22, sy=1.0):
    """A soft rolled edge (a hem, a cuff, a waistband) around axis at c."""
    o = prim('torus', major_segments=seg, minor_segments=6, loc=(0, 0, 0), major_radius=R, minor_radius=r, mat=mat)
    o.scale = (1, sy, 1); apply_tf(o)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector(axis).normalized().to_track_quat('Z', 'Y'); o.location = c
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return smooth(o)

def delete_verts(o, test):
    """Delete the vertices of o (world position) where test(p) is true."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    mw = o.matrix_world
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if test(mw @ v.co)], context='VERTS')
    bm.to_mesh(o.data); bm.free(); o.data.update()
    return o

def plane_cut(o, co, no):
    """Keep the part of o in front of the plane (co, normal no): a smooth cut edge, not the sphere's grid steps."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    co = o.matrix_world.inverted() @ Vector(co)  # the mesh is stored around the object's origin
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_inner=True)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    return o

def curve_strap(pts, r, mat):
    cd = bpy.data.curves.new('strap', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = r; cd.bevel_resolution = 1; cd.resolution_u = 6
    sp = cd.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('strap', cd); bpy.context.scene.collection.objects.link(o)
    select_only([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object; o.data.materials.clear(); o.data.materials.append(mat)
    return smooth(o)

# ---------- the skeleton: one place for every joint ----------
HIP = 0.66
NECK_Z = HIP + 0.49                  # the head's pivot
HEAD_S = 1.22                        # the head is drawn at 1.0 around HC0, then scaled up from the neck pivot
HC0 = Vector((0, -0.005, HIP + 0.62))
HC = Vector((0, 0, NECK_Z)) + (HC0 - Vector((0, 0, NECK_Z))) * HEAD_S
A = POSE['rest_arm']
UPPER, FORE, HAND = 0.205, 0.18, 0.095

def arm(s):
    """Shoulder, elbow, wrist and hand tip of one arm (s = 1 left, -1 right), resting A out from the body."""
    d = Vector((s * math.sin(A), 0, -math.cos(A)))
    sh = Vector((s * 0.172, 0, HIP + 0.382))
    el = sh + d * UPPER
    wr = el + d * FORE + Vector((0, -0.006, 0))
    return sh, el, wr, wr + d * HAND, d

def leg(s):
    x = s * 0.076
    return Vector((x, 0, HIP)), Vector((x, 0, HIP - 0.305)), Vector((x, 0.004, 0.085)), Vector((x, -0.105, 0.03))

BONES = {  # name: (head, tail, parent, radius used for the skin weights)
    'Body': (Vector((0, 0, HIP - 0.03)), Vector((0, 0, HIP + 0.12)), None, 0.15),
    'Spine': (Vector((0, 0, HIP + 0.12)), Vector((0, 0, HIP + 0.27)), 'Body', 0.145),
    'Chest': (Vector((0, 0, HIP + 0.27)), Vector((0, 0, HIP + 0.42)), 'Spine', 0.15),
    'Neck': (Vector((0, 0, HIP + 0.42)), Vector((0, 0, NECK_Z)), 'Chest', 0.05),
    'Head': (Vector((0, 0, NECK_Z)), Vector((0, 0, NECK_Z + 0.32)), 'Neck', 0.16),
}
for s, t in ((1, 'L'), (-1, 'R')):
    sh, el, wr, tip, d = arm(s)
    BONES['Shoulder_' + t] = (sh, el, 'Chest', 0.044)
    BONES['Elbow_' + t] = (el, wr, 'Shoulder_' + t, 0.04)
    BONES['Hand_' + t] = (wr, tip, 'Elbow_' + t, 0.038)
    hp, kn, an, toe = leg(s)
    BONES['Hip_' + t] = (hp, kn, 'Body', 0.06)
    BONES['Knee_' + t] = (kn, an, 'Hip_' + t, 0.052)
    BONES['Foot_' + t] = (an, toe, 'Knee_' + t, 0.045)

# ---------- the body: soft volumes, fused into one surface ----------
vol = []
torso = capsule(0.15, (0, 0, HIP + 0.36), (0, 0, HIP + 0.1), seg=32)
def torso_shape(p):
    z = p.z - (HIP + 0.03)  # 0 at the waist .. 0.42 at the shoulders
    sx = 1.0 + 0.12 * max(0, min(1, (z - 0.24) / 0.12)) - 0.04 * max(0, 1 - z / 0.12)
    sy = 0.7 + 0.04 * math.sin(min(1, max(0, z) / 0.4) * math.pi)
    zz = p.z if z < 0.34 else HIP + 0.37 + (p.z - HIP - 0.37) * 0.45  # flatter shoulders
    return Vector((p.x * sx, p.y * sy, max(zz, HIP + 0.0)))
deform(torso, torso_shape); vol.append(torso)
vol.append(ellipsoid((0, 0, HIP + 0.04), (0.148, 0.112, 0.12)))          # the hips
vol.append(capsule(0.05, (0, 0, HIP + 0.36), (0, 0, NECK_Z + 0.03)))       # the neck
skull = prim('uv_sphere', loc=HC0, radius=0.125, segments=40, ring_count=24)
def head_shape(p):
    d = p - HC0
    k = max(0.0, -d.z / 0.125)  # the jaw: narrower towards the chin
    return HC0 + Vector((d.x * (1 - 0.16 * k * k), d.y * 0.94 * (1 - 0.08 * k), d.z * 1.07))
deform(skull, head_shape)
head_vol = [skull]
for s in (-1, 1):
    head_vol.append(ellipsoid(HC0 + Vector((s * 0.121, 0.005, -0.01)), (0.0135, 0.024, 0.033), seg=16, rings=10))  # ears
head_vol.append(ellipsoid((0, HC0.y - 0.112, HC0.z - 0.025), (0.024, 0.015, 0.016), seg=16, rings=10))             # nose
for s in (1, -1):
    sh, el, wr, tip, d = arm(s)
    side = Vector((s * math.cos(A), 0, math.sin(A)))  # across the hand, in the arm's plane
    vol.append(ellipsoid(sh + Vector((s * -0.01, 0, -0.005)), (0.056, 0.052, 0.05)))  # the shoulder ball
    vol.append(capsule(0.044, sh, el, r1=0.04))
    vol.append(capsule(0.04, el, wr, r1=0.033))
    # a soft mitten hand, palm facing forward: the palm, three fingers and a thumb
    pc = wr + d * 0.04
    palm = ellipsoid((0, 0, 0), (0.036, 0.021, 0.042), seg=20, rings=12)
    palm.rotation_euler = (0, -s * A, 0); palm.location = pc
    select_only([palm]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vol.append(palm)
    for k in (-1, 0, 1):
        f0 = pc + side * (0.021 * k) + d * 0.03
        vol.append(capsule(0.0125, f0, f0 + d * (0.034 - 0.006 * abs(k)) + side * 0.004 * k, seg=10))
    t0 = wr + d * 0.022 + side * 0.03 + Vector((0, -0.008, 0))
    vol.append(capsule(0.013, t0, t0 + d * 0.022 + side * 0.022 + Vector((0, -0.01, 0)), seg=10))
    hp, kn, an, toe = leg(s)
    vol.append(capsule(0.06, hp + Vector((0, 0, 0.02)), kn, r1=0.052))
    vol.append(capsule(0.052, kn, an, r1=0.043))
    vol.append(ellipsoid(kn + Vector((0, 0.008, -0.11)), (0.05, 0.05, 0.085)))  # the calf
    vol.append(ellipsoid(Vector((hp.x, -0.035, 0.045)), (0.042, 0.075, 0.032)))  # the foot (inside the shoe)
# the head volumes are drawn at 1.0 and scaled up from the neck pivot, like every head part
piv = Vector((0, 0, NECK_Z))
for o in head_vol:
    deform(o, lambda p: piv + (p - piv) * HEAD_S)
body = join(vol + head_vol, 'Body_mesh')
rm = body.modifiers.new('fuse', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.0055
sm = body.modifiers.new('soft', 'LAPLACIANSMOOTH'); sm.iterations = 8; sm.lambda_factor = 0.6; sm.use_volume_preserve = True
apply_mods(body)

# ---------- face, hair, clothes and kit: layers on top of the body ----------
acc = {}  # object -> how it follows the bones: a bone name (rigid) or 'skin' (copy the body's weights)
def add(o, how):
    acc[o] = how
    return o
head_parts = []
for s in (-1, 1):
    ex, ez = s * 0.043, HC0.z + 0.012
    head_parts.append(smooth(prim('uv_sphere', loc=(ex, HC0.y - 0.1, ez), radius=0.026, segments=20, ring_count=14, scale=(0.95, 0.55, 1.15), mat=WHITE)))
    head_parts.append(smooth(prim('uv_sphere', loc=(ex, HC0.y - 0.111, ez - 0.002), radius=0.017, segments=18, ring_count=12, scale=(1, 0.5, 1.1), mat=IRIS)))
    head_parts.append(smooth(prim('uv_sphere', loc=(ex, HC0.y - 0.117, ez - 0.002), radius=0.009, segments=14, ring_count=10, scale=(1, 0.5, 1.1), mat=PUPIL)))
    head_parts.append(smooth(prim('uv_sphere', loc=(ex + 0.006, HC0.y - 0.121, ez + 0.007), radius=0.0045, segments=10, ring_count=6, mat=SHINE)))
    brow = prim('torus', major_segments=20, minor_segments=6, loc=(ex, HC0.y - 0.108, ez + 0.045), major_radius=0.026, minor_radius=0.0045, rot=(math.radians(90), 0, 0), mat=BROW)
    deform(brow, lambda p, ez=ez: p if p.z > ez + 0.05 else Vector((p.x, p.y, ez + 0.05)))
    head_parts.append(smooth(brow))
smile = prim('torus', major_segments=28, minor_segments=8, loc=(0, HC0.y - 0.108, HC0.z - 0.052), major_radius=0.032, minor_radius=0.0065, rot=(math.radians(90), 0, 0), mat=LIP)
delete_verts(smile, lambda p: p.z > HC0.z - 0.052 - 0.004)
deform(smile, lambda p: Vector((p.x, p.y + 0.0185 - 0.41 * (p.z - HC0.z + 0.084), p.z)))  # sits on the receding chin
head_parts.append(smooth(smile))
if V['hair'] == 'short':
    hair = prim('uv_sphere', loc=HC0 + Vector((0, 0.004, 0.006)), radius=0.132, segments=32, ring_count=18, mat=HAIR)
    deform(hair, head_shape)
    plane_cut(hair, HC0 + Vector((0, 0, 0.002)), (0, 0.568, 0.823))  # a clean hairline: above the brows at the front, down to the nape
    tex = bpy.data.textures.new('curls', 'CLOUDS'); tex.noise_scale = 0.012
    dm = hair.modifiers.new('curls', 'DISPLACE'); dm.texture = tex; dm.strength = 0.007; dm.mid_level = 0.3
    hair.modifiers.new('sol', 'SOLIDIFY').thickness = 0.006
    hair['lift'] = 1
    head_parts.append(smooth(hair))
else:  # two puffs of hair
    for s in (-1, 1):
        pf = prim('uv_sphere', loc=HC0 + Vector((s * 0.085, 0.03, 0.1)), radius=0.06, segments=24, ring_count=16, mat=HAIR)
        tex = bpy.data.textures.new('curls', 'CLOUDS'); tex.noise_scale = 0.01
        dm = pf.modifiers.new('curls', 'DISPLACE'); dm.texture = tex; dm.strength = 0.012; dm.mid_level = 0.3
        head_parts.append(smooth(pf))
    cap = prim('uv_sphere', loc=HC0 + Vector((0, 0.004, 0.01)), radius=0.129, segments=32, ring_count=18, mat=HAIR)
    deform(cap, head_shape)
    plane_cut(cap, HC0 + Vector((0, 0, 0.018)), (0, 0.5, 0.866))
    cap.modifiers.new('sol', 'SOLIDIFY').thickness = 0.005
    cap['lift'] = 1
    head_parts.append(smooth(cap))
for o in head_parts:
    apply_mods(o); deform(o, lambda p: piv + (p - piv) * HEAD_S); add(o, 'Head')
    if o.get('lift'):  # the smoothed skull is a touch fuller than the sphere the hair was cut from: lift the hair clear of it
        deform(o, lambda p: HC + (p - HC) * 1.03)

# the shirt: collar, buttons, pocket and short sleeves
add(ring((0, -0.004, HIP + 0.44), (0, -0.25, 1), 0.058, 0.013, SHIRT, sy=0.9), 'skin')
for s in (-1, 1):
    f = prim('cube', loc=(s * 0.033, -0.088, HIP + 0.418), scale=(0.034, 0.008, 0.026), rot=(math.radians(-25), 0, s * math.radians(30)), mat=SHIRT)
    bevel(f, 0.006, 2); add(smooth(f), 'Chest')
for i in range(4):
    add(smooth(prim('uv_sphere', loc=(0, -0.107, HIP + 0.38 - i * 0.075), radius=0.008, segments=10, ring_count=6, scale=(1, 0.5, 1), mat=BUTTON)), 'skin')
if not SKIRT:
    pocket = prim('cube', loc=(0.07, -0.106, HIP + 0.34), scale=(0.035, 0.004, 0.035), mat=SHIRT); bevel(pocket, 0.004, 2); add(smooth(pocket), 'Chest')
SLEEVE = 0.085  # how far the sleeve reaches down the upper arm
for s in (-1, 1):
    sh, el, wr, tip, d = arm(s)
    add(tube(0.062, 0.057, sh - d * 0.02, sh + d * SLEEVE, SHIRT, sy=0.95), 'sleeve')
    add(ring(sh + d * SLEEVE, d, 0.055, 0.006, SHIRT, sy=0.95), 'sleeve')

# shorts or a skirt, with a waistband
add(ring((0, 0, HIP + 0.125), (0, 0, 1), 0.149, 0.012, BOTTOMS, sy=0.78), 'skin')
HEM = HIP - 0.14
if SKIRT:  # a pleated school skirt
    sk = prim('cone', loc=(0, 0, HIP - 0.04), radius1=0.215, radius2=0.15, depth=0.3, vertices=48, end_fill_type='NOTHING', mat=BOTTOMS)
    deform(sk, lambda p: Vector((p.x * (1 + 0.035 * math.sin(math.atan2(p.y, p.x) * 16)), p.y * 0.85 * (1 + 0.035 * math.sin(math.atan2(p.y, p.x) * 16)), p.z)))
    sk.modifiers.new('sol', 'SOLIDIFY').thickness = 0.01; add(smooth(sk), 'skirt')
else:
    for s in (-1, 1):
        hp, kn, an, toe = leg(s)
        add(tube(0.076, 0.079, hp + Vector((0, 0, 0.03)), Vector((hp.x, 0, HEM)), BOTTOMS, sy=0.92), 'skin')

# socks (a rolled top) and shoes
SOCK_TOP = 0.17
for s in (-1, 1):
    hp, kn, an, toe = leg(s)
    x = hp.x
    add(ring((x, 0.003, SOCK_TOP), (0, 0, 1), 0.047, 0.008, SOCK), 'skin')
    shoe = prim('cube', loc=(x, -0.03, 0.045), scale=(0.058, 0.1, 0.035), mat=SHOE)
    deform(shoe, lambda p: Vector((p.x, p.y, p.z - (0.012 if p.y < -0.09 else 0))))
    bevel(shoe, 0.02, 3); add(smooth(shoe), 'Foot_' + ('L' if s > 0 else 'R'))
    sole = prim('cube', loc=(x, -0.03, 0.008), scale=(0.056, 0.098, 0.008), mat=SOLE); bevel(sole, 0.008, 2); add(smooth(sole), 'Foot_' + ('L' if s > 0 else 'R'))
    lace = prim('cube', loc=(x, -0.065, 0.074), scale=(0.022, 0.03, 0.004), rot=(math.radians(-20), 0, 0), mat=SOLE); add(smooth(lace), 'Foot_' + ('L' if s > 0 else 'R'))

# the school bag on its straps
bag = prim('cube', loc=(0, 0.16, HIP + 0.27), scale=(0.13, 0.065, 0.16), mat=BAG); bevel(bag, 0.04, 4); add(smooth(bag), 'Chest')
pk = prim('cube', loc=(0, 0.228, HIP + 0.21), scale=(0.095, 0.022, 0.07), mat=BAG); bevel(pk, 0.02, 3); add(smooth(pk), 'Chest')
zp = prim('cube', loc=(0, 0.235, HIP + 0.275), scale=(0.08, 0.008, 0.004), mat=BAGD); add(smooth(zp), 'Chest')
for s in (-1, 1):
    add(curve_strap([(s * 0.09, 0.112, HIP + 0.3), (s * 0.095, 0.075, HIP + 0.378), (s * 0.1, -0.03, HIP + 0.388), (s * 0.105, -0.104, HIP + 0.32), (s * 0.1, -0.11, HIP + 0.2)], 0.011, BAGD), 'Chest')
for o in acc:
    apply_mods(o)

# ---------- the body's clothes colours: clean cuts, then a material per face ----------
def nearest_bone(p):
    """The bone whose capsule surface p is closest to (distance over radius), and that number."""
    best, bn = 1e9, None
    for n, (h, t, par, r) in BONES.items():
        ab = t - h
        u = max(0.0, min(1.0, (p - h).dot(ab) / ab.length_squared))
        dn = (p - (h + ab * u)).length / r
        if dn < best:
            best, bn = dn, n
    return bn, best

def arm_u(p, s):
    sh, el, wr, tip, d = arm(s)
    return (p - sh).dot(d)

cur = sum(len(p.vertices) - 2 for p in body.data.polygons)
others = tri_count(list(acc))
BUDGET = 21600
target = max(7000, BUDGET - others - 2200)  # the clean colour cuts below add about 2,100 triangles
print('BODY TRIANGLES', cur, '-> about', target, '| layers', others)
if cur > target:
    dc = body.modifiers.new('budget', 'DECIMATE'); dc.ratio = target / cur
    apply_mods(body)
bm = bmesh.new(); bm.from_mesh(body.data)
cuts = [((0, 0, HIP + 0.122), (0, 0, 1)), ((0, 0, HIP + 0.432), (0, 0, 1)), ((0, 0, HEM), (0, 0, 1)), ((0, 0, SOCK_TOP), (0, 0, 1))]
for s in (-1, 1):
    sh, el, wr, tip, d = arm(s)
    cuts.append((sh + d * SLEEVE, d))
for co, no in cuts:
    g = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=co, plane_no=no)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
bm.to_mesh(body.data); bm.free()
body.data.materials.clear()
for m in BODY_MATS:
    body.data.materials.append(m)
for f in body.data.polygons:
    p = Vector(f.center)
    bn, _ = nearest_bone(p)
    mi = 0
    if bn.startswith(('Shoulder', 'Elbow', 'Hand')):
        s = 1 if bn.endswith('L') else -1
        mi = 1 if arm_u(p, s) < SLEEVE else 0
    elif bn in ('Spine', 'Chest') or (bn == 'Body' and p.z >= HIP + 0.122):
        mi = 1 if p.z < HIP + 0.432 else 0
    elif bn == 'Body' or (bn.startswith('Hip') and p.z > HEM):
        mi = 2
    elif p.z < SOCK_TOP and bn.startswith(('Knee', 'Foot')):
        mi = 3
    f.material_index = mi
smooth(body)

# ---------- the armature and the skin weights ----------
rig_data = bpy.data.armatures.new('Rig')
rig = bpy.data.objects.new('Child', rig_data); bpy.context.scene.collection.objects.link(rig)
select_only([rig]); bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t, par, r) in BONES.items():
    eb = rig_data.edit_bones.new(n); eb.head = h; eb.tail = t; eb.roll = 0
for n, (h, t, par, r) in BONES.items():
    if par:
        rig_data.edit_bones[n].parent = rig_data.edit_bones[par]
bpy.ops.object.mode_set(mode='OBJECT')
rig['kk_pose'] = json.dumps(POSE)

CHAIN = {n: {n} | ({BONES[n][2]} if BONES[n][2] else set()) | {c for c, b in BONES.items() if b[2] == n} for n in BONES}
def body_weights(p):
    """Smooth weights from the bones near p: the nearest bone, its parent and its children only, so a hand
    hanging by the hip never follows the leg."""
    bn, _ = nearest_bone(p)
    ws = {}
    for n in CHAIN[bn]:
        h, t, par, r = BONES[n]
        ab = t - h
        u = max(0.0, min(1.0, (p - h).dot(ab) / ab.length_squared))
        dn = max((p - (h + ab * u)).length / r, 0.25)
        ws[n] = dn ** -6
    top = sorted(ws.items(), key=lambda kv: -kv[1])[:3]
    tot = sum(w for _, w in top)
    return {n: w / tot for n, w in top}

me = body.data
W = [body_weights(body.matrix_world @ v.co) for v in me.vertices]
# relax the weights over the surface so joints bend in a soft curve, not a crease
nbr = [[] for _ in me.vertices]
for e in me.edges:
    a, b = e.vertices; nbr[a].append(b); nbr[b].append(a)
for _ in range(4):
    NW = []
    for i, w in enumerate(W):
        acc_w = dict(w)
        for j in nbr[i]:
            for n, x in W[j].items():
                acc_w[n] = acc_w.get(n, 0) + x
        top = sorted(acc_w.items(), key=lambda kv: -kv[1])[:3]
        tot = sum(x for _, x in top)
        NW.append({n: x / tot for n, x in top})
    W = NW

def skin_to_rig(o, weights):
    o.vertex_groups.clear()
    for n in BONES:
        o.vertex_groups.new(name=n)
    for i, w in enumerate(weights):
        for n, x in w.items():
            if x > 0.002:
                o.vertex_groups[n].add([i], x, 'REPLACE')
    o.parent = rig
    m = o.modifiers.new('rig', 'ARMATURE'); m.object = rig

kd = KDTree(len(me.vertices))
for i, v in enumerate(me.vertices):
    kd.insert(body.matrix_world @ v.co, i)
kd.balance()
meshes = [body] + list(acc)
bpy.context.view_layer.update()
bake_ao(meshes, rays=24, dist=0.12, strength=0.7)
skin_to_rig(body, W)
for o, how in acc.items():
    ws = []
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        if how == 'skin':
            ws.append(W[kd.find(p)[1]])
        elif how == 'sleeve':  # follows the upper arm as one piece (the chest only at its very top), so it never tears
            s = 1 if p.x > 0 else -1
            k = max(0.0, min(0.35, 0.35 - arm_u(p, s) / 0.05 * 0.35))
            sb = 'Shoulder_' + ('L' if s > 0 else 'R')
            ws.append({sb: 1 - k, 'Chest': k} if k > 0 else {sb: 1.0})
        elif how == 'skirt':  # mostly the hips; the hem follows the legs a little
            k = max(0.0, min(1.0, (HIP + 0.1 - p.z) / 0.29)) * 0.3
            leg_b = 'Hip_L' if p.x > 0 else 'Hip_R'
            ws.append({'Body': 1 - k, leg_b: k} if k > 0 else {'Body': 1.0})
        else:
            ws.append({how: 1.0})
    skin_to_rig(o, ws)

print('TRIANGLES', tri_count(meshes))
select_only(meshes + [rig])
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_vertex_color='ACTIVE', export_materials='EXPORT', export_animations=False,
                          export_skins=True, export_extras=True)
if '--preview' in sys.argv or True:
    render_preview(out.replace('.glb', '_preview.png'), target=(0, 0, 0.72), dist=3.2, elev=10, azim=-30)
