# Settings

Open them with the **Settings** button. Everything is saved in one file, `~/.ai-factory/settings.json`, by the service.
Display choices also live in the browser; when the page connects, the file wins.

| Section | What you can change |
| --- | --- |
| **Projects** | Hide a project from the rail and the solar system, or rename it for display. A hidden project frees its place, so the next project comes in (at most 8 are shown). |
| **Agents** | How many days back to read (1 to 365, default 7), extra folders to look in for agent setup files, and the state of the service. |
| **Display** | Quality (Auto, High, Balanced, Fast, Lite), the frame-rate counter, glass blur, labels (all, names, none), motion (system, reduced, full), the space theme and space weather. |
| **Scenery** (in Display) | How much decoration the hall shows: Full, **Calm** (the default: the cart and two couriers stay; no crowd of walking robots, steam, sparks, dust or drone) or Real only (just the hall and the agents). |
| **Sound & camera** | Sound on or off, volume, and how long the idle tour waits (off, 15, 30 or 60 seconds). |
| **About** | What the hub does, credits (the sky photo is NASA), and a reset of the display choices. |

## Space themes
- **Deep space**: a black sky with the Milky Way and a distant moon.
- **Nebula**: purple and teal gas across the sky.
- **Aurora planet**: green aurora curtains over a dark planet.

## Quality
Auto starts lower on a weak or software-only graphics chip and steps down by itself when the frame rate stays low.
Lite is for computers with no graphics card: no shadows, glow, blur, shield dome or weather, and a lower resolution.

## Changing settings from outside
`PUT /api/settings` needs an allowed `Origin` or the bearer token. A whole change applies or none of it. See
[../reference/agent-service-api.md](../reference/agent-service-api.md).
