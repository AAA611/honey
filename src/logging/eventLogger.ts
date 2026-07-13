import { randomUUID } from "node:crypto";
import type { HarnessEvent } from "../types.js";

export class EventLogger {
  readonly runId = randomUUID();
  private readonly events: HarnessEvent[] = [];

  emit(type: HarnessEvent["type"], payload: Record<string, unknown>, turnId: string | null) {
    this.events.push({
      timestamp: new Date().toISOString(),
      runId: this.runId,
      turnId,
      type,
      payload
    });
  }

  snapshot(): HarnessEvent[] {
    return [...this.events];
  }
}
