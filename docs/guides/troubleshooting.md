# Troubleshooting

## The banner says LOOK TEST
The service is not running, so the page shows demo projects. Start it (`npm start` in `apps/agent-service`, or run
`start-factory.bat`). The page flips to live by itself when the service appears. Check
`http://127.0.0.1:4317/api/health`.

## The banner says LIVE but I see no projects
The service only reads sessions from the last 7 days. Set `AGENT_SERVICE_DAYS=30` (1 to 365) or use Settings, Agents.
A project that only has setup files shows as an idle project "found by its setup files".

## A project I expect is missing
- It may be hidden: Settings, Projects.
- Only 8 projects are shown, active ones first.
- Extra folders to look in can be added in Settings, Agents, or with `AGENT_SERVICE_ROOTS`.

## A robot is in the wrong bay
Where an agent that has never run sits is a guess from its name, description or tools, and the panel says so. Once it
runs, what it did decides.

## Working or waiting looks wrong
These states are inferred from timing and the kind of the newest record, not told by the agent. A long silent
tool call can look like waiting. The note in the panel says why the state was chosen.

## The page is slow
- Press the Quality button to try a lower level, or add `?quality=lite`.
- Add `?fx=noao,nobloom,noshadow,nofilm` to switch effects off one by one and see what each one costs.
- The frame rate counter is in Settings, Display.

## "Open in VS Code" does nothing
The link uses the `vscode://` address, so VS Code must be installed and the browser must allow it to open. The page itself
reads and writes no files.

## The 3D scene could not load
Check that the model files are in `apps/dashboard/public/models/`. See [../engineering/assets-and-blender.md](../engineering/assets-and-blender.md).
