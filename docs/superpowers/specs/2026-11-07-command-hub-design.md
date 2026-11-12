# Command Hub: Design

Status: draft, waiting for approval.
Date: 2026-11-07
Replaces the layout of: `2026-11-07-factory-hall-design.md` (the rectangular two-level hall). Reuses its robots, props, pipeline and rules.

## Why

The user picked idea 3 ("command hub") from `docs/design-ideas/layout-ideas.html` after saying the glass booths felt like cages and the robots looked put inside them. Their vision, in their words: a **centre orb like an arc reactor, with branches running out to all of it**.

The AI Software Factory shows real coding agents as robots. A glowing core that every department connects to is a good picture of that: the core is the whole factory, the branches are the work flowing to and from each department, and each robot is at the end of a branch. It also keeps the warm industrial look of the user's reference image, with cyan light accents that match the robots' eyes.

## What we are making

A round hall, seen from a camera that orbits freely.

- **The core:** a raised circular deck in the centre with a glowing reactor orb: a bright inner sphere, two or three slowly turning rings, and a vertical light shaft through a round opening in the ceiling.
- **Five open bays** around the core, evenly spaced: Planning, Development, Code Review, QA / Testing, Integration. No glass, no cage: a floor pad, a half-height partition behind, a hanging sign, desks with laptops, and department props. Robots face the core.
- **Branches:** from the core, five main conduits run along the floor to the bays. Each splits into three smaller twigs, one per seat. Light pulses travel along them.
- **The hall around it:** a round wall with high windows, columns, pipes, ceiling spokes running out from the central opening, and an amber floor ring.
- **Robots:** the five shapes already built, with their own actions, colours and timing.

## Goals

- The core and branches read as one connected system at first glance and look premium.
- Natural, not caged: robots work in open bays, not boxes.
- Branch pulses and core brightness can show real activity later. For now they are labelled demo data.
- All five departments are easy to tell apart from any angle.
- At least 60 FPS at 1080p on the user's PC (the current hall runs at 120).
- Built from reusable pieces, so adding bays or projects later does not mean rebuilding the hall.

## Non-goals

- No dashboard panels, sidebar, activity log or backend yet.
- No real agent data. Everything shown stays labelled as a look test.
- No robots walking between bays yet.
- No more than one factory in this stage (the "campus" idea is later).
- No mobile support or quality menu.
- Free camera rotation, zoom and pan are in this stage; preset camera angles and click-to-focus are later.

## Anti-goals (a failure even if it works)

- A core that looks like a plain glowing ball with no depth.
- Branches that look like random cables, or that do not visibly connect to each desk.
- Pulses that suggest real activity when they are demo data.
- Props with bare, unfinished backs, since the camera now sees every side.
- Copying the reference image, or any asset without a clear licence.

## Constraints

- GTX 1650, 4 GB. The user measures 120 FPS with shadows and ambient shading on the current hall.
- Blender 5.2.3 through MCP for Blender in safe mode, telemetry off. Each call must be self-contained, with no `os`, `sys`, `open`, computed `setattr`, or dunder attributes.
- Free assets only, licence recorded in `ATTRIBUTIONS.md`. No paid services, keys or accounts. No git remote.
- Total models and textures under about 25 MB.
- Status colours (green, red, blue) are reserved for agent state and are not used for decoration. Cyan, amber, violet, pink and yellow are available.
- The 3D scene only displays state. Nothing pretends to control an agent.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | The whole room as one baked scene | Richest static lighting, but nothing can change |
| B | Everything modular, placed by angle | Flexible, less rich shading |
| **C (chosen)** | Floor, walls, ceiling and core deck baked as one piece; bays, desks, robots and branches modular | Best look where fixed, flexible where data changes |

The reactor core and branches are **not baked**: they glow and move, so they are live objects with emissive materials, with the page driving their animation.

## Decisions made together

- Layout: command hub, idea 3.
- Centre: an arc-reactor-style orb, with branches running out to everything.
- Keep the robots, their roles and shapes.
- Approach C for structure.
- Camera improvements (rotation, zoom) are wanted; preset angles later.

## My calls (please check these)

- **Look:** warm industrial steel and amber for the room, with cyan light for the core and branches.
- **Single level.** The hub deck is raised about 0.4 m; everything else is on the main floor. The old platform and stairs go.
- **Size:** round hall about 30 m across; bays at about 9 m from the centre, 72 degrees apart; core deck about 6.4 m across.
- **Seats:** three per bay, as now, in a gentle arc facing the core. Layout stays in `hallLayout.ts`, extended with an angle and radius per bay.
- **Branches:** a main conduit per bay, forking into three twigs. Each is a tube with an inner light strip; pulses are moving bright segments driven by a small pure function.
- **Core motion:** two or three rings turn at different slow speeds; the orb pulses gently; brightness is a single 0 to 1 value, so real activity can drive it later.
- **Robots face the core.** From a front camera the near bays show robot backs. This is handled by free orbit and, later, preset angles; a slow optional auto-orbit is an idea for later.
- **Bays:** open, with a half-height back partition and sign. Props and laptops are reused and redone with finished sides and backs.
- **Frame target:** 60 FPS or better; bloom only on emissive parts; the core and branches use emissive materials, not extra lights, except one point light inside the core.
- **Camera:** `HallCamera` gets full azimuth rotation, keeps zoom and pan, and keeps the min and max distance limits.

## Stages (each ends with a preview for the user)

1. **The room and the core.** Round shell, deck, ceiling opening, baked lighting; the reactor core with moving rings; free camera.
2. **Bays and branches.** Five open bays on the layout's angles, with desks and robots facing the core; conduits and twigs with demo pulses.
3. **Detail.** Props with finished backs, pipes, ceiling spokes, floor markings, signs, plus first realism improvements to materials.
4. **Polish.** Textures for robots and surfaces, atmosphere, size and speed check.

## Risks to check first

- **Pulses and ring motion cost.** They run every frame, so they must be cheap: moving a uniform or a few transforms, not geometry. Checked in Stage 2 with the frame counter.
- **Seeing the robots' faces.** If the ring layout hides too many faces, the bays can turn a little toward the default camera. This is decided at the Stage 2 preview.
- **Fit between baked room and modular bays.** Positions and angles come from one layout file, with a test that the baked room's anchors match it.

## How we will know it worked

1. The user looks at the page and says the core and branches feel like an arc reactor feeding the factory.
2. 60 FPS or better on the user's PC.
3. Models and textures under about 25 MB.
4. Every free asset is listed with its licence.
5. All five bays are recognisable from any camera angle.

## Left to the builder

- Exact shapes of the core rings and orb surface.
- Branch routing, tube thickness and pulse look.
- Bay partition and prop placement.
- Pulse and ring speeds.
- Ceiling spoke and window detail.
