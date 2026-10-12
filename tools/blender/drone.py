"""drone.glb: a delivery quadcopter, about 1.5 m across, nose facing -Y (+Z in three.js), origin at the body centre.
Nodes the code uses: Prop_FL, Prop_FR, Prop_RL, Prop_RR (pivot on the motor axis, blades along their local X),
Hang (the winch line and parcel, pivot at the belly), Nav_FL, Nav_FR, Nav_RL, Nav_RR (small light lenses)."""
import sys, math, bpy, bmesh
import os; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector

T = os.path.join(HERE, 'tex') + '/'
out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else os.path.join(HERE, 'out', 'drone.glb')
reset()
SHELL = material('Shell', 0xf4f6f8, rough=0.22, coat=1.0)
GLASS = material('Canopy', 0x10151b, rough=0.06, metal=0.3, coat=1.0)
ORANGE = material('Accent', 0xf08a24, rough=0.3, coat=1.0)
CARBON = material('Carbon', 0x24272b, rough=0.35, metal=0.3)
DARK = material('DarkMetal', 0x2a2e33, rough=0.3, metal=0.8)
SILVER = material('Silver', 0xbfc6cd, rough=0.2, metal=1.0)
BLADE = material('Blade', 0x1d2024, rough=0.4)
KRAFT = material('Parcel', 0xffffff, rough=0.85, image=T + 'kraft.jpg')
TAPE = material('Tape', 0xd6c6a0, rough=0.5)
LED = {k: material('Nav' + k, c, rough=0.2, emit=c, emit_s=3.0) for k, c in (('Red', 0xff2a2a), ('Green', 0x2aff6a), ('White', 0xffffff))}

def rod(p0, p1, r0, r1, mat, seg=14):
    p0, p1 = Vector(p0), Vector(p1)
    o = prim('cone', loc=(0, 0, 0), radius1=r0, radius2=r1, depth=(p1 - p0).length, vertices=seg, mat=mat)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (p1 - p0).normalized().to_track_quat('Z', 'Y'); o.location = (p0 + p1) / 2
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return smooth(o)

body = []
# the fuselage: a rounded teardrop (blunt nose), flattened, with an orange band and a dark top cover
sh = prim('uv_sphere', loc=(0, 0, 0), radius=1, segments=40, ring_count=24, mat=SHELL)
def fus(p):
    t = (-p.y + 1) / 2  # 0 tail .. 1 nose
    r = 0.175 * math.sin(math.pi * min(1.0, max(0.0, t)) ** 1.1) ** 0.55 + 0.002
    k = math.hypot(p.x, p.z) or 1e-6
    return Vector((p.x / k * r if k > 1e-5 else 0, -(t * 0.82 - 0.4), p.z / k * r * 0.62 if k > 1e-5 else 0))
deform(sh, lambda p: fus(p)); smooth(sh); body.append(sh)
band = prim('torus', major_segments=40, minor_segments=8, loc=(0, -0.06, 0), major_radius=0.172, minor_radius=0.012, rot=(math.radians(90), 0, 0), scale=(1, 0.62, 1), mat=ORANGE); smooth(band); body.append(band)
can = prim('uv_sphere', loc=(0, -0.1, 0.06), radius=0.12, segments=32, ring_count=16, scale=(0.85, 1.5, 0.45), mat=GLASS); smooth(can); body.append(can)
for s in (-1, 1):  # obstacle sensors in the nose
    e = prim('cube', loc=(s * 0.05, -0.405, 0.0), scale=(0.018, 0.008, 0.012), mat=GLASS); bevel(e, 0.005, 2); body.append(smooth(e))
# GPS mast and two antennas at the back
body.append(rod((0, 0.2, 0.08), (0, 0.2, 0.15), 0.008, 0.008, DARK))
gps = prim('cylinder', loc=(0, 0.2, 0.16), radius=0.035, depth=0.02, vertices=24, mat=SHELL); bevel(gps, 0.008, 2); body.append(smooth(gps, 40))
for s in (-1, 1):
    body.append(rod((s * 0.05, 0.3, 0.05), (s * 0.06, 0.38, 0.14), 0.004, 0.003, DARK))
# the gimbal camera under the nose
body.append(rod((0, -0.28, -0.06), (0, -0.28, -0.1), 0.015, 0.015, DARK))
gb = prim('uv_sphere', loc=(0, -0.29, -0.13), radius=0.045, segments=24, ring_count=14, mat=CARBON); body.append(smooth(gb))
body.append(rod((0, -0.33, -0.13), (0, -0.345, -0.13), 0.02, 0.022, GLASS))
# the winch housing under the belly
wh = prim('cylinder', loc=(0, 0.02, -0.1), radius=0.05, depth=0.05, vertices=24, mat=DARK); bevel(wh, 0.01, 2); body.append(smooth(wh, 40))
# landing skids: bent legs and a bar each side
for s in (-1, 1):
    for yy in (-0.13, 0.13):
        cd = bpy.data.curves.new('leg', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = 0.009; cd.bevel_resolution = 2
        sp = cd.splines.new('BEZIER'); sp.bezier_points.add(2)
        for bp, p in zip(sp.bezier_points, [(s * 0.08, yy, -0.05), (s * 0.15, yy * 1.05, -0.17), (s * 0.19, yy * 1.15, -0.29)]):
            bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        lo = bpy.data.objects.new('leg', cd); bpy.context.scene.collection.objects.link(lo)
        select_only([lo]); bpy.ops.object.convert(target='MESH'); lo = bpy.context.active_object; lo.data.materials.append(CARBON); body.append(smooth(lo))
    body.append(rod((s * 0.19, -0.26, -0.29), (s * 0.19, 0.26, -0.29), 0.011, 0.011, CARBON))
    for yy in (-0.26, 0.26):
        cap = prim('uv_sphere', loc=(s * 0.19, yy, -0.29), radius=0.013, segments=12, ring_count=8, mat=DARK); body.append(smooth(cap))
# four arms with a hinge, a motor with cooling fins, a light under each motor
R = 0.53
props, navs = {}, {}
for tag, sx, sy in (('FL', 1, -1), ('FR', -1, -1), ('RL', 1, 1), ('RR', -1, 1)):
    d = Vector((sx, sy, 0)).normalized()
    m = d * R
    body.append(rod(d * 0.12 + Vector((0, 0, 0.01)), m + Vector((0, 0, 0.0)), 0.03, 0.019, CARBON))
    hinge = prim('cylinder', loc=d * 0.17 + Vector((0, 0, 0.012)), radius=0.034, depth=0.05, vertices=20, mat=SHELL); bevel(hinge, 0.01, 2); body.append(smooth(hinge, 40))
    mot = prim('cylinder', loc=m + Vector((0, 0, 0.025)), radius=0.052, depth=0.07, vertices=28, mat=DARK); bevel(mot, 0.012, 3); body.append(smooth(mot, 40))
    for k in range(12):  # cooling fins
        a = k / 12 * math.pi * 2
        fn = prim('cube', loc=m + Vector((math.cos(a) * 0.054, math.sin(a) * 0.054, 0.03)), scale=(0.006, 0.002, 0.022), rot=(0, 0, a), mat=DARK); body.append(fn)
    bell = prim('cylinder', loc=m + Vector((0, 0, 0.068)), radius=0.048, depth=0.016, vertices=28, mat=SILVER); bevel(bell, 0.005, 2); body.append(smooth(bell, 40))
    lens = prim('uv_sphere', loc=m + Vector((0, 0, -0.018)), radius=0.016, segments=14, ring_count=8, scale=(1, 1, 0.6), mat=LED['White' if sy > 0 else ('Red' if sx > 0 else 'Green')], name='Nav_' + tag)
    navs[tag] = smooth(lens)
    # the propeller: hub and two twisted, tapered blades along local X
    parts = []
    hub = prim('cone', loc=m + Vector((0, 0, 0.088)), radius1=0.022, radius2=0.006, depth=0.03, vertices=16, mat=SILVER); parts.append(smooth(hub))
    shp = bpy.data.curves.new('blade', 'CURVE'); shp.dimensions = '2D'; shp.fill_mode = 'BOTH'; shp.extrude = 0.002
    sp = shp.splines.new('POLY')
    pts = [(0.0, -0.016), (0.08, -0.024), (0.19, -0.019), (0.245, -0.007), (0.25, 0.0), (0.245, 0.008), (0.19, 0.013), (0.08, 0.017), (0.0, 0.016)]
    sp.points.add(len(pts) - 1)
    for p_, (x, y) in zip(sp.points, pts):
        p_.co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    bo = bpy.data.objects.new('blade', shp); bpy.context.scene.collection.objects.link(bo)
    select_only([bo]); bpy.ops.object.convert(target='MESH'); bo = bpy.context.active_object; bo.data.materials.append(BLADE)
    select_only([bo]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=3); bpy.ops.object.mode_set(mode='OBJECT')
    def twist(p):
        a = 0.42 - 0.3 * min(1, p.x / 0.25)
        return Vector((p.x, p.y * math.cos(a) - p.z * math.sin(a), p.y * math.sin(a) + p.z * math.cos(a)))
    deform(bo, twist)
    b2 = bo.copy(); b2.data = bo.data.copy(); bpy.context.scene.collection.objects.link(b2); b2.rotation_euler = (0, 0, math.pi); apply_tf(b2)
    for b in (bo, b2):
        b.location = m + Vector((0, 0, 0.084)); select_only([b]); bpy.ops.object.transform_apply(location=True)
        parts.append(smooth(b))
    pr = join(parts, 'Prop_' + tag); set_origin(pr, m + Vector((0, 0, 0.084)))
    props[tag] = pr
fuse = join(body, 'Body')
set_origin(fuse, (0, 0, 0))
# the winch line, a hook and the parcel (pivot at the winch, so it can swing)
hang = []
hang.append(rod((0, 0.02, -0.125), (0, 0.02, -0.36), 0.003, 0.003, CARBON, seg=6))
hk = prim('torus', major_segments=16, minor_segments=6, loc=(0, 0.02, -0.375), major_radius=0.016, minor_radius=0.004, rot=(math.radians(90), 0, 0), mat=SILVER); hang.append(smooth(hk))
pc = prim('cube', loc=(0, 0.02, -0.5), scale=(0.15, 0.15, 0.11), mat=KRAFT); bevel(pc, 0.008, 2); hang.append(smooth(pc, 30))
hang.append(prim('cube', loc=(0, 0.02, -0.389), scale=(0.152, 0.03, 0.004), mat=TAPE))
hng = join(hang, 'Hang'); set_origin(hng, (0, 0.02, -0.125))
root = empty('Drone', (0, 0, 0))
bpy.context.view_layer.update()
parent(fuse, root); parent(hng, fuse)
for tag in props:
    parent(props[tag], fuse); parent(navs[tag], fuse)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    apply_mods(o)
bpy.context.view_layer.update()
bake_ao([fuse, hng], rays=18, dist=0.12, strength=0.6, ground=False)
print('TRIANGLES', tri_count(meshes))
export(out, meshes + [root])
render_preview(out.replace('.glb', '_preview.png'), target=(0, 0, -0.12), dist=2.2, elev=22, azim=-35, lens=50, res=(1000, 750))
