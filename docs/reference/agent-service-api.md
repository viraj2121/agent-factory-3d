# Agent service API

Base address: `http://127.0.0.1:4317` (this computer only). Every request has its `Host` and `Origin` checked.

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | `{ ok, service, version, now }` |
| `GET /api/snapshot` | The latest snapshot of every project |
| `GET /api/events` | The same snapshots as a stream (server-sent events) |
| `GET /api/settings` | The settings file, plus any problems found reading it |
| `PUT /api/settings` | Change settings. Needs an allowed `Origin` or the bearer token. A whole change applies or none of it |
| `POST /api/hook` | Let another agent report itself. Needs the bearer token |

## The token
`~/.ai-factory/token` holds the bearer token. Send it as `Authorization: Bearer <token>`. The helper
`apps/agent-service/scripts/report.mjs` does it for you.

## Snapshot
```
{ generatedAt, version: 1, projects: ProjectView[], capabilities: AgentCapability[], ... }
```
See [data-model.md](data-model.md). `capabilities` lists, per tool, whether it was found, `observe: supported` and
`control: unsupported` (the hub never starts, stops or prompts an agent).

## What is never in it
Message text, tool inputs and results, and the values of environment variables.

## Errors
A request from a wrong `Origin` or `Host` is refused. A `PUT` or `POST` without permission is refused. A settings change
with any wrong value changes nothing.
