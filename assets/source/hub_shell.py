import bpy
import bmesh
import math
from mathutils import Vector

# Wear: steel, dark and trim materials multiply fine grime and broad mottling (object-space noise)
# into the base colour; the bake captures it. The bake runs at 4096 px and takes several minutes.
# Self-contained: builds the round hub shell, bakes soft sky occlusion into its colour texture,
# and exports hub-shell.glb. Layout numbers are copied from apps/dashboard/src/hubLayout.ts.
# Walls and the ceiling are single-sided (normals inward / downward), so the orbiting camera sees
# in from outside and from above. Every material has backface culling on for the same reason.

OUT = "C:/path/to/agent-factory-3d/assets/models/"
R = 15.0          # room radius
H = 9.0           # wall height
DECK_R = 3.2
DECK_H = 0.4
OCULUS = 2.6
CORE = (0.0, 1.8, 0.0)
BAYS = {
    "planning": (0.0, 0.0, -9.0),
    "development": (8.5595, 0.0, -2.7812),
    "review": (-8.5595, 0.0, -2.7812),
    "qa": (-5.2901, 0.0, 7.2812),
    "integration": (5.2901, 0.0, 7.2812),
}
STEEL = (0.30, 0.32, 0.35)
DARK = (0.10, 0.11, 0.13)
AMBER = (1.0, 0.52, 0.08)
TRIM = (0.75, 0.38, 0.06)


def to_blender(x, y, z):
    return (x, -z, y)


def add_wear(m, grime_scale, grime_strength):
    """Multiply fine grime and broad mottling into the base colour (object coordinates, no UVs needed)."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = grime_scale
    fine.inputs["Detail"].default_value = 10.0
    broad = nt.nodes.new("ShaderNodeTexNoise")
    broad.inputs["Scale"].default_value = 2.2
    broad.inputs["Detail"].default_value = 4.0
    nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], broad.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.45, 0.45, 0.45, 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(fine.outputs["Fac"], ramp.inputs["Fac"])
    ramp2 = nt.nodes.new("ShaderNodeValToRGB")
    ramp2.color_ramp.elements[0].position = 0.3
    ramp2.color_ramp.elements[0].color = (0.7, 0.7, 0.7, 1.0)
    ramp2.color_ramp.elements[1].position = 0.7
    ramp2.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    nt.links.new(broad.outputs["Fac"], ramp2.inputs["Fac"])
    mix1 = nt.nodes.new("ShaderNodeMix")
    mix1.data_type = "RGBA"
    mix1.blend_type = "MULTIPLY"
    mix1.inputs[0].default_value = grime_strength
    mix1.inputs[6].default_value = tuple(b.inputs["Base Color"].default_value)
    nt.links.new(ramp.outputs["Color"], mix1.inputs[7])
    mix2 = nt.nodes.new("ShaderNodeMix")
    mix2.data_type = "RGBA"
    mix2.blend_type = "MULTIPLY"
    mix2.inputs[0].default_value = 0.8
    nt.links.new(mix1.outputs[2], mix2.inputs[6])
    nt.links.new(ramp2.outputs["Color"], mix2.inputs[7])
    nt.links.new(mix2.outputs[2], b.inputs["Base Color"])


def mat(name, color, rough=0.5, metal=0.0, emission=0.0, wear=0.0):
    m = bpy.data.materials.get(name)
    if m is not None:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = emission
    if wear:
        add_wear(m, 28.0, wear)
    m.use_backface_culling = True
    return m


def put(name, bm, material, loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    bpy.context.scene.collection.objects.link(ob)
    return ob


def cyl(name, radius, height, center, material, segments=64, cap=True, inward=False):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=segments, radius1=radius, radius2=radius, depth=height)
    if inward:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    return put(name, bm, material, loc=center)


def box(name, center, size, material, rot=(0, 0, 0), open_top=False, open_out=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if open_top or open_out:
        bm.faces.ensure_lookup_table()
        gone = [f for f in bm.faces if (open_top and f.normal.z > 0.5) or (open_out and f.normal.x > 0.5)]
        bmesh.ops.delete(bm, geom=gone, context="FACES")
    return put(name, bm, material, loc=center, rot=rot)


def quad(name, center, width, height, facing, material):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * width, v.co.y * height, 0.0))
    rot = Vector(facing).to_track_quat("Z", "Y").to_euler()
    return put(name, bm, material, loc=center, rot=rot)


def ring(name, major, minor, z, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=96, minor_segments=8,
                                     location=(0, 0, z))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(material)
    return ob


def clear_prefix(*prefixes):
    for ob in [o for o in bpy.data.objects if o.name.startswith(prefixes)]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data is not None and data.users == 0 and data.name in bpy.data.meshes:
            bpy.data.meshes.remove(data)


def build_hub_shell():
    clear_prefix("Shell_", "Anchor_")
    steel = mat("HubSteel", STEEL, 0.45, 0.8, wear=0.9)
    dark = mat("HubDark", DARK, 0.5, 0.7, wear=0.7)
    trim = mat("HubTrim", TRIM, 0.4, 0.6, wear=0.8)
    amber = mat("HubAmber", AMBER, 0.4, 0.0, emission=0.9)
    window = mat("HubWindow", (1.0, 0.75, 0.4), 0.3, 0.0, emission=0.35)

    # floor, raised deck with a step ring, wall ring facing inward
    cyl("Shell_Floor", R, 0.2, (0, 0, -0.1), steel)
    cyl("Shell_DeckStep", DECK_R + 0.5, 0.2, (0, 0, 0.1), dark, segments=48)
    cyl("Shell_Deck", DECK_R, DECK_H, (0, 0, DECK_H / 2), steel, segments=48)
    cyl("Shell_Wall", R + 0.05, H, (0, 0, H / 2), dark, cap=False, inward=True)

    # ceiling: 24 radial beams open on top (invisible from above), plus a ring around the oculus
    for k in range(24):
        a = k * (2 * math.pi / 24)
        mid = (R + OCULUS) / 2
        box(f"Shell_Beam{k}", (mid * math.cos(a), mid * math.sin(a), H - 0.15), (R - OCULUS, 1.4, 0.3), dark,
            rot=(0, 0, a), open_top=True)
    ring("Shell_OculusRing", OCULUS + 0.2, 0.14, H - 0.1, trim)

    # columns, pipe rings, high windows
    # pilasters: one inward-facing strip each, so nothing sticks out when seen from outside the room
    for k in range(8):
        a = math.radians(k * 45 + 22.5)
        c = (math.cos(a), math.sin(a), 0.0)
        quad(f"Shell_Column{k}", ((R - 0.1) * c[0], (R - 0.1) * c[1], H / 2), 0.8, H, (-c[0], -c[1], 0.0), steel)
        quad(f"Shell_ColumnInset{k}", ((R - 0.13) * c[0], (R - 0.13) * c[1], H / 2), 0.4, H, (-c[0], -c[1], 0.0), dark)
    # pipe bands: thin inward-facing strips, also invisible from outside
    for i, z in enumerate((3.0, 3.5, 6.2)):
        cyl(f"Shell_Pipe{i}", R - 0.2, 0.24, (0, 0, z), trim, segments=96, cap=False, inward=True)
    for k in range(16):
        a = math.radians(k * 22.5)
        c = (math.cos(a), math.sin(a), 0.0)
        inward = (-c[0], -c[1], 0.0)
        quad(f"Shell_WindowFrame{k}", ((R - 0.03) * c[0], (R - 0.03) * c[1], 6.9), 2.5, 1.7, inward, dark)
        quad(f"Shell_Window{k}", ((R - 0.06) * c[0], (R - 0.06) * c[1], 6.9), 2.3, 1.5, inward, window)

    # glowing floor rings and the deck edge
    ring("Shell_FloorRingA", 6.0, 0.04, 0.02, amber)
    ring("Shell_FloorRingB", 12.3, 0.04, 0.02, amber)
    ring("Shell_DeckEdge", DECK_R + 0.05, 0.035, DECK_H + 0.01, amber)

    for dept, pos in BAYS.items():
        ob = bpy.data.objects.new(f"Anchor_{dept}", None)
        ob.location = to_blender(*pos)
        ob.empty_display_type = "ARROWS"
        bpy.context.scene.collection.objects.link(ob)
    core = bpy.data.objects.new("Anchor_core", None)
    core.location = to_blender(*CORE)
    core.empty_display_type = "SPHERE"
    bpy.context.scene.collection.objects.link(core)


def join(objs, name):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def bake_hub_shell(size=4096, samples=24):
    sc = bpy.context.scene
    objs = [o for o in bpy.data.objects if o.name.startswith("Shell_") and o.type == "MESH"]
    glow = [o for o in objs if o.data.materials and o.data.materials[0].name == "HubAmber"]
    windows = [o for o in objs if o.data.materials and o.data.materials[0].name == "HubWindow"]
    solid = [o for o in objs if o not in glow and o not in windows]
    if glow:
        join(glow, "Shell_Glow")
    if windows:
        join(windows, "Shell_Windows")
    baked = join(solid, "Shell_Baked")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")

    img = bpy.data.images.get("HubBake")
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new("HubBake", size, size)
    for m in [m for m in baked.data.materials if m]:
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Metallic"].default_value = 0.0

    lights = [o for o in bpy.data.objects if o.type == "LIGHT"]
    hidden = [(o, o.hide_render) for o in lights]
    for o in lights:
        o.hide_render = True
    bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
    prev_color = tuple(bg.inputs["Color"].default_value)
    prev_strength = bg.inputs["Strength"].default_value
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 2.0  # the ceiling shades the room, so light it more
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
    final = bpy.data.materials.get("HubBaked") or bpy.data.materials.new("HubBaked")
    final.use_nodes = True
    nt = final.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.5
    bsdf.inputs["Roughness"].default_value = 0.5
    final.use_backface_culling = True
    baked.data.materials.clear()
    baked.data.materials.append(final)
    px = list(img.pixels)
    return round(sum(px[0::4]) / (len(px) / 4), 4)


def export_selected(path, objects):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_animations=False,
        export_cameras=False, export_lights=False, export_yup=True,
        export_image_format="JPEG", export_jpeg_quality=88,
    )


for o in bpy.data.objects:
    if o.name.startswith(("Booth_", "Seat_", "Sign_", "Props_", "Desk", "Bot", "Bay_")):
        o.hide_set(True)
        o.hide_render = True
build_hub_shell()
print("mean red of baked texture:", bake_hub_shell())
export_selected(OUT + "hub-shell.glb", [o for o in bpy.data.objects if o.name.startswith(("Shell_", "Anchor_"))])
print("hub shell exported")
