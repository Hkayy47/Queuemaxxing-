export type CustomerTier = "enterprise" | "pro" | "free";

/** How the mock customer endpoint behaves when our senders POST to it. */
export type SinkMode = "always_ok" | "always_5xx" | "flaky";

export interface Destination {
  id: string;
  name: string;
  /** Mock URL customers "own" — senders POST here. */
  sinkUrl: string;
  /** Queuemaxxing queue name dedicated to this destination (FIFO + priority). */
  queueName: string;
  mode: SinkMode;
  createdAt: number;
  receivedOk: number;
  receivedFail: number;
}

export interface WebhookJob {
  eventId: string;
  destinationId: string;
  sinkUrl: string;
  tier: CustomerTier;
  priority: number;
  payload: unknown;
  enqueuedAt: number;
}

export interface ActivityEntry {
  id: string;
  ts: number;
  kind:
    | "enqueued"
    | "deliver_ok"
    | "deliver_5xx"
    | "deliver_4xx"
    | "deliver_error"
    | "gave_up"
    | "sender_start"
    | "sender_stop";
  message: string;
  destinationId?: string;
  eventId?: string;
  senderId?: number;
  statusCode?: number;
  delaySeconds?: number;
}

export const TIER_PRIORITY: Record<CustomerTier, number> = {
  enterprise: 1,
  pro: 5,
  free: 20,
};

export function backoffSeconds(receiveCount: number): number {
  // 2, 4, 8, 16, 32… capped
  return Math.min(60, Math.pow(2, Math.max(1, receiveCount)));
}

export function queueNameFor(destinationId: string): string {
  return `wh-${destinationId}`;
}
