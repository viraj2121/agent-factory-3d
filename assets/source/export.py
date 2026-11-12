import bpy

OUT = "C:/path/to/agent-factory-3d/assets/models/"


def _export(path, objects):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


def export_all():
    rig = bpy.data.objects["RobotA"]
    for t in rig.animation_data.nla_tracks:
        t.mute = False
    saved = rig.location.copy()
    rig.location = (0, 0, 0)
    robot_parts = [rig] + [o for o in bpy.data.objects if o.parent == rig]
    _export(OUT + "robot.glb", robot_parts)
    rig.location = saved
    for t in rig.animation_data.nla_tracks:
        t.mute = t.name != "typing"

    booth = [o for o in bpy.data.objects if o.name.startswith(("Hall_", "Booth_")) and o.type == "MESH"]
    _export(OUT + "look-test.glb", booth)
