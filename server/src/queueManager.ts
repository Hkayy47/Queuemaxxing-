import path from "path";
import fsp from "fs/promises";
import type { QueueConfig } from "./types.js";
import { Queue } from "./queue.js";
import { WAL } from "./wal.js";

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private readonly dataDir: string;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async init(): Promise<void> {
    // Recover existing queues from WAL on disk
    const queuesDir = path.join(this.dataDir, "queues");
    try {
      const entries = await fsp.readdir(queuesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        const wal = new WAL(this.dataDir, name);
        await wal.open();
        const events = await wal.replay();
        // Find the create event to get config
        const createEvent = events.find((e) => e.type === "create");
        if (!createEvent || createEvent.type !== "create") {
          await wal.close();
          continue;
        }
        const queue = new Queue(createEvent.config, wal);
        queue.replayEvents(events);
        this.queues.set(name, queue);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // No queues dir yet — that's fine
    }

    // Start the lease expiry sweeper
    this.sweepInterval = setInterval(() => {
      for (const queue of this.queues.values()) {
        queue.expireLeases().catch(console.error);
      }
    }, 1000);
  }

  async shutdown(): Promise<void> {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  async createQueue(
    name: string,
    order: "fifo" | "lifo",
    priority: boolean,
    visibilityTimeoutMs?: number
  ): Promise<Queue> {
    if (this.queues.has(name)) {
      throw new Error(`Queue "${name}" already exists`);
    }

    const config: QueueConfig = {
      name,
      order,
      priority,
      visibilityTimeoutMs: visibilityTimeoutMs ?? 30000,
      maxReceiveCount: 5,
    };

    const wal = new WAL(this.dataDir, name);
    await wal.open();
    await wal.append({ type: "create", config });

    const queue = new Queue(config, wal);
    this.queues.set(name, queue);
    return queue;
  }

  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  listQueues(): Array<{ config: QueueConfig; stats: ReturnType<Queue["getStats"]> }> {
    return Array.from(this.queues.values()).map((q) => ({
      config: q.config,
      stats: q.getStats(),
    }));
  }

  async deleteQueue(name: string): Promise<boolean> {
    const queue = this.queues.get(name);
    if (!queue) return false;
    this.queues.delete(name);
    // Close open file handles first (important on Windows), then remove dir
    await queue.close();
    const wal = new WAL(this.dataDir, name);
    await wal.deleteDir();
    return true;
  }
}
