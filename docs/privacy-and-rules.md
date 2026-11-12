# Privacy and rules

## Rules the project keeps

1. **Never show fake results.** If an agent cannot do something, it is marked unsupported. Mock or replay data is
   clearly labelled.
2. **Bind the local service to `127.0.0.1` and check `Origin`** on requests.
3. **Read-only.** The hub watches; starting, stopping or prompting an agent is marked `control: unsupported`.

## What is read

- Titles the agents wrote for their sessions.
- Names of tools and counts of tool calls.
- Times: when a session last wrote something.
- Names and paths of agent setup files, MCP servers and harness items.
- Plan progress from the agent's own task list (`TodoWrite`, `update_plan`).

## What is never read out

- The text of messages.
- Tool inputs and tool results.
- Environment variable **values** of MCP servers (only the names of the variables are listed). Secret-looking parts of a
  server's target are replaced by `***`.

## Inferred, not told

Working, waiting for you and asleep are **inferred** from timing and the kind of the newest record. Every note in the
hub says so. Where an agent that has never run sits is a guess (from its name, description or tools) and the panel
says that too.

## Decoration

Belts, the drone, the weather, the star of the solar system, the orbits and the planet surfaces are decoration. They
show a status, but they carry no real task. This is said in Settings, About.

## Settings and tokens

Settings are in `~/.ai-factory/settings.json`. A change needs an allowed `Origin` or the bearer token in
`~/.ai-factory/token`. A whole change applies or none of it.
