# Robot Look Test: Design

Status: draft, waiting for approval.
Date: 2026-11-07

## Why

The AI Software Factory dashboard will show real coding agents as small robots
in a 3D factory. The project is also a profile piece, so the 3D look matters as
much as the features.

Before building any dashboard or backend, we want to prove we can reach a
premium look. The user's reference image is a warm, gritty industrial hall in
steel and amber, with glass-fronted department booths and small white robots at
desks. Of everything in that image, **the robots are what the user would keep
first.** So this test puts the robots first and keeps everything else simple.

## What we are making

One small test scene:

- One glass-fronted booth (the Development department) with a desk and a glowing screen.
- Two cute robots at the desk: round white body, dark face, glowing cyan eyes.
- A plain steel-and-amber hall behind and around the booth, seen from the same
  high, fixed camera angle as the reference.
- The robots can play three animations: **idle**, **typing** and **wave**.

It is built in Blender, exported as a GLB file, and shown in a small browser page.

## Goals

- The robots look cute, friendly and well made. This is the main test.
- The scene is clearly the same family as the reference image: warm light,
  steel, amber trim, glass.
- The robots animate in the browser (idle, typing, wave), and the animations
  could later map to agent status.
- It runs smoothly on the user's PC (GTX 1650, 4 GB).
- The robot can be reused in the full factory without remaking it.

## Non-goals

- No dashboard panels, sidebar, activity log or project selection.
- No backend, no real agent data, no connection to Claude Code.
- No full hall: no gear wall, crane, conveyor, stairs, robot arm or forklift yet.
- No robot walking between departments yet.
- No quality settings menu or mobile support.

## Anti-goals (a failure even if it technically works)

- Robots that look like generic, stiff placeholder figures.
- A scene that looks flat and cold, unlike the warm reference.
- Fake data presented as real. Anything shown is labelled as a test.
- A robot copied from the reference image or from someone else's model.

## Constraints

- The user's PC has a GTX 1650 (4 GB), so keep triangle counts and effects modest.
- Blender is driven through MCP for Blender in safe mode, with telemetry off.
  Scripts run there cannot use `os`, `sys` or file-opening functions, but may use
  Blender's own export operators.
- No paid services, no API keys, no accounts. No git remote.
- Everything made must be our own work, or a clearly licensed asset.
- The 3D scene only displays state. Nothing here pretends to control an agent.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Build the robot ourselves in Blender from code | Unique, no licence or cost; polish takes several rounds |
| B | Start from a free robot model and restyle it | Fast and already animated; common look, licence checks |
| C | AI-generated model from a paid service | Quick first result; needs a paid key and cleanup |

The user chose A. Reason: it is the only option that gives a unique robot with
no account or cost.

## Decisions made together

- Style: **cute and friendly**, like the robots in the reference (round, white,
  big glowing eyes).
- Robots come first; the hall stays simple.
- The test is one Development booth with two robots.
- Build the robot ourselves in Blender (approach A).

## My calls (please check these)

- **Web stack:** Vite, React, TypeScript, React Three Fiber and Drei, in
  `apps/dashboard/`, so the page can grow into the real dashboard.
- **Robot construction:** rounded primitives and bevels, about 10 parts, simple
  armature (body, head, two arms, two hands). Aim for under about 15,000
  triangles per robot.
- **Animations:** made in Blender as actions (`idle`, `typing`, `wave`), with
  small looping motion, exported inside the GLB.
- **Lighting:** baked in Blender where possible, plus a few live lights. Bloom
  only on eyes and screens, kept subtle.
- **Camera:** fixed high angle with a little orbit, no free zoom.
- **File layout:** Blender scripts in `assets/source/`, exported models in
  `assets/models/`, the page in `apps/dashboard/`. Every Blender step is saved as
  a script, so assets can be rebuilt.
- **Size target:** the exported scene under about 5 MB, and a smooth frame rate
  (aim for 45 fps or better) at 1080p on the user's PC.
- **Status colours:** the status lights get their own colours (green, red, blue),
  not amber, since amber is the theme colour.

## How we will know it worked

1. The user looks at the browser page next to the reference image and says the
   robots feel right.
2. The three animations play and loop without glitches.
3. It runs smoothly on the user's PC.
4. The scene is labelled as a look test.

## Left to the builder

- Exact proportions, colours and materials of the robot.
- Booth, desk and screen shapes.
- Animation timing.
- How to bake lighting and which live lights to keep.
- Folder details beyond the layout above.
