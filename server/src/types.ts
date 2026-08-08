export type MessageStatus = "ready" | "in_flight" | "acked";

export interface Message {
  id: string;
  body: string;
  priority: number;
  createdAt: number;
  visibleAt: number;
  status: MessageStatus;
  receiveCount: number;
  leaseExpiresAt: number | null;
}

export interface QueueConfig {
  name: string;
  order: "fifo" | "lifo";
  priority: boolean;
  visibilityTimeoutMs: number;
  maxReceiveCount: number;
}

export interface QueueStats {
  total: number;
  ready: number;
  inFlight: number;
  acked: number;
  delayed: number;
}

// WAL event types
export type WalEvent =
  | { type: "create"; config: QueueConfig }
  | { type: "enqueue"; message: Message }
  | { type: "receive"; id: string; leaseExpiresAt: number; receiveCount: number }
  | { type: "ack"; id: string }
  | { type: "nack"; id: string; visibleAt: number };
