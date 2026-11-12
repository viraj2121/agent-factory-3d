import bpy
import bmesh
from mathutils import Vector

# Self-contained: builds one open department bay at the origin and exports bay.glb.
# The bay's front faces -Y in Blender (+Z in three.js); the page turns it to face the core.
# No glass and no side walls. A back partition carries the sign, with finished rear detail,
# because the orbiting camera sees the back of the bays.

OUT = "C:/path/to/agent-factory-3d/assets/models/"
STEEL = (0.30, 0.32, 0.35)
DARK_STEEL = (0.10, 0.11, 0.13)
AMBER = (1.0, 0.52, 0.08)
TRIM = (0.75, 0.38, 0.06)
CREAM = (0.9, 0.86, 0.75)
CYAN = (0.2, 0.85, 1.0)
LABELS = {
    "planning": "PLANNING",
    "development": "DEVELOPMENT",
    "review": "CODE REVIEW",
    "qa": "QA / TESTING",
    "integration": "INTEGRATION",
}
# layout seats (three.js) -> Blender (x, -z, y); copied from hubLayout.ts
SEATS = [(-1.1, 0.12, 0.0), (0.0, 0.0, 0.0), (1.1, 0.12, 0.0)]


def mat(name, color, rough=0.5, metal=0.0, emission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = emission
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


def blob(name, center, radii, material):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return link(name, me, material)


def disc(name, center, radius, height, material, segments=20):
    return pipe(name, (center[0], center[1], center[2] - height / 2), (center[0], center[1], center[2] + height / 2), radius, material, segments)


def torus(name, center, major, minor, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=20, minor_segments=8,
                                     location=center, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(material)
    return ob


def clear_prefix(*prefixes):
    obs = [o for o in bpy.data.objects if o.name.startswith(prefixes)]
    data_names = {o.data.name for o in obs if o.data is not None}
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves):
        for n in data_names:
            d = coll.get(n)
            if d is not None and d.users == 0:
                coll.remove(d)


def text(name, body, center, rot, material):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = 0.17
    curve.extrude = 0.012
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    ob = bpy.data.objects.new(name, curve)
    ob.location = center
    ob.rotation_euler = rot
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.data.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.data.materials.append(material)
    return ob


def group(name, children):
    g = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(g)
    for c in children:
        c.parent = g
    return g


def build_bay():
    clear_prefix("Bay_", "Seat_", "Sign_", "SignBack_", "Props_", "Desk")
    steel = mat("BaySteel", STEEL, 0.45, 0.8)
    dark = mat("BayDark", DARK_STEEL, 0.5, 0.7)
    trim = mat("BayTrim", TRIM, 0.4, 0.6)
    amber = mat("BayAmber", AMBER, 0.4, 0.0, emission=0.9)
    screen = mat("BayScreen", (0.15, 0.55, 1.0), 0.3, 0.0, emission=2.0)
    cream = mat("BayCream", CREAM, 0.6)
    code = mat("BayCode", CYAN, 0.3, 0.0, emission=2.5)
    lamp = mat("BayLamp", (1.0, 0.85, 0.6), 0.3, 0.0, emission=1.2)
    glass = mat("BayLens", (0.55, 0.8, 0.9), 0.05, 0.0)

    # floor pad with a glowing edge, back partition, sign on top (front and back)
    box("Bay_Pad", (0, 0, 0.02), (3.4, 2.4, 0.04), dark, bevel=0.01)
    for i, y in enumerate((-1.2, 1.2)):
        box(f"Bay_PadEdge{i}", (0, y, 0.045), (3.4, 0.04, 0.012), amber)
    for i, x in enumerate((-1.7, 1.7)):
        box(f"Bay_PadSide{i}", (x, 0, 0.045), (0.04, 2.4, 0.012), amber)
    box("Bay_Partition", (0, 1.1, 1.0), (3.3, 0.08, 2.0), dark, bevel=0.01)
    box("Bay_PartitionTrim", (0, 1.1, 2.0), (3.34, 0.12, 0.05), trim)
    box("Bay_Lamp", (0, 1.03, 1.93), (3.0, 0.05, 0.05), lamp)
    box("Bay_SignPlate", (0, 1.1, 2.3), (2.3, 0.12, 0.34), dark, bevel=0.01)
    for dept, label in LABELS.items():
        text(f"Sign_{dept}", label, (0, 1.03, 2.3), (1.5708, 0, 0), amber)
        text(f"SignBack_{dept}", label, (0, 1.17, 2.3), (1.5708, 0, 3.1416), amber)

    # rear detail: vent slats, an amber trim line and a cable run
    for i in range(7):
        box(f"Bay_Vent{i}", (-1.2 + i * 0.4, 1.17, 0.5), (0.3, 0.02, 0.5), steel)
    box("Bay_RearTrim", (0, 1.17, 1.7), (3.2, 0.02, 0.04), amber)
    pipe("Bay_Cable", (-1.6, 1.2, 1.2), (1.6, 1.2, 1.2), 0.04, trim)
    pipe("Bay_CableDrop", (1.0, 1.2, 1.2), (1.0, 1.2, 0.05), 0.04, trim)

    # desk, seats, laptops (laptops follow each seat)
    box("Desk", (0, -0.5, 0.28), (3.2, 0.6, 0.04), steel, bevel=0.01)
    for i, x in enumerate((-1.5, 1.5)):
        box(f"Bay_DeskLeg{i}", (x, -0.5, 0.13), (0.06, 0.6, 0.26), dark)
    for i, (sx, sy, _sz) in enumerate(SEATS):
        seat = bpy.data.objects.new(f"Seat_{i}", None)
        seat.location = (sx, sy, 0.0)
        seat.empty_display_type = "ARROWS"
        bpy.context.scene.collection.objects.link(seat)
        box(f"Bay_LaptopBase{i}", (sx, -0.4 + sy, 0.31), (0.4, 0.28, 0.02), dark, bevel=0.006)
        box(f"Bay_LaptopLid{i}", (sx, -0.54 + sy, 0.45), (0.4, 0.016, 0.26), dark, bevel=0.006, rot=(0.2, 0, 0))
        box(f"Bay_LaptopScreen{i}", (sx, -0.532 + sy, 0.451), (0.35, 0.005, 0.21), screen, rot=(0.2, 0, 0))
        box(f"Bay_LaptopLogo{i}", (sx, -0.56 + sy, 0.46), (0.05, 0.004, 0.05), amber, rot=(0.2, 0, 0))


    # ---- small things -------------------------------------------------------------------------
    mug = mat("BayMug", (0.92, 0.9, 0.84), 0.35)
    leaf = mat("BayLeaf", (0.38, 0.44, 0.22), 0.6)   # dusty olive, not status green
    soil = mat("BaySoil", (0.16, 0.11, 0.08), 0.9)
    paper = mat("BayPaper", (0.95, 0.94, 0.9), 0.7)
    tab = mat("BayTab", (0.85, 0.25, 0.2), 0.5)
    duck = mat("BayDuck", (1.0, 0.82, 0.15), 0.4)
    ledc = mat("BayLedCyan", CYAN, 0.3, 0.0, emission=3.0)
    leda = mat("BayLedAmber", AMBER, 0.3, 0.0, emission=3.0)
    plastic = mat("BayPlastic", (0.2, 0.22, 0.26), 0.4)

    # chairs behind each robot: back rest, pole and a round wheel base
    for i, (sx, sy, _sz) in enumerate(SEATS):
        box(f"Bay_ChairBack{i}", (sx, sy + 0.38, 0.62), (0.46, 0.07, 0.46), plastic, bevel=0.025)
        pipe(f"Bay_ChairPole{i}", (sx, sy + 0.38, 0.1), (sx, sy + 0.38, 0.4), 0.025, dark)
        disc(f"Bay_ChairBase{i}", (sx, sy + 0.38, 0.05), 0.2, 0.04, trim)

    # cables from each laptop's side of the desk down to a power strip with status LEDs
    pipe("Bay_CableRun", (-1.1, -0.72, 0.035), (1.55, -0.72, 0.035), 0.016, dark)
    for i, (sx, _sy, _sz) in enumerate(SEATS):
        pipe(f"Bay_CableDrop{i}", (sx, -0.72, 0.27), (sx, -0.72, 0.035), 0.014, dark)
    box("Bay_PowerStrip", (1.55, -0.72, 0.03), (0.34, 0.1, 0.05), dark, bevel=0.01)
    for i in range(4):
        box(f"Bay_StripLed{i}", (1.43 + i * 0.08, -0.75, 0.058), (0.025, 0.012, 0.012), ledc if i % 2 == 0 else leda)

    # desk clutter shared by every department
    disc("Bay_Mug0", (-0.72, -0.5, 0.345), 0.045, 0.09, mug)
    torus("Bay_MugHandle0", (-0.675, -0.5, 0.345), 0.028, 0.008, mug, rot=(1.5708, 0, 0))
    blob("Bay_Mouse0", (-0.8, -0.3, 0.315), (0.035, 0.05, 0.02), plastic)
    disc("Bay_PlantPot", (0.42, -0.62, 0.34), 0.07, 0.08, trim)
    blob("Bay_PlantSoil", (0.42, -0.62, 0.385), (0.06, 0.06, 0.012), soil)
    for k, (dx, dy, dz) in enumerate(((0, 0, 0.1), (0.05, 0.02, 0.07), (-0.05, -0.02, 0.08), (0.02, -0.05, 0.06))):
        blob(f"Bay_PlantLeaf{k}", (0.42 + dx, -0.62 + dy, 0.4 + dz), (0.045, 0.02, 0.07), leaf)
    for k in range(3):
        box(f"Bay_Sticky{k}", (-0.4, -0.62 - k * 0.0, 0.32 + k * 0.012), (0.08, 0.08, 0.012), amber, rot=(0, 0, 0.1 * k))
    disc("Bay_LampBase", (1.52, -0.45, 0.31), 0.07, 0.02, dark)
    pipe("Bay_LampArm", (1.52, -0.45, 0.32), (1.45, -0.5, 0.55), 0.012, dark)
    disc("Bay_LampShade", (1.43, -0.52, 0.55), 0.05, 0.05, lamp)
    for k in range(3):
        pipe(f"Bay_Pen{k}", (0.78 + k * 0.025, -0.66, 0.31), (0.78 + k * 0.025, -0.58 - k * 0.02, 0.33), 0.006, [tab, amber, dark][k])
    torus("Bay_HeadsetBand", (-1.52, -0.55, 0.38), 0.055, 0.01, dark)
    disc("Bay_HeadsetCupL", (-1.57, -0.55, 0.33), 0.03, 0.025, trim)
    disc("Bay_HeadsetCupR", (-1.47, -0.55, 0.33), 0.03, 0.025, trim)

    planning = [
        box("Bay_Plan_BoardFrame", (0, 1.05, 1.25), (1.7, 0.04, 1.0), trim, bevel=0.01),
        box("Bay_Plan_Board", (0, 1.025, 1.25), (1.6, 0.05, 0.9), cream),
        pipe("Bay_Plan_Roll", (-1.35, 0.9, 0.1), (-1.35, 0.9, 0.75), 0.08, cream),
        box("Bay_Plan_TableTop", (1.15, 0.75, 0.75), (0.9, 0.6, 0.04), steel, rot=(0.25, 0, 0)),
        box("Bay_Plan_TableLegL", (0.8, 0.75, 0.37), (0.05, 0.05, 0.74), dark),
        box("Bay_Plan_TableLegR", (1.5, 0.75, 0.37), (0.05, 0.05, 0.74), dark),
    ]
    for i in range(8):
        note = mat(f"BayNote{i % 3}", [(1.0, 0.7, 0.2), (0.95, 0.9, 0.6), (1.0, 0.5, 0.25)][i % 3], 0.6)
        planning.append(box(f"Bay_Plan_Note{i}", (-0.55 + (i % 4) * 0.37, 1.0, 1.45 - (i // 4) * 0.4), (0.2, 0.05, 0.2), note))
    planning.append(box("Bay_Plan_EaselBoard", (1.3, -0.5, 0.5), (0.5, 0.03, 0.34), cream, rot=(0.25, 0, 0)))
    planning.append(box("Bay_Plan_EaselFrame", (1.3, -0.52, 0.5), (0.54, 0.02, 0.38), trim, rot=(0.25, 0, 0)))
    planning.append(pipe("Bay_Plan_MapRoll", (-0.55, -0.38, 0.33), (-0.1, -0.38, 0.33), 0.03, cream))
    group("Props_planning", planning)

    development = []
    for i, x in enumerate((-1.0, 0.0, 1.0)):
        development.append(box(f"Bay_Dev_Frame{i}", (x, 1.05, 1.35), (0.9, 0.05, 0.55), dark, bevel=0.01))
        development.append(box(f"Bay_Dev_Screen{i}", (x, 1.02, 1.35), (0.82, 0.055, 0.47), screen))
        for j in range(3):
            development.append(box(f"Bay_Dev_Code{i}{j}", (x - 0.1 + 0.08 * j, 1.0, 1.43 - j * 0.12), (0.4 - 0.08 * j, 0.06, 0.03), code))
    development.append(box("Bay_Dev_Tower", (1.4, 0.8, 0.45), (0.35, 0.5, 0.9), dark, bevel=0.015))
    development.append(box("Bay_Dev_Led", (1.4, 0.54, 0.7), (0.2, 0.02, 0.03), amber))
    development.append(box("Bay_Dev_Keyboard", (0.0, -0.3, 0.315), (0.4, 0.12, 0.02), dark, bevel=0.006))
    development.append(box("Bay_Dev_KeyGlow", (0.0, -0.3, 0.327), (0.36, 0.01, 0.004), ledc))
    development.append(blob("Bay_Dev_DuckBody", (0.55, -0.4, 0.335), (0.04, 0.05, 0.035), duck))
    development.append(blob("Bay_Dev_DuckHead", (0.55, -0.43, 0.38), (0.028, 0.028, 0.028), duck))
    development.append(box("Bay_Dev_DuckBeak", (0.55, -0.465, 0.375), (0.02, 0.025, 0.01), amber))
    group("Props_development", development)

    review = [
        pipe("Bay_Rev_LensRing", (0, 1.07, 1.3), (0, 1.0, 1.3), 0.45, trim, 32),
        pipe("Bay_Rev_Lens", (0, 1.0, 1.3), (0, 0.97, 1.3), 0.37, code, 32),
        pipe("Bay_Rev_Handle", (0.32, 1.02, 0.98), (0.8, 1.02, 0.45), 0.05, dark),
        box("Bay_Rev_Checklist", (-1.2, 1.03, 1.2), (0.8, 0.05, 1.0), cream),
    ]
    for i in range(5):
        review.append(box(f"Bay_Rev_Check{i}", (-1.2, 1.0, 1.5 - i * 0.18), (0.55, 0.06, 0.05), amber))
    for i in range(4):
        review.append(box(f"Bay_Rev_Binder{i}", (1.3, 0.7, 0.05 + i * 0.08), (0.4 - i * 0.03, 0.3, 0.07), [steel, trim, dark, cream][i]))
    for k in range(4):
        review.append(box(f"Bay_Rev_Paper{k}", (-0.45, -0.42, 0.315 + k * 0.012), (0.2, 0.28, 0.01), paper, rot=(0, 0, 0.05 * k)))
    review.append(box("Bay_Rev_Tab", (-0.35, -0.3, 0.34), (0.03, 0.05, 0.012), tab))
    review.append(torus("Bay_Rev_HandLens", (0.5, -0.4, 0.33), 0.06, 0.008, trim))
    review.append(pipe("Bay_Rev_HandLensGrip", (0.56, -0.4, 0.33), (0.64, -0.4, 0.33), 0.012, dark))
    group("Props_review", review)

    qa = [
        box("Bay_QA_ShelfLow", (0, 0.95, 0.9), (1.8, 0.3, 0.04), trim),
        box("Bay_QA_ShelfHigh", (0, 0.95, 1.5), (1.8, 0.3, 0.04), trim),
        box("Bay_QA_Rig", (-1.1, 0.6, 0.25), (0.9, 0.6, 0.5), dark, bevel=0.015),
        box("Bay_QA_RigScreen", (-1.1, 0.29, 0.35), (0.6, 0.02, 0.2), screen),
        box("Bay_QA_Board", (1.25, 1.03, 1.3), (0.7, 0.05, 0.9), cream),
    ]
    for i in range(5):
        qa.append(pipe(f"Bay_QA_Flask{i}", (-0.7 + i * 0.35, 0.95, 0.92), (-0.7 + i * 0.35, 0.95, 1.14), 0.06, glass))
        qa.append(pipe(f"Bay_QA_Liquid{i}", (-0.7 + i * 0.35, 0.95, 0.92), (-0.7 + i * 0.35, 0.95, 1.02), 0.055, code))
    qa.append(box("Bay_QA_Panel", (-0.5, -0.4, 0.33), (0.3, 0.2, 0.04), dark, bevel=0.01))
    for k in range(6):
        qa.append(disc(f"Bay_QA_Button{k}", (-0.6 + (k % 3) * 0.1, -0.44 + (k // 3) * 0.08, 0.36), 0.018, 0.012, ledc if k % 2 == 0 else leda))
    qa.append(disc("Bay_QA_Jar", (0.55, -0.4, 0.35), 0.05, 0.1, glass))
    qa.append(blob("Bay_QA_Bug", (0.55, -0.4, 0.33), (0.025, 0.018, 0.015), dark))
    group("Props_qa", qa)

    integration = [
        pipe("Bay_Int_ReelA", (-1.2, 0.5, 0.35), (-1.2, 0.9, 0.35), 0.35, trim, 24),
        pipe("Bay_Int_ReelB", (-0.6, 0.5, 0.35), (-0.6, 0.9, 0.35), 0.35, trim, 24),
        pipe("Bay_Int_CoreA", (-1.2, 0.45, 0.35), (-1.2, 0.95, 0.35), 0.12, dark),
        pipe("Bay_Int_CoreB", (-0.6, 0.45, 0.35), (-0.6, 0.95, 0.35), 0.12, dark),
        box("Bay_Int_Belt", (0.9, 0.6, 0.3), (1.5, 0.6, 0.12), dark, bevel=0.01),
        box("Bay_Int_BeltEdge", (0.9, 0.29, 0.37), (1.5, 0.03, 0.04), amber),
        pipe("Bay_Int_PipeV", (1.5, 1.0, 0.0), (1.5, 1.0, 1.9), 0.08, trim),
        pipe("Bay_Int_PipeH", (0.3, 1.0, 1.7), (1.5, 1.0, 1.7), 0.08, trim),
    ]
    for i in range(3):
        integration.append(box(f"Bay_Int_Crate{i}", (0.5 + i * 0.5, 0.6, 0.5), (0.35, 0.35, 0.35), [steel, trim, dark][i], bevel=0.02))
    integration.append(box("Bay_Int_Toolbox", (-0.5, -0.45, 0.36), (0.3, 0.14, 0.12), trim, bevel=0.012))
    integration.append(box("Bay_Int_ToolboxLid", (-0.5, -0.45, 0.43), (0.31, 0.15, 0.02), dark, bevel=0.008))
    integration.append(torus("Bay_Int_CoilA", (0.5, -0.4, 0.33), 0.07, 0.014, dark))
    integration.append(torus("Bay_Int_CoilB", (0.5, -0.4, 0.35), 0.06, 0.014, trim))
    group("Props_integration", integration)


def join_group(objs, name):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def merge_by_material(meshes, prefix):
    """Join meshes that share a material, so the page draws a few meshes instead of hundreds."""
    buckets = {}
    for o in meshes:
        buckets.setdefault(o.data.materials[0].name if o.data.materials else "none", []).append(o)
    for key, objs in buckets.items():
        if len(objs) > 1:
            join_group(objs, f"{prefix}_Merged_{key}")


def merge_bay():
    keep = ("Desk", "Bay_Partition")
    all_objs = [o for o in bpy.data.objects if o.name.startswith(("Bay_", "Seat_", "Sign_", "SignBack_", "Props_", "Desk"))]
    common = [o for o in all_objs if o.type == "MESH" and o.parent is None and o.name not in keep
              and not o.name.startswith(("Sign_", "SignBack_"))]
    merge_by_material(common, "Bay")
    for grp in [o for o in bpy.data.objects if o.name.startswith("Props_") and o.type == "EMPTY"]:
        merge_by_material([c for c in grp.children if c.type == "MESH"], grp.name)


def export_selected(path, objects):
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_animations=False,
        export_cameras=False, export_lights=False, export_yup=True,
    )


for o in bpy.data.objects:
    if o.name.startswith(("Shell_", "Anchor_", "Booth_")):
        o.hide_set(True)
        o.hide_render = True
build_bay()
merge_bay()
objs = [o for o in bpy.data.objects if o.name.startswith(("Bay_", "Seat_", "Sign_", "SignBack_", "Props_", "Desk"))]
for o in objs:
    o.hide_set(False)
    o.hide_render = False
export_selected(OUT + "bay.glb", objs)
print("bay exported", len(objs), "objects")
