# Testing

## Run the tests
```
cd apps/dashboard
npx vitest run          # the dashboard's logic

cd apps/agent-service
npm test                # the service
```
Type check: `npx tsc -b` in either folder.

## What is tested, and how
- **Logic is tested first** (test-driven): event parsing, status changes, mapping agent activity to departments, crew and
  roster building, layout maths (`systemLayout.ts`), the crew panel's rows (`crewDetails.ts`), settings, the noise that
  surfaces are made from.
- **How the 3D scene looks is not unit tested.** Check it by running the app and looking: take screenshots in a real
  browser, with the real graphics chip (`--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist`). The software renderer
  hides some bugs.
- **Layout tests against the baked floor** read the exported model and compare its anchors with `hubLayout.ts`.

## Habits that paid off
- Watch a test fail before making it pass.
- Keep still props inside `StaticMerge` and moving parts outside; check the frame rate after adding scenery.
- After changing a shader or a texture, look at it close up as well as from far away.
- When checking with the agent service running, remember the rail shows real project names, not the demo ones.

## Before saying something is done
Run the type check and the whole suite, look at the result in the browser, and say plainly what was and was not checked.
