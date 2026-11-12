# Architecture

```
agent tools on this computer            apps/agent-service              apps/dashboard
(Claude Code, Codex, Copilot,   --->    watches files, infers    --->   draws the hub in 3D
 any agent through a hook)              state, serves JSON/SSE          and the panels around it
        read-only                       127.0.0.1:4317                   localhost:5173
```

## The agent service (`apps/agent-service`)

- Node 22 and TypeScript, **no runtime dependencies**.
- Binds to `127.0.0.1` only and checks the `Host` and `Origin` of every request.
- Adapters read each tool's own files (`adapters/claude.ts`, `codex.ts`, copilot, hook). Each adapter turns what it finds
  into the same shapes: sessions, subagent runs, MCP servers, harness items.
- `status.ts` infers working, waiting or idle from timing and the kind of the newest record. The state is inferred and
  every note says so.
- `roster.ts` builds the list of every agent that exists in a project: agent files, sessions and subagent runs.
- `projects.ts` groups everything per project; `scanner.ts` runs the scans; `server.ts` serves them.
- `settings.ts` keeps `~/.ai-factory/settings.json` (written through a temporary file).

## The dashboard (`apps/dashboard`)

- Vite, React 19, TypeScript, React Three Fiber and drei. Not Next.js.
- `live/` follows the service: `useLive` listens to `/api/events`, `liveProjects.ts` turns a snapshot into the
  dashboard's `Project`, `parseSnapshot` checks what arrives.
- Scene components get the project list as a prop. React context does not cross into the Canvas, so
  `projectsContext.ts` is only for the page parts around it.
- Logic lives in plain TypeScript files with tests (`crew.ts`, `systemLayout.ts`, `crewDetails.ts`, ...); components are
  thin and only draw.

## Two levels

`level` in `App.tsx` is `hall` or `system`. The hall stays mounted but hidden while the solar system is shown, and the
camera flights between them go through the lift-off view (`skyCamera`).

## What owns what

The backend owns execution, process management and status. The 3D scene owns nothing: it draws what it is given.
