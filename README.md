# Queuemaxxing

Imagine a **magic toy box**.

You put toys (messages) in. Friends can take toys out later.  
Sometimes the first toy in comes out first.  
Sometimes the *important* toys jump the line.  
Sometimes a toy has a sticky note: “wait a few seconds before anyone can take me.”

**Queuemaxxing** is that toy box for computer programs.

The **demo app** is a tiny **webhook delivery service** — the kind of product that *needs* every queue mode at once.

---

## What is this project?

Three parts:

1. **The brain (`server/`)** — Queuemaxxing, the durable queue  
2. **The webhook company (`demo/`)** — accepts events, runs several senders, talks to customer URLs  
3. **The face (`web/`)** — buttons so you can watch it happen  

```text
You fire an event  →  demo enqueues job  →  Queuemaxxing stores it on disk
Several senders     →  receive + POST to customer sink
2xx                 →  ack (done)
5xx                 →  nack + delay backoff (retry later)
```

---

## How to run it

You need [Node.js](https://nodejs.org/) installed.

```bash
npm install
npm run dev
```

Then open:

| What | URL |
|------|-----|
| Website | http://localhost:5173 |
| Webhook demo API | http://localhost:8790 |
| Queue brain | http://localhost:8787 |

Stop with `Ctrl+C`.

### Try the story in 60 seconds

Open http://localhost:5173 and click **Start tutorial**.  
It walks you through a real example: create a failing sink, enqueue a mixed-priority burst, start senders, watch delay backoff, then heal the sink so jobs deliver.

Or explore manually:

1. Add a destination (try **Always 500**)  
2. **Burst 6** mixed tiers  
3. **Start senders**  
4. Watch the **Delayed** lane, then set sink to **Always 200**

---

## Folders (the whole codebase, simple)

```text
Queuemaxxing-/
  README.md        ← you are here
  AI-WORKFLOW.md   ← how AI agents + planning were used to build this
  package.json     ← starts queue + demo + website together
  server/          ← THE BRAIN (frankenstein queue)
  demo/            ← WEBHOOK DELIVERY SERVICE (uses the queue)
  web/             ← THE FACE (controls + live lanes)
  data/            ← durable WAL files on disk
```

### `server/` — the brain

| File | Kid explanation |
|------|-----------------|
| `src/index.ts` | Turns the lights on. Listens for notes. |
| `src/routes.ts` | Mailbox slots: create queue, add message, receive, ack… |
| `src/queue.ts` | Rules: FIFO/LIFO, priority, delay, locks, leases. |
| `src/queueManager.ts` | Many queues at once. |
| `src/wal.ts` | Diary on disk so a crash doesn’t lose messages. |

### `demo/` — the webhook delivery service

This is the real demo application. It is a **client** of Queuemaxxing.

| File | Kid explanation |
|------|-----------------|
| `src/index.ts` | Starts the webhook company on port 8790. |
| `src/app.ts` | Register destinations, fire events, mock customer sinks. |
| `src/senders.ts` | Several workers that pull jobs and HTTP POST them. |
| `src/queueClient.ts` | How the demo texts the queue brain. |
| `src/store.ts` | Destinations + activity log in memory (jobs live in the queue). |

**How it uses every mode:**

| Queue feature | How webhooks use it |
|---------------|---------------------|
| **FIFO** | One queue per destination (`wh-…`) so each endpoint stays in order |
| **Priority** | Enterprise=1, Pro=5, Free=20 |
| **Delay** | After a 5xx, `nack` with 2s/4s/8s… backoff |
| **Durability** | Undelivered events are the product — WAL keeps them |
| **Concurrency** | Multiple senders `receive` at once under queue locks |

### `web/` — the face

| File | Kid explanation |
|------|-----------------|
| `src/App.tsx` | Main screen. |
| `src/demoApi.ts` | Talks to the webhook demo (`:8790`), not the queue directly. |
| `src/components/*` | Destinations, fire events, senders, lanes, activity. |

### `data/` — the memory

Jobs are saved under `data/queues/`. Restart the apps — undelivered webhooks are still there.

---

## “Other apps talking to my queue?”

Yes. The webhook demo **is** that other app.

- Browser → demo API (`:8790`)  
- Demo → Queuemaxxing (`:8787`)  
- Senders → customer sinks (`:8790/sinks/...` in this toy world)

The website never has to talk to the queue itself.

---

## Why a webhook demo (not thumbnails)?

A thumbnail generator mostly shows **priority**.  
Webhook delivery naturally needs:

- order per destination  
- VIP customers first  
- wait-and-retry when their server is sick  
- never lose an event  
- many senders working together  

That’s the whole frankenstein queue in one story.

---

## Interview questions (short)

### Replay?

Senders **lease** a job (`receive`). Success → **ack**. 5xx / crash → **nack** or lease timeout → job becomes visible again (replay) after a delay.

### Pub/Sub refactor?

Keep a durable log of events; each subscriber (or each destination fan-out) tracks its own cursor. Queues become per-subscription delivery buffers.

### More time?

Dead-letter after max attempts, signing (HMAC), admin replay UI, WAL compaction, metrics, multi-node senders.

### vs SQS / Rabbit / Pulsar?

Not for Amazon-scale. Choose this for a tiny self-hosted queue with composable rules, or for learning. Incumbents win on ops, ecosystem, and global scale.

---

## Useful commands

```bash
npm run dev          # queue + webhook demo + website
npm run dev:server   # :8787 only
npm run dev:demo     # :8790 only
npm run dev:web      # :5173 only
npm run build
```

```bash
curl.exe http://localhost:8787/health
curl.exe http://localhost:8790/health
```
