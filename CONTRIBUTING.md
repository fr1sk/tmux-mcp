# Contributing

## Setup

```bash
git clone https://github.com/fr1sk/tmux-mcp.git
cd tmux-mcp
npm install
```

## Development

```bash
npm run dev   # watch mode — rebuilds on save
npm run build # single build
npm start     # run the built server
```

## Testing locally

Point your MCP client at the local build instead of npx:

```json
{
  "mcp": {
    "tmux": {
      "type": "local",
      "command": ["node", "/path/to/tmux-mcp/dist/index.js"]
    }
  }
}
```

You can also test the MCP protocol directly by piping JSON-RPC messages:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node dist/index.js
```

## Adding a tool

1. Add your tool in `src/index.ts` using `server.tool(name, description, schema, handler)`
2. Wrap the handler in `run()` for consistent error handling
3. Call `validateTarget()` on any user-supplied tmux target string
4. Add the tool to the Tools table in `README.md` with a parameter table
5. Add a usage example to the Usage examples section
6. Update `CHANGELOG.md`
7. Bump the version in `package.json` and the `McpServer` constructor in `src/index.ts`

## Tool description guidelines

Descriptions are instructions to the AI, not just documentation. Follow these conventions:

- **WHEN TO CALL** — tell the AI exactly what user intent should trigger this tool
- **WORKFLOW** — describe the sequence of tool calls that should follow
- **AFTER** — describe what the AI should do after the tool returns
- **ALWAYS** — use this prefix for non-negotiable behavior (e.g. confirm before destructive ops)
- **WARNING** — use for security-relevant notes the AI must surface to the user

## Pull requests

- Keep changes focused — one fix or feature per PR
- Run `npm run build` before opening a PR — no TypeScript errors
- Update `CHANGELOG.md` under a new version heading
- If adding a tool, include a manual test showing it working against a real tmux session

## Reporting issues

Open an issue at https://github.com/fr1sk/tmux-mcp/issues with:
- tmux version (`tmux -V`)
- Node.js version (`node -v`)
- MCP client (OpenCode, Claude Code, Cursor, etc.)
- What you expected vs. what happened
