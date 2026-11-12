# Needs animations.py pasted first. Adds the role actions to its _ACTIONS before add_animations runs.
# Bone local Y runs along the bone: swing arms forward with X, sideways with Z. First key == last key.

_ACTIONS.update(
    {
        # idle variant: slowly looks around
        "idle2": {
            "root": ("location", [(1, (0, 0, 0)), (25, (0, 0, 0.012)), (49, (0, 0, 0))]),
            "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.08)), (25, (0, 0, 0)), (37, (0, 0, -0.08)), (49, (0, 0, 0))]),
            "head": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.5)), (25, (0, 0, 0)), (37, (0, 0, -0.5)), (49, (0, 0, 0))]),
            "arm_l": ("rotation_euler", [(1, (0, 0, 0)), (25, (-0.12, 0, 0)), (49, (0, 0, 0))]),
            "arm_r": ("rotation_euler", [(1, (0, 0, 0)), (25, (0.12, 0, 0)), (49, (0, 0, 0))]),
        },
        # planner: hand on chin, head tilted, slow nod
        "think": {
            "body": ("rotation_euler", [(1, (-0.05, 0, 0)), (49, (-0.05, 0, 0))]),
            "head": ("rotation_euler", [(1, (0.1, 0, 0.25)), (25, (0.18, 0, 0.2)), (49, (0.1, 0, 0.25))]),
            "arm_r": ("rotation_euler", [(1, (-2.3, 0, 0)), (13, (-2.25, 0, 0.05)), (25, (-2.3, 0, 0)), (37, (-2.25, 0, 0.05)), (49, (-2.3, 0, 0))]),
            "arm_l": ("rotation_euler", [(1, (-0.6, 0, -0.1)), (49, (-0.6, 0, -0.1))]),
        },
        # reviewer: leans in, sweeps a lens from side to side
        "inspect": {
            "body": ("rotation_euler", [(1, (0.12, 0, 0)), (49, (0.12, 0, 0))]),
            "head": ("rotation_euler", [(1, (0.05, 0, -0.3)), (25, (0.05, 0, 0.3)), (49, (0.05, 0, -0.3))]),
            "arm_r": ("rotation_euler", [(1, (-1.2, 0, -0.3)), (13, (-1.3, 0, 0.2)), (25, (-1.2, 0, -0.3)), (37, (-1.3, 0, 0.2)), (49, (-1.2, 0, -0.3))]),
            "arm_l": ("rotation_euler", [(1, (0.05, 0, 0.1)), (49, (0.05, 0, 0.1))]),
        },
        # tester: fast alternating button presses, small nods
        "test": {
            "body": ("rotation_euler", [(1, (0, 0, 0)), (13, (0, 0, 0.04)), (25, (0, 0, 0)), (37, (0, 0, -0.04)), (49, (0, 0, 0))]),
            "head": ("rotation_euler", [(1, (0.05, 0, 0)), (13, (0.15, 0, 0)), (25, (0.05, 0, 0)), (37, (0.15, 0, 0)), (49, (0.05, 0, 0))]),
            "arm_l": ("rotation_euler", [(f, (-1.0 if i % 2 == 0 else -0.5, 0, 0)) for i, f in enumerate(range(1, 50, 4))]),
            "arm_r": ("rotation_euler", [(f, (-0.5 if i % 2 == 0 else -1.0, 0, 0)) for i, f in enumerate(range(1, 50, 4))]),
        },
        # integrator: hammers with the right arm, holds a part with the left
        "assemble": {
            "body": ("rotation_euler", [(1, (0, 0, 0)), (7, (0.1, 0, 0)), (13, (0, 0, 0)), (19, (0.1, 0, 0)), (25, (0, 0, 0)),
                                        (31, (0.1, 0, 0)), (37, (0, 0, 0)), (43, (0.1, 0, 0)), (49, (0, 0, 0))]),
            "head": ("rotation_euler", [(1, (0, 0, 0)), (7, (0.12, 0, 0)), (13, (0, 0, 0)), (19, (0.12, 0, 0)), (25, (0, 0, 0)),
                                        (31, (0.12, 0, 0)), (37, (0, 0, 0)), (43, (0.12, 0, 0)), (49, (0, 0, 0))]),
            "arm_r": ("rotation_euler", [(1, (-1.9, 0, 0)), (7, (-0.5, 0, 0)), (13, (-1.9, 0, 0)), (19, (-0.5, 0, 0)), (25, (-1.9, 0, 0)),
                                         (31, (-0.5, 0, 0)), (37, (-1.9, 0, 0)), (43, (-0.5, 0, 0)), (49, (-1.9, 0, 0))]),
            "arm_l": ("rotation_euler", [(1, (-1.0, 0, 0)), (7, (-1.0, 0, 0.03)), (13, (-1.0, 0, 0)), (19, (-1.0, 0, 0.03)), (25, (-1.0, 0, 0)),
                                         (31, (-1.0, 0, 0.03)), (37, (-1.0, 0, 0)), (43, (-1.0, 0, 0.03)), (49, (-1.0, 0, 0))]),
        },
    }
)
