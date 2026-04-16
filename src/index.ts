#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_SESSION = process.env.TMUX_MCP_DEFAULT_SESSION ?? null;
const ALWAYS_USE_TMUX = process.env.TMUX_MCP_ALWAYS_USE === "true";

const tmuxAvailable = await (async () => {
  try { await execFileAsync("tmux", ["-V"]); return true; }
  catch { return false; }
})();

async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("tmux", args);
  return stdout.trim();
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function validateTarget(value: string, label = "target"): void {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${label} '${value}': must not start with '-'`);
  }
}

async function run(fn: () => Promise<string>) {
  if (!tmuxAvailable) {
    return text(
      "tmux is not installed or not on PATH.\n\nInstall:\n  macOS:          brew install tmux\n  Ubuntu/Debian:  sudo apt install tmux\n  Arch:           sudo pacman -S tmux"
    );
  }
  try {
    return text(await fn());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint =
      msg.includes("no server running") || msg.includes("No such file")
        ? " — is tmux running?"
        : msg.includes("no sessions")
        ? " — tmux is running but has no active sessions"
        : msg.includes("session not found") || msg.includes("can't find")
        ? " — check the target name/index"
        : msg.includes("ambiguous")
        ? " — target matches multiple sessions/windows, use a more specific name"
        : msg.includes("not enough space")
        ? " — pane is too small to split"
        : msg.includes("already exists")
        ? " — a session with that name already exists"
        : "";
    return text(`tmux error: ${msg}${hint}`);
  }
}

const server = new McpServer({ name: "tmux-mcp", version: "0.3.0" });

server.tool(
  "list_sessions",
  "List all active tmux sessions. Returns session name, window count, creation time, and attached status. WHEN TO CALL: Call this immediately whenever the user mentions tmux, asks to attach a session, wants to see terminal output, check logs, run a command in a pane, or interact with any running process. Do not answer from memory — always call this tool first to get live state. WORKFLOW: After getting sessions, ask the user which session, call list_windows, ask which window, call list_panes, ask which pane, then call capture_pane.",
  {},
  () =>
    run(async () => {
      const raw = await tmux(
        "list-sessions",
        "-F",
        "#{session_name}\t#{session_windows}\t#{session_created_string}\t#{?session_attached,attached,detached}"
      );
      const sessions = raw.split("\n").filter(Boolean).map((line) => {
        const [name, windows, created, status] = line.split("\t");
        return { name, windows: Number(windows), created, attached: status === "attached" };
      });
      return JSON.stringify(sessions, null, 2);
    })
);

server.tool(
  "list_windows",
  "List all windows in a tmux session. Returns window index, name, pane count, and active status. If there is only one window, auto-select it without asking. If multiple, ask the user which window to use.",
  {
    session: z.string().describe("Session name (from list_sessions)"),
  },
  ({ session }) =>
    run(async () => {
      validateTarget(session, "session");
      const raw = await tmux(
        "list-windows",
        "-t", session,
        "-F",
        "#{window_index}\t#{window_name}\t#{window_panes}\t#{?window_active,active,}"
      );
      const windows = raw.split("\n").filter(Boolean).map((line) => {
        const [index, name, panes, active] = line.split("\t");
        return { index: Number(index), name, panes: Number(panes), active: active === "active" };
      });
      return JSON.stringify(windows, null, 2);
    })
);

server.tool(
  "list_panes",
  "List panes in a tmux target. Pass a session name ('work') or session:window ('work:0'). When only a session name is passed, lists all panes across all windows in that session. Returns pane index, size, active status, and running command. If there is only one pane, auto-select it without asking. If multiple, present them as choices and ask the user which pane to use.",
  {
    target: z.string().describe("Session name or 'session:window'"),
  },
  ({ target }) =>
    run(async () => {
      validateTarget(target, "target");
      const isSessionOnly = !target.includes(":");
      const args = isSessionOnly
        ? ["list-panes", "-s", "-t", target, "-F", "#{pane_index}\t#{pane_title}\t#{pane_width}x#{pane_height}\t#{?pane_active,active,}\t#{pane_current_command}\t#{window_index}"]
        : ["list-panes", "-t", target, "-F", "#{pane_index}\t#{pane_title}\t#{pane_width}x#{pane_height}\t#{?pane_active,active,}\t#{pane_current_command}\t#{window_index}"];
      const raw = await tmux(...args);
      const panes = raw.split("\n").filter(Boolean).map((line) => {
        const [index, title, size, active, command, windowIndex] = line.split("\t");
        return {
          index: Number(index),
          window: Number(windowIndex),
          title,
          size,
          active: active === "active",
          command,
        };
      });
      return JSON.stringify(panes, null, 2);
    })
);

server.tool(
  "capture_pane",
  "Capture current output of a tmux pane. Target format: 'session:window.pane' (e.g. 'work:0.0'). Use list_sessions → list_windows → list_panes to build the target. WARNING: pane output may contain environment variables, API keys, tokens, and credentials — do not call if the pane may contain sensitive data unless the user has confirmed it is safe. AFTER displaying the output, always ask the user what to do next with these options: Refresh (call capture_pane again), Send command (ask what command then call send_keys), Switch pane (restart from list_sessions), Done (stop). Loop until the user picks Done.",
  {
    target: z.string().describe("Pane target: 'session:window.pane'"),
    lines: z.number().int().min(1).max(5000).optional().describe("Lines of scrollback to include (default: 150)"),
  },
  ({ target, lines = 150 }) =>
    run(async () => {
      validateTarget(target, "target");
      const output = await tmux("capture-pane", "-t", target, "-p", "-S", `-${lines}`);
      return output || "(pane is empty)";
    })
);

server.tool(
  "send_keys",
  "Send keys or a command to a tmux pane, then capture its output. Target format: 'session:window.pane'. Use enter=false for raw tmux key sequences like 'C-c', 'Escape', or arrow keys — these are not shell commands and must not have Enter appended. Use enter=true (default) for shell commands. Set wait_ms higher for long-running commands; 0 captures immediately before output appears. WARNING: this executes arbitrary commands in your shell — only use with trusted input.",
  {
    target: z.string().describe("Pane target: 'session:window.pane'"),
    keys: z.string().describe("Command or key sequence (tmux notation: 'C-c', 'Escape', 'Up', etc.)"),
    enter: z.boolean().optional().describe("Press Enter after keys (default: true). Set false for raw key sequences like C-c, Escape, arrow keys."),
    capture_lines: z.number().int().min(1).max(5000).optional().describe("Lines to capture after sending (default: 50)"),
    wait_ms: z.number().int().min(0).max(10000).optional().describe("Milliseconds to wait before capturing (default: 400). Set higher for slow commands, 0 to capture immediately."),
  },
  ({ target, keys, enter = true, capture_lines = 50, wait_ms = 400 }) =>
    run(async () => {
      validateTarget(target, "target");
      const args = ["send-keys", "-t", target, keys];
      if (enter) args.push("Enter");
      await execFileAsync("tmux", args);
      if (wait_ms > 0) await new Promise((r) => setTimeout(r, wait_ms));
      const output = await tmux("capture-pane", "-t", target, "-p", "-S", `-${capture_lines}`);
      return `Keys sent to ${target}.\n\nPane output:\n\n${output}`;
    })
);

server.tool(
  "new_session",
  "Create a new detached tmux session. Before calling, use list_sessions to check whether a session with the requested name already exists.",
  {
    name: z.string().optional().describe("Session name. Omit to let tmux auto-assign one."),
    cwd: z.string().optional().describe("Working directory for the session."),
    command: z.string().optional().describe("Shell command to run immediately in the first window. WARNING: executes in your shell."),
  },
  ({ name, cwd, command }) =>
    run(async () => {
      if (name) validateTarget(name, "name");
      const args = ["new-session", "-d", "-P", "-F", "#{session_name}"];
      if (name) args.push("-s", name);
      if (cwd) args.push("-c", cwd);
      if (command) args.push(command);
      const { stdout } = await execFileAsync("tmux", args);
      const sessionName = stdout.trim();
      return `Session '${sessionName}' created.`;
    })
);

server.tool(
  "new_window",
  "Create a new window in an existing tmux session.",
  {
    session: z.string().describe("Session name to create the window in."),
    name: z.string().optional().describe("Window name."),
    cwd: z.string().optional().describe("Working directory for the new window."),
    command: z.string().optional().describe("Shell command to run immediately. WARNING: executes in your shell."),
  },
  ({ session, name, cwd, command }) =>
    run(async () => {
      validateTarget(session, "session");
      const args = ["new-window", "-t", session, "-d", "-P", "-F", "#{window_index}"];
      if (name) args.push("-n", name);
      if (cwd) args.push("-c", cwd);
      if (command) args.push(command);
      const { stdout } = await execFileAsync("tmux", args);
      const idx = stdout.trim();
      return `Window '${name ?? idx}' created in session '${session}'.`;
    })
);

server.tool(
  "split_pane",
  "Split a tmux pane horizontally or vertically. 'horizontal' = left/right panes side by side. 'vertical' = top/bottom panes stacked. Target format: 'session:window.pane' or 'session:window'.",
  {
    target: z.string().describe("Target pane or window to split: 'session:window.pane'"),
    direction: z.enum(["horizontal", "vertical"]).optional().describe("'horizontal' splits left/right, 'vertical' splits top/bottom (default: horizontal)"),
    cwd: z.string().optional().describe("Working directory for the new pane."),
    command: z.string().optional().describe("Shell command to run in the new pane. WARNING: executes in your shell."),
    size: z.number().int().min(1).max(99).optional().describe("Size of the new pane as a percentage (e.g. 50)."),
  },
  ({ target, direction = "horizontal", cwd, command, size }) =>
    run(async () => {
      validateTarget(target, "target");
      const args = ["split-window", "-t", target, "-d"];
      args.push(direction === "vertical" ? "-v" : "-h");
      if (cwd) args.push("-c", cwd);
      if (size) args.push("-p", String(size));
      if (command) args.push(command);
      await execFileAsync("tmux", args);
      return `Pane split ${direction}ly in '${target}'.`;
    })
);

server.tool(
  "kill_session",
  "Kill a tmux session and all its windows and panes. ALWAYS confirm with the user before calling — this is destructive and cannot be undone.",
  {
    session: z.string().describe("Session name to kill."),
  },
  ({ session }) =>
    run(async () => {
      validateTarget(session, "session");
      await execFileAsync("tmux", ["kill-session", "-t", session]);
      return `Session '${session}' killed.`;
    })
);

server.tool(
  "kill_window",
  "Kill a tmux window and all its panes. ALWAYS confirm with the user before calling — this is destructive and cannot be undone. Target format: 'session:window'.",
  {
    target: z.string().describe("Window target: 'session:window'"),
  },
  ({ target }) =>
    run(async () => {
      validateTarget(target, "target");
      await execFileAsync("tmux", ["kill-window", "-t", target]);
      return `Window '${target}' killed.`;
    })
);

server.tool(
  "kill_pane",
  "Kill a tmux pane and terminate its running process. ALWAYS confirm with the user before calling — this is destructive and cannot be undone. Target format: 'session:window.pane'.",
  {
    target: z.string().describe("Pane target: 'session:window.pane'"),
  },
  ({ target }) =>
    run(async () => {
      validateTarget(target, "target");
      await execFileAsync("tmux", ["kill-pane", "-t", target]);
      return `Pane '${target}' killed.`;
    })
);

server.tool(
  "rename_session",
  "Rename an existing tmux session.",
  {
    session: z.string().describe("Current session name."),
    new_name: z.string().describe("New session name."),
  },
  ({ session, new_name }) =>
    run(async () => {
      validateTarget(session, "session");
      validateTarget(new_name, "new_name");
      await execFileAsync("tmux", ["rename-session", "-t", session, new_name]);
      return `Session '${session}' renamed to '${new_name}'.`;
    })
);

server.tool(
  "rename_window",
  "Rename a window in a tmux session. Target format: 'session:window'.",
  {
    target: z.string().describe("Window target: 'session:window'"),
    new_name: z.string().describe("New window name."),
  },
  ({ target, new_name }) =>
    run(async () => {
      validateTarget(target, "target");
      await execFileAsync("tmux", ["rename-window", "-t", target, new_name]);
      return `Window '${target}' renamed to '${new_name}'.`;
    })
);

server.tool(
  "get_config",
  "Returns the current tmux-mcp configuration: whether tmux is installed, the default session name, and whether the agent is configured to always route shell commands through tmux. Call this at the start of any task to check how the agent should behave. If alwaysUseTmux is true, route all shell commands through send_keys in the configured session instead of direct Bash for the remainder of the task.",
  {},
  () => {
    const config = {
      tmuxAvailable,
      defaultSession: DEFAULT_SESSION,
      alwaysUseTmux: ALWAYS_USE_TMUX,
      instructions: ALWAYS_USE_TMUX && DEFAULT_SESSION
        ? `Always run shell commands via send_keys in session '${DEFAULT_SESSION}' instead of direct Bash. Create the session first with new_session if it doesn't exist.`
        : ALWAYS_USE_TMUX
        ? "Always run shell commands via send_keys in tmux. No default session configured — ask the user which session to use."
        : "Standard mode — use tmux tools only when explicitly asked.",
    };
    return text(JSON.stringify(config, null, 2));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
