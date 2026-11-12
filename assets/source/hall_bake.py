import bpy

# Needs the Shell_ objects from hall_shell.build_shell() in the scene.
# Joins the solid shell into one mesh, bakes soft sky-light occlusion into its colour texture
# (glTF has no lightmap slot), and leaves emissive parts as their own objects.

EMISSIVE = ("ShellAmber", "ShellWindow")


def _join(objs, name):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def bake_shell(size=2048, samples=24):
    sc = bpy.context.scene
    objs = [o for o in bpy.data.objects if o.name.startswith("Shell_") and o.type == "MESH"]
    glow = [o for o in objs if o.data.materials and o.data.materials[0].name == "ShellAmber"]
    windows = [o for o in objs if o.data.materials and o.data.materials[0].name == "ShellWindow"]
    solid = [o for o in objs if o not in glow and o not in windows]

    if glow:
        _join(glow, "Shell_Glow")
    if windows:
        _join(windows, "Shell_Windows")
    baked = _join(solid, "Shell_Baked")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.get("ShellBake")
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new("ShellBake", size, size)
    mats = [m for m in baked.data.materials if m]
    for m in mats:
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Metallic"].default_value = 0.0

    lights = [o for o in bpy.data.objects if o.type == "LIGHT"]
    hidden = [(o, o.hide_render) for o in lights]
    for o in lights:
        o.hide_render = True
    world = sc.world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    prev_color = tuple(bg.inputs["Color"].default_value)
    prev_strength = bg.inputs["Strength"].default_value
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    prev_engine = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples

    for o in bpy.data.objects:
        o.select_set(False)
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT", "COLOR"}, margin=8)

    sc.render.engine = prev_engine
    bg.inputs["Color"].default_value = prev_color
    bg.inputs["Strength"].default_value = prev_strength
    for o, h in hidden:
        o.hide_render = h

    img.pack()
    final = bpy.data.materials.get("ShellBaked") or bpy.data.materials.new("ShellBaked")
    final.use_nodes = True
    nt = final.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.5
    bsdf.inputs["Roughness"].default_value = 0.55
    baked.data.materials.clear()
    baked.data.materials.append(final)

    px = list(img.pixels)
    return round(sum(px[0::4]) / (len(px) / 4), 4)
