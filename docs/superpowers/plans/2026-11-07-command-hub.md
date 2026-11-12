# Command Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rectangular glass-booth hall with a round hall: an arc-reactor core in the centre, five open department bays on a ring with robots facing the core, and glowing branches from the core to every desk.

**Architecture:** A baked `hub-shell.glb` (floor, single-sided walls and ceiling, deck, columns, pipes) and a modular `bay.glb` are built in Blender; the existing five `robot-<variant>.glb` are reused. The reactor core and the branches are built in code (live, emissive, animated by small pure functions). One layout file, `hubLayout.ts`, places everything. The old rectangular hall stays reachable until the new one is accepted, then is removed.

**Tech Stack:** Blender 5.2.3 LTS (MCP for Blender 2.2.7, safe mode), Vite, React 19, TypeScript, React Three Fiber, drei, postprocessing (N8AO, Bloom), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-command-hub-design.md`

## Global Constraints

- GTX 1650, 4 GB. At least 60 FPS at 1080p; total models and textures under about 25 MB.
- Blender safe mode, telemetry off. Every Blender call is self-contained: no calls to functions from earlier calls, no `os`, `sys`, `open`, computed `setattr`/`getattr`, or dunder attributes.
- Free assets only, licence in `ATTRIBUTIONS.md`. No paid services, keys, accounts. No git remote; never push.
- Status colours (green, red, blue) are not used for decoration. Cyan, amber, violet, pink, yellow are available.
- Nothing is shown as real agent data. Pulses, core brightness and robot counts are demo values, labelled "LOOK TEST - not real agent data".
- Layout coordinates are three.js space (y up, +z toward the default camera). `angle` 0 points at +z and increases toward +x. Blender conversion: `to_blender(x, y, z) = (x, -z, y)`.
- Room walls and ceiling are single-sided (normals inward / downward) so the orbiting camera sees inside from outside and above.
- Robots are placed with `RoleRobot` and `robotVariants.ts` as they are. Do not change their files in this plan except where a task says so.
- After each stage, stop and show the user a preview and ask for feedback before the next stage.

## Review Focus

- Default view hides the interior (a wall or ceiling blocks it): pinned by the single-sided check in Task 3 and the screenshot step in Task 5.
- Bay focus view shows robots' faces, not their backs: pinned by `hubCameraFor` tests in Task 2.
- Core brightness input outside 0 to 1, NaN or negative: pinned by the `orbGlow` tests in Task 4.
- A twig does not reach its desk, or an empty seat shows a live pulse: pinned by the branch tests in Task 7.
- A model file is missing or fails to load: shows a clear message, pinned by the check in Task 8.

## File Structure

- `apps/dashboard/src/hubLayout.ts`: `HUB`, `BaySpec`, `HUB_LAYOUT`, `bayPosition`.
- `apps/dashboard/src/hubCameraConfig.ts`, `HubCamera.tsx`: wide and focus views, full-rotation orbit.
- `apps/dashboard/src/reactor.ts`, `ReactorCore.tsx`: core motion and the core object.
- `apps/dashboard/src/branches.ts`, `Branches.tsx`: branch paths, pulse timing and the glowing conduits.
- `apps/dashboard/src/HubScene.tsx`: the new scene.
- `assets/source/hub_shell.py`, `bay_module.py`: Blender builders; `hall_bake.py`-style bake is pasted inside `hub_shell.py`'s run; `export_hall.py` gains `export_hub_shell`, `export_bay`.
- Tests in `apps/dashboard/tests/`: `hubLayout`, `hubCamera`, `hubShell`, `reactor`, `bay`, `branches`, `budget`.

---

## Stage 1: Room and core

### Task 1: Hub layout

**Files:**
- Create: `apps/dashboard/src/hubLayout.ts`
- Test: `apps/dashboard/tests/hubLayout.test.ts`

**Interfaces:**
- Consumes: `DEPARTMENTS`, `Department`, `Vec3` from `hallLayout.ts`.
- Produces: `HUB = { roomRadius: 15, wallHeight: 9, deckRadius: 3.2, deckHeight: 0.4, oculusRadius: 2.6, coreCenter: [0, 1.8, 0] as Vec3, coreRadius: 0.9 }`; `bayPosition(angle: number, radius: number): Vec3` returning `[radius*sin(angle), 0, radius*cos(angle)]`; `interface BaySpec { id: Department; label: string; angle: number; radius: number; position: Vec3; rotationY: number; seats: Vec3[] }`; `HUB_LAYOUT: { bays: BaySpec[] }`.

- [ ] **Step 1: Write failing tests:** bays are the five departments in `DEPARTMENTS` order; angles are `[π, 0.6π, -0.6π, -0.2π, 0.2π]` for planning, development, review, qa, integration (mod 2π); every `radius` is 9; neighbouring bays are 72 degrees apart around the ring; `position` equals `bayPosition(angle, radius)` within 0.001; `rotationY` equals `angle + π` mod 2π (robots face the centre); each bay has three seats `[-1.1, 0, -0.12]`, `[0, 0, 0]`, `[1.1, 0, -0.12]`; every bay is at least 3.6 m from every other.
- [ ] **Step 2:** Run `npx vitest run tests/hubLayout.test.ts` in `apps/dashboard`. Expected: FAIL, module missing.
- [ ] **Step 3:** Implement the module with `position` computed by `bayPosition`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 2: Camera

**Files:**
- Create: `apps/dashboard/src/hubCameraConfig.ts`, `apps/dashboard/src/HubCamera.tsx`
- Test: `apps/dashboard/tests/hubCamera.test.ts`

**Interfaces:**
- Consumes: `HUB_LAYOUT`, `CameraView` type from `hallCameraConfig.ts`.
- Produces: `HUB_ZOOM_LIMITS = { min: 2.5, max: 42 }`; `hubCameraFor(focus: string | undefined): CameraView` (wide view `position [0, 12, 24]`, `target [0, 1.5, 0]`, `fov 37`; a focus view stands on the core side of the bay, 7.5 m back toward the centre and 3.2 m up, looking at the bay at height 0.9); default export `HubCamera` (full azimuth rotation, polar angle 10 to 85 degrees, zoom to cursor, pan, `HUB_ZOOM_LIMITS`).

- [ ] **Step 1: Write failing tests:** the wide view's distance to its target is between `min` and `max`; with `focus` set to each bay id, the target x and z equal the bay position, the camera is closer to the origin than the bay (so it looks at robot faces), the camera is within 9 m of the target, and above the floor; an unknown focus equals the wide view.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement both files; read `?focus=<department>` once, like `HallCamera.tsx`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Hub shell model

**Files:**
- Create: `assets/source/hub_shell.py`, `apps/dashboard/tests/hubShell.test.ts`
- Modify: `assets/source/export_hall.py` (add `export_hub_shell`)
- Output: `assets/models/hub-shell.glb`, copied to `apps/dashboard/public/models/`

**Interfaces:**
- Consumes: `HUB`, `HUB_LAYOUT` values (pasted into the script as literals); `tests/glbReader.ts`.
- Produces: `hub-shell.glb` with nodes `Anchor_planning` … `Anchor_integration` at each bay `position`, and `Anchor_core` at `HUB.coreCenter`; the baked solids joined into one mesh named `Shell_Baked`, plus `Shell_Glow` and `Shell_Windows`.

- [ ] **Step 1: Write failing tests:** anchors match `HUB_LAYOUT` positions and `HUB.coreCenter` within 0.01; the file is under 8 MB; every material in the glTF that belongs to `Shell_Baked` has `doubleSided` false or absent (single-sided).
- [ ] **Step 2:** Run. Expected: FAIL, file missing.
- [ ] **Step 3:** Build the shell in one self-contained Blender call: round floor, wall ring (normals inward), deck cylinder with a step ring, ceiling of 24 radial boxes whose faces point down plus a ring beam around the oculus, columns every 45 degrees at the wall, pipe rings, a ring of high window panels, an amber floor ring, anchors. Then bake as in `hall_bake.py` (white world, metallic 0 during the bake, lights hidden, pack the image), keep emissive parts as separate objects, and export.
- [ ] **Step 4:** Copy to `public/models/`; run the tests. Expected: PASS.
- [ ] **Step 5:** `look` from the default camera angle: expected to see the whole interior through the near wall.
- [ ] **Step 6: Commit.**

### Task 4: Reactor core

**Files:**
- Create: `apps/dashboard/src/reactor.ts`, `apps/dashboard/src/ReactorCore.tsx`
- Test: `apps/dashboard/tests/reactor.test.ts`

**Interfaces:**
- Produces: `RING_SPEEDS = [0.35, -0.5, 0.8]` (radians per second); `ringAngle(t: number, index: number): number` (`RING_SPEEDS[index] * t`); `orbGlow(t: number, activity: number): number` — activity is clamped to 0 to 1 (non-finite counts as 0), result is between 0.6 and 3.0 and pulses gently with `t`; `ReactorCore({ activity }: { activity: number })` draws the orb, three rings, a base disc and one point light, using emissive materials and `useFrame` with refs only.

- [ ] **Step 1: Write failing tests:** `ringAngle(2, 0)` is 0.7 and `ringAngle(2, 1)` is -1; `orbGlow` stays within 0.6 to 3.0 for `t` from 0 to 60 and activity from -5 to 5; `orbGlow(t, 1)` is on average greater than `orbGlow(t, 0)`; `orbGlow(0, Number.NaN)` is finite and at least 0.6.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `reactor.ts`, then `ReactorCore.tsx`. No `setState` in `useFrame`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Room and core in the page

**Files:**
- Create: `apps/dashboard/src/HubScene.tsx`
- Modify: `apps/dashboard/src/App.tsx`

- [ ] **Step 1:** `HubScene` loads `hub-shell.glb`, adds `ReactorCore` at `HUB.coreCenter` with a fixed demo `activity` of 0.6, `HubCamera`, lights, fog, N8AO (`quality="medium"`) and Bloom. The old hall stays at `?scene=hall`; the hub becomes the default.
- [ ] **Step 2: Verify.** `npx tsc -b`, `npx vitest run`, then the GPU-accelerated headless screenshot (`--use-gl=angle --use-angle=d3d11`). Expected: no console errors; the interior is visible from the default view; the rings turn between two screenshots a few seconds apart.
- [ ] **Step 3: Commit.** **Stop: show the user the preview and ask whether Stage 1 is on track.**

## Stage 2: Bays and branches

### Task 6: Open bay model

**Files:**
- Create: `assets/source/bay_module.py`, `apps/dashboard/tests/bay.test.ts`
- Modify: `assets/source/export_hall.py` (add `export_bay`)
- Output: `bay.glb`

**Interfaces:**
- Produces: `bay.glb` with `Seat_0`, `Seat_1`, `Seat_2` at the layout seats, `Sign_<department>` and `Props_<department>` for all five departments (at least 5 children each), `Desk`, `Bay_Partition`. No glass, no side walls.

- [ ] **Step 1: Write failing tests:** seats match `HUB_LAYOUT.bays[0].seats` within 0.01; all five signs and props groups exist, each props group has at least 5 children; `Desk` and `Bay_Partition` exist; no node name contains `Glass`; file under 3 MB.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Derive from `booth_module.py`: keep the back panel as the partition, move the sign onto its top edge, remove glass, posts, side walls and the front beam, add rear details (vent slats, an amber trim line, a cable run) so the back looks finished, keep laptops, desk and the department props. Export and copy.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 7: Branches

**Files:**
- Create: `apps/dashboard/src/branches.ts`, `apps/dashboard/src/Branches.tsx`
- Test: `apps/dashboard/tests/branches.test.ts`

**Interfaces:**
- Consumes: `HUB`, `HUB_LAYOUT`, `SeatState` from `seats.ts`.
- Produces: `interface BranchPath { bay: Department; kind: 'main' | 'twig'; seat?: number; points: Vec3[] }`; `branchPaths(): BranchPath[]` (per bay one main from the deck edge at floor level to a fork point 2.2 m short of the bay, and three twigs from the fork to each seat's world position); `pulseT(time: number, index: number, speed: number): number` in [0, 1), periodic, offset by `index`; `activeTwigs(states: SeatState[]): boolean[]` (true where a robot sits). `Branches({ seatStates })` draws tubes with an emissive inner strip and moving pulse spheres only on active twigs and on a main when any twig is active.

- [ ] **Step 1: Write failing tests:** 20 paths (5 mains, 15 twigs); each main starts at radius `HUB.deckRadius` from the origin (within 0.05); each twig's last point equals its seat's world position (within 0.01), computed from the bay position and `rotationY`; every point has y of at least 0; `pulseT(t + 1/speed, i, speed)` equals `pulseT(t, i, speed)`; values are in [0, 1); different `index` gives different phases; `activeTwigs(['robot','robot','empty'])` is `[true, true, false]`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `branches.ts`, then `Branches.tsx` (tube geometry from a `CatmullRomCurve3` per path; pulses move with `useFrame` through refs; no `setState`).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 8: Bays, robots and branches in the page

**Files:**
- Modify: `apps/dashboard/src/HubScene.tsx`

- [ ] **Step 1:** For each bay, clone `bay.glb`, show only its department's sign and props, place it at `position` with `rotationY`, place a `RoleRobot` at each seat with demo counts `{planning 1, development 3, review 2, qa 1, integration 2}` using `seatsFor`, `variantFor`, `primaryClip` and a seed. Add `Branches` with the same seat states. Keep one point light per bay at most.
- [ ] **Step 2: Verify.** Tests and `tsc`; GPU headless screenshots of the wide view and `?focus=` for each bay (robot faces visible in each); block `bay.glb` and expect the clear error message; read the frame counter. Expected: clean console, 60 FPS or better on the test GPU.
- [ ] **Step 3: Commit.** **Stop: show the user the preview and ask whether Stage 2 is on track.**

## Stage 3: Detail

### Task 9: Props, ceiling and signs

**Files:**
- Modify: `assets/source/hub_shell.py`, `assets/source/bay_module.py`

- [ ] **Step 1:** Add hanging lamps over each bay, ceiling spoke detail, wall pipe branches that run toward the bays, floor markings along the branches, and bigger props with finished backs and sides. Rebuild, rebake, re-export both files.
- [ ] **Step 2:** Run all tests; screenshot from three azimuths (front, side, back). Expected: no bare or untextured backs, clean console.
- [ ] **Step 3: Commit.**

### Task 10: Light shaft and first materials

**Files:**
- Modify: `apps/dashboard/src/HubScene.tsx`, `apps/dashboard/src/ReactorCore.tsx`

- [ ] **Step 1:** Add a soft additive light shaft from the core up through the oculus, and vary material roughness and metalness on shell and bay parts.
- [ ] **Step 2:** Run tests, `tsc`, GPU screenshots, and read the frame counter. Expected: 60 FPS or better, clean console.
- [ ] **Step 3: Commit.** **Stop: show the user the preview and ask whether Stage 3 is on track.**

## Stage 4: Polish

### Task 11: Textures and atmosphere

**Files:**
- Create: `apps/dashboard/tests/budget.test.ts`
- Modify: robot, shell and bay export scripts

**Interfaces:**
- Consumes: `threejs-asset-pipeline` skill (gltf-transform).

- [ ] **Step 1: Write failing test:** the sum of all files in `public/models` is under 25,000,000 bytes, every model name used in `src/*.tsx` loader calls exists on disk, and `ATTRIBUTIONS.md` has no row with an empty licence.
- [ ] **Step 2:** Run. Expected: PASS or FAIL; if it fails, shrink textures (WebP, 1024 or 2048) with gltf-transform until it passes.
- [ ] **Step 3:** Bake scuff and roughness detail into the robot and shell materials; add haze tuned to the room.
- [ ] **Step 4:** Run all tests; screenshots from the wide view and one focus view. Expected: surfaces look worn and robots less flat; clean console.
- [ ] **Step 5: Commit.**

### Task 12: Remove the old hall and final check

**Files:**
- Delete: `HallScene.tsx`, `HallCamera.tsx`, `hallCameraConfig.ts`, `hall-shell.glb`, `booth.glb`, `look-test.glb`, and their tests, once the user has accepted the hub.
- Modify: `App.tsx`, `CLAUDE.md`

- [ ] **Step 1:** Ask the user to confirm the hub replaces the old hall. Only then remove the old files and update `CLAUDE.md` to describe the hub.
- [ ] **Step 2:** Run the whole suite, `tsc -b`, `npm run build`. Expected: all pass.
- [ ] **Step 3:** Ask the user to read the frame counter and compare with the vision. Expected: 60 FPS or better.
- [ ] **Step 4: Commit.** Then the final review, as the execution skill describes.
