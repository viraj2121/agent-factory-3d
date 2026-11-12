# Robot Look Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show two cute white robots at a desk in a glass Development booth, built in Blender and animated (idle, typing, wave), in a browser page that looks like the user's warm industrial reference.

**Architecture:** Blender scripts (run through MCP for Blender in safe mode, saved in the repo) build the robot, animations and booth, then export one GLB. A small Vite + React Three Fiber page loads the GLB from `apps/dashboard/public/models/` and plays the animations. The page only displays; it has no backend.

**Tech Stack:** Blender 5.2.3 LTS (MCP for Blender 2.2.7), Vite, React, TypeScript, React Three Fiber, Drei, `@react-three/postprocessing`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-robot-look-test-design.md`

## Global Constraints

- PC is a GTX 1650 (4 GB): keep each robot under about 15,000 triangles; exported scene under about 5 MB; aim for 45 fps or better at 1080p.
- Blender runs in safe mode with telemetry off. Scripts may not use `os`, `sys` or file-opening functions, but may use Blender's own export operator.
- No paid services, no API keys, no accounts, no git remote. Never push.
- Everything must be our own work or clearly licensed. Do not copy the reference image or another model.
- Robot: round white body, dark face, glowing cyan eyes, about 10 parts, simple armature, actions named `idle`, `typing`, `wave`.
- Lighting baked where possible plus a few live lights; bloom only on eyes and screens, subtle. Camera fixed high angle with a little orbit, no free zoom.
- Status colours (later) are green, red, blue, never amber.
- The page is labelled as a look test. Nothing implies real agent data.
- Layout: Blender scripts in `assets/source/`, models in `assets/models/`, page in `apps/dashboard/`.

## Review Focus

- GLB loads but an animation is missing or misnamed: the page must say which clip is missing, not show a frozen robot.
- GLB fails to load: show an error message, not a blank canvas.
- Browser has no WebGL: show a plain message.
- Robot faces away from the camera or is the wrong size: the check is a screenshot against the reference.
- Browser uses the AMD integrated GPU, not the GTX 1650: fps is measured on screen so this is noticed.

## File Structure

- `assets/source/robot.py`: builds one robot and its armature in Blender.
- `assets/source/animations.py`: adds the three actions to the robot.
- `assets/source/booth.py`: builds booth, desk, screen, hall backdrop and lights; places two robots.
- `assets/source/export.py`: exports the scene to `assets/models/look-test.glb`.
- `apps/dashboard/`: Vite app. `src/main.tsx`, `src/App.tsx`, `src/LookTestScene.tsx`, `src/clips.ts`.
- `apps/dashboard/tests/glb.test.ts`: checks the exported file.

---

### Task 1: Robot model

**Files:**
- Create: `assets/source/robot.py`

**Interfaces:**
- Produces: a function `build_robot(name: str, location: tuple[float, float, float]) -> bpy.types.Object` returning the armature object. The body mesh and eyes are children. Eyes use an emissive cyan material named `RobotEyes`. The body uses a white material named `RobotBody`, the face a dark material named `RobotFace`.

- [ ] **Step 1:** Write `build_robot` with about 10 rounded parts (body, head, face plate, two eyes, two arms, two hands, base) using primitives with bevel modifiers, and a simple armature (root, body, head, left arm, right arm). Parent meshes to bones. Look shader nodes up by type, not name.
- [ ] **Step 2:** Run it through `execute_blender_code` with the user's words as `user_prompt`.
- [ ] **Step 3: Verify.** Call `get_scene_info` with fields `details`: expect one armature plus its meshes, and under 15,000 triangles in total. Call `look` with `mode: angles` on the robot: expect it to read as a cute, round, white robot with a dark face and glowing cyan eyes. Show the image to the user and ask whether the shape feels right.
- [ ] **Step 4:** Adjust proportions from the user's feedback and re-run until they approve. Each re-run must first delete the previous robot so objects do not pile up.
- [ ] **Step 5: Commit** locally: `git add assets/source/robot.py && git commit -m "feat: add robot model script"`.

### Task 2: Robot animations

**Files:**
- Create: `assets/source/animations.py`

**Interfaces:**
- Consumes: `build_robot` armature from Task 1 (bones `root`, `body`, `head`, `arm_l`, `arm_r`).
- Produces: `add_animations(armature: bpy.types.Object) -> None` creating actions `idle`, `typing`, `wave`, each looping, 48 frames at 24 fps, each pushed to its own NLA track so all export.

- [ ] **Step 1:** Write `add_animations`. `idle`: slight body bob and head turn. `typing`: both arms alternate small down moves. `wave`: right arm raises and swings.
- [ ] **Step 2:** Run it and read back `[a.name for a in bpy.data.actions]`: expect `idle`, `typing`, `wave`.
- [ ] **Step 3: Verify.** Call `look` with `mode: frames` for each action: expect visible, smooth motion, and the first and last frames matching so the loop does not jump. Ask the user whether the motion feels cute.
- [ ] **Step 4: Commit** locally.

### Task 3: Booth, desk and lighting

**Files:**
- Create: `assets/source/booth.py`

**Interfaces:**
- Consumes: `build_robot`, `add_animations`.
- Produces: `build_scene() -> None` creating a glass-fronted booth, a desk with one screen per robot, a steel-and-amber hall backdrop (floor, back wall, a few pipes, a sign reading "DEVELOPMENT"), two robots named `RobotA` and `RobotB`, and a warm light setup. Screens use an emissive material named `ScreenGlow`.

- [ ] **Step 1:** Write `build_scene`. Warm amber and steel palette matching the reference. Keep the hall simple: no gears, crane, conveyor, stairs, forklift or robot arm.
- [ ] **Step 2:** Run it, then `look` from a high three-quarter angle matching the reference (about 35 degrees down, slightly right). Compare against the reference with the user.
- [ ] **Step 3:** Adjust until the user says the mood is right: warm light, steel, amber trim, glass.
- [ ] **Step 4: Commit** locally.

### Task 4: Export the GLB and test it

**Files:**
- Create: `assets/source/export.py`, `apps/dashboard/tests/glb.test.ts`
- Output: `assets/models/look-test.glb`, copied to `apps/dashboard/public/models/look-test.glb`

**Interfaces:**
- Produces: GLB containing nodes named `RobotA` and `RobotB` and animation names `idle`, `typing`, `wave`.

- [ ] **Step 1: Write the failing test** in `glb.test.ts`: read the GLB's JSON chunk and assert `animations` names include `idle`, `typing`, `wave`; assert nodes include `RobotA` and `RobotB`; assert file size is under 5,000,000 bytes.
- [ ] **Step 2:** Run `npx vitest run tests/glb.test.ts` inside `apps/dashboard`. Expect FAIL: file not found.
- [ ] **Step 3:** Write `export.py` using `bpy.ops.export_scene.gltf` with `export_format='GLB'`, animations on (all actions), Draco off for now. Run it through MCP, then copy the file into `public/models/`.
- [ ] **Step 4:** Run the test again. Expect PASS. If size is over 5 MB, reduce texture sizes or bevel segments and re-export.
- [ ] **Step 5: Commit** locally.

### Task 5: Browser page

**Files:**
- Create: `apps/dashboard/` (Vite React TypeScript app), `src/main.tsx`, `src/App.tsx`, `src/LookTestScene.tsx`, `src/clips.ts`

**Interfaces:**
- Produces: `CLIPS = ['idle', 'typing', 'wave'] as const` and `type ClipName = typeof CLIPS[number]` in `clips.ts`. `LookTestScene` loads `/models/look-test.glb`, plays `typing` on `RobotA` and `idle` on `RobotB`, and has a button row to switch each robot's clip.

- [ ] **Step 1:** Create the Vite app and install React Three Fiber, Drei and postprocessing. Add a Drei `Stats` overlay so frame rate is visible.
- [ ] **Step 2:** Implement `LookTestScene`: fixed high camera with small orbit and zoom disabled, subtle bloom on emissive materials only, a visible "LOOK TEST — not real agent data" label.
- [ ] **Step 3:** If a named clip is missing, show a message naming it. If the GLB fails to load, show an error message. If WebGL is unavailable, show a plain message.
- [ ] **Step 4: Verify.** Run `npm run dev`, open the page. Expect: scene renders, `RobotA` types, `RobotB` idles, buttons switch clips, label is visible.
- [ ] **Step 5: Commit** locally.

### Task 6: Check on the user's PC

- [ ] **Step 1:** Ask the user to open the page and read the `Stats` fps while the page is full screen. Expect 45 fps or better. If lower, check the browser is using the GTX 1650, then lower bloom or shadow quality.
- [ ] **Step 2:** Ask the user to compare the page with the reference image and say what feels right or wrong. Record their answer in the spec's "How we will know it worked".
- [ ] **Step 3:** Run `npx vitest run` and `npm run build`. Expect all tests pass and a successful build.
- [ ] **Step 4: Commit** locally.
