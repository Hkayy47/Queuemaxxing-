import type { Message, QueueConfig, QueueStats, WalEvent } from "./types.js";
import { WAL } from "./wal.js";

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

export class Queue {
  readonly config: QueueConfig;
  private messages: Map<string, Message> = new Map();
  private wal: WAL;
  private mutex = new AsyncMutex();

  constructor(config: QueueConfig, wal: WAL) {
    this.config = config;
    this.wal = wal;
  }

  // Replay WAL events to rebuild in-memory state (called once at startup, no locking needed)
  replayEvents(events: WalEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "create":
          // config already set
          break;
        case "enqueue":
          this.messages.set(event.message.id, { ...event.message });
          break;
        case "receive": {
          const msg = this.messages.get(event.id);
          if (msg) {
            msg.status = "in_flight";
            msg.receiveCount = event.receiveCount;
            msg.leaseExpiresAt = event.leaseExpiresAt;
          }
          break;
        }
        case "ack": {
          const msg = this.messages.get(event.id);
          if (msg) msg.status = "acked";
          break;
        }
        case "nack": {
          const msg = this.messages.get(event.id);
          if (msg) {
            msg.status = "ready";
            msg.leaseExpiresAt = null;
            msg.visibleAt = event.visibleAt;
          }
          break;
        }
      }
    }
  }

  async enqueue(body: string, priority?: number, delaySeconds?: number): Promise<Message> {
    const release = await this.mutex.acquire();
    try {
      const now = Date.now();
      const message: Message = {
        id: crypto.randomUUID(),
        body,
        priority: priority ?? 100,
        createdAt: now,
        visibleAt: now + (delaySeconds ?? 0) * 1000,
        status: "ready",
        receiveCount: 0,
        leaseExpiresAt: null,
      };
      await this.wal.append({ type: "enqueue", message });
      this.messages.set(message.id, message);
      return message;
    } finally {
      release();
    }
  }

  async receive(maxMessages: number): Promise<Message[]> {
    const release = await this.mutex.acquire();
    try {
      const now = Date.now();
      const candidates = this.selectCandidates(now);
      const selected = candidates.slice(0, maxMessages);
      const result: Message[] = [];

      for (const msg of selected) {
        const leaseExpiresAt = now + this.config.visibilityTimeoutMs;
        msg.status = "in_flight";
        msg.receiveCount += 1;
        msg.leaseExpiresAt = leaseExpiresAt;
        await this.wal.append({ type: "receive", id: msg.id, leaseExpiresAt, receiveCount: msg.receiveCount });
        result.push({ ...msg });
      }

      return result;
    } finally {
      release();
    }
  }

  async ack(id: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const msg = this.messages.get(id);
      if (!msg || msg.status !== "in_flight") return false;
      msg.status = "acked";
      msg.leaseExpiresAt = null;
      await this.wal.append({ type: "ack", id });
      return true;
    } finally {
      release();
    }
  }

  async nack(id: string, delaySeconds?: number): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const msg = this.messages.get(id);
      if (!msg || msg.status !== "in_flight") return false;
      const visibleAt = Date.now() + (delaySeconds ?? 0) * 1000;
      msg.status = "ready";
      msg.leaseExpiresAt = null;
      msg.visibleAt = visibleAt;
      await this.wal.append({ type: "nack", id, visibleAt });
      return true;
    } finally {
      release();
    }
  }

  // Called by the sweeper every second
  async expireLeases(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const now = Date.now();
      for (const msg of this.messages.values()) {
        if (msg.status === "in_flight" && msg.leaseExpiresAt !== null && msg.leaseExpiresAt < now) {
          const visibleAt = now;
          msg.status = "ready";
          msg.leaseExpiresAt = null;
          msg.visibleAt = visibleAt;
          await this.wal.append({ type: "nack", id: msg.id, visibleAt });
        }
      }
    } finally {
      release();
    }
  }

  getStats(): QueueStats {
    let ready = 0, inFlight = 0, acked = 0, delayed = 0;
    const now = Date.now();
    for (const msg of this.messages.values()) {
      if (msg.status === "acked") {
        acked++;
      } else if (msg.status === "in_flight") {
        inFlight++;
      } else if (msg.visibleAt > now) {
        delayed++;
      } else {
        ready++;
      }
    }
    return { total: this.messages.size, ready, inFlight, acked, delayed };
  }

  getMessages(): Message[] {
    return Array.from(this.messages.values());
  }

  async close(): Promise<void> {
    await this.wal.close();
  }

  private selectCandidates(now: number): Message[] {
    const eligible = Array.from(this.messages.values()).filter(
      (m) => m.status === "ready" && m.visibleAt <= now
    );

    eligible.sort((a, b) => {
      if (this.config.priority) {
        if (a.priority !== b.priority) return a.priority - b.priority;
      }
      const timeA = a.createdAt;
      const timeB = b.createdAt;
      return this.config.order === "fifo" ? timeA - timeB : timeB - timeA;
    });

    return eligible;
  }
}
