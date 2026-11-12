# Data model

The shapes the service sends (`apps/agent-service/src/model.ts`). The dashboard imports the same types.

## ProjectView
| Field | Meaning |
| --- | --- |
| `id`, `name`, `path` | Stable id made from the folder, its name, its absolute path |
| `status` | `running`, `needs-you` or `idle` |
| `activity` | 0 to 1, the share of sessions that are running |
| `progress` | 0 to 1 from the agents' own plans, or `null` when no agent wrote a plan |
| `attention` | The department asking for a person, or `null` |
| `agents` | Seats used per department, 0 to 3 |
| `discovered` | True for a folder found only by its setup files |
| `sessions`, `roster`, `mcp`, `harness` | The lists below |
| `docs`, `docsTruncated` | The project's markdown files (path, name, size, date; never contents), up to 300 |

## AgentSession
A main session of an agent tool: `id`, `agent`, `agentLabel`, `projectPath`, `title` (written by the agent, never a message),
`model`, `lastActivityAt`, `state`, `stateNote` (why we think so), `currentTool` (a name only), `department`, `plan`
(`done` of `total`), `mcpCalls` (by server name), `toolCount`.

## RosterEntry
One robot. `role` is `definition` (an agent file), `session` or `subagent`. `state` is one of:

| State | Meaning |
| --- | --- |
| `running` | working |
| `needs-you` | waiting for the person |
| `idle` | ran lately and is quiet |
| `standby` | defined in a file, never seen running |

Other fields: `department` and `departmentBasis` (`activity`, or a guess from `name`, `description`, `tools`, or
`unknown`), `lastSeenAt`, `currentTool`, `parentId`, `runs` (in the last 7 days), `seated`.

## McpServer
`name`, `scope`, `agent`, `transport`, `target` (secret-looking parts replaced by `***`), `envKeys` (names only),
`configFile`.

## HarnessItem
`kind`, `agent`, `name`, `scope` (`user` or `project`), `path`.

## Departments
`planning`, `development` (Development & Integration) and `review` (Review & QA). Commit, push and deploy work counts as development.
