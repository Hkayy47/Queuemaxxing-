import { serve } from "@hono/node-server";
import { buildDemoApp } from "./app.js";
import { SenderPool } from "./senders.js";
import { DemoStore } from "./store.js";

const PORT = Number(process.env.DEMO_PORT ?? 8790);
const publicBase = process.env.DEMO_PUBLIC_URL ?? `http://localhost:${PORT}`;

const store = new DemoStore();
const senders = new SenderPool(store);
const app = buildDemoApp(store, senders, publicBase);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[webhook-demo] Listening on http://localhost:${PORT}`);
  console.log(`[webhook-demo] Queue server expected at ${process.env.QUEUE_URL ?? "http://localhost:8787"}`);
  console.log(`[webhook-demo] This app exercises FIFO-per-destination, tier priority, 5xx delay backoff, durability, concurrency`);
});

const shutdown = async () => {
  console.log("\n[webhook-demo] Shutting down senders...");
  await senders.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
