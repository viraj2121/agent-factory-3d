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
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )


def export_shell():
    objs = [o for o in bpy.data.objects if o.name.startswith(("Shell_", "Anchor_"))]
    _export(OUT + "hall-shell.glb", objs)


def export_booth():
    prefixes = ("Booth_", "Seat_", "Sign_", "Props_", "Desk")
    objs = [o for o in bpy.data.objects if o.name.startswith(prefixes)]
    for o in objs:
        o.hide_set(False)
        o.hide_render = False
    _export(OUT + "booth.glb", objs)
