import { randomUUID } from "node:crypto";
import type { EventType, HarnessEvent } from "../types.js";

export interface EventLoggerOptions {
  sessionId?: string;
  /** When set, events are attributed to a nested Subagent under this parent Run. */
  parentRunId?: string;
  onEmit?: (event: HarnessEvent) => void;
}

export class EventLogger {
  readonly runId = randomUUID();
  readonly parentRunId: string | undefined;
  private readonly events: HarnessEvent[] = [];
  private readonly sessionId: string | undefined;
  private readonly onEmit: ((event: HarnessEvent) => void) | undefined;

  constructor(options: EventLoggerOptions = {}) {
    this.sessionId = options.sessionId;
    this.parentRunId = options.parentRunId;
    this.onEmit = options.onEmit;
  }

  emit(type: EventType, payload: Record<string, unknown>, turnId: string | null) {
    const event: HarnessEvent = {
      timestamp: new Date().toISOString(),
      runId: this.runId,
      turnId,
      type,
      payload,
      ...(this.sessionId ? { sessionId: this.sessionId } : {}),
      ...(this.parentRunId ? { parentRunId: this.parentRunId } : {})
    };
    this.events.push(event);
    this.onEmit?.(event);
  }

  snapshot(): HarnessEvent[] {
    return [...this.events];
  }
}
