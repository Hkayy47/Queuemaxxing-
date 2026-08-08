import { Hono } from "hono";
import { cors } from "hono/cors";
import { queueClient } from "./queueClient.js";
import { SenderPool } from "./senders.js";
import { DemoStore } from "./store.js";
import {
  TIER_PRIORITY,
  type CustomerTier,
  type SinkMode,
  type WebhookJob,
} from "./types.js";

export function buildDemoApp(store: DemoStore, senders: SenderPool, publicBase: string): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "http://localhost:5173",
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );

  app.onError((err, c) => {
    console.error("[webhook-demo]", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  });

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      queueUrl: queueClient.url,
      ts: Date.now(),
    })
  );

  // ── Destinations (customer webhook endpoints we deliver TO) ──

  app.get("/destinations", (c) => c.json(store.listDestinations()));

  app.post("/destinations", async (c) => {
    const body = await c.req.json<{ name?: string; mode?: SinkMode }>();
    const name = (body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const mode: SinkMode = body.mode ?? "always_ok";
    if (!["always_ok", "always_5xx", "flaky"].includes(mode)) {
      return c.json({ error: "mode must be always_ok | always_5xx | flaky" }, 400);
    }

    const id = crypto.randomUUID().slice(0, 8);
    const sinkUrl = `${publicBase}/sinks/${id}`;
    const dest = store.addDestination({ id, name, sinkUrl, mode });

    // One priority-FIFO queue per destination — true FIFO per endpoint
    await queueClient.ensurePriorityFifoQueue(dest.queueName);

    store.pushActivity({
      kind: "enqueued",
      destinationId: id,
      message: `Registered destination "${name}" → queue ${dest.queueName} (${mode})`,
    });

    return c.json(dest, 201);
  });

  app.patch("/destinations/:id", async (c) => {
    const body = await c.req.json<{ mode?: SinkMode }>();
    if (!body.mode) return c.json({ error: "mode is required" }, 400);
    const dest = store.updateMode(c.req.param("id"), body.mode);
    if (!dest) return c.json({ error: "Not found" }, 404);
    return c.json(dest);
  });

  app.delete("/destinations/:id", async (c) => {
    const ok = store.deleteDestination(c.req.param("id"));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // ── Mock customer sinks (what "their server" returns) ──

  app.post("/sinks/:id", async (c) => {
    const id = c.req.param("id");
    const dest = store.getDestination(id);
    if (!dest) return c.json({ error: "Unknown sink" }, 404);

    const status = store.resolveSinkStatus(id);
    const ok = status >= 200 && status < 300;
    store.recordSinkHit(id, ok);

    let payload: unknown = null;
    try {
      payload = await c.req.json();
    } catch {
      /* ignore */
    }

    return new Response(
      JSON.stringify({
        received: true,
        mode: dest.mode,
        echo: payload,
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  // ── Fire events (producers enqueue durable delivery jobs) ──

  app.post("/events", async (c) => {
    const body = await c.req.json<{
      destinationId?: string;
      tier?: CustomerTier;
      payload?: unknown;
    }>();

    const dest = body.destinationId ? store.getDestination(body.destinationId) : undefined;
    if (!dest) return c.json({ error: "destinationId is required / unknown" }, 400);

    const tier: CustomerTier = body.tier ?? "free";
    if (!TIER_PRIORITY[tier]) {
      return c.json({ error: "tier must be enterprise | pro | free" }, 400);
    }

    const job: WebhookJob = {
      eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
      destinationId: dest.id,
      sinkUrl: dest.sinkUrl,
      tier,
      priority: TIER_PRIORITY[tier],
      payload: body.payload ?? { hello: "world", at: new Date().toISOString() },
      enqueuedAt: Date.now(),
    };

    // Ensure queue still exists (e.g. after queue-server wipe)
    await queueClient.ensurePriorityFifoQueue(dest.queueName);

    const message = await queueClient.enqueue(
      dest.queueName,
      JSON.stringify(job),
      job.priority,
      0
    );

    store.pushActivity({
      kind: "enqueued",
      destinationId: dest.id,
      eventId: job.eventId,
      message: `Enqueued ${job.eventId} (${tier}, p=${job.priority}) → ${dest.queueName}`,
    });

    return c.json({ job, message }, 201);
  });

  /** Burst helper: enqueue several events across tiers to show priority. */
  app.post("/events/burst", async (c) => {
    const body = await c.req.json<{ destinationId?: string; count?: number }>();
    const dest = body.destinationId ? store.getDestination(body.destinationId) : undefined;
    if (!dest) return c.json({ error: "destinationId is required / unknown" }, 400);

    const count = Math.max(1, Math.min(body.count ?? 6, 30));
    const tiers: CustomerTier[] = ["free", "free", "pro", "enterprise", "free", "pro"];
    await queueClient.ensurePriorityFifoQueue(dest.queueName);

    const created = [];
    for (let i = 0; i < count; i++) {
      const tier = tiers[i % tiers.length];
      const job: WebhookJob = {
        eventId: `evt_${crypto.randomUUID().slice(0, 8)}`,
        destinationId: dest.id,
        sinkUrl: dest.sinkUrl,
        tier,
        priority: TIER_PRIORITY[tier],
        payload: { n: i + 1, burst: true },
        enqueuedAt: Date.now(),
      };
      const message = await queueClient.enqueue(
        dest.queueName,
        JSON.stringify(job),
        job.priority,
        0
      );
      created.push({ job, message });
      store.pushActivity({
        kind: "enqueued",
        destinationId: dest.id,
        eventId: job.eventId,
        message: `Burst enqueued ${job.eventId} (${tier})`,
      });
    }
    return c.json({ count: created.length, created }, 201);
  });

  // ── Senders (concurrent consumers) ──

  app.get("/senders", (c) => c.json(senders.getStatus()));

  app.post("/senders/start", async (c) => {
    let count = 3;
    try {
      const body = await c.req.json<{ count?: number }>();
      if (body.count !== undefined) count = body.count;
    } catch {
      /* default */
    }
    await senders.start(count);
    return c.json(senders.getStatus());
  });

  app.post("/senders/stop", async (c) => {
    await senders.stop();
    return c.json(senders.getStatus());
  });

  // ── Observability for the UI ──

  app.get("/activity", (c) => {
    const limit = Number(c.req.query("limit") ?? "80");
    return c.json(store.listActivity(Number.isFinite(limit) ? limit : 80));
  });

  app.get("/overview", async (c) => {
    const destinations = store.listDestinations();
    const queues = [];
    for (const d of destinations) {
      try {
        queues.push({ destinationId: d.id, queue: await queueClient.getQueue(d.queueName) });
      } catch {
        queues.push({ destinationId: d.id, queue: null });
      }
    }
    return c.json({
      destinations,
      senders: senders.getStatus(),
      activity: store.listActivity(40),
      queues,
      queueUrl: queueClient.url,
    });
  });

  return app;
}
