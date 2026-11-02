"""Render one pupil model (child_a.glb / child_b.glb) for review: front, 3/4 waving, side and a face close-up, 1024 px.
The model is imported from the exported .glb, so the renders show exactly what the story loads.
The wave matches the story's pose in assets/story/future-world.js (wireChild: wave = 1).
Usage: python render_child.py <child.glb> <out_dir> <prefix>"""
import sys, os, math, bpy
from mathutils import Vector

glb, out_dir, prefix = sys.argv[-3], sys.argv[-2], sys.argv[-1]
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
N = {o.name: o for o in bpy.data.objects}
HEAD_Z = N['Head'].matrix_world.translation.z if 'Head' in N else 1.15

def pose(wave):
    """three.js rotation.z = a  ->  Blender rotation about Y = -a (glTF Y-up / Blender Z-up); rotation.x is the same."""
    for k in ('Shoulder_L', 'Shoulder_R', 'Elbow_L', 'Elbow_R'):
        if k in N:
            N[k].rotation_mode = 'XYZ'; N[k].rotation_euler = (0, 0, 0)
    if not wave:
        return
    N['Shoulder_R'].rotation_euler = (0, 2.75, 0)
    N['Elbow_R'].rotation_euler = (0, -0.27, 0)  # the hand mid-wave
    N['Shoulder_L'].rotation_euler = (0, -0.06, 0)
    N['Elbow_L'].rotation_euler = (-0.2, 0, 0)

def shot(name, target, dist, azim, elev=6, lens=50):
    t = Vector(target); a, e = math.radians(azim), math.radians(elev)
    cam_d.lens = lens
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    sc.render.filepath = os.path.join(out_dir, f'{prefix}_{name}.png')
    bpy.ops.render.render(write_still=True)

pose(False); shot('front', (0, 0, 0.74), 2.5, 0)
pose(True); shot('wave34', (0, 0, 0.84), 2.8, -35)
pose(False); shot('side', (0, 0, 0.74), 2.5, 90)
shot('face', (0, -0.01, HEAD_Z + 0.13), 0.8, -15, elev=2)
print('RENDERED', prefix)
