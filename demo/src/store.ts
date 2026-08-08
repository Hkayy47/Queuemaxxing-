import type { ActivityEntry, Destination, SinkMode } from "./types.js";
import { queueNameFor } from "./types.js";

const MAX_ACTIVITY = 200;

export class DemoStore {
  private destinations = new Map<string, Destination>();
  private activity: ActivityEntry[] = [];

  listDestinations(): Destination[] {
    return Array.from(this.destinations.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  getDestination(id: string): Destination | undefined {
    return this.destinations.get(id);
  }

  addDestination(input: {
    id: string;
    name: string;
    sinkUrl: string;
    mode: SinkMode;
  }): Destination {
    const dest: Destination = {
      id: input.id,
      name: input.name,
      sinkUrl: input.sinkUrl,
      queueName: queueNameFor(input.id),
      mode: input.mode,
      createdAt: Date.now(),
      receivedOk: 0,
      receivedFail: 0,
    };
    this.destinations.set(dest.id, dest);
    return dest;
  }

  updateMode(id: string, mode: SinkMode): Destination | undefined {
    const dest = this.destinations.get(id);
    if (!dest) return undefined;
    dest.mode = mode;
    return dest;
  }

  deleteDestination(id: string): boolean {
    return this.destinations.delete(id);
  }

  recordSinkHit(id: string, ok: boolean): void {
    const dest = this.destinations.get(id);
    if (!dest) return;
    if (ok) dest.receivedOk += 1;
    else dest.receivedFail += 1;
  }

  /** Decide HTTP status for a sink based on its mode. */
  resolveSinkStatus(id: string): number {
    const dest = this.destinations.get(id);
    if (!dest) return 404;
    if (dest.mode === "always_ok") return 200;
    if (dest.mode === "always_5xx") return 500;
    // flaky: ~50% 500
    return Math.random() < 0.5 ? 500 : 200;
  }

  pushActivity(entry: Omit<ActivityEntry, "id" | "ts"> & { ts?: number }): ActivityEntry {
    const full: ActivityEntry = {
      id: crypto.randomUUID(),
      ts: entry.ts ?? Date.now(),
      kind: entry.kind,
      message: entry.message,
      destinationId: entry.destinationId,
      eventId: entry.eventId,
      senderId: entry.senderId,
      statusCode: entry.statusCode,
      delaySeconds: entry.delaySeconds,
    };
    this.activity.unshift(full);
    if (this.activity.length > MAX_ACTIVITY) this.activity.length = MAX_ACTIVITY;
    return full;
  }

  listActivity(limit = 80): ActivityEntry[] {
    return this.activity.slice(0, limit);
  }
}
