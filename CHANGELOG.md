# Changelog

## 0.3.3

- docs: highlight always-use-tmux agent observability feature in README
- docs: add server.json and mcpName for official MCP registry
- fix: remove self-dependency from package.json
- docs: recommend global install over npx

## 0.3.0

- Added `new_window`, `split_pane`, `kill_session`, `kill_window`, `kill_pane`, `rename_session`, `rename_window`, `get_config` tools
- Added `cwd` and `command` parameters to `new_session`
- Added `TMUX_MCP_ALWAYS_USE` and `TMUX_MCP_DEFAULT_SESSION` env var support
- Added startup tmux availability check — all tools return a readable error if tmux is not installed
- Fixed `new_session` returning wrong session name when other sessions exist (now uses `-P -F`)
- Fixed `new_window` returning wrong window index (now uses `-P -F`)
- Fixed `get_config` being unreachable when tmux is absent (now bypasses `run()`)
- Fixed `list_panes` with session-only target now uses `-s` to list all panes across all windows
- Fixed dead code path in `list_sessions` — empty session list error now handled by `run()` hint
- Added target validation to reject flag-injection attempts (targets starting with `-`)
- Added error hints for `ambiguous`, `not enough space`, `already exists`, `no sessions`
- Added workflow instructions to tool descriptions for interactive AI behavior
- Added security warnings to `capture_pane`, `send_keys`, and `command` param descriptions
- Added `ALWAYS confirm` instruction to all kill tool descriptions

## 0.2.0

- Added `new_window` (with `name`, `cwd`, `command`)
- Added `split_pane` (with `direction`, `cwd`, `command`, `size`)
- Added `kill_session`, `kill_window`, `kill_pane`
- Added `rename_session`, `rename_window`
- Added `cwd` and `command` to `new_session`
- Added `LICENSE` file
- Added `repository`, `author`, `homepage` to `package.json`

## 0.1.0

- Initial release
- Tools: `list_sessions`, `list_windows`, `list_panes`, `capture_pane`, `send_keys`, `new_session`
