# 3D assets and Blender

Models are built in Blender through MCP in **safe mode**. The scripts that build them are the source of truth.

## Where things are
| What | Where |
| --- | --- |
| Build scripts | `assets/source/` (`kit.py`, `hub_shell.py`, `robot_variants.py`, `robot_bay.py`, ...) |
| Exports | `assets/models/` |
| Copies the page loads | `apps/dashboard/public/models/` |
| The saved scene | `assets/blender/factory-hub.blend` (git-ignored, 27 MB; the scripts rebuild everything) |

Total models should stay under 25 MB.

## Safe mode rules
- Every call must be self-contained: functions from an earlier call are rejected.
- No `os`, `sys`, `open`, `eval` or `exec`, no `getattr` or `setattr` with a computed name, no dunder attributes.
- Blender's own operators (bake, export, join, unwrap) are fine.
- Read enum values before using them; look shader nodes up by type, not by name.

## Coordinates
`hubLayout.ts` is three.js space (y up). Blender is z up: `to_blender(x, y, z) = (x, -z, y)`. The glTF exporter converts
back.

## Robots and animation
- Five shapes plus five bay shapes share the same bones, so every clip works on every shape.
- Keep pose bones in quaternion mode, make loops seamless and export animations from the NLA tracks.
- One file cannot hold two robots with clips of the same name: export once and clone in the page.

## Baking
glTF has no lightmap slot. The shell bakes sky-light occlusion into its colour texture (Cycles, diffuse with direct,
indirect and colour, a white world). Keep emissive parts as separate objects so they are not baked.

## Planets, the star and the sky
These are **not** made in Blender. The sky photo is a NASA image (`public/textures/`), and planet and star surfaces are
baked on canvases in code.
