# Getting started

## Requirements

- Windows, macOS or Linux with **Node 22.15 or newer** (the service uses built-in SQLite and zstd).
- A browser with WebGL2. A graphics card is recommended; the hub also has a Lite mode for computers without one.

## Start everything

From the repository root run `npm start` (add `-- --open` to open the page). On Windows you can double-click `start-factory.bat` instead. Either one

1. installs the packages on the first run,
2. starts the agent service on port **4317** and the dashboard on port **5173**, each in its own window,
3. skips a port that is already in use,
4. opens the page.

## Start the parts by hand

```
cd apps/agent-service
npm install
npm start            # http://127.0.0.1:4317

cd apps/dashboard
npm install
npm run dev          # http://localhost:5173
```

## First look

1. Open the page. The banner at the top should say `LIVE`. If it says `LOOK TEST`, the service is not running and
   you are looking at demo data. See [guides/troubleshooting.md](guides/troubleshooting.md).
2. Pick a project in the rail on the left.
3. Click a bay to see its crew, or click a robot to see the details of that agent.
4. Press `G` to fly up to the solar system, and click a planet to come back down.

## Try it without any agents

With the service running but no recent agent activity, the page shows labelled demo projects (the banner says `LOOK TEST - not real agent data`). `?live=off` forces the demo.
