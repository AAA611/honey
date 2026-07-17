import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EventType, HarnessEvent } from "../types.js";

export interface SessionEventLogOptions {
  sessionId: string;
  directory: string;
  mode?: "repl" | "command";
}

export class SessionEventLog {
  readonly path: string;
  readonly sessionId: string;
  private ended = false;

  constructor(options: SessionEventLogOptions) {
    this.sessionId = options.sessionId;
    mkdirSync(options.directory, { recursive: true });
    this.path = join(
      options.directory,
      `${stamp()}-${options.sessionId.slice(0, 8)}.jsonl`
    );
    this.write({
      timestamp: new Date().toISOString(),
      runId: "",
      sessionId: this.sessionId,
      turnId: null,
      type: "session_started",
      payload: {
        path: this.path,
        ...(options.mode ? { mode: options.mode } : {})
      }
    });
  }

  append(event: HarnessEvent): void {
    if (this.ended) {
      return;
    }
    this.write({
      ...event,
      sessionId: event.sessionId ?? this.sessionId
    });
  }

  clear(): void {
    this.emitLifecycle("session_cleared", {});
  }

  end(payload: Record<string, unknown> = {}): void {
    if (this.ended) {
      return;
    }
    this.emitLifecycle("session_ended", payload);
    this.ended = true;
  }

  private emitLifecycle(type: EventType, payload: Record<string, unknown>): void {
    this.write({
      timestamp: new Date().toISOString(),
      runId: "",
      sessionId: this.sessionId,
      turnId: null,
      type,
      payload
    });
  }

  private write(event: HarnessEvent): void {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }
}

export function defaultSessionEventLogDir(cwd: string): string {
  return join(cwd, ".honey", "session-logs");
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
