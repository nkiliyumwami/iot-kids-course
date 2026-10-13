"""Render one pupil model (child_a.glb / child_b.glb) for review: front (idle), 3/4 waving, side and a face close-up, 1024 px.
The model is imported from the exported .glb, so the renders show exactly what the story loads, posed with the same
formula as the story (kid_pose.py, wireSkinned in assets/story/future-world.js) and the POSE numbers in the model.
Usage: python render_child.py <child.glb> <out_dir> <prefix> [--strip]   (--strip: 6 frames of the wave, <prefix>_wave0..5)"""
import sys, os, math, bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kid_pose import apply_pose, params

STRIP = '--strip' in sys.argv
argv = [a for a in sys.argv if a != '--strip']
glb, out_dir, prefix = argv[-3], argv[-2], argv[-1]
os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.78, 0.84, 0.9, 1)
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
for nm, en, rot in [('key', 4.0, (50, 0, -40)), ('fill', 1.2, (60, 0, 60)), ('rim', 2.5, (120, 0, 170))]:
    ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en
    lo = bpy.data.objects.new(nm, ld); lo.rotation_euler = tuple(math.radians(a) for a in rot); sc.collection.objects.link(lo)
# a soft floor so the feet have a contact shadow
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
floor = bpy.context.active_object
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.66, 0.7, 1)
floor.data.materials.append(fm)
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.update()
HEAD_Z = (rig.matrix_world @ rig.data.bones['Head'].head_local).z
WAVE_T = (math.asin(0.5) + 2 * math.pi) / params(rig)['wave_rate']  # mid-swing

def pose(wave, t=None):
    apply_pose(rig, t=(WAVE_T if t is None else t) if wave else 0.0, wave=1.0 if wave else 0.0)
    bpy.context.view_layer.update()

def shot(name, target, dist, azim, elev=6, lens=50):
    t = Vector(target); a, e = math.radians(azim), math.radians(elev)
    cam_d.lens = lens
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(out_dir, f'{prefix}_{name}.png')
    bpy.ops.render.render(write_still=True)

if STRIP:  # one wave cycle, for comparing motion
    period = 2 * math.pi / params(rig)['wave_rate']
    for i in range(6):
        pose(True, t=1.0 + period * i / 6); shot(f'wave{i}', (0, 0, 0.9), 2.4, -25)
    print('RENDERED', prefix); sys.exit(0)
pose(False); shot('front', (0, 0, 0.74), 2.5, 0)
pose(True); shot('wave34', (0, 0, 0.84), 2.8, -35)
pose(False); shot('side', (0, 0, 0.74), 2.5, 90)
apply_pose(rig, t=0.16, walk=1.0, speed=2.1); bpy.context.view_layer.update(); shot('walk', (0, 0, 0.74), 2.5, 90)  # mid-stride
pose(False)
shot('face', (0, -0.01, HEAD_Z + 0.13), 0.8, -15, elev=2)
print('RENDERED', prefix)
