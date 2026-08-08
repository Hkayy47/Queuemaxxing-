import { queueClient } from "./queueClient.js";
import type { DemoStore } from "./store.js";
import { backoffSeconds, type WebhookJob } from "./types.js";

const MAX_ATTEMPTS = 5;
const POLL_IDLE_MS = 400;

/**
 * Concurrent webhook senders.
 * Each sender loops: pick a destination queue → receive → HTTP POST sink → ack / nack+delay.
 */
export class SenderPool {
  private store: DemoStore;
  private running = false;
  private workers: Array<Promise<void>> = [];
  private abort = false;
  private senderCount = 0;
  private deliveriesOk = 0;
  private deliveriesFail = 0;
  private retries = 0;

  constructor(store: DemoStore) {
    this.store = store;
  }

  getStatus() {
    return {
      running: this.running,
      senderCount: this.senderCount,
      deliveriesOk: this.deliveriesOk,
      deliveriesFail: this.deliveriesFail,
      retries: this.retries,
    };
  }

  async start(count: number): Promise<void> {
    await this.stop();
    const n = Math.max(1, Math.min(count, 12));
    this.abort = false;
    this.running = true;
    this.senderCount = n;
    this.store.pushActivity({
      kind: "sender_start",
      message: `Started ${n} concurrent sender${n === 1 ? "" : "s"}`,
    });
    this.workers = [];
    for (let i = 1; i <= n; i++) {
      this.workers.push(this.workerLoop(i));
    }
  }

  async stop(): Promise<void> {
    if (!this.running && this.workers.length === 0) return;
    this.abort = true;
    this.running = false;
    await Promise.allSettled(this.workers);
    this.workers = [];
    const prev = this.senderCount;
    this.senderCount = 0;
    if (prev > 0) {
      this.store.pushActivity({
        kind: "sender_stop",
        message: `Stopped senders`,
      });
    }
  }

  private async workerLoop(senderId: number): Promise<void> {
    while (!this.abort) {
      const destinations = this.store.listDestinations();
      if (destinations.length === 0) {
        await sleep(POLL_IDLE_MS);
        continue;
      }

      // Round-robin-ish: try destinations in random order so all queues get drained
      const order = shuffle(destinations);
      let didWork = false;

      for (const dest of order) {
        if (this.abort) break;
        try {
          const messages = await queueClient.receive(dest.queueName, 1);
          if (messages.length === 0) continue;
          didWork = true;
          const msg = messages[0];
          await this.deliver(senderId, dest.queueName, msg.id, msg.body, msg.receiveCount);
        } catch (err: unknown) {
          const text = err instanceof Error ? err.message : String(err);
          // Queue missing / empty transient — keep going
          if (!text.includes("404")) {
            console.error(`[sender ${senderId}]`, text);
          }
        }
      }

      if (!didWork) await sleep(POLL_IDLE_MS);
    }
  }

  private async deliver(
    senderId: number,
    queueName: string,
    messageId: string,
    body: string,
    receiveCount: number
  ): Promise<void> {
    let job: WebhookJob;
    try {
      job = JSON.parse(body) as WebhookJob;
    } catch {
      await queueClient.ack(queueName, messageId);
      return;
    }

    if (receiveCount > MAX_ATTEMPTS) {
      await queueClient.ack(queueName, messageId);
      this.deliveriesFail += 1;
      this.store.pushActivity({
        kind: "gave_up",
        senderId,
        destinationId: job.destinationId,
        eventId: job.eventId,
        message: `Gave up on ${job.eventId} after ${receiveCount} attempts`,
      });
      return;
    }

    let status = 0;
    try {
      const res = await fetch(job.sinkUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event-Id": job.eventId,
          "X-Customer-Tier": job.tier,
          "X-Attempt": String(receiveCount),
        },
        body: JSON.stringify({
          eventId: job.eventId,
          tier: job.tier,
          payload: job.payload,
          attempt: receiveCount,
        }),
      });
      status = res.status;
    } catch (err: unknown) {
      const delay = backoffSeconds(receiveCount);
      this.retries += 1;
      await queueClient.nack(queueName, messageId, delay);
      this.store.pushActivity({
        kind: "deliver_error",
        senderId,
        destinationId: job.destinationId,
        eventId: job.eventId,
        delaySeconds: delay,
        message: `Network error for ${job.eventId} — retry in ${delay}s (${err instanceof Error ? err.message : "error"})`,
      });
      return;
    }

    if (status >= 200 && status < 300) {
      await queueClient.ack(queueName, messageId);
      this.deliveriesOk += 1;
      this.store.pushActivity({
        kind: "deliver_ok",
        senderId,
        destinationId: job.destinationId,
        eventId: job.eventId,
        statusCode: status,
        message: `Sender #${senderId} delivered ${job.eventId} → ${status}`,
      });
      return;
    }

    if (status >= 400 && status < 500) {
      // Poison / client error — don't retry forever
      await queueClient.ack(queueName, messageId);
      this.deliveriesFail += 1;
      this.store.pushActivity({
        kind: "deliver_4xx",
        senderId,
        destinationId: job.destinationId,
        eventId: job.eventId,
        statusCode: status,
        message: `Dropping ${job.eventId} after ${status} (no retry)`,
      });
      return;
    }

    // 5xx → delay backoff via nack (this is the delay mode showcase)
    const delay = backoffSeconds(receiveCount);
    this.retries += 1;
    await queueClient.nack(queueName, messageId, delay);
    this.store.pushActivity({
      kind: "deliver_5xx",
      senderId,
      destinationId: job.destinationId,
      eventId: job.eventId,
      statusCode: status,
      delaySeconds: delay,
      message: `Sender #${senderId} got ${status} for ${job.eventId} — backoff ${delay}s`,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
