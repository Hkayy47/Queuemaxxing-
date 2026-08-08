const BASE = (import.meta.env.VITE_DEMO_URL as string | undefined) ?? 'http://localhost:8790';

export type CustomerTier = 'enterprise' | 'pro' | 'free';
export type SinkMode = 'always_ok' | 'always_5xx' | 'flaky';

export interface Destination {
  id: string;
  name: string;
  sinkUrl: string;
  queueName: string;
  mode: SinkMode;
  createdAt: number;
  receivedOk: number;
  receivedFail: number;
}

export interface ActivityEntry {
  id: string;
  ts: number;
  kind: string;
  message: string;
  destinationId?: string;
  eventId?: string;
  senderId?: number;
  statusCode?: number;
  delaySeconds?: number;
}

export interface QueueStats {
  ready: number;
  inFlight: number;
  delayed: number;
  acked: number;
  total: number;
}

export interface QueueMessage {
  id: string;
  body: string;
  priority: number;
  createdAt: number;
  visibleAt: number;
  status: 'ready' | 'in_flight' | 'acked';
  receiveCount: number;
  leaseExpiresAt: number | null;
}

export interface QueueDetail {
  config: {
    name: string;
    order: 'fifo' | 'lifo';
    priority: boolean;
    visibilityTimeoutMs: number;
    maxReceiveCount: number;
  };
  stats: QueueStats;
  messages: QueueMessage[];
}

export interface SenderStatus {
  running: boolean;
  senderCount: number;
  deliveriesOk: number;
  deliveriesFail: number;
  retries: number;
}

export interface Overview {
  destinations: Destination[];
  senders: SenderStatus;
  activity: ActivityEntry[];
  queues: Array<{ destinationId: string; queue: QueueDetail | null }>;
  queueUrl: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const demoApi = {
  overview: () => req<Overview>('/overview'),
  createDestination: (body: { name: string; mode: SinkMode }) =>
    req<Destination>('/destinations', { method: 'POST', body: JSON.stringify(body) }),
  updateDestination: (id: string, mode: SinkMode) =>
    req<Destination>(`/destinations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    }),
  deleteDestination: (id: string) =>
    req<{ ok: boolean }>(`/destinations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  fireEvent: (body: { destinationId: string; tier: CustomerTier; payload?: unknown }) =>
    req<{ job: { eventId: string }; message: QueueMessage }>('/events', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  burst: (destinationId: string, count = 6) =>
    req<{ count: number }>('/events/burst', {
      method: 'POST',
      body: JSON.stringify({ destinationId, count }),
    }),
  startSenders: (count: number) =>
    req<SenderStatus>('/senders/start', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),
  stopSenders: () => req<SenderStatus>('/senders/stop', { method: 'POST', body: '{}' }),
};
