# Decisions

A short log of choices and the reason for each. Newest first.

## 2026-11-10 — Remove the tubes, the cradle, the clutter and the sky view
The glass tubes with their capsules, the assembly cradle (two arms and a glowing model), the floor clutter and the sky
view with island miniatures were removed. They were decoration that competed with the real agent activity, and the
solar system now shows all projects. `cradle.ts` stays only for the arm solver the library and the core arms use.

## 2026-11-10 — The solar system is a level above the hall
One red-dwarf system, one planet per project. The star is fixed and stands for this computer (every agent runs on it), so
the system does not reshuffle when you pick another project. Moons are working agents.

## 2026-11-09 — A real Milky Way photo for the sky
NASA SVS "Deep Star Maps 2020" replaces the drawn sky. A drawn sky never read as real space. Credit is in
`public/textures/CREDITS.md` and Settings, About.

## 2026-11-09 — Space weather instead of rain
The scene is in space, so rain and clouds were dropped. Weather follows the project's status: dust when idle, a meteor
shower while agents work, an ion storm when it needs you.

## 2026-11-08 — Show every agent, working or not
The hub shows the whole roster: agent files, sessions and subagent runs. A resting agent sleeps; one that never ran
stands by. Where a standby agent sits is a guess and the panel says so.

## 2026-11-08 — One settings file
Everything is saved in `~/.ai-factory/settings.json` by the service. Display choices also live in the browser and the
file wins when the page connects.

## 2026-11-07 — A round command hub
The glass booths felt like cages. The hub is round, with a core in the middle and open bays on a ring.

## Standing decisions
- The service has no runtime dependencies.
- It only watches, read-only.
- State is inferred and says so.
- Dashboard: Vite and React, not Next.js.
- 3D assets are built in Blender and the scripts are kept in `assets/source/`.
