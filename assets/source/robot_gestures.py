import bpy
from mathutils import Euler

# Self-contained: adds ten gesture clips to existing robot-<variant>.glb files without touching their other
# clips. It imports each file, appends the new clips as NLA tracks on the same five bones, exports over the
# file and removes the import. Bone axes after import match the original build (checked): bones point up,
# arms point down; arm Z raises an arm sideways (arm_r positive, arm_l negative), arm X swings it forward when
# negative, body X leans forward when positive, root Z spins.

OUT = "C:/path/to/agent-factory-3d/assets/models/"
FPS = 24
LOOP_END = 49  # frame 49 repeats frame 1 so every loop is seamless


def _alt(frames, a, b):
    return [(f, a if i % 2 == 0 else b) for i, f in enumerate(frames)]


# gesture name -> {bone: (channel, keys) or [(channel, keys), ...]}; channels are rotation_euler (radians) or location (metres)
_GESTURES = {
    # both arms swing up and down while the body sways and bounces
    "dance": {
        "root": ("location", [(1, (0, 0, 0)), (7, (0, 0, 0.05)), (13, (0, 0, 0)), (19, (0, 0, 0.05)), (25, (0, 0, 0)),
                              (31, (0, 0, 0.05)), (37, (0, 0, 0)), (43, (0, 0, 0.05)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0, 0, -0.2)), (13, (0, 0, 0.2)), (25, (0, 0, -0.2)), (37, (0, 0, 0.2)), (49, (0, 0, -0.2))]),
        "head": ("rotation_euler", [(1, (0, 0, 0.25)), (13, (0, 0, -0.25)), (25, (0, 0, 0.25)), (37, (0, 0, -0.25)), (49, (0, 0, 0.25))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0.5)), (13, (0, 0, 2.3)), (25, (0, 0, 0.5)), (37, (0, 0, 2.3)), (49, (0, 0, 0.5))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, -2.3)), (13, (0, 0, -0.5)), (25, (0, 0, -2.3)), (37, (0, 0, -0.5)), (49, (0, 0, -2.3))]),
    },
    # second dance: arms pump forward and up in turn, head nods to a beat
    "dance2": {
        "root": ("location", [(1, (0, 0, 0)), (13, (0, 0, 0.04)), (25, (0, 0, 0)), (37, (0, 0, 0.04)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0.1, 0, 0.1)), (13, (0.1, 0, -0.1)), (25, (0.1, 0, 0.1)), (37, (0.1, 0, -0.1)), (49, (0.1, 0, 0.1))]),
        "head": ("rotation_euler", _alt(range(1, 50, 6), (0.2, 0, 0), (-0.05, 0, 0))),
        "arm_r": ("rotation_euler", [(1, (-2.6, 0, 0.3)), (13, (-0.4, 0, 0.2)), (25, (-2.6, 0, 0.3)), (37, (-0.4, 0, 0.2)), (49, (-2.6, 0, 0.3))]),
        "arm_l": ("rotation_euler", [(1, (-0.4, 0, -0.2)), (13, (-2.6, 0, -0.3)), (25, (-0.4, 0, -0.2)), (37, (-2.6, 0, -0.3)), (49, (-0.4, 0, -0.2))]),
    },
    # both arms up, four hops
    "cheer": {
        "root": ("location", _alt(range(1, 50, 6), (0, 0, 0), (0, 0, 0.14))),
        "body": ("rotation_euler", [(1, (-0.08, 0, 0)), (25, (-0.08, 0, 0.05)), (49, (-0.08, 0, 0))]),
        "head": ("rotation_euler", [(1, (-0.2, 0, 0)), (25, (-0.3, 0, 0)), (49, (-0.2, 0, 0))]),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 6), (0, 0, 2.5), (0, 0, 2.9))),
        "arm_l": ("rotation_euler", _alt(range(1, 50, 6), (0, 0, -2.5), (0, 0, -2.9))),
    },
    # leans forward, holds, comes back up
    "bow": {
        "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (0.75, 0, 0)), (31, (0.75, 0, 0)), (43, (0, 0, 0)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (13, (0.25, 0, 0)), (31, (0.25, 0, 0)), (43, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (13, (0.6, 0, 0.15)), (31, (0.6, 0, 0.15)), (43, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (13, (0.6, 0, -0.15)), (31, (0.6, 0, -0.15)), (43, (0, 0, 0)), (49, (0, 0, 0))]),
    },
    # arms out and up a little, head tilted: "no idea"
    "shrug": {
        "root": ("location", [(1, (0, 0, 0)), (13, (0, 0, 0.02)), (37, (0, 0, 0.02)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (-0.05, 0, 0.06)), (37, (-0.05, 0, 0.06)), (47, (0, 0, 0)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.3)), (37, (0, 0, 0.3)), (47, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (13, (-0.4, 0, 1.1)), (37, (-0.4, 0, 1.1)), (47, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (13, (-0.4, 0, -1.1)), (37, (-0.4, 0, -1.1)), (47, (0, 0, 0)), (49, (0, 0, 0))]),
    },
    # arms held up and out, trembling with effort
    "flex": {
        "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.02)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (-0.1, 0, 0)), (49, (-0.1, 0, 0))]),
        "head": ("rotation_euler", [(1, (-0.12, 0, 0)), (49, (-0.12, 0, 0))]),
        "arm_r": ("rotation_euler", _alt(range(1, 50, 3), (-0.4, 0, 1.6), (-0.4, 0, 1.78))),
        "arm_l": ("rotation_euler", _alt(range(1, 50, 3), (-0.4, 0, -1.78), (-0.4, 0, -1.6))),
    },
    # right hand to the brow, held, then down
    "salute": {
        "body": ("rotation_euler", [(1, (0, 0, 0)), (9, (-0.06, 0, 0)), (41, (-0.06, 0, 0)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (9, (-0.12, 0, 0)), (41, (-0.12, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (9, (-2.5, 0, 0.45)), (41, (-2.5, 0, 0.45)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (9, (0.05, 0, -0.08)), (41, (0.05, 0, -0.08)), (49, (0, 0, 0))]),
    },
    # a full turn on the spot with arms out and a small hop
    "spin": {
        "root": [
            ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 1.5708)), (25, (0, 0, 3.1416)), (37, (0, 0, 4.7124)), (49, (0, 0, 6.2832))]),
            ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.12)), (49, (0, 0, 0))]),
        ],
        "arm_r": ("rotation_euler", [(1, (0, 0, 1.2)), (49, (0, 0, 1.2))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, -1.2)), (49, (0, 0, -1.2))]),
    },
    # slow stretch up with both arms overhead, then relax
    "stretch": {
        "root": ("location", [(1, (0, 0, 0)), (13, (0, 0, 0.03)), (37, (0, 0, 0.03)), (49, (0, 0, 0))]),
        "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (-0.18, 0, 0)), (37, (-0.18, 0, 0)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (13, (-0.3, 0, 0)), (37, (-0.3, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 2.6)), (37, (0, 0, 2.6)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, -2.6)), (37, (0, 0, -2.6)), (49, (0, 0, 0))]),
    },
    # right arm up for a high five, a slap at frame 15, then down
    "highfive": {
        "body": ("rotation_euler", [(1, (0, 0, 0)), (9, (0.05, 0, 0.1)), (33, (0.05, 0, 0.1)), (41, (0, 0, 0)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, 0)), (9, (0, 0, 0.2)), (33, (0, 0, 0.2)), (41, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (9, (-2.7, 0, 0.35)), (15, (-3.0, 0, 0.35)), (19, (-2.7, 0, 0.35)),
                                     (33, (-2.7, 0, 0.35)), (41, (0, 0, 0)), (49, (0, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (9, (0.1, 0, -0.1)), (33, (0.1, 0, -0.1)), (41, (0, 0, 0)), (49, (0, 0, 0))]),
    },
}


def add_gestures(rig):
    """Append every gesture as its own NLA track. Existing tracks are left alone."""
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, LOOP_END
    ad = rig.animation_data or rig.animation_data_create()
    have = set(t.name for t in ad.nla_tracks)
    ad.action = None
    # keep the bones in quaternion mode, as the importer leaves them: the existing clips are stored that way, and
    # switching the mode would silently freeze them. The gestures are written as turns (Euler) and converted.
    for name, bones in _GESTURES.items():
        if name in have:
            continue
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        ad.action = action
        for bone, spec in bones.items():
            pb = rig.pose.bones[bone]
            for channel, keys in (spec if isinstance(spec, list) else [spec]):
                for frame, value in keys:
                    if channel == "location":
                        pb.location = value
                        pb.keyframe_insert("location", frame=frame)
                    else:
                        pb.rotation_quaternion = Euler(value, "XYZ").to_quaternion()
                        pb.keyframe_insert("rotation_quaternion", frame=frame)
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.repeat = 1
        ad.action = None


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


def _purge(variant):
    """Remove unused robot materials, so an import does not give them a .001 suffix (the page tints parts by name)."""
    for m in [m for m in bpy.data.materials if m.users == 0 and (m.name.startswith(variant) or m.name.startswith("Robot"))]:
        bpy.data.materials.remove(m)


def regift(variant):
    """Import robot-<variant>.glb, add the gestures, export it over itself, remove the import."""
    _purge(variant)
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=OUT + f"robot-{variant}.glb")
    new = [o for o in bpy.data.objects if o.name not in before]
    rig = next(o for o in new if o.type == "ARMATURE")
    add_gestures(rig)
    for t in rig.animation_data.nla_tracks:
        t.mute = False
    parts = [rig] + [o for o in new if o.parent == rig]
    export_selected(OUT + f"robot-{variant}.glb", parts)
    tracks = len(rig.animation_data.nla_tracks)
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
    for ac in [a for a in bpy.data.actions if a.users == 0]:
        bpy.data.actions.remove(ac)
    _purge(variant)
    return tracks


print("pocket tracks", regift("pocket"))
