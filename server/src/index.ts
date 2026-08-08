import { serve } from "@hono/node-server";
import path from "path";
import { fileURLToPath } from "url";
import { QueueManager } from "./queueManager.js";
import { buildApp } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const PORT = 8787;

const manager = new QueueManager(DATA_DIR);

async function main() {
  await manager.init();
  console.log(`[queuemaxxing] Recovered queues: ${manager.listQueues().map((q) => q.config.name).join(", ") || "(none)"}`);

  const app = buildApp(manager);

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[queuemaxxing] Listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log("\n[queuemaxxing] Shutting down...");
    await manager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[queuemaxxing] Fatal error:", err);
  process.exit(1);
});
