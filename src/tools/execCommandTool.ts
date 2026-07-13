import { SessionManager } from "./sessionManager.js";
import type { Tool } from "../types.js";

const sessionManager = new SessionManager();

export const execCommandTool: Tool = {
  definition: {
    name: "exec_command",
    description: "Run a shell command and create or continue a session.",
    risk: "guarded",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "write", "snapshot", "terminate"] },
        command: { type: "string" },
        sessionId: { type: "string" },
        input: { type: "string" }
      },
      required: ["action"]
    }
  },
  async execute(input, context) {
    const action = String(input.action ?? "");
    if (action === "start") {
      const record = sessionManager.create(String(input.command ?? ""), context.cwd);
      return {
        ok: true,
        content: JSON.stringify(record, null, 2),
        metadata: sessionMetadata(record)
      };
    }

    if (action === "write") {
      const record = sessionManager.write(String(input.sessionId ?? ""), String(input.input ?? ""));
      return {
        ok: true,
        content: JSON.stringify(record, null, 2),
        metadata: sessionMetadata(record)
      };
    }

    if (action === "snapshot") {
      const record = sessionManager.snapshot(String(input.sessionId ?? ""));
      return {
        ok: true,
        content: JSON.stringify(record, null, 2),
        metadata: sessionMetadata(record)
      };
    }

    if (action === "terminate") {
      const record = sessionManager.terminate(String(input.sessionId ?? ""));
      return {
        ok: true,
        content: JSON.stringify(record, null, 2),
        metadata: sessionMetadata(record)
      };
    }

    return {
      ok: false,
      content: `Unsupported action: ${action}`
    };
  }
};

function sessionMetadata(record: {
  id: string;
  command: string;
  status: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}) {
  return {
    id: record.id,
    command: record.command,
    status: record.status,
    exitCode: record.exitCode,
    stdout: record.stdout,
    stderr: record.stderr
  };
}
