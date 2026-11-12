import bpy
import bmesh
from mathutils import Vector, Euler, Matrix

# Self-contained: rebuilds the cassette and fishbowl robots (see robot_bay.py for the other shapes) so that the parts
# that should keep moving are separate pieces fixed to the head bone instead of being skinned into the body:
#   Bay_ReelL, Bay_ReelR  the two reels of the cassette (the page turns them about the front axis)
#   Bay_FishSwim          the fish, its tail, fin, eye and two bubbles in the bowl, with its origin at the bowl centre
#                         (the page turns it about the vertical axis, so the fish circles, and bobs it)
# Everything else is the same as robot_bay.py. The 23 clips are borrowed from robot-pocket.glb. Robots face -Y.

OUT = "C:/path/to/agent-factory-3d/assets/models/"
CLIPS = ("idle", "typing", "wave", "idle2", "think", "inspect", "test", "assemble", "draw", "walk", "polish", "gauge", "drive",
         "dance", "dance2", "cheer", "bow", "shrug", "flex", "salute", "spin", "stretch", "highfive")


def _material(name, color, roughness, emission=0.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = roughness
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


def _rounded_box(name, center, size, bevel, m, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=4, profile=0.5, affect="EDGES")
    turn = Euler(rot).to_matrix()
    for v in bm.verts:
        v.co = turn @ v.co + Vector(center)
    bm.to_mesh(me)
    bm.free()
    return _finish(name, me, m)


def _torus(name, center, major, minor, m, rot=(1.5708, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=28, minor_segments=8,
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


def _attach(ob, rig, bone):
    """Fix a whole piece to a bone (not skinned): it follows the bone and keeps its place at rest."""
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    # with no parent the object's own transform was its place in the world; undo whatever the bone adds
    parent_matrix = ob.matrix_world @ ob.matrix_basis.inverted()
    ob.matrix_parent_inverse = parent_matrix.inverted()


def _join(objs, name):
    """Merge several objects into the first one, which keeps its origin and transform."""
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def _mats(variant, tint, eye):
    return dict(
        body=_material(f"{variant}Body", tint, 0.3),
        face=_material("RobotFace", (0.015, 0.02, 0.035), 0.12),
        eye=_material(f"{variant}Eyes", eye, 0.5, emission=6.0),
        accent=_material(f"{variant}Accent", eye, 0.35),
        glow=_material(f"{variant}Glow", eye, 0.4, emission=4.0),
        dark=_material("RobotDark", (0.08, 0.09, 0.11), 0.4),
    )


def _rig(name, root_to, body_to, head_from, head_to, ax, arm_top, arm_bottom, parts, attached=()):
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.data.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head, root.tail = (0, 0, 0), (0, 0, root_to)
    bb = eb.new("body"); bb.head, bb.tail = (0, 0, root_to), (0, 0, body_to); bb.parent = root
    hb = eb.new("head"); hb.head, hb.tail = (0, 0, head_from), (0, 0, head_to); hb.parent = bb
    al = eb.new("arm_l"); al.head, al.tail = (ax, 0, arm_top), (ax + 0.01, 0, arm_bottom); al.parent = bb
    ar = eb.new("arm_r"); ar.head, ar.tail = (-ax, 0, arm_top), (-ax - 0.01, 0, arm_bottom); ar.parent = bb
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob, bone in parts:
        _bind(ob, rig, bone)
    for ob, bone in attached:
        _attach(ob, rig, bone)
    return rig


def _limbs(name, m, cz, zt, ax, neck):
    return [
        (_ellipsoid(f"{name}_Base", (0, 0, 0.06), (0.22, 0.22, 0.07), m["body"]), "root"),
        (_torus(f"{name}_BaseRing", (0, 0, 0.03), 0.205, 0.012, m["glow"], rot=(0, 0, 0)), "root"),
        (_ellipsoid(f"{name}_ArmL", (ax, 0, cz + 0.04), (0.05, 0.05, 0.14), m["body"], 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_ArmR", (-ax, 0, cz + 0.04), (0.05, 0.05, 0.14), m["body"], 16, 10), "arm_r"),
        (_ellipsoid(f"{name}_HandL", (ax + 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), m["body"], 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_HandR", (-ax - 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), m["body"], 16, 10), "arm_r"),
        (_ellipsoid(f"{name}_JointL", (ax, 0, cz + 0.17), (0.06, 0.06, 0.06), m["dark"], 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_JointR", (-ax, 0, cz + 0.17), (0.06, 0.06, 0.06), m["dark"], 16, 10), "arm_r"),
        (_torus(f"{name}_Neck", (0, 0, zt - 0.02), neck, 0.018, m["dark"], rot=(0, 0, 0)), "body"),
    ]


def _egg(name, m, cz):
    return [
        (_ellipsoid(f"{name}_Body", (0, 0, cz), (0.20, 0.17, 0.25), m["body"]), "body"),
        (_ellipsoid(f"{name}_Badge", (0, -0.165, cz + 0.06), (0.045, 0.012, 0.045), m["glow"], 16, 10), "body"),
        (_torus(f"{name}_Waist", (0, 0, cz - 0.06), 0.194, 0.007, m["dark"], rot=(0, 0, 0)), "body"),
    ]


def build_cassette(name):
    """A cassette tape for a head: the two reels are the eyes, and they turn."""
    _remove_existing(name)
    m = _mats("cassette", (0.80, 0.89, 0.93), (0.35, 0.9, 1.0))
    shell = _material("CassetteShell", (0.90, 0.85, 0.74), 0.5)
    cz, zt, ax = 0.28, 0.47, 0.225
    hh = 0.38
    zh = zt + hh / 2 - 0.03
    ytop = zh + hh / 2
    yf = -0.07
    parts = _limbs(name, m, cz, zt, ax, 0.1) + [
        (_rounded_box(f"{name}_Body", (0, 0, cz), (0.38, 0.28, 0.38), 0.07, m["body"]), "body"),
        (_rounded_box(f"{name}_Chest", (0, -0.14 + 0.004, cz + 0.02), (0.28, 0.012, 0.18), 0.01, m["dark"]), "body"),
        (_ellipsoid(f"{name}_Badge", (0, -0.14, cz + 0.06), (0.04, 0.012, 0.04), m["glow"], 14, 8), "body"),
        (_rounded_box(f"{name}_Head", (0, 0, zh), (0.56, 0.14, hh), 0.05, shell), "head"),
        (_rounded_box(f"{name}_Label", (0, yf - 0.004, zh + 0.12), (0.44, 0.012, 0.11), 0.01, m["body"]), "head"),
        (_rounded_box(f"{name}_Window", (0, yf - 0.006, zh - 0.04), (0.42, 0.014, 0.19), 0.03, m["face"]), "head"),
        (_rounded_box(f"{name}_Tape", (0, yf - 0.012, zh - 0.115), (0.3, 0.008, 0.012), 0.002, m["dark"]), "head"),
    ]
    reels = []
    for side, s in (("L", 1), ("R", -1)):
        x = s * 0.115
        z = zh - 0.035
        pieces = [_torus(f"{name}_ReelRing{side}", (x, yf - 0.014, z), 0.07, 0.013, m["accent"])]
        pieces.append(_ellipsoid(f"{name}_Hub{side}", (x, yf - 0.016, z), (0.026, 0.012, 0.026), m["eye"], 14, 8))
        for k in range(3):
            pieces.append(_rounded_box(f"{name}_Spoke{side}{k}", (x, yf - 0.014, z), (0.12, 0.006, 0.012), 0.002, m["accent"], rot=(0, 1.0472 * k, 0)))
        reels.append((_join(pieces, f"{name}_Reel{side}"), "head"))
        parts.append((_ellipsoid(f"{name}_Screw{side}", (s * 0.245, yf - 0.006, zh + 0.15), (0.013, 0.008, 0.013), m["dark"], 8, 6), "head"))
        parts.append((_ellipsoid(f"{name}_ScrewLow{side}", (s * 0.245, yf - 0.006, zh - 0.15), (0.013, 0.008, 0.013), m["dark"], 8, 6), "head"))
    return _rig(name, 0.12, zt, zt - 0.04, ytop, ax, cz + 0.18, cz - 0.14, parts, attached=reels)


def build_fishbowl(name):
    """A glass bowl for a head, water inside and a fish that circles in it."""
    _remove_existing(name)
    m = _mats("fishbowl", (0.85, 0.80, 0.95), (1.0, 0.62, 0.2))
    glass = _material("GlassBowl", (0.8, 0.95, 1.0), 0.05, alpha=0.25)
    water = _material("BowlWater", (0.2, 0.85, 0.95), 0.1, alpha=0.45)
    cz, zt, ax = 0.34, 0.59, 0.235
    r = 0.21
    zh = zt + r - 0.05
    ytop = zh + r
    swim = 0.06  # how far in front of the bowl's centre the fish swims
    parts = _limbs(name, m, cz, zt, ax, 0.11) + _egg(name, m, cz) + [
        (_torus(f"{name}_Collar", (0, 0, zt + 0.0), 0.14, 0.03, m["dark"], rot=(0, 0, 0)), "head"),
        (_ellipsoid(f"{name}_Water", (0, 0, zh - 0.03), (r - 0.012, r - 0.012, r - 0.04), water, 32, 18), "head"),
        (_ellipsoid(f"{name}_Glass", (0, 0, zh), (r, r, r), glass, 32, 18), "head"),
    ]
    fish = [
        _ellipsoid(f"{name}_Fish", (0, -0.03 - swim, zh - 0.02), (0.07, 0.035, 0.045), m["accent"], 16, 10),
        _ellipsoid(f"{name}_FishTail", (-0.095, -0.03 - swim, zh - 0.02), (0.04, 0.012, 0.05), m["accent"], 12, 8),
        _ellipsoid(f"{name}_FishFin", (0.0, -0.03 - swim, zh + 0.03), (0.025, 0.01, 0.025), m["glow"], 10, 6),
        _ellipsoid(f"{name}_FishEye", (0.05, -0.062 - swim, zh - 0.008), (0.013, 0.01, 0.013), m["face"], 10, 6),
        _ellipsoid(f"{name}_Bubble0", (0.07, -0.05 - swim, zh + 0.07), (0.016, 0.016, 0.016), glass, 10, 6),
        _ellipsoid(f"{name}_Bubble1", (0.095, -0.04 - swim, zh + 0.1), (0.011, 0.011, 0.011), glass, 10, 6),
    ]
    swimmer = _join(fish, f"{name}_FishSwim")
    # the piece turns about its own origin, so put the origin at the middle of the bowl
    centre = Vector((0, 0, zh))
    swimmer.data.transform(Matrix.Translation(-centre))
    swimmer.location = centre
    return _rig(name, 0.12, zt, zt - 0.04, ytop, ax, cz + 0.18, cz - 0.14, parts, attached=[(swimmer, "head")])


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


def load_clips():
    """Import the pocket robot only to get its 23 actions, then remove the robot and keep the actions."""
    for m in [m for m in bpy.data.materials if m.users == 0 and m.name.startswith("pocket")]:
        bpy.data.materials.remove(m)
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=OUT + "robot-pocket.glb")
    new = [o for o in bpy.data.objects if o.name not in before]
    clips = {a.name: a for a in bpy.data.actions if a.name in CLIPS}
    for a in clips.values():
        a.use_fake_user = True
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
    for m in [m for m in bpy.data.materials if m.users == 0 and m.name.startswith("pocket")]:
        bpy.data.materials.remove(m)
    return clips


def build_and_export(variant, rig, clips):
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start, scene.frame_end = 1, 49
    ad = rig.animation_data_create()
    for name in CLIPS:
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, clips[name])
        strip.repeat = 1
    parts = [rig] + [o for o in bpy.data.objects if o.parent == rig]
    export_selected(OUT + f"robot-{variant}.glb", parts)
    count = len(parts)
    for o in parts:
        if o.type == "MESH":
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.meshes.remove(me)
    arm_data = rig.data
    bpy.data.objects.remove(rig, do_unlink=True)
    bpy.data.armatures.remove(arm_data)
    return count


clips = load_clips()
print("clips found", len(clips))
print("cassette parts", build_and_export("cassette", build_cassette("Bay"), clips))
print("fishbowl parts", build_and_export("fishbowl", build_fishbowl("Bay"), clips))
for a in clips.values():
    a.use_fake_user = False
for ac in [a for a in bpy.data.actions if a.users == 0]:
    bpy.data.actions.remove(ac)
