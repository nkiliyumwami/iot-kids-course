"""banana.glb: two banana plants (Banana_A with a bunch and a purple flower bud, Banana_B young), origin at the ground."""
import sys, math, random, bpy
import os; HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from mathutils import Vector, Matrix

T = os.path.join(HERE, 'tex') + '/'
out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else os.path.join(HERE, 'out', 'banana.glb')
reset()
LEAF = material('Leaf', 0xffffff, rough=0.55, image=T + 'leaf.png', alpha_clip=True)
DRY = material('DryLeaf', 0xffffff, rough=0.8, image=T + 'leaf_dry.png', alpha_clip=True)
STEM = material('Stem', 0x7f8c4e, rough=0.8)
STEM_D = material('StemDark', 0x5d6a35, rough=0.85)
FRUIT = material('Bananas', 0x6f9a2e, rough=0.5)
BUD = material('Bud', 0x6b2340, rough=0.45)
for m in (LEAF, DRY):
    m.use_backface_culling = False

def leaf(L, Wd, droop, fold, rot_z, tilt, h, mat, twist=0.0, rnd=random):
    o = prim('plane', loc=(0, 0, 0), size=1, mat=mat)
    select_only([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=14); bpy.ops.object.mode_set(mode='OBJECT')
    def shape(p):
        f = p.x + 0.5; y = p.y * Wd  # 0 at the stem .. 1 at the tip
        x = f * L
        z = -droop * f * f * L + abs(y) * fold + math.sin(f * 7 + rnd.random()) * 0.015 * f
        q = Vector((x, y, z))
        a = twist * f
        return Vector((q.x, q.y * math.cos(a) - q.z * math.sin(a), q.y * math.sin(a) + q.z * math.cos(a)))
    deform(o, shape)
    o.rotation_euler = (0, tilt, rot_z); o.location = (0, 0, h)  # tilt < 0 points the leaf up
    select_only([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return smooth(o)

def plant(name, x, h, n, seed, fruit=False):
    rnd = random.Random(seed)
    parts = []
    stem = prim('cone', loc=(x, 0, h / 2), radius1=0.17, radius2=0.1, depth=h, vertices=18, mat=STEM)
    deform(stem, lambda p: Vector((p.x + 0.012 * math.sin(p.z * 3), p.y, p.z)))
    smooth(stem); parts.append(stem)
    for k in range(2):  # old leaf sheaths wrapped around the foot of the stem
        sh = prim('cone', loc=(x, 0, 0.35 + k * 0.5), radius1=0.19 - k * 0.02, radius2=0.165 - k * 0.02, depth=0.7, vertices=18, end_fill_type='NOTHING', mat=STEM_D)
        sh.rotation_euler = (rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), 0); apply_tf(sh); smooth(sh); parts.append(sh)
    for i in range(n):
        a = i / n * math.pi * 2 + rnd.uniform(-0.25, 0.25)
        lf = leaf(1.6 + rnd.uniform(0, 0.6), 0.6, 0.6 + rnd.uniform(0, 0.35), 0.35, a, rnd.uniform(-1.0, -0.55), h - 0.05 + rnd.uniform(-0.05, 0.1), LEAF, twist=rnd.uniform(-0.3, 0.3), rnd=rnd)
        lf.location.x += x; apply_tf(lf); select_only([lf]); bpy.ops.object.transform_apply(location=True); parts.append(lf)
    for i in range(2):  # dry leaves hanging down along the stem
        lf = leaf(1.1, 0.4, 0.2, 0.15, rnd.uniform(0, 6.28), 1.1, h - 0.35, DRY, twist=0.6, rnd=rnd)
        lf.location.x += x; select_only([lf]); bpy.ops.object.transform_apply(location=True); parts.append(lf)
    if fruit:
        stalk_top = Vector((x + 0.12, -0.05, h - 0.1))
        cd = bpy.data.curves.new('stalk', 'CURVE'); cd.dimensions = '3D'; cd.bevel_depth = 0.025
        sp = cd.splines.new('BEZIER'); sp.bezier_points.add(2)
        for bp, p in zip(sp.bezier_points, [stalk_top, stalk_top + Vector((0.35, -0.15, 0.05)), stalk_top + Vector((0.42, -0.2, -0.9))]):
            bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        so = bpy.data.objects.new('stalk', cd); bpy.context.scene.collection.objects.link(so)
        select_only([so]); bpy.ops.object.convert(target='MESH'); so = bpy.context.active_object; so.data.materials.append(STEM); parts.append(smooth(so))
        c = stalk_top + Vector((0.38, -0.17, -0.35))
        for r in range(5):  # hands of green bananas, pointing up
            for j in range(9):
                a = j / 9 * math.pi * 2
                p = c + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, -r * 0.09))
                b = prim('uv_sphere', loc=p, radius=0.03, segments=8, ring_count=6, scale=(1, 1, 3.2), mat=FRUIT)
                b.rotation_euler = (math.sin(a) * -0.5, math.cos(a) * 0.5, 0); apply_tf(b); select_only([b]); bpy.ops.object.transform_apply(location=True)
                parts.append(smooth(b))
        bud = prim('uv_sphere', loc=stalk_top + Vector((0.42, -0.2, -0.98)), radius=0.07, segments=12, ring_count=8, scale=(1, 1, 1.8), mat=BUD)
        parts.append(smooth(bud))
    o = join(parts, name)
    set_origin(o, (x, 0, 0)); o.location = (0, 0, 0)
    return o

a = plant('Banana_A', 0, 2.6, 9, 11, fruit=True)
b = plant('Banana_B', 4, 2.0, 7, 23)
bpy.context.view_layer.update()
bake_ao([a], rays=14, dist=0.8, strength=0.55); bake_ao([b], rays=14, dist=0.8, strength=0.55)
print('TRIANGLES', tri_count([a]), tri_count([b]))
export(out, [a, b])
b.location = (2.2, 0, 0)
render_preview(out.replace('.glb', '_preview.png'), target=(1.1, 0, 1.6), dist=7, elev=10, azim=-20, lens=45, res=(1000, 700))
