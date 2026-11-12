# Needs kit.py pasted first. Builds the fixed hall: floors, walls, columns, pipes, stairs,
# upper platform, trusses and windows, plus an Anchor_<department> empty per booth.

# Booth positions copied from apps/dashboard/src/hallLayout.ts (three.js space, y up).
BOOTH_POSITIONS = {
    "planning": (-2.2, 3.2, -1.2),
    "development": (2.2, 3.2, -1.2),
    "review": (-2.2, 0.0, 1.0),
    "qa": (2.2, 0.0, 1.0),
    "integration": (7.0, 0.0, 0.0),
}


def build_shell():
    clear_prefix("Shell_", "Anchor_")
    steel = mat("ShellSteel", STEEL, 0.45, 0.8)
    dark = mat("ShellDark", DARK_STEEL, 0.5, 0.7)
    trim = mat("ShellTrim", TRIM, 0.4, 0.6)
    amber = mat("ShellAmber", AMBER, 0.4, 0.0, emission=0.9)
    window = mat("ShellWindow", (1.0, 0.75, 0.4), 0.3, 0.0, emission=0.35)

    # lower floor, back wall, side walls
    box("Shell_Floor", (0, -0.5, -0.1), (26, 12, 0.2), steel, bevel=0.01)
    box("Shell_Wall", (0, 5.0, 5.0), (26, 0.3, 10), dark)
    for i, x in enumerate((-13, 13)):
        box(f"Shell_SideWall{i}", (x, -0.5, 5.0), (0.3, 12, 10), dark)
    for i, y in enumerate((-3.0, -3.35)):
        box(f"Shell_FloorLine{i}", (0, y, 0.005), (22, 0.08, 0.012), amber)

    # upper platform with a front rail
    box("Shell_Platform", (-0.7, 0.8, 3.1), (10.2, 3.4, 0.2), steel, bevel=0.01)
    box("Shell_PlatformEdge", (-0.7, -0.92, 3.1), (10.2, 0.04, 0.26), trim)
    for i in range(11):
        box(f"Shell_RailPost{i}", (-5.8 + i * 1.02, -0.9, 3.45), (0.06, 0.06, 0.5), trim)
    box("Shell_RailTop", (-0.7, -0.9, 3.7), (10.2, 0.07, 0.07), trim)
    for i, x in enumerate((-5.6, 4.2)):
        for j, y in enumerate((-0.7, 2.2)):
            box(f"Shell_PlatformColumn{i}{j}", (x, y, 1.5), (0.4, 0.4, 3.0), steel, bevel=0.03)

    # stairs up to the platform on the left (16 steps)
    for i in range(16):
        top = 0.2 * (i + 1)
        box(f"Shell_Step{i}", (-9.8 + 0.25 * i + 0.125 + 0.0, 0.8, top / 2), (0.25, 1.0, top), dark)
    for i, y in enumerate((0.25, 1.35)):
        box(f"Shell_Stringer{i}", (-7.8, y, 1.55), (5.12, 0.06, 0.18), trim, rot=(0, -0.675, 0))

    # hall columns, back-wall pipes, ceiling trusses, windows
    for i, x in enumerate((-12.4, -8.5, 8.5, 12.4)):
        box(f"Shell_Column{i}", (x, 4.6, 4.5), (0.6, 0.6, 9.0), steel, bevel=0.04)
    for i, z in enumerate((3.2, 3.7, 4.2)):
        pipe(f"Shell_Pipe{i}", (-12.7, 4.6, z), (12.7, 4.6, z), 0.13, trim)
    for i, x in enumerate((-10.4, 10.4)):
        pipe(f"Shell_PipeV{i}", (x, 4.55, 0.0), (x, 4.55, 9.2), 0.16, trim)
    for i, y in enumerate((-4.0, 0.5, 4.0)):
        box(f"Shell_TrussX{i}", (0, y, 8.8), (26, 0.35, 0.45), dark)
    for i in range(7):
        box(f"Shell_TrussY{i}", (-10.8 + i * 3.6, -0.5, 8.8), (0.35, 12, 0.35), dark)
    for i in range(8):
        x = -9.5 + i * 2.7
        box(f"Shell_WindowFrame{i}", (x, 4.8, 7.4), (2.5, 0.08, 1.6), dark)
        box(f"Shell_Window{i}", (x, 4.74, 7.4), (2.3, 0.04, 1.4), window)

    # anchors: where booth modules attach
    for dept, pos in BOOTH_POSITIONS.items():
        ob = bpy.data.objects.new(f"Anchor_{dept}", None)
        ob.location = to_blender(*pos)
        ob.empty_display_type = "ARROWS"
        bpy.context.scene.collection.objects.link(ob)
