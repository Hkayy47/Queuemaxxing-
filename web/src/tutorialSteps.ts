import { demoApi, type Destination } from './demoApi'

export type TutorialTarget =
  | 'welcome'
  | 'destinations'
  | 'events'
  | 'senders'
  | 'yard'
  | 'activity'
  | null

export interface TutorialContext {
  destinations: Destination[]
  selectedId: string | null
  setSelectedId: (id: string) => void
  refresh: () => Promise<void>
}

export interface TutorialStep {
  id: string
  target: TutorialTarget
  title: string
  body: string
  /** Primary button label; if omitted, only Next/Skip show */
  actionLabel?: string
  /** Run when primary action is clicked. Return selected destination id if created. */
  run?: (ctx: TutorialContext) => Promise<string | void>
  nextLabel?: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    target: null,
    title: 'Ship a webhook in five minutes',
    body: 'This walkthrough creates a fake customer endpoint, queues mixed-priority events, starts senders, watches backoff on HTTP 500, then heals the sink so jobs deliver. You can click through — the demo will do the work.',
    nextLabel: 'Begin',
  },
  {
    id: 'dest',
    target: 'destinations',
    title: '1 · Register a destination',
    body: 'Each customer URL gets its own FIFO + priority queue. We’ll create “Tutorial Shop” that always returns HTTP 500 so you can see delay backoff.',
    actionLabel: 'Create Tutorial Shop',
    async run(ctx) {
      const existing = ctx.destinations.find(d => d.name === 'Tutorial Shop')
      if (existing) {
        await demoApi.updateDestination(existing.id, 'always_5xx')
        ctx.setSelectedId(existing.id)
        await ctx.refresh()
        return existing.id
      }
      const dest = await demoApi.createDestination({
        name: 'Tutorial Shop',
        mode: 'always_5xx',
      })
      ctx.setSelectedId(dest.id)
      await ctx.refresh()
      return dest.id
    },
    nextLabel: 'Next',
  },
  {
    id: 'events',
    target: 'events',
    title: '2 · Enqueue a mixed burst',
    body: 'We’ll drop six events with free, pro, and enterprise tiers. Enterprise (priority 1) should leave the Ready lane before free (priority 20).',
    actionLabel: 'Enqueue example burst',
    async run(ctx) {
      const id = ctx.selectedId ?? ctx.destinations.find(d => d.name === 'Tutorial Shop')?.id
      if (!id) throw new Error('Create the destination first')
      await demoApi.burst(id, 6)
      await ctx.refresh()
    },
    nextLabel: 'Next',
  },
  {
    id: 'senders',
    target: 'senders',
    title: '3 · Start concurrent senders',
    body: 'Senders pull leases from Queuemaxxing and POST to the sink. With Always 500, every attempt will nack with a growing delay (2s, 4s, 8s…).',
    actionLabel: 'Start 3 senders',
    async run(ctx) {
      await demoApi.startSenders(3)
      await ctx.refresh()
    },
    nextLabel: 'Next',
  },
  {
    id: 'yard',
    target: 'yard',
    title: '4 · Watch the delivery yard',
    body: 'Ready empties, Delayed fills, In-flight flickers as workers lease jobs. That Delayed lane is the delay feature doing real retry backoff.',
    nextLabel: 'I see the delayed jobs',
  },
  {
    id: 'heal',
    target: 'destinations',
    title: '5 · Heal the customer sink',
    body: 'Flip Tutorial Shop to Always 200. When each job’s delay expires, senders will deliver and ack — durability kept the events safe the whole time.',
    actionLabel: 'Set Always 200',
    async run(ctx) {
      const id =
        ctx.selectedId ??
        ctx.destinations.find(d => d.name === 'Tutorial Shop')?.id
      if (!id) throw new Error('Tutorial destination missing')
      await demoApi.updateDestination(id, 'always_ok')
      ctx.setSelectedId(id)
      await ctx.refresh()
    },
    nextLabel: 'Next',
  },
  {
    id: 'activity',
    target: 'activity',
    title: '6 · Read the activity log',
    body: 'deliver_5xx lines show backoff; deliver_ok means ack. Try Burst again anytime, or change the sink to Flaky for a messier real-world feel.',
    nextLabel: 'Finish tutorial',
  },
]
