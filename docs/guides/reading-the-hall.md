# Reading the hall

## A robot

| You see | It means |
| --- | --- |
| Lit eyes, works at the desk | The agent is **working** (inferred from timing) |
| A small turning **green** gem and ripple over the head | A live session or helper agent is working |
| Amber tag, waving, an **amber** gem | The agent is **waiting for you** |
| Dim eyes and floating z z Z | The agent ran lately and is quiet |
| Eyes off | The agent is defined in a file but was never seen running |

A robot's **shape** comes from a hash of its agent and name, so the same agent always looks the same.

## A bay
- The bubble over a bay counts its agents: "1 working · 2 asleep".
- `+N more` means more agents than the three desks.
- Where an agent that has never run sits is a guess (from its name, description or tools). The panel says so.

## The project
- The colour of the dome, the strip on the parapet and the sky tell the project's status.
- The banner says `LIVE` for real data and `LOOK TEST` for demo data.

## Click a robot
The panel shows what the service knows about that one agent: its title, kind, state with the reason, what it is doing,
last activity, model, tool calls, MCP servers, plan progress and bay. For an agent file it also shows the tools and the
file, with a link that opens it in VS Code.

## What is decoration
The belt, the drone, the arms over the core, the rocket build, the weather and the glowing lines are decoration. They show
a status but carry no real task. Only the robots, the markers and the status colours are real.
