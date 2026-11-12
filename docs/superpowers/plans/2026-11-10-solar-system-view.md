# Solar system view: implementation plan

**Goal:** a new top level above the hall. Every project is a planet of one red-dwarf system; picking one flies down into its hall.

**Design (agreed in the playground `docs/superpowers/mockups/space-solar-playground.html`):**
- The star is fixed and stands for this computer (decoration). It is a red dwarf: a cellular surface, a corona, and flares that come more often when more agents work.
- A project is a planet. Its look (eight kinds) is stable per project; its orbit follows its place in the project list. Planets are tidally locked (the same face to the star).
- Agents are moons (green, one per working agent). A project that needs you shows an amber moon and an expanding amber ring. A resting project is dark.
- The current project is marked YOU ARE HERE. Click a planet (or its name in the rail) to fly down into that project's hall.
- The hall and the sky view with the islands stay as they are. The levels are: system, then island (today's sky view), then hall.

**Architecture:** `level: 'hall' | 'system'` lives in `App.tsx`. `HubScene` shows either the hall group (kept mounted, hidden) or `SystemWorld`. All layout maths is plain TypeScript in `systemLayout.ts` (tested). Planet and star surfaces are baked on canvases once (`planetTextures.ts`, `starTexture.ts`) and drawn by small shaders (`systemMaterials.ts`) that do their own lighting from the star, so they do not depend on the hall's lights.

**Rules kept:** nothing invented. Moon counts and flares come from the project's real agents; the star, orbits and textures are decoration and labelled so in the Settings credits.

## Stage 1 (this build)
1. `systemLayout.ts` (test first): planet kinds, orbit radii, positions over time, tidal yaw, agent counts, camera views, flare period.
2. `planetTextures.ts`, `starTexture.ts`: noise and the baked surfaces (noise tested).
3. `systemMaterials.ts`: planet, star, glow shaders.
4. `SystemWorld.tsx`: star, orbits, planets, moons, labels, click to enter.
5. Wire `level` through `App.tsx`, `HubScene.tsx`, `HubCamera.tsx`; transitions both ways; key `G` and a System button; `?focus=system`.
6. Docs: CLAUDE.md. Verify in the browser.

## Later stages (not in this build)
- Stage 2: the star's magnetic loops and coronal ejections; the other kinds of star (Our Sun, two suns, black hole, blue giant) as a Settings choice; Look closer.
- Stage 3: the galaxy of workspaces.
