import bpy
import bmesh
from mathutils import Vector

# Shared helpers for the hall scripts. Paste this before any script that uses it.

STEEL = (0.30, 0.32, 0.35)
DARK_STEEL = (0.10, 0.11, 0.13)
AMBER = (1.0, 0.52, 0.08)
TRIM = (0.75, 0.38, 0.06)


def to_blender(x, y, z):
    """Layout (three.js, y up, +z to camera) -> Blender (z up, -y to camera)."""
    return (x, -z, y)


def mat(name, color, rough=0.5, metal=0.0, emission=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Alpha"].default_value = alpha
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0:
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    return m


def link(name, me, material, rot=(0, 0, 0), loc=(0, 0, 0)):
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = rot
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(name, center, size, material, bevel=0.0, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.5, affect="EDGES")
    bm.to_mesh(me)
    bm.free()
    return link(name, me, material, rot=rot, loc=center)


def pipe(name, p0, p1, radius, material, segments=16):
    a, b = Vector(p0), Vector(p1)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=(b - a).length)
    rot = (b - a).to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return link(name, me, material, loc=(a + b) / 2)


def clear_prefix(*prefixes):
    for ob in [o for o in bpy.data.objects if o.name.startswith(prefixes)]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0 and data.name in bpy.data.meshes:
            bpy.data.meshes.remove(data)
