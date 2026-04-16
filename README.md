# tmux-mcp

MCP server that exposes your tmux sessions to AI assistants — list sessions, windows, and panes, capture output, and send commands.

Works with Claude Code, OpenCode, Cursor, Windsurf, and any MCP-compatible host.

## Tools

| Tool | Description |
|---|---|
| `list_sessions` | List all active tmux sessions |
| `list_windows` | List windows in a session |
| `list_panes` | List panes in a session or window |
| `capture_pane` | Capture current output of a pane |
| `send_keys` | Send a command or key sequence to a pane |

## Install

```bash
npx tmux-mcp
```

Or globally:

```bash
npm install -g tmux-mcp
```

## Configure

### Claude Code (`~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "tmux": {
      "command": "npx",
      "args": ["-y", "tmux-mcp"]
    }
  }
}
```

### OpenCode (`~/.config/opencode/config.json`)

```json
{
  "mcp": {
    "tmux": {
      "type": "local",
      "command": ["npx", "-y", "tmux-mcp"]
    }
  }
}
```

### Cursor / Windsurf (`mcp.json`)

```json
{
  "mcpServers": {
    "tmux": {
      "command": "npx",
      "args": ["-y", "tmux-mcp"]
    }
  }
}
```

## Usage

Once configured, you can ask your AI assistant things like:

- "What tmux sessions do I have running?"
- "Show me the output of my dev server pane"
- "Send Ctrl-C to work:0.1"
- "Run `git status` in my work session"

## Target Format

Pane targets follow tmux's `session:window.pane` notation:

```
default        → session named "default" (all windows)
default:0      → window 0 of session "default"
default:0.0    → pane 0 of window 0 of session "default"
```

Use `list_sessions` → `list_windows` → `list_panes` to discover the right target.

## Requirements

- Node.js 18+
- tmux installed and on `$PATH`
