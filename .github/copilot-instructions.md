# Instructions for GitHub Copilot

Read [AGENTS.md](../AGENTS.md) at the root of this repository before making changes. It has the layout, the commands
(`npm run install:all`, `npm test`, `npm run typecheck`, `npm start`), and the rules that must not be broken:

- read-only: never add code that starts, stops, prompts, approves or denies an agent;
- never show fake results; demo data is always labelled;
- never read or send message text, tool inputs or results; nothing leaves the computer (the service binds to 127.0.0.1);
- no runtime dependencies in `apps/agent-service`;
- logic changes start with a failing test; visual changes are checked by running the app;
- no personal or company data anywhere in the repository.
