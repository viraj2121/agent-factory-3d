# Environment variables

All of them belong to the agent service and are optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `AGENT_SERVICE_PORT` | `4317` | The port the service listens on (always on `127.0.0.1`) |
| `AGENT_SERVICE_ORIGINS` | none | Extra browser origins that may call the service, separated by commas |
| `AGENT_SERVICE_DAYS` | `7` | How many days back sessions and subagent runs are read, 1 to 365. A longer time makes the first scan slower |
| `AGENT_SERVICE_ROOTS` | next to folders where agents were used | Folders to look in for agent setup files, separated by `;` (for example `E:\;D:\Code`) |

## Related files
- `~/.ai-factory/settings.json`: the settings, written by the service.
- `~/.ai-factory/token`: the bearer token for `POST /api/hook` and for changing settings from outside the page.

## Discovery limits
Folders are searched up to 4 levels deep, skipping `node_modules`, `.git`, system and hidden folders; at most 20,000
folders and 8 seconds per search, repeated every 5 minutes.
