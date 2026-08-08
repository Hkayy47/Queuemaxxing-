# How AI was used to build Queuemaxxing

This note documents the **process**, not the chat logs.  
Goal: show a deliberate, reviewable AI coding workflow — plan first, split work, verify, then ship.

---

## Principles we followed

1. **Plan before code** — write a shared spec so agents don’t invent conflicting designs  
2. **One job per agent** — backend ≠ frontend ≠ docs; parallelize only when interfaces are clear  
3. **Human-owned constraints** — durability, no external DB, composable FIFO/LIFO/priority/delay  
4. **Verify with reality** — API smoke tests, builds, browser checks; don’t trust “it should work”  
5. **Keep learning artifacts local** — personal notes stay gitignored; the repo stays shippable  

That is the difference between “vibe coding” and **directed AI engineering**.

---

## Workflow overview

```text
┌─────────────────────┐
│ 1. Problem framing  │  Understand the homework + constraints
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 2. Written plan     │  PLAN.md: stack, API, WAL, demo story, acceptance checks
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 3. Parallel agents  │  Agent A: queue server   Agent B: UI scaffold
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 4. Integration pass │  Root workspaces, README, LEARNING, smoke tests
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 5. Demo specialization │  Webhook delivery service (exercises every mode)
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 6. UX + tutorial    │  Redesign for clarity + guided example walkthrough
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 7. Ship             │  Commit, push, keep local study notes out of git
└─────────────────────�──────────┬──────────┘
           ▼
┌─────────────────────┐
│ 7. Ship             │  Commit, push, keep local study notes out of git
└─────────────────────┘
```

---

## Phase 1 — Frame the problem

Before any implementation agent ran, we separated:

| Layer | Meaning |
|-------|---------|
| **Queue engine** | Durable, concurrent, composable ordering rules |
| **HTTP API** | How other programs talk to the engine |
| **Demo app** | A realistic *client* of the queue (not the queue itself) |
| **UI** | Remote control / teaching surface |

That split prevented the common failure mode: one blob where “the website *is* the queue.”

Personal study notes (`LEARNING.md`) were written for HTTP / client-server basics and gitignored so the repo stays a product, not a notebook dump.

---

## Phase 2 — Spec as the contract (`PLAN.md`)

A written plan locked:

- Stack (TypeScript, Hono, Vite, file WAL — no Redis/Postgres/SQS)
- Message lifecycle (receive → lease → ack / nack+delay)
- Selection rules (delay gate → optional priority → FIFO/LIFO)
- HTTP routes and ports
- Acceptance checklist (restart survival, concurrent receive, composable modes)

Agents were instructed to **implement the plan**, not reinterpret the assignment.  
That keeps multi-agent work coherent.

---

## Phase 3 — Multi-agent implementation

### Agent A — Queue server (`server/`)

Owned end-to-end:

- Types, WAL append + fsync, recovery on boot  
- Queue engine + per-queue mutex  
- Lease sweeper (replay after timeout)  
- HTTP routes + CORS  

**Why isolate this agent:** persistence and concurrency are easy to get wrong if mixed with UI concerns.

### Agent B — Frontend scaffold (`web/`)

Owned:

- Vite/React app talking to the API  
- Visual system (freight / dispatch aesthetic → later refined)  
- Operator controls for enqueue / receive / observe  

**Why isolate this agent:** UI can move fast once the API shape is fixed in the plan.

### Parent / integrator role

After parallel agents returned:

- Wired npm workspaces + `npm run dev`  
- Cross-checked API response shapes vs client types  
- Ran builds and live HTTP smoke tests  
- Fixed Windows-specific issues (file handles on delete, PowerShell vs `curl.exe`)  

Agents propose; integration proves.

---

## Phase 4 — Choose a demo that earns the features

A weak demo (e.g. only thumbnails) would barely use priority.  
We specialized the demo into a **webhook delivery service** because it naturally needs:

| Queue mode | Webhook meaning |
|------------|-----------------|
| FIFO | Order preserved **per destination** |
| Priority | Customer tier (enterprise / pro / free) |
| Delay | Backoff after HTTP 5xx |
| Durability | Undelivered events *are* the product |
| Concurrency | Several sender workers |

Architecture stayed honest:

```text
Browser → demo service (:8790) → queue (:8787) → senders → mock sinks
```

The UI is a client of the demo; the demo is a client of the queue.

---

## Phase 5 — UX as a teaching surface

After the system worked, we treated UI as a second problem:

- Reduce “card soup” / generic dashboard chrome  
- Sidebar + main workspace aligned to the real mental model  
- **Start tutorial** that *runs an example* (create failing sink → burst → senders → watch delay → heal → read activity)

Good AI usage here meant: redesign against a clear user journey, not more features.

---

## What “good AI coding” looked like in practice

### Did

- Shared written plan before parallel coding  
- Narrow agent scopes with explicit file ownership  
- Acceptance criteria from day one  
- Smoke tests after integration (priority LIFO, 5xx → delayed → heal → ack)  
- Separated learning notes from the shipped repo  
- Iterated the demo when the first UI didn’t teach the architecture well enough  

### Avoided

- Asking one agent to “build the whole thing” with no interface contract  
- Outsourcing the queue to Redis/SQS (violates the assignment)  
- Shipping without restart / concurrency checks  
- Dumping raw prompts into the repository as documentation  

---

## Repo map vs agent ownership

| Path | Role | Primary owner in the workflow |
|------|------|-------------------------------|
| `PLAN.md` (local) | Contract | Human + lead agent (pre-code) |
| `server/` | Queue product | Agent A |
| `demo/` | Webhook client app | Lead agent (post-scaffold specialization) |
| `web/` | Tutorial UI | Agent B → then UX pass |
| `README.md` | Simple explanation | Lead agent |
| `LEARNING.md` (local) | Study notes | Lead agent / human |
| `AI-WORKFLOW.md` | This process doc | Lead agent |

---

## How to reuse this workflow on the next project

1. Write a short plan with API shapes and “done means…” checks  
2. Split agents by **hard boundary** (storage engine vs UI vs docs)  
3. Integrate yourself (or a dedicated integrator agent) with real commands  
4. Pick a demo that forces the hard requirements to show up  
5. Do a final pass for clarity (tutorial, README) before you call it finished  

AI is strongest as a **structured workforce**, not as a single magic autocomplete.
