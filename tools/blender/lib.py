"""Small helpers for building the story's 3D assets in headless Blender (bpy).
Conventions: Blender metres, Z up. Characters and vehicles face -Y in Blender, which is +Z in glTF / three.js."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(hexv):
    return (lin(((hexv >> 16) & 255) / 255), lin(((hexv >> 8) & 255) / 255), lin((hexv & 255) / 255), 1.0)

def material(name, hexv, rough=0.5, metal=0.0, emit=None, emit_s=0.0, coat=0.0, image=None, alpha_clip=False, normal_img=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgb(hexv)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.05
    if emit is not None:
        b.inputs['Emission Color'].default_value = rgb(emit)
        b.inputs['Emission Strength'].default_value = emit_s
    if image:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(image)
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha_clip:
            nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
            m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
            try:
                m.surface_render_method = 'DITHERED'
            except Exception:
                pass
    if normal_img:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(normal_img)
        t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def prim(kind, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), name=None, mat=None, **kw):
    getattr(bpy.ops.mesh, 'primitive_' + kind + '_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.scale = scale
    if name:
        o.name = name
    if mat:
        o.data.materials.append(mat)
    apply_tf(o)
    return o

def apply_tf(o):
    select_only([o])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

def subsurf(o, lv=2):
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = lv; m.render_levels = lv
    return o

def bevel(o, w=0.01, seg=3, angle=None):
    m = o.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg
    if angle:
        m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    return o

def apply_mods(o):
    select_only([o])
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def smooth(o, angle=None):
    select_only([o])
    if angle is None:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    return o

def join(objs, name=None):
    objs = [o for o in objs if o]
    for o in objs:
        apply_mods(o)
    select_only(objs)
    bpy.ops.object.join()
    o = bpy.context.active_object
    if name:
        o.name = name
    return o

def set_origin(o, p):
    """Move the object's origin (its pivot) to world point p without moving the mesh."""
    p = Vector(p)
    o.data.transform(Matrix.Translation(o.matrix_world.translation - p))
    o.matrix_world.translation = p
    return o

def parent(child, par):
    w = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = w
    return child

def empty(name, loc, par=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if par:
        bpy.context.view_layer.update()
        parent(e, par)
    return e

def deform(o, fn):
    """Move every vertex: fn(Vector) -> Vector, in world space."""
    mw, mi = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        v.co = mi @ fn(mw @ v.co)
    o.data.update()
    return o

def bake_ao(objs, rays=20, dist=0.35, strength=0.75, ground=True, seed=3):
    """Ambient occlusion baked into vertex colours (COLOR_0): creases, undersides and contact areas get darker,
    the way they look in real light. three.js multiplies it with the material colour."""
    rnd = random.Random(seed)
    verts, polys, off = [], [], 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        mw = o.matrix_world
        verts += [mw @ v.co for v in me.vertices]
        polys += [[i + off for i in p.vertices] for p in me.polygons]
        off += len(me.vertices)
        o.evaluated_get(dg).to_mesh_clear()
    if ground:
        zmin = min(v.z for v in verts)
        b = len(verts)
        verts += [Vector((-50, -50, zmin - 0.002)), Vector((50, -50, zmin - 0.002)), Vector((50, 50, zmin - 0.002)), Vector((-50, 50, zmin - 0.002))]
        polys.append([b, b + 1, b + 2, b + 3])
    tree = BVHTree.FromPolygons(verts, polys)
    dirs = []
    while len(dirs) < rays:
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.05 < d.length <= 1:
            dirs.append(d.normalized())
    for o in objs:
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        if 'AO' in me.color_attributes:
            me.color_attributes.remove(me.color_attributes['AO'])
        ca = me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        for v in me.vertices:
            p = mw @ v.co
            n = (nm @ v.normal).normalized()
            hit = 0
            for d in dirs:
                if d.dot(n) < 0:
                    d = -d
                loc, _, _, _ = tree.ray_cast(p + n * 0.002, d, dist)
                if loc is not None:
                    hit += 1 - (loc - p).length / dist * 0.5
            k = 1 - strength * hit / rays
            ca.data[v.index].color = (k, k, k, 1)
        me.color_attributes.active_color = ca

def tri_count(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')

def export(path, objs=None):
    if objs:
        select_only(objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=bool(objs), export_apply=True,
                              export_yup=True, export_vertex_color='ACTIVE', export_image_format='JPEG',
                              export_jpeg_quality=85, export_animations=False, export_materials='EXPORT')

def render_preview(path, target=(0, 0, 0.7), dist=3.0, elev=12, azim=-35, lens=50, res=(900, 900)):
    """A quick look: an orthogonal 3-point light, EEVEE, saved as PNG."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 0.9, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    t = Vector(target)
    a, e = math.radians(azim), math.radians(elev)
    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = lens
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    for nm, en, rot in [('key', 4.0, (math.radians(50), 0, math.radians(-40))), ('fill', 1.2, (math.radians(60), 0, math.radians(60))), ('rim', 2.5, (math.radians(120), 0, math.radians(170)))]:
        ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en
        lo = bpy.data.objects.new(nm, ld); lo.rotation_euler = rot; sc.collection.objects.link(lo)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
