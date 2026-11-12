# Agent service: real agents in the hub (design)

Decided by Claude on 2026-11-08 while the user was away ("take decisions for me, don't stop until finished").
Every decision is listed under "Decisions" so the user can overrule it.

## Goal

A local service that finds the AI coding agents running on this computer (Claude Code, Codex, GitHub Copilot,
and any other agent through a hook endpoint), groups them by project, and tells the dashboard what each one is
doing, which MCP servers the project uses and which harness pieces (instructions, skills, hooks, subagents) are in
place. The 3D scene only displays that state.

## Rules it must keep (from CLAUDE.md)

- Never show fake results. Anything the service cannot know is marked `unknown` or `unsupported`, never guessed.
  Demo data in the dashboard stays labelled as demo whenever the service is not connected.
- Bind to `127.0.0.1` only. Check `Origin` (and `Host`, against DNS rebinding) on every request.

## Shape

```
apps/agent-service/           Node 22, TypeScript, no runtime dependencies (node:http, node:sqlite, node:zlib)
  src/model.ts                types: AgentKind, AgentSession, McpServer, HarnessItem, ProjectView, Snapshot
  src/department.ts           tool name + command -> department (planning / development / review / integration)
  src/status.ts               session state from timestamps + last record (running, needs-you, idle, ended)
  src/adapters/claude.ts      ~/.claude/projects/**/*.jsonl transcripts (tail read)
  src/adapters/codex.ts       ~/.codex/state_5.sqlite threads + rollout jsonl (.zst too)
  src/adapters/copilot.ts     VS Code workspaceStorage/*/chatSessions/*.jsonl (patch log) + Copilot CLI
  src/adapters/hooks.ts       sessions reported by any agent through POST /api/hook
  src/mcp.ts                  MCP servers: ~/.claude.json, .mcp.json, ~/.codex/config.toml, .vscode/mcp.json
  src/harness.ts              CLAUDE.md, AGENTS.md, copilot-instructions, skills, subagents, hooks, plugins
  src/projects.ts             group sessions by folder, count seats per department, plan progress
  src/security.ts             Origin / Host check, bearer token for hook posts, redaction
  src/server.ts               HTTP: /api/health, /api/snapshot, /api/events (SSE), /api/hook
  src/scanner.ts              periodic scan with per-file cache (re-parse only files whose mtime/size changed)
apps/dashboard/src/live/      useLive hook, mapping Snapshot -> Project, ProjectInfoPanel
```

## What is real and what is inferred

| Thing | Source | Honest limit |
| --- | --- | --- |
| Session exists, folder, title, model | agent's own files | real |
| Running vs waiting vs idle | time since last record and the last record's kind | inferred, labelled "inferred" |
| Current tool / department | newest tool call in the file | real tool name, department is our mapping |
| Plan progress | Claude `TodoWrite`, Codex `update_plan` todo lists | only when the agent wrote a plan, else `null` (cradle shows no progress, not a made-up number) |
| MCP servers | config files | "configured"; connection state only known for Claude's needs-auth cache; usage counts from tool names `mcp__server__tool` |
| Start / stop / send a prompt | not implemented | every adapter reports `control: unsupported`; the UI says "observe only" |

Privacy: the service never sends message text, tool inputs or tool results to the dashboard. It sends titles the
agent itself wrote, tool names, counts and times. MCP `env` values are never read out (only the key names) and
command arguments that look like secrets are replaced by `***`.

## Decisions

1. **Observe, do not control (v1).** Reading files is safe and works for all three agents today. Launching and
   managing processes is marked unsupported in the API (`capabilities`), with the door left open for later.
2. **Node, no dependencies.** Node 22 has an HTTP server, SQLite and zstd built in; nothing to install or audit.
3. **Port 4317**, env `AGENT_SERVICE_PORT`. Allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`,
   and 4173 (Vite preview); extend with `AGENT_SERVICE_ORIGINS`.
4. **Any other agent** (Cursor, Aider, Gemini CLI, a custom harness) reports through `POST /api/hook` with a bearer
   token kept in `~/.ai-factory/token` (created on first start). Browser pages cannot read it, so a web page
   cannot post fake sessions. Hook-reported sessions are labelled "reported by hook".
5. **"Harness"** is read as the agent harness around the model: instruction files, skills, subagents, hooks and
   plugins. It is shown per project. The demo project named "Relay Pipeline" stays demo data.
6. **Polling, not file watching.** One scan every 2 s with a per-file cache; the SSE stream sends a snapshot when
   it changed. Simple, works on Windows, cheap because only changed files are re-read (tail 256 KB).
7. **Recent only.** Sessions older than 7 days are not listed as projects' agents (they stay out of the hub),
   old zst rollouts are never decompressed.
8. **Dashboard fallback.** If the service is not reachable the dashboard keeps showing the demo projects with the
   LOOK TEST label. When it is reachable, real projects replace the demo ones and the label says LIVE.

## Addendum: the roster (every agent that exists)

Decision: the hub shows every agent of a project, not only the ones that are running. A project has a `roster`: one entry per agent file
(`.claude/agents`, `.github/agents`, `.codex/agents`, `~/.claude/agents`), per live session and per subagent type that ran.
States: `running`, `needs-you`, `idle` (shown asleep) and `standby` (defined, no run seen). Rules that keep it honest:

- A subagent never "waits for you": when done it is idle. Its parent session counts as working while a subagent works.
- The bay of a standby agent is a guess (name, then description, then tools) and is labelled as one; running agents sit where their own tools say.
- Agent files are read for name, description, tools and model only; instructions are never read.
- Account-level agent files are listed but only get a desk after a run in the project.
- Codex subagent records are checked only for the built-in `guardian` reviewer, and the `.codex/agents/*.toml` format is a guess; Copilot subagent runs are not read (no real run was available to check the format).
- Sessions older than `AGENT_SERVICE_DAYS` (default 7) are not read, so older runs do not appear.

