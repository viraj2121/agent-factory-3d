# Performance

The reference machine has a GTX 1650. The frame rate is limited mostly by the **processor**: the cost is three.js
setting up draw calls, so fewer separate objects and materials is what speeds the page up.

## Rules that keep it fast
- Merge still props at load (`StaticMerge`); keep moving parts outside it.
- Robot parts are merged (`mergeSkinned.ts`) and the parts of a cloned robot share one skeleton.
- An instanced mesh with zero instances must be hidden (`visible = false`). It once cost about 20 FPS under the
  ambient-shading effect.
- Shadows are redrawn every other frame (`ShadowThrottle`); tiny and unlit parts do not cast shadows.
- Robots share eye, glow and plain materials.
- Surfaces are procedural, not big images.

## Quality levels (`quality.ts`)
| Level | Idea |
| --- | --- |
| High | Everything: ambient shading, zoom blur, glow, shadows, film finish |
| Balanced | No ambient shading, the costliest effect |
| Fast | Smaller shadows, lighter weather, lower resolution |
| Lite | No shadows, glow, blur, dome or weather; plain materials; the 2K sky photo and no film finish |

Auto starts from the graphics chip's name and steps down when the frame rate stays low (two slow readings in a row).

## Measuring
- The frame-rate counter is in Settings, Display.
- `?fx=noao,noshadow,nobloom,lowdpr,noweather,nofilm` switches effects off one by one.
- `?off=vents,decals,holograms,pulses,machines,screens` turns moving scenery off.
- The solar system level bakes its planet and star surfaces once; they are drawn quietly in the background after the page
  loads, so the first flight up does not stall.

## Known costs
The hall stays mounted but hidden in the solar system level, so it still uses some processor time there.
