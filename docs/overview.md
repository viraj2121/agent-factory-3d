# Overview

The AI Software Factory is a local dashboard that shows the AI coding agents running on your computer as robots in a
3D factory. It is a way to **see** what your agents are doing, at a glance, without opening each tool.

The 3D scene only displays state. A small local service watches the agent tools and reports what it found. Nothing in
the hub starts, stops or prompts an agent.

## What you see

- **The hall.** A round command hub with a glowing core in the middle and three open bays on a ring: Planning,
  Development & Integration, Review & QA. Around them are the rest pods round the core, the design studio, the launch pad, the library (archive) and a
  conveyor belt.
- **The robots.** One robot for every agent that exists in the project, working or not. A working agent has lit eyes and
  works at its desk; one waiting for you waves with an amber tag; an idle one sleeps with z z Z; one that is only defined
  in a file stands by with its eyes off. A small gem over the head marks an agent that is working or waiting.
- **The solar system.** One level up, every project is a planet of one red-dwarf system. Moons are the working agents.
  Click a planet to fly down into that project's hall.
- **Panels.** Click a bay for its crew, click a robot for the details of that agent, open Project info for the
  project's sessions, MCP servers and harness.

## Which agents it can see

Claude Code, Codex and GitHub Copilot Chat (VS Code) are read from their own files. Any other agent can report itself
with a small hook. See [reference/agent-service-api.md](reference/agent-service-api.md).

## Real or demo

The banner at the top says `LIVE` when the service is connected and the data is real. When the service is not
running, the page shows clearly labelled demo projects. Demo and replay data are never shown as real.
