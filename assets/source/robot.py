import bpy
import bmesh
from mathutils import Vector


def _principled(mat):
    mat.use_nodes = True
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _material(name, color, roughness, emission=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = _principled(mat)
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def _ellipsoid(name, center, radii, mat, segments=24, rings=14):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    bm.to_mesh(me)
    bm.free()
    return _finish(name, me, mat)


def _rounded_box(name, center, size, bevel, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=4, profile=0.5, affect="EDGES")
    for v in bm.verts:
        v.co += Vector(center)
    bm.to_mesh(me)
    bm.free()
    return _finish(name, me, mat)


def _finish(name, me, mat):
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _remove_existing(name):
    for ob in [o for o in bpy.data.objects if o.name == name or o.name.startswith(name + "_")]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data and data.users == 0:
            (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.armatures).remove(data)


def _bind(ob, rig, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add([v.index for v in ob.data.vertices], 1.0, "REPLACE")
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def build_robot(name, location):
    """Build one cute robot facing -Y. Returns the armature object."""
    _remove_existing(name)
    white = _material("RobotBody", (0.92, 0.93, 0.95), 0.35)
    dark = _material("RobotFace", (0.015, 0.02, 0.035), 0.15)
    eyes = _material("RobotEyes", (0.0, 0.85, 1.0), 0.5, emission=6.0)

    parts = [
        ("Base", _ellipsoid(f"{name}_Base", (0, 0, 0.06), (0.22, 0.22, 0.07), white), "root"),
        ("Body", _ellipsoid(f"{name}_Body", (0, 0, 0.34), (0.2, 0.17, 0.25), white), "body"),
        ("Head", _rounded_box(f"{name}_Head", (0, 0, 0.74), (0.42, 0.36, 0.3), 0.07, white), "head"),
        ("Face", _rounded_box(f"{name}_Face", (0, -0.17, 0.74), (0.32, 0.05, 0.2), 0.02, dark), "head"),
        ("EyeL", _ellipsoid(f"{name}_EyeL", (0.08, -0.2, 0.76), (0.04, 0.012, 0.055), eyes, 16, 10), "head"),
        ("EyeR", _ellipsoid(f"{name}_EyeR", (-0.08, -0.2, 0.76), (0.04, 0.012, 0.055), eyes, 16, 10), "head"),
        ("ArmL", _ellipsoid(f"{name}_ArmL", (0.235, 0, 0.38), (0.05, 0.05, 0.14), white, 16, 10), "arm_l"),
        ("ArmR", _ellipsoid(f"{name}_ArmR", (-0.235, 0, 0.38), (0.05, 0.05, 0.14), white, 16, 10), "arm_r"),
        ("HandL", _ellipsoid(f"{name}_HandL", (0.245, 0, 0.22), (0.06, 0.06, 0.06), white, 16, 10), "arm_l"),
        ("HandR", _ellipsoid(f"{name}_HandR", (-0.245, 0, 0.22), (0.06, 0.06, 0.06), white, 16, 10), "arm_r"),
    ]

    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head, root.tail = (0, 0, 0), (0, 0, 0.12)
    body = eb.new("body"); body.head, body.tail = (0, 0, 0.12), (0, 0, 0.55); body.parent = root
    head = eb.new("head"); head.head, head.tail = (0, 0, 0.56), (0, 0, 0.91); head.parent = body
    al = eb.new("arm_l"); al.head, al.tail = (0.235, 0, 0.52), (0.245, 0, 0.2); al.parent = body
    ar = eb.new("arm_r"); ar.head, ar.tail = (-0.235, 0, 0.52), (-0.245, 0, 0.2); ar.parent = body
    bpy.ops.object.mode_set(mode="OBJECT")

    for _, ob, bone in parts:
        _bind(ob, rig, bone)
    rig.location = location
    return rig
