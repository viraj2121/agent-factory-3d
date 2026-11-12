# Factory Hall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full detailed factory hall (five department booths, hall shell, props, moving hero pieces) that the browser page assembles from a layout file, to approach the user's second reference image.

**Architecture:** Blender scripts (run through MCP in safe mode) produce four GLBs: `hall-shell.glb` (fixed hall, lighting baked), `booth.glb` (one reusable booth with five department prop groups and signs), `props.glb` (small-prop kit), `hero.glb` (gear wall, crane, conveyor, robot arm as separate moving nodes). The existing `robot.glb` is reused. A TypeScript layout file is the single source for where everything goes. The page places modules from it and moves hero pieces with small pure functions.

**Tech Stack:** Blender 5.2.3 LTS (MCP for Blender 2.2.7, safe mode), Vite, React, React Three Fiber, Drei, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-factory-hall-design.md`

## Global Constraints

- PC is a GTX 1650 (4 GB). Target at least 60 FPS at 1080p; total model and texture size under about 25 MB.
- Blender runs in safe mode with telemetry off. Scripts may not use `os`, `sys`, file opening, or `setattr`/`getattr` with computed names. Each Blender call pastes the needed scripts concatenated, since the namespace may not persist.
- Free assets only, with a clear licence (CC0 preferred), recorded in `ATTRIBUTIONS.md`, recoloured to the amber-and-steel palette. No paid services, API keys, accounts or AI-generated models.
- Departments, in this order: `planning`, `development`, `review`, `qa`, `integration`. Three robot seats per booth.
- Status colours (later) are green, red and blue, never amber. The page keeps the "LOOK TEST - not real agent data" label and never shows fake data as real.
- Layout coordinates are in three.js / glTF space (y up). Blender scripts convert with `to_blender(x, y, z) = (x, -z, y)`.
- Camera stays fixed high angle with a small orbit in this plan, in its own component `HallCamera`. Zoom and extra angles are for later.
- Layout in Blender: scripts in `assets/source/`, exports in `assets/models/`, copies in `apps/dashboard/public/models/`.
- After each stage, stop and show the user a preview and ask for feedback before the next stage.

## Review Focus

- Shell anchors disagree with the layout file: booths float or clip into walls. Pinned by the anchor test in Task 4.
- A booth has fewer than three agents: unused seats show an empty desk, never a missing or broken robot. Pinned by the `seatsFor` test in Task 7.
- A free prop has no recorded licence. Pinned by the attribution test in Task 8.
- Total size or load time grows past budget as props are added. Pinned by the budget test in Task 12.
- A model file is missing or fails to load: the page shows a clear message, not a blank scene. Pinned by the load-failure check in Task 7.

## File Structure

- `assets/source/bake_probe.py`: safe-mode bake test.
- `assets/source/hall_shell.py`, `booth_module.py`, `props_kit.py`, `hero.py`, `materials.py`, `export_hall.py`: Blender builders and exports.
- `apps/dashboard/src/hallLayout.ts`: layout types and `HALL_LAYOUT`.
- `apps/dashboard/src/seats.ts`: `seatsFor`. `apps/dashboard/src/motion.ts`: loop functions.
- `apps/dashboard/src/HallScene.tsx`, `HallCamera.tsx`: the page scene.
- `apps/dashboard/tests/`: `glbReader.ts` (shared helper), `hallLayout.test.ts`, `hallShell.test.ts`, `booth.test.ts`, `seats.test.ts`, `motion.test.ts`, `props.test.ts`, `budget.test.ts`.
- `ATTRIBUTIONS.md` at the repo root.

---

## Stage 1: Hall shell and baking

### Task 1: Baking probe (safe mode)

**Files:**
- Create: `assets/source/bake_probe.py`

**Interfaces:**
- Produces: a recorded finding, one of `bake: works` or `bake: blocked`, written to the ledger as a ruling. Later tasks use baked lighting only if it works.

- [ ] **Step 1:** Write `bake_probe.py`: build a plane and a cube, add an image texture node, set the render engine to Cycles (read the engine enum first), and call `bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT','INDIRECT'})`.
- [ ] **Step 2:** Run it through `execute_blender_code`. Expected: either an image with non-black pixels, or a safe-mode rejection message.
- [ ] **Step 3:** If blocked, test the fallback (ambient occlusion baked into vertex colours, with no bake operator) and record which works. Tell the user in one plain sentence which lighting approach was chosen.
- [ ] **Step 4: Commit** `git add assets/source/bake_probe.py && git commit -m "chore: probe baking under safe mode"`.

### Task 2: Layout file

**Files:**
- Create: `apps/dashboard/src/hallLayout.ts`
- Test: `apps/dashboard/tests/hallLayout.test.ts`

**Interfaces:**
- Produces: `type Department = 'planning'|'development'|'review'|'qa'|'integration'`; `interface BoothSpec { id: Department; label: string; position: [number, number, number]; rotationY: number; seats: [number, number, number][] }` (seats relative to the booth); `interface PropPlacement { prop: string; position: [number, number, number]; rotationY?: number; scale?: number }`; `interface HallLayout { booths: BoothSpec[]; props: PropPlacement[] }`; `export const HALL_LAYOUT: HallLayout`; `export const DEPARTMENTS: readonly Department[]` in the spec's order.

- [ ] **Step 1: Write failing tests** in `hallLayout.test.ts`: `booths` ids equal `DEPARTMENTS` in order; each has exactly 3 seats; no two booths closer than 5 metres on the floor plane; layout is in y-up space (no booth `position[1]` below 0); top-level booths sit higher than lower-level ones (the reference's two levels).
- [ ] **Step 2:** Run `npx vitest run tests/hallLayout.test.ts` in `apps/dashboard`. Expected: FAIL, module missing.
- [ ] **Step 3:** Implement the types and `HALL_LAYOUT`: Planning and Development on the upper level, Code Review and QA on the lower level, Integration on the right, matching the reference. `props` starts empty.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Hall shell model

**Files:**
- Create: `assets/source/hall_shell.py`

**Interfaces:**
- Consumes: `HALL_LAYOUT` booth positions (pasted into the script as a literal dict).
- Produces: `build_shell() -> None` creating floor (two levels), walls, columns, pipe runs, stairs, walkways and windows, plus an empty named `Anchor_<department>` at each booth position.

- [ ] **Step 1:** Write `build_shell` from reusable pieces (pipe, column, stair, rail), placed by loops. Finish backs and sides of walkways and walls where cheap, so they hold up when the camera can move later.
- [ ] **Step 2:** Run it, then `look` from the reference-like high angle. Expected: a recognisable two-level hall with room for five booths and no overlaps.
- [ ] **Step 3: Commit.**

### Task 4: Bake, export and test the shell

**Files:**
- Create: `assets/source/export_hall.py` (export function `export_shell`), `apps/dashboard/tests/glbReader.ts`, `apps/dashboard/tests/hallShell.test.ts`
- Output: `assets/models/hall-shell.glb`, copied to `apps/dashboard/public/models/`

**Interfaces:**
- Consumes: Task 1 finding; `HALL_LAYOUT`.
- Produces: `readGlb(file: string): Gltf` in `glbReader.ts` (same behaviour as in `glb.test.ts`).

- [ ] **Step 1: Write failing tests:** `hall-shell.glb` has nodes `Anchor_planning` … `Anchor_integration`, and each anchor's translation matches the booth `position` in `HALL_LAYOUT` within 0.01; the file is under 8 MB.
- [ ] **Step 2:** Run. Expected: FAIL, file missing.
- [ ] **Step 3:** Bake lighting (or the Task 1 fallback), export with `use_selection` on the shell objects and `export_lights=False`, copy into `public/models/`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Add `HallScene.tsx` and `HallCamera.tsx` showing the shell only, with the fixed camera from the look test. Open the page in the GPU-accelerated headless browser, check the console is clean, and screenshot.
- [ ] **Step 6: Commit.** **Stop: show the user the preview and ask whether Stage 1 is on track.**

## Stage 2: Booths

### Task 5: Booth module

**Files:**
- Create: `assets/source/booth_module.py`
- Test: `apps/dashboard/tests/booth.test.ts`

**Interfaces:**
- Produces: `booth.glb` with nodes `Seat_0`, `Seat_1`, `Seat_2` (empties at the desk seats), `Sign_<department>` for each of the five departments (sign meshes, only one shown by the page), `Props_<department>` groups, `Desk`, and the glass front.

- [ ] **Step 1: Write failing tests:** `booth.glb` contains `Seat_0..2`, all five `Sign_*` and `Props_*` nodes; size under 3 MB.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Build the booth from the look-test booth, improved: bevelled steel frame, glass with reflections, desks, monitors, amber trim. Export and copy.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Department props

**Files:**
- Modify: `assets/source/booth_module.py` (department groups)

**Interfaces:**
- Produces: each `Props_<department>` group holds that department's identity: Planning (whiteboard, blueprint table), Development (extra monitors, keyboards), Review (large magnifier, shield sign), QA (test rig, flask shelf), Integration (conveyor end, cable reels).

- [ ] **Step 1:** Build the five groups with simple, readable shapes.
- [ ] **Step 2:** Re-export and re-run `booth.test.ts`. Expected: PASS.
- [ ] **Step 3:** `look` at each group. Expected: the five departments are distinguishable at a glance.
- [ ] **Step 4: Commit.**

### Task 7: Assemble booths and robots in the page

**Files:**
- Create: `apps/dashboard/src/seats.ts`
- Modify: `apps/dashboard/src/HallScene.tsx`, `apps/dashboard/src/App.tsx`
- Test: `apps/dashboard/tests/seats.test.ts`

**Interfaces:**
- Produces: `seatsFor(agentCount: number, seatCount: number): ('robot' | 'empty')[]`, returning `seatCount` entries with robots first.

- [ ] **Step 1: Write failing tests:** `seatsFor(2, 3)` equals `['robot','robot','empty']`; `seatsFor(0, 3)` is all `'empty'`; `seatsFor(5, 3)` is all `'robot'` (extra agents are not shown); a negative count behaves as zero.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `seatsFor`. In `HallScene`, load `booth.glb`, clone it once per booth with `SkeletonUtils`, place by `position` and `rotationY`, show only that booth's `Sign_` and `Props_` nodes, and place cloned robots at `Seat_n` for `'robot'` entries. Use placeholder counts and keep the look-test label.
- [ ] **Step 4:** Run all tests. Expected: PASS. Block `booth.glb` in the headless browser: expected a clear error message. Screenshot the hall with the GPU-accelerated browser.
- [ ] **Step 5: Commit.** **Stop: show the preview, ask whether Stage 2 is on track.**

## Stage 3: Props and moving hero pieces

### Task 8: Props kit and attributions

**Files:**
- Create: `assets/source/props_kit.py`, `ATTRIBUTIONS.md`
- Test: `apps/dashboard/tests/props.test.ts`

**Interfaces:**
- Produces: `props.glb` with nodes `Crate`, `Barrel`, `Plant`, `Cart`, `Lamp`, `PipeBend`, `Cable` (custom or recoloured CC0). Names are the `prop` values used by `PropPlacement`.

- [ ] **Step 1: Write failing tests:** `props.glb` has all seven prop nodes; `ATTRIBUTIONS.md` has one row per external asset with name, author, licence and URL, and contains no row with an empty licence.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Download any free pack (Kenney or Quaternius) into its own new empty folder, read its licence before use, and never run anything from it. Recolour to the palette, merge into the kit, export. Props from a pack with unclear licensing are dropped.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: Hero pieces and motion

**Files:**
- Create: `assets/source/hero.py`, `apps/dashboard/src/motion.ts`
- Test: `apps/dashboard/tests/motion.test.ts`

**Interfaces:**
- Produces: `hero.glb` with nodes `GearWall`, `Gear_0..5`, `Crane`, `CraneHook`, `Conveyor`, `ConveyorBelt`, `RobotArm`. In `motion.ts`: `gearAngle(t: number, direction: 1 | -1): number` (radians, 6 seconds per turn), `conveyorOffset(t: number, period: number, speed: number): number` (repeats every `period`), `craneSway(t: number): number` (small angle, smooth, within ±0.12 rad).

- [ ] **Step 1: Write failing tests:** `gearAngle(0, 1)` is 0 and `gearAngle(6, 1)` is 2π; direction -1 gives the negative; `conveyorOffset(t + 3, 3, 1)` equals `conveyorOffset(t, 3, 1)`; `|craneSway(t)| <= 0.12` over 0 to 60 s in steps of 0.5.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the three functions as plain maths. Build the hero pieces in Blender as separate nodes with their pivots at the rotation centres.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: Place props and animate in the page

**Files:**
- Modify: `apps/dashboard/src/hallLayout.ts` (fill `props`), `apps/dashboard/src/HallScene.tsx`

- [ ] **Step 1:** Add `PropPlacement` entries for crates, barrels, plants, carts, lamps around the booths and aisles.
- [ ] **Step 2:** In `HallScene`, load `props.glb` and `hero.glb`, clone props per placement, and drive the hero nodes from `motion.ts` inside `useFrame`.
- [ ] **Step 3:** Run all tests, then the GPU-accelerated headless run: expected clean console, and two screenshots a few seconds apart show the gears and conveyor in different positions.
- [ ] **Step 4: Commit.** **Stop: show the preview, ask whether Stage 3 is on track.**

## Stage 4: Materials, atmosphere, budget

### Task 11: Materials and atmosphere

**Files:**
- Create: `assets/source/materials.py`
- Modify: `apps/dashboard/src/HallScene.tsx`

- [ ] **Step 1:** Write `materials.py` with reusable scratched-steel, rust, glass and amber-emissive materials applied across shell, booth, props and hero (procedural wear baked to roughness and normal maps).
- [ ] **Step 2:** In the page, add haze (fog tuned to the hall), a few cheap light-shaft planes, an environment map, and tune bloom so only emissive parts glow.
- [ ] **Step 3:** Re-export all GLBs, copy, run all tests, screenshot with the GPU-accelerated browser. Expected: metal reads as worn and reflective, and the robots still read as white.
- [ ] **Step 4: Commit.**

### Task 12: Budget and final check

**Files:**
- Test: `apps/dashboard/tests/budget.test.ts`

- [ ] **Step 1: Write failing test:** the sum of all files in `public/models` is under 25,000,000 bytes, and every `.glb` listed in the page's loader calls exists on disk.
- [ ] **Step 2:** Run. Expected: PASS or FAIL. If FAIL, reduce texture sizes or merge meshes until it passes.
- [ ] **Step 3:** Run the whole suite and `npm run build`. Expected: all pass.
- [ ] **Step 4:** Ask the user to read the FPS counter and compare with the reference. Expected: 60 or higher.
- [ ] **Step 5: Commit.** Then the final review, as the execution skill describes.
