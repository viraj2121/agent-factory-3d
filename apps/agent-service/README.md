# Agent service

A small local service that lets the 3D hub show **real** AI coding agents. It only *watches* (read-only); it never
starts, stops or prompts an agent. Design and decisions: `docs/superpowers/specs/2026-11-08-agent-service-design.md`.

## Run

```
cd apps/agent-service
npm install        # dev tools only, the service has no runtime dependencies
npm start          # http://127.0.0.1:4317, this computer only
npm test
```

Needs Node 22.15 or newer (built-in SQLite and zstd). Then open the dashboard (`npm run dev` in `apps/dashboard`):
the banner at the top says `LIVE` when it is connected; when the service is not running the page shows the labelled
demo projects. `?live=off` forces the demo, `?service=http://127.0.0.1:5000` points at another local port.

## What it reads

| Agent | Where | Notes |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/*/*.jsonl`, subagent runs in `<session>/subagents/` | newest 256 KB of each transcript; plan from `TodoWrite` |
| Codex | `~/.codex/state_5.sqlite` + each session file (`.jsonl`, or `.zst` up to 20 MB) | plan from `update_plan`; subagent threads (source `subagent`) are runs |
| GitHub Copilot | VS Code `workspaceStorage/*/chatSessions/*.jsonl` | Copilot CLI sessions and Copilot subagent runs are not read yet |
| Any other agent | `POST /api/hook` | see below; shown as "reported by hook" |

Per project it also lists the **MCP servers** (`~/.claude.json`, `.mcp.json`, `~/.codex/config.toml`,
`.vscode/mcp.json`, plus servers whose tools were called) and the **harness** (CLAUDE.md / AGENTS.md /
copilot-instructions, skills, subagents, slash commands, hooks, plugins).

Folders with agent setup files (CLAUDE.md, AGENTS.md, `.mcp.json`, `.claude`, `.codex`, `.github/copilot-instructions.md`,
`.vscode/mcp.json`) but no recent session are found too and shown as idle projects ("found by its setup files"). By default
the service looks next to folders where agents were used (the parent folder, up to 4 levels deep, skipping `node_modules`,
`.git`, system and hidden folders; 20,000 folders and 8 s at most, repeated every 5 minutes). To look elsewhere set
`AGENT_SERVICE_ROOTS`, for example `AGENT_SERVICE_ROOTS=E:\;D:\Code`. The hub shows at most 8 projects, active ones first.

Only sessions and subagent runs active in the last 7 days are read (`AGENT_SERVICE_DAYS=30` changes that, 1 to 365; a longer time makes the first scan slower). Working / waiting / idle is **inferred** from timing and the kind of
the newest record (see `src/status.ts`); the service says so in every session note.

## The roster: every agent that exists

Each project has a `roster`: one entry per agent, working or not. Sources: agent files (`.claude/agents/*.md`, `.github/agents/*.agent.md`,
`.codex/agents/*.toml`, and `~/.claude/agents`), sessions, and subagent runs. Only name, description, tool names and model are read from an agent
file, never its instructions. State: `running` (working), `needs-you`, `idle` (ran in the last days, now quiet: shown asleep) or `standby` (defined in a
file, no run seen). The bay of a `standby` agent is a guess from its name, description or tools and says so (`departmentBasis`); once it runs, its real
activity decides. Agents from `~/.claude/agents` get no seat in a project until they ran there (`seated: false`). A subagent's run is matched to its agent
file by type name; a type without a file (Explore, `guardian`) is a robot of its own (`role: subagent`).

## What it never sends

Message text, tool inputs and tool results are never sent. Only titles the agent wrote (cut to 120 characters), tool
names, counts, times, folders and config names. MCP `env` values and header values are never read out; command
arguments that look like secrets become `***`.

## Security

- Listens on `127.0.0.1` only.
- `Host` must be this computer and port (against DNS rebinding); a browser `Origin` must be on the list
  (`localhost:5173`, `127.0.0.1:5173`, and 4173 by default; add more with `AGENT_SERVICE_ORIGINS=http://localhost:3000`).
- `POST /api/hook` also needs `Authorization: Bearer <token>` from `~/.ai-factory/token`, which a web page cannot read.

## API

- `GET /api/health`
- `GET /api/snapshot` - projects with sessions, MCP servers, harness, and what each agent kind supports
- `GET /api/events` - server-sent events, a `snapshot` event whenever something changed (checked every 2 s)
- `GET /api/settings` - the saved settings, the file they live in and the days in use
- `PUT /api/settings` - change settings: `days` (1-365 or null), `roots` (full paths), `hiddenProjects` (`[{path, name}]`), `projectNames` (`{folder: name}`, empty = folder name), `display` (the dashboard's choices). Needs an allowed browser Origin or the bearer token. Saved in `~/.ai-factory/settings.json`.
- `POST /api/hook` - `{ "agent": "Aider", "sessionId": "x", "cwd": "E:/Work/App", "event": "tool", "tool": "Edit" }`

Events: `start`, `prompt`, `tool` (with `tool`, optional `command`), `tool_result`, `waiting`, `stop`.
From a shell: `node scripts/report.mjs --agent Aider --session chat1 --event tool --tool Edit --cwd "E:/Work/App"`.

## Not built yet (marked `unsupported` in the API)

Starting, stopping or prompting an agent from the hub; Copilot CLI sessions; agents on other computers.
