# Needs kit.py pasted first. Builds one reusable booth at the origin (front faces -Y in Blender,
# +Z in three.js). The page shows only the sign and props group of the booth's department.

DEPT_LABELS = {
    "planning": "PLANNING",
    "development": "DEVELOPMENT",
    "review": "CODE REVIEW",
    "qa": "QA / TESTING",
    "integration": "INTEGRATION",
}
SEAT_XS = (-1.0, 0.0, 1.0)
CREAM = (0.9, 0.86, 0.75)
CYAN = (0.2, 0.85, 1.0)


def _text(name, body, center, material):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = 0.17
    curve.extrude = 0.012
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    ob = bpy.data.objects.new(name, curve)
    ob.location = (center[0], center[1] - 0.04, center[2])
    ob.rotation_euler = (1.5708, 0, 0)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.data.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.data.materials.append(material)
    return ob


def _group(name, children):
    g = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(g)
    for c in children:
        c.parent = g
    return g


def build_booth():
    clear_prefix("Booth_", "Seat_", "Sign_", "Props_", "Desk")
    steel = mat("BoothSteel", STEEL, 0.45, 0.8)
    dark = mat("BoothDark", DARK_STEEL, 0.5, 0.7)
    trim = mat("BoothTrim", TRIM, 0.4, 0.6)
    amber = mat("BoothAmber", AMBER, 0.4, 0.0, emission=0.9)
    glass = mat("BoothGlass", (0.55, 0.8, 0.9), 0.05, 0.0, alpha=0.15)
    screen = mat("BoothScreen", (0.15, 0.55, 1.0), 0.3, 0.0, emission=2.0)
    cream = mat("BoothCream", CREAM, 0.6)
    code = mat("BoothCode", CYAN, 0.3, 0.0, emission=2.5)
    lamp = mat("BoothLamp", (1.0, 0.85, 0.6), 0.3, 0.0, emission=1.2)

    # shell of the booth
    box("Booth_Mat", (0, 0, 0.012), (3.1, 2.0, 0.024), dark)
    box("Booth_Back", (0, 1.1, 1.0), (3.3, 0.06, 2.0), dark)
    for i, x in enumerate((-1.65, 1.65)):
        box(f"Booth_Side{i}", (x, 0.0, 1.0), (0.06, 2.2, 2.0), dark)
        box(f"Booth_Post{i}", (x, -1.1, 1.0), (0.1, 0.1, 2.0), trim, bevel=0.015)
    box("Booth_Glass", (0, -1.1, 1.0), (3.2, 0.02, 1.95), glass)
    box("Booth_Beam", (0, -1.1, 2.15), (3.4, 0.14, 0.3), steel, bevel=0.02)
    box("Booth_AmberStrip", (0, -1.18, 1.98), (3.2, 0.02, 0.03), amber)
    box("Booth_Lamp", (0, 1.04, 1.93), (3.0, 0.05, 0.05), lamp)
    box("Booth_SignPlate", (0, -1.2, 2.15), (2.3, 0.06, 0.34), dark, bevel=0.01)

    # desk, three seats, three monitors
    desk = box("Desk", (0, -0.5, 0.28), (3.0, 0.6, 0.04), steel, bevel=0.01)
    for i, x in enumerate((-1.4, 1.4)):
        box(f"Booth_DeskLeg{i}", (x, -0.5, 0.13), (0.06, 0.6, 0.26), dark)
    for i, sx in enumerate(SEAT_XS):
        seat = bpy.data.objects.new(f"Seat_{i}", None)
        seat.location = (sx, 0.0, 0.0)
        seat.empty_display_type = "ARROWS"
        bpy.context.scene.collection.objects.link(seat)
        # laptop in front of each robot: keyboard near the robot, lid leaning back, screen facing the robot
        box(f"Booth_LaptopBase{i}", (sx, -0.4, 0.31), (0.4, 0.28, 0.02), dark, bevel=0.006)
        box(f"Booth_LaptopLid{i}", (sx, -0.54, 0.45), (0.4, 0.016, 0.26), dark, bevel=0.006, rot=(0.2, 0, 0))
        box(f"Booth_LaptopScreen{i}", (sx, -0.532, 0.451), (0.35, 0.005, 0.21), screen, rot=(0.2, 0, 0))
        box(f"Booth_LaptopLogo{i}", (sx, -0.56, 0.46), (0.05, 0.004, 0.05), amber, rot=(0.2, 0, 0))

    # one sign per department (the page shows one)
    for dept, label in DEPT_LABELS.items():
        _text(f"Sign_{dept}", label, (0, -1.2, 2.15), amber)

    # department props
    planning = [
        box("Booth_Plan_BoardFrame", (0, 1.05, 1.25), (1.7, 0.04, 1.0), trim, bevel=0.01),
        box("Booth_Plan_Board", (0, 1.025, 1.25), (1.6, 0.05, 0.9), cream),
        pipe("Booth_Plan_Roll", (-1.35, 0.9, 0.1), (-1.35, 0.9, 0.75), 0.08, cream),
        box("Booth_Plan_TableTop", (1.15, 0.75, 0.75), (0.9, 0.6, 0.04), steel, rot=(0.25, 0, 0)),
        box("Booth_Plan_TableLegL", (0.8, 0.75, 0.37), (0.05, 0.05, 0.74), dark),
        box("Booth_Plan_TableLegR", (1.5, 0.75, 0.37), (0.05, 0.05, 0.74), dark),
    ]
    for i in range(8):
        note = mat(f"BoothNote{i % 3}", [(1.0, 0.7, 0.2), (0.95, 0.9, 0.6), (1.0, 0.5, 0.25)][i % 3], 0.6)
        planning.append(box(f"Booth_Plan_Note{i}", (-0.55 + (i % 4) * 0.37, 1.0, 1.45 - (i // 4) * 0.4), (0.2, 0.05, 0.2), note))
    _group("Props_planning", planning)

    development = []
    for i, x in enumerate((-1.0, 0.0, 1.0)):
        development.append(box(f"Booth_Dev_Frame{i}", (x, 1.05, 1.35), (0.9, 0.05, 0.55), dark, bevel=0.01))
        development.append(box(f"Booth_Dev_Screen{i}", (x, 1.02, 1.35), (0.82, 0.055, 0.47), screen))
        for j in range(3):
            development.append(box(f"Booth_Dev_Code{i}{j}", (x - 0.1 + 0.08 * j, 1.0, 1.43 - j * 0.12), (0.4 - 0.08 * j, 0.06, 0.03), code))
    development.append(box("Booth_Dev_Tower", (1.4, 0.8, 0.45), (0.35, 0.5, 0.9), dark, bevel=0.015))
    development.append(box("Booth_Dev_Led", (1.4, 0.54, 0.7), (0.2, 0.02, 0.03), amber))
    _group("Props_development", development)

    review = [
        pipe("Booth_Rev_LensRing", (0, 1.07, 1.3), (0, 1.0, 1.3), 0.45, trim, 32),
        pipe("Booth_Rev_Lens", (0, 1.0, 1.3), (0, 0.97, 1.3), 0.37, code, 32),
        pipe("Booth_Rev_Handle", (0.32, 1.02, 0.98), (0.8, 1.02, 0.45), 0.05, dark),
        box("Booth_Rev_Checklist", (-1.2, 1.03, 1.2), (0.8, 0.05, 1.0), cream),
    ]
    for i in range(5):
        review.append(box(f"Booth_Rev_Check{i}", (-1.2, 1.0, 1.5 - i * 0.18), (0.55, 0.06, 0.05), amber))
    for i in range(4):
        review.append(box(f"Booth_Rev_Binder{i}", (1.3, 0.7, 0.05 + i * 0.08), (0.4 - i * 0.03, 0.3, 0.07), [steel, trim, dark, cream][i]))
    _group("Props_review", review)

    qa = [
        box("Booth_QA_ShelfLow", (0, 0.95, 0.9), (1.8, 0.3, 0.04), trim),
        box("Booth_QA_ShelfHigh", (0, 0.95, 1.5), (1.8, 0.3, 0.04), trim),
        box("Booth_QA_Rig", (-1.1, 0.6, 0.25), (0.9, 0.6, 0.5), dark, bevel=0.015),
        box("Booth_QA_RigScreen", (-1.1, 0.29, 0.35), (0.6, 0.02, 0.2), screen),
        box("Booth_QA_Board", (1.25, 1.03, 1.3), (0.7, 0.05, 0.9), cream),
    ]
    for i in range(5):
        qa.append(pipe(f"Booth_QA_Flask{i}", (-0.7 + i * 0.35, 0.95, 0.92), (-0.7 + i * 0.35, 0.95, 1.14), 0.06, glass))
        qa.append(pipe(f"Booth_QA_Liquid{i}", (-0.7 + i * 0.35, 0.95, 0.92), (-0.7 + i * 0.35, 0.95, 1.02), 0.055, code))
    _group("Props_qa", qa)

    integration = [
        pipe("Booth_Int_ReelA", (-1.2, 0.5, 0.35), (-1.2, 0.9, 0.35), 0.35, trim, 24),
        pipe("Booth_Int_ReelB", (-0.6, 0.5, 0.35), (-0.6, 0.9, 0.35), 0.35, trim, 24),
        pipe("Booth_Int_CoreA", (-1.2, 0.45, 0.35), (-1.2, 0.95, 0.35), 0.12, dark),
        pipe("Booth_Int_CoreB", (-0.6, 0.45, 0.35), (-0.6, 0.95, 0.35), 0.12, dark),
        box("Booth_Int_Belt", (0.9, 0.6, 0.3), (1.5, 0.6, 0.12), dark, bevel=0.01),
        box("Booth_Int_BeltEdge", (0.9, 0.29, 0.37), (1.5, 0.03, 0.04), amber),
        pipe("Booth_Int_PipeV", (1.5, 1.0, 0.0), (1.5, 1.0, 1.9), 0.08, trim),
        pipe("Booth_Int_PipeH", (0.3, 1.0, 1.7), (1.5, 1.0, 1.7), 0.08, trim),
    ]
    for i in range(3):
        integration.append(box(f"Booth_Int_Crate{i}", (0.5 + i * 0.5, 0.6, 0.5), (0.35, 0.35, 0.35), [steel, trim, dark][i], bevel=0.02))
    _group("Props_integration", integration)
    return desk
