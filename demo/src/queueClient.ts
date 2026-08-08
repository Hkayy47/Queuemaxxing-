/** Thin HTTP client for the Queuemaxxing queue server. */

const QUEUE_URL = process.env.QUEUE_URL ?? "http://localhost:8787";

export interface QueueMessage {
  id: string;
  body: string;
  priority: number;
  createdAt: number;
  visibleAt: number;
  status: "ready" | "in_flight" | "acked";
  receiveCount: number;
  leaseExpiresAt: number | null;
}

export interface QueueDetail {
  config: {
    name: string;
    order: "fifo" | "lifo";
    priority: boolean;
    visibilityTimeoutMs: number;
    maxReceiveCount: number;
  };
  stats: {
    ready: number;
    inFlight: number;
    delayed: number;
    acked: number;
    total: number;
  };
  messages: QueueMessage[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${QUEUE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const queueClient = {
  url: QUEUE_URL,

  async ensurePriorityFifoQueue(name: string): Promise<void> {
    try {
      await req("/queues", {
        method: "POST",
        body: JSON.stringify({
          name,
          order: "fifo",
          priority: true,
          visibilityTimeoutMs: 15000,
        }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already exists is fine
      if (!msg.includes("409") && !msg.toLowerCase().includes("already exists")) {
        throw err;
      }
    }
  },

  enqueue(queueName: string, body: string, priority: number, delaySeconds = 0) {
    return req<QueueMessage>(`/queues/${encodeURIComponent(queueName)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, priority, delaySeconds }),
    });
  },

  receive(queueName: string, maxMessages = 1) {
    return req<QueueMessage[]>(`/queues/${encodeURIComponent(queueName)}/receive`, {
      method: "POST",
      body: JSON.stringify({ maxMessages }),
    });
  },

  ack(queueName: string, id: string) {
    return req<{ ok: boolean }>(
      `/queues/${encodeURIComponent(queueName)}/messages/${encodeURIComponent(id)}/ack`,
      { method: "POST", body: "{}" }
    );
  },

  nack(queueName: string, id: string, delaySeconds: number) {
    return req<{ ok: boolean }>(
      `/queues/${encodeURIComponent(queueName)}/messages/${encodeURIComponent(id)}/nack`,
      { method: "POST", body: JSON.stringify({ delaySeconds }) }
    );
  },

  getQueue(queueName: string) {
    return req<QueueDetail>(`/queues/${encodeURIComponent(queueName)}`);
  },
};
