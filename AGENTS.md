# Working on agent-factory-3d (instructions for AI coding agents)

This file is for AI coding agents (GitHub Copilot, Codex, Claude Code and others) working on this repository. Humans:
start with [README.md](README.md).

## What this is

A local, **read-only** dashboard of the AI coding agents running on this computer:

- **`apps/agent-service`**: Node 22.18+, TypeScript run directly by Node, **no runtime dependencies**. It reads the files
  that Claude Code, Codex and GitHub Copilot Chat already write, works out each agent's state, and serves
  `GET /api/snapshot`, `GET /api/events` (live stream), `GET/PUT /api/settings`, `POST /api/window` (the desktop widget's
  own window) and `POST /api/hook` (any other tool reports itself). Port 4317, bound to `127.0.0.1`.
- **`apps/dashboard`**: Vite + React 19 + TypeScript + React Three Fiber (three.js) + drei. Two pages:
  `index.html` (the 3D hall and solar system) and `widget.html` (the desktop widget). Port 5173.
- **`scripts/`**: Windows helpers. `widget-window.ps1` opens the widget in Edge app mode and pins it; `widget-tab.ps1` is
  the edge tab shown while the widget is docked (WPF from PowerShell); `check-setup.ps1` checks a computer (read-only).
- **`assets/`**: Blender scripts that build the 3D models; exports are copied to `apps/dashboard/public/models/`.

## Commands

```bash
npm run install:all     # install both apps
npm test                # all tests (Vitest), service and dashboard
npm run typecheck       # TypeScript, both apps
npm start               # start the service and the dashboard together
npm run smoke           # real-browser check (needs: cd apps/dashboard && npm i -D playwright && npx playwright install chromium)
```

On Windows: `check-setup.cmd` (checks the computer), `start-widget.cmd` / `stop-widget.cmd` (desktop widget),
`start-factory.bat` (3D hall).

## Rules that must not be broken

1. **Read-only.** Never add code that starts, stops, prompts, approves or denies an agent. These are marked
   `control: unsupported`. Changing that needs an explicit decision by the repository owner.
2. **Never show fake results.** If something is not known, show "unknown" or leave it out. Demo or sample data must be
   clearly labelled as demo (the 3D page says "LOOK TEST"). The desktop widget shows live data only.
3. **Privacy.** Read only names, tool names, counts and times. Never read or send message text, tool inputs or tool
   results. Never read the values of environment variables in MCP config. Nothing leaves the computer.
4. **Local only.** The service binds to `127.0.0.1` and checks `Host` and `Origin`. Changes (`PUT /api/settings`,
   `POST /api/window`, `POST /api/hook`) need an allowed browser Origin or the bearer token in `~/.ai-factory/token`.
5. **No runtime dependencies in the agent service.** Use Node built-ins.
6. **Windows file names are case-insensitive.** Never give a component (`Foo.tsx`) the same name as a logic file (`foo.ts`)
   in the same folder.
7. **No personal or company data** in code, tests, docs or pictures. Use made-up names and paths such as `E:/Work/App`.

## How to make a change

- **Logic** (parsing tool files, working out states, mapping activity, layout maths, anything with a clear answer):
  write the failing test first in `apps/*/tests/`, see it fail, then write the code, then run `npm test`.
- **Looks** (3D scene, panels, widget): run the app and look at it. `npm run smoke` checks the main paths and that the
  browser console has no errors.
- Before saying a change is done: `npm test` and `npm run typecheck` pass, and you looked at the result if it is visual.
- Keep code comments in plain words: what it does and why.

## Where things are

| Area | Files |
|---|---|
| Reading Claude Code | `apps/agent-service/src/adapters/claude.ts` |
| Reading Codex | `apps/agent-service/src/adapters/codex.ts` |
| Reading Copilot Chat (VS Code) | `apps/agent-service/src/adapters/copilot.ts` |
| Inferred state (working, waiting, idle) | `apps/agent-service/src/status.ts` |
| Roster of agents per project | `apps/agent-service/src/roster.ts` |
| HTTP routes and checks | `apps/agent-service/src/server.ts` |
| Widget window control (pin, fade, hide) | `apps/agent-service/src/window.ts` |
| Live data in the page | `apps/dashboard/src/live/` |
| Desktop widget | `apps/dashboard/src/widget/` (`WidgetApp.tsx`, `OrbitSky.tsx`, `orbit.ts`), `apps/dashboard/src/widgetRows.ts` |
| 3D hall | `apps/dashboard/src/HubScene.tsx`, `hubLayout.ts` and the files they import |
| Solar system | `apps/dashboard/src/SystemWorld.tsx`, `systemLayout.ts` |
| Demo projects (labelled) | `apps/dashboard/src/projects.ts` |

More: [docs/architecture.md](docs/architecture.md), [docs/reference/data-model.md](docs/reference/data-model.md),
[apps/agent-service/README.md](apps/agent-service/README.md).
