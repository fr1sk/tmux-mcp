#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("tmux", args);
  return stdout.trim();
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

async function run(fn: () => Promise<string>) {
  try {
    return text(await fn());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint =
      msg.includes("no server running") || msg.includes("No such file")
        ? " — is tmux running?"
        : msg.includes("session not found") || msg.includes("can't find")
        ? " — check the target name/index"
        : "";
    return text(`tmux error: ${msg}${hint}`);
  }
}

const server = new McpServer({ name: "tmux-mcp", version: "0.1.0" });

server.tool(
  "list_sessions",
  "List all active tmux sessions. Returns session name, window count, creation time, and attached status.",
  {},
  () =>
    run(async () => {
      const raw = await tmux(
        "list-sessions",
        "-F",
        "#{session_name}\t#{session_windows}\t#{session_created_string}\t#{?session_attached,attached,detached}"
      );
      if (!raw) return "No active tmux sessions.";
      const sessions = raw.split("\n").filter(Boolean).map((line) => {
        const [name, windows, created, status] = line.split("\t");
        return { name, windows: Number(windows), created, attached: status === "attached" };
      });
      return JSON.stringify(sessions, null, 2);
    })
);

server.tool(
  "list_windows",
  "List all windows in a tmux session. Returns window index, name, pane count, and active status.",
  {
    session: z.string().describe("Session name (from list_sessions)"),
  },
  ({ session }) =>
    run(async () => {
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
  "List panes in a tmux target. Pass a session name ('work') or session:window ('work:0'). Returns pane index, size, active status, and running command.",
  {
    target: z.string().describe("Session name or 'session:window'"),
  },
  ({ target }) =>
    run(async () => {
      const raw = await tmux(
        "list-panes",
        "-t", target,
        "-F",
        "#{pane_index}\t#{pane_title}\t#{pane_width}x#{pane_height}\t#{?pane_active,active,}\t#{pane_current_command}"
      );
      const panes = raw.split("\n").filter(Boolean).map((line) => {
        const [index, title, size, active, command] = line.split("\t");
        return { index: Number(index), title, size, active: active === "active", command };
      });
      return JSON.stringify(panes, null, 2);
    })
);

server.tool(
  "capture_pane",
  "Capture current output of a tmux pane. Target format: 'session:window.pane' (e.g. 'work:0.0'). Use list_sessions → list_windows → list_panes to build the target.",
  {
    target: z.string().describe("Pane target: 'session:window.pane'"),
    lines: z.number().int().min(1).max(5000).optional().describe("Lines of scrollback to include (default: 150)"),
  },
  ({ target, lines = 150 }) =>
    run(async () => {
      const output = await tmux("capture-pane", "-t", target, "-p", "-S", `-${lines}`);
      return output || "(pane is empty)";
    })
);

server.tool(
  "send_keys",
  "Send keys or a command to a tmux pane, then capture its output. Target format: 'session:window.pane'. Set enter=false for raw key sequences (e.g. 'C-c', 'Escape', 'Up').",
  {
    target: z.string().describe("Pane target: 'session:window.pane'"),
    keys: z.string().describe("Command or key sequence (tmux notation: 'C-c', 'Escape', 'Up', etc.)"),
    enter: z.boolean().optional().describe("Press Enter after keys (default: true)"),
    capture_lines: z.number().int().min(1).max(5000).optional().describe("Lines to capture after sending (default: 50)"),
    wait_ms: z.number().int().min(0).max(10000).optional().describe("Milliseconds to wait before capturing (default: 400)"),
  },
  ({ target, keys, enter = true, capture_lines = 50, wait_ms = 400 }) =>
    run(async () => {
      const args = ["send-keys", "-t", target, keys];
      if (enter) args.push("Enter");
      await execFileAsync("tmux", args);
      if (wait_ms > 0) await new Promise((r) => setTimeout(r, wait_ms));
      const output = await tmux("capture-pane", "-t", target, "-p", "-S", `-${capture_lines}`);
      return `Keys sent to ${target}.\n\nPane output:\n\n${output}`;
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
