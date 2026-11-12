import bpy

FPS = 24
LOOP_END = 49  # frame 49 repeats frame 1 so the loop does not jump

# action name -> {bone: (channel, [(frame, value), ...])} using rotation_euler / location
# bone local Y runs along the bone, so swings use X (forward/back) and Z (sideways)
# rotation_euler channels are (x, y, z) radians, location channels are metres.
_ACTIONS = {
    "idle": {
        "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.015)), (49, (0, 0, 0))]),
        "head": ("rotation_euler", [(1, (0, 0, -0.12)), (25, (0, 0, 0.12)), (49, (0, 0, -0.12))]),
        "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (25, (0, 0, 0.04)), (49, (0, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (25, (0, 0, -0.04)), (49, (0, 0, 0))]),
    },
    "typing": {
        "head": ("rotation_euler", [(1, (0.08, 0, 0)), (13, (0.12, 0, 0)), (25, (0.08, 0, 0)), (37, (0.12, 0, 0)), (49, (0.08, 0, 0))]),
        "arm_l": ("rotation_euler", [(1, (-0.9, 0, 0)), (7, (-0.6, 0, 0)), (13, (-0.9, 0, 0)), (19, (-0.6, 0, 0)), (25, (-0.9, 0, 0)),
                                     (31, (-0.6, 0, 0)), (37, (-0.9, 0, 0)), (43, (-0.6, 0, 0)), (49, (-0.9, 0, 0))]),
        "arm_r": ("rotation_euler", [(1, (-0.6, 0, 0)), (7, (-0.9, 0, 0)), (13, (-0.6, 0, 0)), (19, (-0.9, 0, 0)), (25, (-0.6, 0, 0)),
                                     (31, (-0.9, 0, 0)), (37, (-0.6, 0, 0)), (43, (-0.9, 0, 0)), (49, (-0.6, 0, 0))]),
    },
    "wave": {
        "head": ("rotation_euler", [(1, (0, 0, 0.1)), (25, (0, 0, 0.1)), (49, (0, 0, 0.1))]),
        "arm_r": ("rotation_euler", [(1, (0, 0, 2.0)), (7, (0, 0, 2.5)), (13, (0, 0, 2.0)), (19, (0, 0, 2.5)),
                                     (25, (0, 0, 2.0)), (31, (0, 0, 2.5)), (37, (0, 0, 2.0)), (43, (0, 0, 2.5)), (49, (0, 0, 2.0))]),
    },
}


def add_animations(armature):
    """Create looping actions idle, typing and wave, each on its own NLA track."""
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
