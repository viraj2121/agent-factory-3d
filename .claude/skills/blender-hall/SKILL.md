---
name: blender-hall
description: Use when building, baking or exporting 3D assets in Blender through MCP for Blender for this project (robot, hall shell, booths, props), or when a Blender script is rejected by safe mode or an export or animation looks wrong.
---

# Blender work for the factory hall

Lessons learned on this project. Blender 5.2.3 LTS, MCP for Blender 2.2.7, safe mode on, telemetry off.

## Running scripts

- Scripts in `assets/source/` are the source of truth. Run them by pasting the code into `execute_blender_code`. The namespace may not persist, so paste dependencies first and together: `kit.py`, then the builder, then the call.
- Every call must be self-contained: safe mode checks that each function called is defined in that same script, so a function from an earlier call is rejected as "not a known callable".
- Safe mode rejects: `os`, `sys`, `open`, `eval`/`exec`, `setattr`/`getattr` with a computed name, and any dunder attribute such as `__name__`. A rejection happens before anything runs, so nothing is half-applied. Rewrite the line; never ask to turn safe mode off.
- Blender's own operators are fine: bake, export, convert, join, UV unwrap, mode switches.
- Read enum values before assigning them. Look shader nodes up by type (`n.type == "BSDF_PRINCIPLED"`), not by name.
- Delete or hide Blender's default `Cube` and `Light` before judging a scene. They overlap everything near the origin.
- Always `look` after building. Compare against the reference image, not against what you expected.

## Coordinates and layout

- `src/hallLayout.ts` is three.js space (y up, +z toward the camera). Blender is z up. Convert with `to_blender(x, y, z) = (x, -z, y)`. The glTF exporter converts back.
- Booth positions are copied into `hall_shell.py` as a literal; the test `tests/hallShell.test.ts` checks the exported anchors against `HALL_LAYOUT`.

## Robot and animation

- Bone local Y runs along the bone. For a bone pointing down, swing forward or back with rotation X and sideways with rotation Z. Rotating Y only spins the bone.
- Make loops seamless: the last keyframe equals the first.
- Actions must be named `idle`, `typing`, `wave` and each pushed onto its own NLA track.
- Export animations with `export_animation_mode="NLA_TRACKS"`; unmute all tracks first.
- One GLB cannot hold two robots both with clips of the same name. Export the robot once and clone it in the page.

## Robot shapes

- `robot_variants.py` builds five shapes (planner, developer, reviewer, tester, integrator) on the same five bones, so every clip works on every shape. `animations_roles.py` adds the role clips. Export one GLB per shape, building, animating and exporting inside one loop and removing each shape before the next.
- Per-robot colour, size and timing are applied in the page by `RoleRobot` from a seed, not baked in Blender.

- Every robot file carries up to 23 clips. To add clips to existing `robot-<variant>.glb` files, `assets/source/robot_gestures.py` imports each file, appends NLA tracks and exports over it (back up the files first). **Keep the pose bones in quaternion mode** (key `rotation_quaternion`, converted from Euler with `Euler(...).to_quaternion()`): switching imported bones to `XYZ` silently flattens every existing clip on export. Purge unused robot materials before each import, or the names gain a `.001` suffix and the page's name-based tinting breaks. `robot_bay.py` builds the five bay shapes and borrows the 23 clips from `robot-pocket.glb`.
- After exporting, check that clips really move the bones (compare keyframe values in the GLB); a clip with 2 keys and `STEP` interpolation is flat.

## Baking and export

- glTF has no lightmap slot. The shell bakes sky-light occlusion into the colour texture: Cycles, `bake(type="DIFFUSE", pass_filter={"DIRECT","INDIRECT","COLOR"})`, uniform white world, lights hidden, metallic set to 0 during the bake, then `image.pack()`.
- Keep emissive parts (amber lines, windows) as separate objects so they are not baked.
- Export with `use_selection=True`, `export_lights=False`, `export_cameras=False`. Copy the GLBs into `apps/dashboard/public/models/`.
- Check size: total models stay under 25 MB. The baked shell texture is the biggest item; see the `threejs-asset-pipeline` skill for shrinking.

## Verifying in the browser

- Screenshot with Playwright from the scratchpad folder, not from the project.
- Use real GPU args (`--use-gl=angle --use-angle=d3d11`). The software renderer showed none of the context-leak bugs.
