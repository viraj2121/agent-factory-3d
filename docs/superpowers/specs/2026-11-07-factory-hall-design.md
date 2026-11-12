# Factory Hall: Design

Status: approved by the user on 2026-11-07 (camera improvements deferred, see below).
Date: 2026-11-07
Builds on: `2026-11-07-robot-look-test-design.md` (done: one blockout booth, `robot.glb`, a Vite + React Three Fiber page at `apps/dashboard/`).

## Why

The AI Software Factory shows real coding agents as robots in a 3D factory, and it is a profile project, so the 3D look is what sets it apart. The look test proved the pipeline (Blender, GLB, browser, animation) and ran at 120 FPS on the user's PC, but it is only a bare blockout: one booth, flat materials, almost no props.

The user's second reference image shows the target: a warm, gritty industrial hall in steel and amber, with five glass-fronted department booths, small white robots at desks, and a lot of detail around them (gear wall, crane, conveyor, stairs and walkways, pipes, a forklift or cart, a robot arm, plants, wear on the metal). The user said the current result is "really not that much detailed" and chose to build the full hall next, ahead of the dashboard UI and the backend.

## What we are making

The full hall as a browser scene, seen from a high, fixed camera like the reference:

- Five glass-fronted department booths: **Planning, Development, Code Review, QA / Testing, Integration**. Each has a sign, desks, monitors, and department-specific props.
- A hall around them: floor, walls, pipes, columns, stairs and walkways, a gear wall, a crane, a conveyor with crates, a cart or forklift, a robot arm near Integration, plants and small props.
- Robots at desks, using the existing robot (`robot.glb`) with its three clips.
- Worn, shiny metal, glass reflections, warm lighting and light atmosphere, so it reads as premium and not as a blockout.

## Goals

- The hall is clearly the same family as the reference and looks detailed and premium, which the user judges by eye.
- The five departments are easy to tell apart at a glance.
- Smooth on the user's PC: at least 60 FPS at 1080p.
- Built from reusable pieces, so detail is added by placing pieces, not by hand-modelling everything.
- The booths and robot seats stay data-driven, so later each project can be a factory and each agent a robot.

## Non-goals

- No dashboard panels, sidebar, activity log, or any backend (these come later).
- No real agent data. Robots show placeholder states and the page keeps the "LOOK TEST - not real agent data" label.
- No robot walking between departments.
- No more than one factory building in this stage.
- No mobile support and no quality-settings menu.

## Anti-goals (a failure even if it works)

- Detail that is just noise, or a hall that looks busy but flat.
- Props that look pasted in: wrong scale, wrong colours, or clearly different art styles.
- Anything fake presented as real. Placeholders stay labelled.
- Copying the reference image or someone else's model, or using assets without a clear licence.

## Constraints

- User's PC: GTX 1650, 4 GB.
- Blender 5.2.3 LTS through MCP for Blender in safe mode, telemetry off. Scripts cannot use `os`, `sys` or open files, but may use Blender's own import and export operators.
- Free assets only, with a clear licence (CC0 preferred) and the source recorded in `ATTRIBUTIONS.md`. Every free prop is recoloured to the same amber-and-steel palette.
- No paid services, API keys, accounts or AI-generated models.
- The 3D scene only displays state. Nothing pretends to control an agent.
- Total model and texture size under about 25 MB, with a local load of a few seconds.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | One big scene exported as a single file | Simplest and richest lighting, but nothing can change |
| B | Fully modular pieces assembled by a layout list | Flexible, but lighting is live only and less rich |
| **C (chosen)** | Fixed hall shell in one baked scene, with booths, desks and robots as modular pieces | Best look for permanent parts and flexible where data changes; the pieces must line up exactly |

For assets the user chose a **mix**: our own hero pieces (booths, robot, gear wall, crane, conveyor, signs) plus free small props (plants, crates, carts), recoloured to match. All-custom was rejected as too slow.

## Decisions made together

- Build the full hall first, before the dashboard or backend.
- Approach C for structure.
- Asset mix as above.
- Keep the earlier look-test decisions: cute white robot, warm steel-and-amber style.

## My calls (please check these)

- **Files:** `hall-shell.glb` (baked), `booth.glb` (one booth module reused five times with different signs and props), `props.glb` (the small-prop kit), and the existing `robot.glb`.
- **Layout:** a small data file in `apps/dashboard/src/` holds each booth's position, department name and desk (robot) slots, so the page assembles the hall from data. Three robot slots per booth; unused slots show an empty desk.
- **Arrangement:** like the reference: two booths on the top level, two below, and Integration on the right near the robot arm and conveyor.
- **Lighting:** baked lighting and ambient occlusion on the shell, a few live lights for the booths, bloom only on glowing parts.
- **Motion:** simple code-driven loops for the conveyor, gears and crane. No physics.
- **Camera:** same fixed high angle with a small orbit, no zoom.
- **Frame target:** 60 FPS or better at 1080p.
- **Status colours** stay green, red and blue, never amber.
- **Stages, each with a preview for the user before the next:**
  1. Shell and the baking pipeline.
  2. Booth module, five variants.
  3. Props, then gear wall, crane and conveyor with motion.
  4. Materials, atmosphere and polish.

## Planned for later (user request, not in this stage)

- Zoom in and out.
- Multiple camera angles, including free rotation around the hall, and focusing on a selected booth.

This stage keeps the fixed high camera, but the camera lives in its own small component (`HallCamera`) so these can be added without touching the scene. Hall pieces are modelled with finished backs and sides where cheap, so they hold up when the camera can move.

## Risks to check first

- **Baking in safe mode.** Blender's bake operator may be blocked by safe mode. Stage 1 starts by testing this on a small object. If it is blocked, the fallback is a lighter lighting setup (ambient occlusion in vertex colours plus live lights), and the user is told before work continues.
- **Fitting the shell and the modules.** Positions and scale must be fixed in one shared layout file before modelling booths.
- **Free-prop styles.** Props from different packs may not match. Each is recoloured and checked against the palette, and any that still clash are dropped.

## How we will know it worked

1. The user compares the page with the reference at the end of each stage and says it is on track.
2. 60 FPS or better on the user's PC.
3. Model and texture size under about 25 MB.
4. Every free asset is listed with its licence in `ATTRIBUTIONS.md`.
5. The five departments can be told apart at a glance.

## Left to the builder

- Exact shapes, sizes and placement of the props.
- Texture detail and wear patterns.
- How to arrange the walkways and stairs within the layout.
- Animation speeds for the conveyor, gears and crane.
