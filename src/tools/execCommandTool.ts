import { SessionManager } from "./sessionManager.js";
import { formatSoftFailure } from "../runtime/softFailure.js";
import type { SessionRecord, Tool, ToolExecutionResult } from "../types.js";

const sessionManager = new SessionManager();

export const execCommandTool: Tool = {
  definition: {
    name: "exec_command",
    description:
      "Run a shell command and create or continue a session. Non-zero exit is a Soft failure—diagnose and retry differently.",
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
      return resultFromRecord(record);
    }

    if (action === "write") {
      const record = sessionManager.write(
        String(input.sessionId ?? ""),
        String(input.input ?? "")
      );
      return resultFromRecord(record);
    }

    if (action === "snapshot") {
      const record = sessionManager.snapshot(String(input.sessionId ?? ""));
      return resultFromRecord(record);
    }

    if (action === "terminate") {
      const record = sessionManager.terminate(String(input.sessionId ?? ""));
      return resultFromRecord(record);
    }

    return {
      ok: false,
      content: formatSoftFailure(
        `Unsupported action: ${action}`,
        "exec_command only accepts start, write, snapshot, or terminate",
        "Retry with a supported action"
      )
    };
  }
};

function resultFromRecord(record: SessionRecord): ToolExecutionResult {
  const json = JSON.stringify(record, null, 2);
  const metadata = sessionMetadata(record);

  if (record.status === "exited" && record.exitCode !== 0 && record.exitCode !== null) {
    const output = [record.stderr, record.stdout]
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 1_200);
    const why = output
      ? `Command \`${record.command}\` failed. Output:\n${output}`
      : `Command \`${record.command}\` failed with no captured output`;
    return {
      ok: false,
      content: `${formatSoftFailure(
        `exec_command exited with code ${record.exitCode}`,
        why,
        "Diagnose the output, fix the command or Environment (for example Node version), then retry a different approach—do not repeat the same failing command"
      )}\n\n${json}`,
      metadata
    };
  }

  return {
    ok: true,
    content: json,
    metadata
  };
}

function sessionMetadata(record: SessionRecord) {
  return {
    id: record.id,
    command: record.command,
    status: record.status,
    exitCode: record.exitCode,
    stdout: record.stdout,
    stderr: record.stderr
  };
}
