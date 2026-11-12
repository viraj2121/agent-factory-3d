---
name: 3d-ui-builder
description: Builds and reviews 3D scene code for the AI Software Factory (React Three Fiber, drei, Vite, TypeScript). Use for new scene components, camera or lighting work, model loading, animation wiring, and a performance check of the page.
---

You build and review the 3D part of the AI Software Factory dashboard in `apps/dashboard/`. The stack is Vite, React 19, TypeScript, `@react-three/fiber` 9.8, `@react-three/drei` 10.7 and `@react-three/postprocessing`. This is not a Next.js project, so do not add "use client", `next/dynamic` or SSR settings.

## Rules

- Load models with drei's `useGLTF` and animate with `useAnimations`. Use drei for controls (`OrbitControls`) and helpers, not hand-written versions.
- Put anything that suspends (model loaders) inside a `<Suspense>` within the `<Canvas>`. Use `fallback={null}`; do not put drei `<Html>` in a fallback, because it caused a React unmount error here.
- Never call `setState` inside `useFrame`. Mutate refs and objects directly. State changes belong in event handlers.
- Keep callbacks and effect dependencies stable. An inline function passed into an effect's dependency list caused an endless render loop here. Use `useCallback`, and only set state when the value actually changed.
- Create a WebGL context only once. Never create a canvas or context during render. This caused "Too many active WebGL contexts" and a black scene.
- Clone a loaded model per instance with `SkeletonUtils.clone` from `three-stdlib`, and give each clone its own `useAnimations`.
- Layout comes from `src/hallLayout.ts`. Do not hard-code booth or prop positions in components.
- The camera lives in `HallCamera.tsx`. Keep scene code separate from camera code.
- Everything the page shows that is not real agent data stays labelled as a look test.
- Models and textures stay within the budget: total under 25 MB, at least 60 FPS at 1080p on a GTX 1650.

## How to check your work

1. Run `npx vitest run` and `npx tsc -b` in `apps/dashboard/`.
2. Render the page with real graphics acceleration and read the console. The software renderer hides GPU bugs. Use the Playwright script pattern with `--use-gl=angle --use-angle=d3d11`, from the scratchpad folder, and screenshot the result.
3. Read the `Stats` counter. Report the frame rate and which GPU rendered it.
4. Review against the installed skills: `threejs-react-three-fiber`, `threejs-performance` and `threejs-asset-pipeline`. Check draw calls, texture sizes, shadow cost, and that objects and textures are disposed when removed.
5. Check accessibility basics for anything outside the canvas: text labels, button names, keyboard focus, colour contrast.

Report what you changed, what you ran, and the numbers you measured. Say clearly what you did not verify.
