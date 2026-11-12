import bpy
import bmesh
from mathutils import Vector

# Needs build_robot (robot.py) and add_animations (animations.py) defined first.

STEEL = (0.30, 0.32, 0.35)
DARK_STEEL = (0.10, 0.11, 0.13)
AMBER = (1.0, 0.52, 0.08)
SCREEN = (0.15, 0.55, 1.0)


def _mat(name, color, rough=0.5, metal=0.0, emission=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Alpha"].default_value = alpha
    if emission:
        b.inputs["Emission Color"].default_value = (*color, 1.0)
        b.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0:
        try:
            mat.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            pass
    return mat


def _link(name, me, mat, rot=(0, 0, 0), loc=(0, 0, 0)):
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = rot
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _box(name, center, size, mat, bevel=0.0, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, profile=0.5, affect="EDGES")
    bm.to_mesh(me)
    bm.free()
    return _link(name, me, mat, rot=rot, loc=center)


def _pipe(name, p0, p1, radius, mat):
    a, b = Vector(p0), Vector(p1)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=radius, radius2=radius, depth=(b - a).length)
    rot = (b - a).to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return _link(name, me, mat, loc=(a + b) / 2)


def _clear():
    for ob in [o for o in bpy.data.objects if o.name.startswith(("Hall_", "Booth_", "Sun", "Lamp_"))]:
        data = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        if data and data.users == 0:
            for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.lights):
                if data.name in coll:
                    coll.remove(data)


def _sign(text, center, mat_plate, mat_letters):
    _box("Booth_SignPlate", center, (1.9, 0.06, 0.34), mat_plate, bevel=0.01)
    curve = bpy.data.curves.new("Booth_SignText", "FONT")
    curve.body = text
    curve.size = 0.2
    curve.extrude = 0.012
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    ob = bpy.data.objects.new("Booth_SignText", curve)
    ob.location = (center[0], center[1] - 0.04, center[2])
    ob.rotation_euler = (1.5708, 0, 0)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.data.materials.append(mat_letters)


def build_scene():
    _clear()
    steel = _mat("HallSteel", STEEL, 0.45, 0.8)
    dark = _mat("HallDarkSteel", DARK_STEEL, 0.5, 0.7)
    amber = _mat("HallAmber", AMBER, 0.4, 0.0, emission=0.9)
    trim = _mat("HallTrim", (0.75, 0.38, 0.06), 0.4, 0.6)
    glass = _mat("BoothGlass", (0.55, 0.8, 0.9), 0.05, 0.0, alpha=0.15)
    screen = _mat("ScreenGlow", SCREEN, 0.3, 0.0, emission=3.0)
    window = _mat("HallWindow", (1.0, 0.75, 0.4), 0.3, 0.0, emission=0.35)

    # hall: floor, back wall, pipes, columns
    _box("Hall_Floor", (0, 1.5, -0.05), (14, 10, 0.1), steel, bevel=0.01)
    for i, y in enumerate((-1.7, -2.4)):
        _box(f"Hall_FloorLine{i}", (0, y, 0.005), (7, 0.06, 0.012), amber)
    _box("Hall_Wall", (0, 5.0, 2.5), (14, 0.2, 5), dark)
    for i, x in enumerate((-4.5, 4.5)):
        _box(f"Hall_Column{i}", (x, 4.8, 2.5), (0.5, 0.5, 5), steel, bevel=0.03)
    for i, z in enumerate((3.2, 3.7)):
        _pipe(f"Hall_Pipe{i}", (-6.8, 4.7, z), (6.8, 4.7, z), 0.13, trim)
    for i, x in enumerate((-2.4, -0.8, 0.8, 2.4)):
        _box(f"Hall_Window{i}", (x, 4.88, 2.0), (1.0, 0.04, 0.9), window)

    # booth: walls, posts, glass front, top beam, sign
    _box("Booth_Back", (0, 1.1, 1.0), (3.3, 0.06, 2.0), dark)
    for i, x in enumerate((-1.65, 1.65)):
        _box(f"Booth_Side{i}", (x, 0.0, 1.0), (0.06, 2.2, 2.0), dark)
    _box("Booth_Glass", (0, -1.1, 1.0), (3.2, 0.02, 2.0), glass)
    for i, x in enumerate((-1.65, 1.65)):
        _box(f"Booth_Post{i}", (x, -1.1, 1.0), (0.1, 0.1, 2.0), trim, bevel=0.015)
    _box("Booth_Beam", (0, -1.1, 2.15), (3.4, 0.14, 0.3), steel, bevel=0.02)
    _box("Booth_AmberStrip", (0, -1.18, 2.0), (3.2, 0.02, 0.03), amber)
    _sign("DEVELOPMENT", (0, -1.2, 2.15), dark, amber)

    # desk and monitors
    _box("Booth_Desk", (0, -0.5, 0.28), (3.0, 0.7, 0.04), steel, bevel=0.01)
    for i, x in enumerate((-1.4, 1.4)):
        _box(f"Booth_DeskLeg{i}", (x, -0.5, 0.13), (0.06, 0.6, 0.26), dark)
    for i, (x, rz) in enumerate(((-1.15, 0.6), (1.15, -0.6))):
        _box(f"Booth_MonitorBody{i}", (x, -0.5, 0.52), (0.55, 0.04, 0.34), dark, bevel=0.01, rot=(0, 0, rz))
        _box(f"Booth_MonitorScreen{i}", (x, -0.5, 0.52), (0.5, 0.045, 0.3), screen, rot=(0, 0, rz))
        _box(f"Booth_MonitorStand{i}", (x, -0.5, 0.35), (0.06, 0.06, 0.12), dark)

    # robots: A is animated, B shares A's actions
    ra = build_robot("RobotA", (-0.65, 0.0, 0.0))
    rb = build_robot("RobotB", (0.65, 0.0, 0.0))
    add_animations(ra)
    adb = rb.animation_data or rb.animation_data_create()
    for t in list(adb.nla_tracks):
        adb.nla_tracks.remove(t)
    for name in ("idle", "typing", "wave"):
        tr = adb.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, bpy.data.actions[name])
        tr.mute = name != "idle"
    for t in ra.animation_data.nla_tracks:
        t.mute = t.name != "typing"

    # lights for the Blender preview (the web page sets its own)
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 2.5
    sun.color = (1.0, 0.8, 0.55)
    so = bpy.data.objects.new("Sun", sun)
    so.rotation_euler = (0.9, 0.2, 0.6)
    bpy.context.scene.collection.objects.link(so)
    for i, x in enumerate((-0.8, 0.8)):
        pl = bpy.data.lights.new(f"Lamp_{i}", "POINT")
        pl.energy = 250
        pl.color = (1.0, 0.65, 0.3)
        po = bpy.data.objects.new(f"Lamp_{i}", pl)
        po.location = (x, -0.3, 1.9)
        bpy.context.scene.collection.objects.link(po)

    # camera
    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = (3.4, -5.6, 3.6)
        direction = Vector((0, 0, 0.9)) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 38
