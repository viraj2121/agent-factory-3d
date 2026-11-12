import bpy
import bmesh
from mathutils import Vector

# Self-contained: builds the extra robots (designer, keeper, driver) on the same five-bone skeleton
# as the department robots, gives each one every clip, and exports robot-<variant>.glb.
# Robots face -Y; the robot's right is -X. Bone local Y runs along the bone.

OUT = "C:/path/to/agent-factory-3d/assets/models/"


def _material(name, color, roughness, emission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = roughness
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = emission
    return m


def _finish(name, me, m):
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _ellipsoid(name, center, radii, m, segments=24, rings=14):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    bm.to_mesh(me)
    bm.free()
    return _finish(name, me, m)


def _rounded_box(name, center, size, bevel, m):
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
    return _finish(name, me, m)


def _pipe(name, p0, p1, radius, m, segments=16):
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
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = (a + b) / 2
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _torus(name, center, major, minor, m, rot=(1.5708, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8,
                                     location=center, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(m)
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


FPS = 24
LOOP_END = 49


def _alt(frames, a, b):
    return [(f, a if i % 2 == 0 else b) for i, f in enumerate(frames)]


_ACTIONS = {
    "idle": {
        "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.015)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, -0.12)), (25, (0, 0, 0.12)), (49, (0, 0, -0.12))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (25, (0, 0, 0.04)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (25, (0, 0, -0.04)), (49, (0, 0, 0))]),
    },
    "typing": {
        "head": ("rotation_euler", [(1, (0.08, 0, 0)), (13, (0.12, 0, 0)), (25, (0.08, 0, 0)), (37, (0.12, 0, 0)), (49, (0.08, 0, 0))]),
        "arm_l": ("rotation_euler", _alt(range(1, 50, 6), (-0.9, 0, 0), (-0.6, 0, 0))),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 6), (-0.6, 0, 0), (-0.9, 0, 0))),
    },
    "wave": {
        "head": ("rotation_euler", [(1, (0, 0, 0.1)), (25, (0, 0, 0.1)), (49, (0, 0, 0.1))]),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 6), (0, 0, 2.0), (0, 0, 2.5))),
    },
    "idle2": {
        "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.012)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.08)), (25, (0, 0, 0)), (37, (0, 0, -0.08)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.5)), (25, (0, 0, 0)), (37, (0, 0, -0.5)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (25, (-0.12, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (25, (0.12, 0, 0)), (49, (0, 0, 0))]),
    },
    "think": {
        "body": ("rotation_euler", [(1, (-0.05, 0, 0)), (49, (-0.05, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.1, 0, 0.25)), (25, (0.18, 0, 0.2)), (49, (0.1, 0, 0.25))]),
        "arm_r": ("rotation_euler", [(1, (-2.3, 0, 0)), (13, (-2.25, 0, 0.05)), (25, (-2.3, 0, 0)), (37, (-2.25, 0, 0.05)), (49, (-2.3, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (-0.6, 0, -0.1)), (49, (-0.6, 0, -0.1))]),
    },
    "inspect": {
        "body": ("rotation_euler", [(1, (0.12, 0, 0)), (49, (0.12, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.05, 0, -0.3)), (25, (0.05, 0, 0.3)), (49, (0.05, 0, -0.3))]),
        "arm_r": ("rotation_euler", [(1, (-1.2, 0, -0.3)), (13, (-1.3, 0, 0.2)), (25, (-1.2, 0, -0.3)), (37, (-1.3, 0, 0.2)), (49, (-1.2, 0, -0.3))]),
        "arm_l": ("rotation_euler", [(1, (0.05, 0, 0.1)), (49, (0.05, 0, 0.1))]),
    },
    "test": {
        "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.04)), (25, (0, 0, 0)), (37, (0, 0, -0.04)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.05, 0, 0)), (13, (0.15, 0, 0)), (25, (0.05, 0, 0)), (37, (0.15, 0, 0)), (49, (0.05, 0, 0))]),
        "arm_l": ("rotation_euler", _alt(range(1, 50, 4), (-1.0, 0, 0), (-0.5, 0, 0))),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 4), (-0.5, 0, 0), (-1.0, 0, 0))),
    },
    "assemble": {
        "body": ("rotation_euler", _alt(range(1, 50, 6), (0, 0, 0), (0.1, 0, 0))),
        "head": ("rotation_euler", _alt(range(1, 50, 6), (0, 0, 0), (0.12, 0, 0))),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 6), (-1.9, 0, 0), (-0.5, 0, 0))),
        "arm_l": ("rotation_euler", _alt(range(1, 50, 6), (-1.0, 0, 0), (-1.0, 0, 0.03))),
    },
    # new: designer draws with sweeping strokes
    "draw": {
        "body": ("rotation_euler", [(1, (0.08, 0, 0)), (49, (0.08, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.1, 0, 0.15)), (25, (0.06, 0, -0.1)), (49, (0.1, 0, 0.15))]),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 6), (-2.0, 0, 0.35), (-2.05, 0, -0.35))),
        "arm_l": ("rotation_euler", [(1, (-0.9, 0, 0.1)), (49, (-0.9, 0, 0.1))]),
    },
    # new: hover-walk with a bob, a sway and swinging arms
    "walk": {
        "root": ("location", [(1, (0, 0, 0)), (13, (0, 0, 0.03)), (25, (0, 0, 0)), (37, (0, 0, 0.03)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0.06, 0, 0.05)), (25, (0.06, 0, -0.05)), (49, (0.06, 0, 0.05))]),
        "head": ("rotation_euler", [(1, (0, 0, 0.05)), (25, (0, 0, -0.05)), (49, (0, 0, 0.05))]),
        "arm_l": ("rotation_euler", [(1, (0.5, 0, 0)), (25, (-0.5, 0, 0)), (49, (0.5, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (-0.5, 0, 0)), (25, (0.5, 0, 0)), (49, (-0.5, 0, 0))]),
    },
    # new: keeper polishes a ring with quick wiping strokes
    "polish": {
        "body": ("rotation_euler", [(1, (0.12, 0, 0)), (49, (0.12, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.1, 0, 0)), (49, (0.1, 0, 0))]),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 4), (-1.6, 0, 0.5), (-1.4, 0, -0.5))),
        "arm_l": ("rotation_euler", [(1, (-0.4, 0, 0.1)), (49, (-0.4, 0, 0.1))]),
    },
    # new: keeper reads a gauge, looking left and right
    "gauge": {
        "head": ("rotation_euler", [(1, (0.05, 0, -0.35)), (25, (0.05, 0, 0.35)), (49, (0.05, 0, -0.35))]),
        "arm_r": ("rotation_euler", [(1, (-1.8, 0, 0.1)), (13, (-1.7, 0, 0.2)), (25, (-1.8, 0, 0.1)), (37, (-1.7, 0, 0.2)), (49, (-1.8, 0, 0.1))]),
        "arm_l": ("rotation_euler", [(1, (-0.3, 0, 0.1)), (49, (-0.3, 0, 0.1))]),
    },
    # new: driver holds a steering wheel and sways slightly
    "drive": {
        "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.01)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0.03, 0, 0.08)), (25, (0.03, 0, -0.08)), (49, (0.03, 0, 0.08))]),
        "arm_l": ("rotation_euler", [(1, (-1.25, 0, 0.18)), (25, (-1.3, 0, 0.1)), (49, (-1.25, 0, 0.18))]),
        "arm_r": ("rotation_euler", [(1, (-1.25, 0, -0.18)), (25, (-1.3, 0, -0.1)), (49, (-1.25, 0, -0.18))]),
    },
}


def add_animations(armature):
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, LOOP_END
    ad = armature.animation_data or armature.animation_data_create()
    for track in list(ad.nla_tracks):
        ad.nla_tracks.remove(track)
    for name in _ACTIONS:
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
    ad.action = None
    for pb in armature.pose.bones:
        pb.rotation_mode = "XYZ"
    for name, bones in _ACTIONS.items():
        action = bpy.data.actions.new(name)
        ad.action = action
        for bone, (channel, keys) in bones.items():
            pb = armature.pose.bones[bone]
            for frame, value in keys:
                if channel == "location":
                    pb.location = value
                else:
                    pb.rotation_euler = value
                pb.keyframe_insert(channel, frame=frame)
        for pb in armature.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.repeat = 1
        ad.action = None


VARIANTS = {
    "designer": dict(body=("egg", (0.19, 0.16, 0.24)), head=("round", (0.23, 0.21, 0.20)),
                     tint=(0.98, 0.93, 0.88), eye=(1.0, 0.55, 0.8), acc=("beret", "stylus")),
    "keeper": dict(body=("egg", (0.18, 0.16, 0.30)), head=("box", (0.34, 0.30, 0.26)),
                   tint=(0.80, 0.84, 0.88), eye=(0.5, 0.85, 1.0), acc=("toolbelt", "headlamp")),
    "driver": dict(body=("egg", (0.21, 0.18, 0.22)), head=("box", (0.38, 0.34, 0.28)),
                   tint=(0.97, 0.80, 0.55), eye=(1.0, 0.88, 0.3), acc=("cap", "goggles")),
}


def build_variant(variant, name):
    spec = VARIANTS[variant]
    _remove_existing(name)
    body_mat = _material(f"{variant}Body", spec["tint"], 0.3)
    face_mat = _material("RobotFace", (0.015, 0.02, 0.035), 0.12)
    eye_mat = _material(f"{variant}Eyes", spec["eye"], 0.5, emission=6.0)
    accent = _material(f"{variant}Accent", spec["eye"], 0.35)
    glow = _material(f"{variant}Glow", spec["eye"], 0.4, emission=4.0)
    dark = _material("RobotDark", (0.08, 0.09, 0.11), 0.4)

    bkind, bd = spec["body"]
    bhalf = bd[2]
    bwide = bd[0]
    bdeep = bd[1]
    cz = 0.09 + bhalf
    zt = cz + bhalf
    body = _ellipsoid(f"{name}_Body", (0, 0, cz), bd, body_mat)

    hkind, hd = spec["head"]
    hw, hdp, hh = (hd[0], hd[1], hd[2]) if hkind == "box" else (hd[0] * 2, hd[1] * 2, hd[2] * 2)
    zh = zt + hh / 2 - 0.04
    ytop = zh + hh / 2
    yf = -hdp / 2
    if hkind == "box":
        head = _rounded_box(f"{name}_Head", (0, 0, zh), hd, 0.07, body_mat)
    else:
        head = _ellipsoid(f"{name}_Head", (0, 0, zh), hd, body_mat)
    fscale = 0.76 if hkind == "box" else 0.6
    face = _rounded_box(f"{name}_Face", (0, yf + 0.01, zh), (hw * fscale, 0.05, hh * 0.66 * (1.0 if hkind == "box" else 0.8)), 0.02, face_mat)
    ex = 0.08 * (hw / 0.42)
    eyes = [
        _ellipsoid(f"{name}_EyeL", (ex, yf - 0.02, zh + 0.02), (0.04, 0.012, 0.055), eye_mat, 16, 10),
        _ellipsoid(f"{name}_EyeR", (-ex, yf - 0.02, zh + 0.02), (0.04, 0.012, 0.055), eye_mat, 16, 10),
    ]

    ax = bwide + 0.035
    parts = [
        (_ellipsoid(f"{name}_Base", (0, 0, 0.06), (0.22, 0.22, 0.07), body_mat), "root"),
        (body, "body"), (head, "head"), (face, "head"), (eyes[0], "head"), (eyes[1], "head"),
        (_ellipsoid(f"{name}_ArmL", (ax, 0, cz + 0.04), (0.05, 0.05, 0.14), body_mat, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_ArmR", (-ax, 0, cz + 0.04), (0.05, 0.05, 0.14), body_mat, 16, 10), "arm_r"),
        (_ellipsoid(f"{name}_HandL", (ax + 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), body_mat, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_HandR", (-ax - 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), body_mat, 16, 10), "arm_r"),
        (_ellipsoid(f"{name}_Badge", (0, -bdeep + 0.005, cz + 0.06), (0.045, 0.012, 0.045), glow, 16, 10), "body"),
        (_torus(f"{name}_Neck", (0, 0, zt - 0.02), min(bwide, hw / 2) * 0.55, 0.018, dark, rot=(0, 0, 0)), "body"),
        (_ellipsoid(f"{name}_JointL", (ax, 0, cz + 0.17), (0.06, 0.06, 0.06), dark, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_JointR", (-ax, 0, cz + 0.17), (0.06, 0.06, 0.06), dark, 16, 10), "arm_r"),
        (_rounded_box(f"{name}_Mouth", (0, yf - 0.015, zh - 0.065 * (hh / 0.28)), (0.1, 0.008, 0.012), 0.003, glow), "head"),
        (_torus(f"{name}_BaseRing", (0, 0, 0.03), 0.205, 0.012, glow, rot=(0, 0, 0)), "root"),
        (_torus(f"{name}_Waist", (0, 0, cz - 0.06), bwide * 0.97, 0.007, dark, rot=(0, 0, 0)), "body"),
    ]

    for a in spec["acc"]:
        if a == "beret":
            parts.append((_ellipsoid(f"{name}_Beret", (0.04, -0.01, ytop), (hw * 0.62, hdp * 0.62, 0.07), accent), "head"))
            parts.append((_ellipsoid(f"{name}_BeretTip", (0.04, -0.01, ytop + 0.07), (0.02, 0.02, 0.03), dark, 10, 6), "head"))
        elif a == "stylus":
            parts.append((_pipe(f"{name}_Stylus", (-ax - 0.01, 0, cz - 0.12), (-ax - 0.01, -0.2, cz - 0.12), 0.012, dark), "arm_r"))
            parts.append((_ellipsoid(f"{name}_StylusTip", (-ax - 0.01, -0.21, cz - 0.12), (0.016, 0.016, 0.016), glow, 10, 6), "arm_r"))
        elif a == "toolbelt":
            parts.append((_torus(f"{name}_Belt", (0, 0, cz - 0.14), bwide * 1.0, 0.03, accent, rot=(0, 0, 0)), "body"))
            for s, side in ((1, "L"), (-1, "R")):
                parts.append((_rounded_box(f"{name}_Pouch{side}", (s * 0.13, -bdeep * 0.9, cz - 0.14), (0.09, 0.06, 0.1), 0.012, dark), "body"))
            parts.append((_rounded_box(f"{name}_Tablet", (0, -bdeep - 0.005, cz + 0.02), (0.13, 0.015, 0.1), 0.004, dark), "body"))
            parts.append((_ellipsoid(f"{name}_TabletGlow", (0, -bdeep - 0.016, cz + 0.02), (0.045, 0.005, 0.03), glow, 10, 6), "body"))
        elif a == "headlamp":
            parts.append((_ellipsoid(f"{name}_Headlamp", (0, yf - 0.025, ytop - 0.05), (0.05, 0.025, 0.03), glow, 12, 8), "head"))
        elif a == "cap":
            parts.append((_ellipsoid(f"{name}_Cap", (0, 0, ytop - 0.01), (hw * 0.56, hdp * 0.56, 0.08), accent), "head"))
            parts.append((_rounded_box(f"{name}_Brim", (0, yf - 0.05, ytop - 0.03), (hw * 0.6, 0.14, 0.015), 0.005, accent), "head"))
        elif a == "goggles":
            for s, side in ((1, "L"), (-1, "R")):
                parts.append((_torus(f"{name}_Goggle{side}", (s * 0.05, yf - 0.03, ytop - 0.01), 0.04, 0.01, dark), "head"))

    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.data.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head, root.tail = (0, 0, 0), (0, 0, 0.12)
    bb = eb.new("body"); bb.head, bb.tail = (0, 0, 0.12), (0, 0, zt); bb.parent = root
    hb = eb.new("head"); hb.head, hb.tail = (0, 0, zt - 0.04), (0, 0, ytop); hb.parent = bb
    al = eb.new("arm_l"); al.head, al.tail = (ax, 0, cz + 0.18), (ax + 0.01, 0, cz - 0.14); al.parent = bb
    ar = eb.new("arm_r"); ar.head, ar.tail = (-ax, 0, cz + 0.18), (-ax - 0.01, 0, cz - 0.14); ar.parent = bb
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob, bone in parts:
        _bind(ob, rig, bone)
    return rig


def export_selected(path, objects):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_cameras=False, export_lights=False, export_yup=True,
    )


report = {}
for variant in VARIANTS:
    rig = build_variant(variant, "Extra")
    add_animations(rig)
    parts = [rig] + [o for o in bpy.data.objects if o.parent == rig]
    export_selected(OUT + f"robot-{variant}.glb", parts)
    report[variant] = (len(parts), sorted(a.name for a in bpy.data.actions))
    for o in parts:
        if o.type == "MESH":
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.meshes.remove(me)
    arm_data = rig.data
    bpy.data.objects.remove(rig, do_unlink=True)
    bpy.data.armatures.remove(arm_data)

for k, v in report.items():
    print(k, "parts", v[0], "actions", len(v[1]))
