# Needs robot.py pasted first (uses its helpers). Builds five robot shapes on the same five-bone
# skeleton, so every animation works on every shape. Robots face -Y; the robot's right is -X.

VARIANTS = {
    "planner": dict(body=("egg", (0.20, 0.17, 0.25)), head=("round", (0.23, 0.21, 0.20)),
                    tint=(0.96, 0.86, 0.66), eye=(1.0, 0.70, 0.20), acc=("antenna",)),
    "developer": dict(body=("egg", (0.20, 0.17, 0.25)), head=("box", (0.42, 0.36, 0.30)),
                      tint=(0.92, 0.93, 0.95), eye=(0.0, 0.85, 1.0), acc=("headphones",)),
    "reviewer": dict(body=("egg", (0.23, 0.19, 0.23)), head=("round", (0.24, 0.22, 0.21)),
                     tint=(0.82, 0.76, 0.95), eye=(0.70, 0.55, 1.0), acc=("monocle",)),
    "tester": dict(body=("box", (0.34, 0.28, 0.46)), head=("box", (0.50, 0.36, 0.26)),
                   tint=(0.95, 0.78, 0.86), eye=(1.0, 0.43, 0.78), acc=("goggles", "beacon")),
    "integrator": dict(body=("box", (0.42, 0.30, 0.44)), head=("box", (0.38, 0.34, 0.28)),
                       tint=(0.97, 0.90, 0.55), eye=(1.0, 0.88, 0.30), acc=("hardhat", "shoulders")),
}


def _torus(name, center, major, minor, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24, minor_segments=8,
                                     location=center, rotation=(1.5708, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(material)
    return ob


def _torus_flat(name, center, major, minor, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=28, minor_segments=8, location=center)
    ob = bpy.context.active_object
    ob.name = name
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(material)
    return ob


def build_variant(variant, name, location):
    spec = VARIANTS[variant]
    _remove_existing(name)
    body_mat = _material(f"{variant}Body", spec["tint"], 0.35)
    face_mat = _material("RobotFace", (0.015, 0.02, 0.035), 0.15)
    eye_mat = _material(f"{variant}Eyes", spec["eye"], 0.5, emission=6.0)
    accent = _material(f"{variant}Accent", spec["eye"], 0.4)
    glow = _material(f"{variant}Glow", spec["eye"], 0.4, emission=4.0)
    dark = _material("RobotDark", (0.08, 0.09, 0.11), 0.5)

    # body, then head on top of it
    bkind, bd = spec["body"]
    bhalf = bd[2] / 2 if bkind == "box" else bd[2]
    bwide = bd[0] / 2
    bdeep = bd[1] / 2 if bkind == "box" else bd[1]
    cz = 0.09 + bhalf
    zt = cz + bhalf
    if bkind == "box":
        body = _rounded_box(f"{name}_Body", (0, 0, cz), bd, 0.08, body_mat)
    else:
        body = _ellipsoid(f"{name}_Body", (0, 0, cz), bd, body_mat)

    hkind, hd = spec["head"]
    hw, hdp, hh = (hd[0], hd[1], hd[2]) if hkind == "box" else (hd[0] * 2, hd[1] * 2, hd[2] * 2)
    zh = zt + hh / 2 - 0.04
    ytop = zh + hh / 2
    yf = -hdp / 2
    if hkind == "box":
        head = _rounded_box(f"{name}_Head", (0, 0, zh), hd, 0.07, body_mat)
    else:
        head = _ellipsoid(f"{name}_Head", (0, 0, zh), hd, body_mat)
    fscale = 0.76 if hkind == "box" else 0.6
    face = _rounded_box(f"{name}_Face", (0, yf + 0.01, zh), (hw * fscale, 0.05, hh * 0.66 * (1.0 if hkind == "box" else 0.8)), 0.02, face_mat)
    ex = 0.08 * (hw / 0.42)
    eyes = [
        _ellipsoid(f"{name}_EyeL", (ex, yf - 0.02, zh + 0.02), (0.04, 0.012, 0.055), eye_mat, 16, 10),
        _ellipsoid(f"{name}_EyeR", (-ex, yf - 0.02, zh + 0.02), (0.04, 0.012, 0.055), eye_mat, 16, 10),
    ]

    ax = bwide + 0.035
    parts = [
        (_ellipsoid(f"{name}_Base", (0, 0, 0.06), (0.22, 0.22, 0.07), body_mat), "root"),
        (body, "body"), (head, "head"), (face, "head"), (eyes[0], "head"), (eyes[1], "head"),
        (_ellipsoid(f"{name}_ArmL", (ax, 0, cz + 0.04), (0.05, 0.05, 0.14), body_mat, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_ArmR", (-ax, 0, cz + 0.04), (0.05, 0.05, 0.14), body_mat, 16, 10), "arm_r"),
        (_ellipsoid(f"{name}_HandL", (ax + 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), body_mat, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_HandR", (-ax - 0.01, 0, cz - 0.12), (0.06, 0.06, 0.06), body_mat, 16, 10), "arm_r"),
        # chest badge in the eye colour
        (_ellipsoid(f"{name}_Badge", (0, -bdeep + 0.005, cz + 0.06), (0.045, 0.012, 0.045), glow, 16, 10), "body"),
        # detail: neck ring, shoulder joints, mouth, cheek lights, glowing base ring
        (_torus_flat(f"{name}_Neck", (0, 0, zt - 0.02), min(bwide, hw / 2) * 0.55, 0.018, dark), "body"),
        (_ellipsoid(f"{name}_JointL", (ax, 0, cz + 0.17), (0.06, 0.06, 0.06), dark, 16, 10), "arm_l"),
        (_ellipsoid(f"{name}_JointR", (-ax, 0, cz + 0.17), (0.06, 0.06, 0.06), dark, 16, 10), "arm_r"),
        (box(f"{name}_Mouth", (0, yf - 0.015, zh - 0.065 * (hh / 0.28)), (0.1, 0.008, 0.012), glow, bevel=0.003), "head"),
        (_ellipsoid(f"{name}_CheekL", (hw * 0.3, yf - 0.012, zh - 0.04), (0.018, 0.008, 0.012), glow, 12, 8), "head"),
        (_ellipsoid(f"{name}_CheekR", (-hw * 0.3, yf - 0.012, zh - 0.04), (0.018, 0.008, 0.012), glow, 12, 8), "head"),
        (_torus_flat(f"{name}_BaseRing", (0, 0, 0.03), 0.205, 0.012, glow), "root"),
    ]
    if bkind == "egg":
        parts.append((_torus_flat(f"{name}_Waist", (0, 0, cz - 0.06), bwide * 0.97, 0.007, dark), "body"))
    else:
        parts.append((_rounded_box(f"{name}_ChestPanel", (0, -bdeep + 0.004, cz + 0.02), (bwide * 1.1, 0.012, bhalf * 0.9), 0.01, dark), "body"))
        for k in range(3):
            parts.append((_ellipsoid(f"{name}_Button{k}", (-0.06 + k * 0.06, -bdeep - 0.004, cz - 0.07), (0.014, 0.008, 0.014), glow, 10, 6), "body"))

    for a in spec["acc"]:
        if a == "antenna":
            parts.append((pipe(f"{name}_Antenna", (0, 0, ytop - 0.02), (0, 0, ytop + 0.18), 0.012, dark), "head"))
            parts.append((_ellipsoid(f"{name}_AntennaTip", (0, 0, ytop + 0.2), (0.035, 0.035, 0.035), glow, 12, 8), "head"))
        elif a == "headphones":
            for s, side in ((1, "L"), (-1, "R")):
                parts.append((_ellipsoid(f"{name}_Ear{side}", (s * (hw / 2 + 0.01), 0, zh), (0.05, 0.075, 0.075), accent, 16, 10), "head"))
                parts.append((box(f"{name}_Band{side}", (s * (hw / 2 + 0.005), 0, zh + hh / 2 * 0.6), (0.025, 0.03, hh * 0.55), dark), "head"))
            parts.append((box(f"{name}_BandTop", (0, 0, ytop + 0.005), (hw + 0.02, 0.03, 0.025), dark), "head"))
        elif a == "monocle":
            parts.append((_torus(f"{name}_MonocleRing", (-ex, yf - 0.045, zh + 0.02), 0.075, 0.012, accent), "head"))
            parts.append((pipe(f"{name}_MonocleChain", (-ex - 0.07, yf - 0.04, zh - 0.02), (-ex - 0.1, yf - 0.02, zh - 0.2), 0.006, dark), "head"))
        elif a == "goggles":
            for s, side in ((1, "L"), (-1, "R")):
                parts.append((_torus(f"{name}_Goggle{side}", (s * ex, yf - 0.04, zh + 0.02), 0.07, 0.014, accent), "head"))
            parts.append((box(f"{name}_Strap", (0, 0, zh + 0.02), (hw + 0.02, hdp * 0.3, 0.04), dark), "head"))
        elif a == "beacon":
            parts.append((pipe(f"{name}_BeaconStem", (0, 0, ytop - 0.02), (0, 0, ytop + 0.05), 0.02, dark), "head"))
            parts.append((_ellipsoid(f"{name}_Beacon", (0, 0, ytop + 0.075), (0.045, 0.045, 0.04), glow, 16, 10), "head"))
        elif a == "hardhat":
            parts.append((_ellipsoid(f"{name}_Hat", (0, 0, ytop - 0.02), (hw * 0.56, hdp * 0.58, 0.14), accent), "head"))
            parts.append((_ellipsoid(f"{name}_HatBrim", (0, -0.02, ytop - 0.03), (hw * 0.64, hdp * 0.66, 0.02), accent), "head"))
        elif a == "shoulders":
            for s, side, bone in ((1, "L", "arm_l"), (-1, "R", "arm_r")):
                parts.append((_ellipsoid(f"{name}_Pad{side}", (s * (ax + 0.02), 0, cz + 0.16), (0.09, 0.09, 0.07), accent, 16, 10), bone))

    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.data.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    root = eb.new("root"); root.head, root.tail = (0, 0, 0), (0, 0, 0.12)
    bb = eb.new("body"); bb.head, bb.tail = (0, 0, 0.12), (0, 0, zt); bb.parent = root
    hb = eb.new("head"); hb.head, hb.tail = (0, 0, zt - 0.04), (0, 0, ytop); hb.parent = bb
    al = eb.new("arm_l"); al.head, al.tail = (ax, 0, cz + 0.18), (ax + 0.01, 0, cz - 0.14); al.parent = bb
    ar = eb.new("arm_r"); ar.head, ar.tail = (-ax, 0, cz + 0.18), (-ax - 0.01, 0, cz - 0.14); ar.parent = bb
    bpy.ops.object.mode_set(mode="OBJECT")

    for ob, bone in parts:
        _bind(ob, rig, bone)
    rig.location = location
    return rig
