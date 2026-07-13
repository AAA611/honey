import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { SessionRecord } from "../types.js";

interface ActiveSession {
  process: ChildProcessWithoutNullStreams;
  record: SessionRecord;
}

export class SessionManager {
  private readonly sessions = new Map<string, ActiveSession>();

  create(command: string, cwd: string): SessionRecord {
    const process = spawn(command, {
      cwd,
      shell: true,
      stdio: "pipe"
    });

    const record: SessionRecord = {
      id: randomUUID(),
      command,
      status: "running",
      exitCode: null,
      stdout: "",
      stderr: ""
    };

    process.stdout.on("data", (chunk: Buffer) => {
      record.stdout += chunk.toString("utf8");
    });

    process.stderr.on("data", (chunk: Buffer) => {
      record.stderr += chunk.toString("utf8");
    });

    process.on("close", (code) => {
      record.status = "exited";
      record.exitCode = code ?? null;
    });

    this.sessions.set(record.id, { process, record });
    return { ...record };
  }

  write(sessionId: string, input: string): SessionRecord {
    const session = this.requireSession(sessionId);
    session.process.stdin.write(input);
    return { ...session.record };
  }

  terminate(sessionId: string): SessionRecord {
    const session = this.requireSession(sessionId);
    session.process.kill("SIGTERM");
    return { ...session.record };
  }

  snapshot(sessionId: string): SessionRecord {
    return { ...this.requireSession(sessionId).record };
  }

  private requireSession(sessionId: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return session;
  }
}
