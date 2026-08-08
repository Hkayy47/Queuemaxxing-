import { Hono } from "hono";
import { cors } from "hono/cors";
import type { QueueManager } from "./queueManager.js";

export function buildApp(manager: QueueManager): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "http://localhost:5173",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );

  app.onError((err, c) => {
    console.error("[queuemaxxing] route error:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  });

  app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

  // List queues
  app.get("/queues", (c) => {
    return c.json(manager.listQueues());
  });

  // Create queue
  app.post("/queues", async (c) => {
    const body = await c.req.json<{
      name: string;
      order: "fifo" | "lifo";
      priority: boolean;
      visibilityTimeoutMs?: number;
    }>();

    if (!body.name || !body.order) {
      return c.json({ error: "name and order are required" }, 400);
    }
    if (body.order !== "fifo" && body.order !== "lifo") {
      return c.json({ error: 'order must be "fifo" or "lifo"' }, 400);
    }

    try {
      const queue = await manager.createQueue(
        body.name,
        body.order,
        body.priority ?? false,
        body.visibilityTimeoutMs
      );
      return c.json({ config: queue.config }, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 409);
    }
  });

  // Get queue details
  app.get("/queues/:name", (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);
    return c.json({
      config: queue.config,
      stats: queue.getStats(),
      messages: queue.getMessages(),
    });
  });

  // Delete queue
  app.delete("/queues/:name", async (c) => {
    const deleted = await manager.deleteQueue(c.req.param("name"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // Enqueue a message
  app.post("/queues/:name/messages", async (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{
      body: string;
      priority?: number;
      delaySeconds?: number;
    }>();

    if (body.body === undefined || body.body === null) {
      return c.json({ error: "body is required" }, 400);
    }

    const message = await queue.enqueue(body.body, body.priority, body.delaySeconds);
    return c.json(message, 201);
  });

  // Receive messages (lease them)
  app.post("/queues/:name/receive", async (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);

    let maxMessages = 1;
    try {
      const body = await c.req.json<{ maxMessages?: number }>();
      if (body.maxMessages !== undefined) maxMessages = Math.max(1, Math.min(body.maxMessages, 10));
    } catch {
      // empty body is fine
    }

    const messages = await queue.receive(maxMessages);
    return c.json(messages);
  });

  // Ack a message
  app.post("/queues/:name/messages/:id/ack", async (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);

    const ok = await queue.ack(c.req.param("id"));
    if (!ok) return c.json({ error: "Message not found or not in_flight" }, 404);
    return c.json({ ok: true });
  });

  // Nack a message
  app.post("/queues/:name/messages/:id/nack", async (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);

    let delaySeconds: number | undefined;
    try {
      const body = await c.req.json<{ delaySeconds?: number }>();
      delaySeconds = body.delaySeconds;
    } catch {
      // empty body is fine
    }

    const ok = await queue.nack(c.req.param("id"), delaySeconds);
    if (!ok) return c.json({ error: "Message not found or not in_flight" }, 404);
    return c.json({ ok: true });
  });

  // Demo seed helper
  app.post("/queues/:name/demo/seed", async (c) => {
    const queue = manager.getQueue(c.req.param("name"));
    if (!queue) return c.json({ error: "Not found" }, 404);

    const seeds = [
      { body: "Seed message 1", priority: 10 },
      { body: "Seed message 2", priority: 50 },
      { body: "Seed message 3 (delayed)", priority: 100, delaySeconds: 5 },
    ];
    const created = [];
    for (const s of seeds) {
      created.push(await queue.enqueue(s.body, s.priority, s.delaySeconds));
    }
    return c.json(created, 201);
  });

  return app;
}
