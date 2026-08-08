import { useCallback, useEffect, useMemo, useState } from 'react'
import { demoApi, type Overview } from './demoApi'
import DestinationsPanel from './components/DestinationsPanel'
import FireEventsPanel from './components/FireEventsPanel'
import SendersPanel from './components/SendersPanel'
import WebhookLaneBoard from './components/WebhookLaneBoard'
import ActivityFeed from './components/ActivityFeed'
import Tutorial from './components/Tutorial'
import type { TutorialTarget } from './tutorialSteps'

const emptySenders = {
  running: false,
  senderCount: 0,
  deliveriesOk: 0,
  deliveriesFail: 0,
  retries: 0,
}

const SEEN_KEY = 'queuemaxxing-tutorial-seen'

export default function App() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiOk, setApiOk] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [spotlight, setSpotlight] = useState<TutorialTarget>(null)
  const [showWelcome, setShowWelcome] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await demoApi.overview()
      setOverview(data)
      setApiError(null)
      setApiOk(true)
      setSelectedId(prev => {
        if (prev && data.destinations.some(d => d.id === prev)) return prev
        return data.destinations[0]?.id ?? null
      })
    } catch (e) {
      setApiOk(false)
      setApiError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refresh() }, 1000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== '1') {
        setShowWelcome(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const startTutorial = () => {
    setShowWelcome(false)
    setTutorialOpen(true)
  }

  const closeTutorial = () => {
    setTutorialOpen(false)
    setSpotlight(null)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const onSpotlight = useCallback((target: TutorialTarget) => {
    setSpotlight(target)
    if (!target) return
    const el = document.getElementById(`tour-${target}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const destinations = overview?.destinations ?? []
  const selected = destinations.find(d => d.id === selectedId) ?? null
  const selectedQueue =
    overview?.queues.find(q => q.destinationId === selectedId)?.queue ?? null

  const tutorialCtx = useMemo(
    () => ({
      destinations,
      selectedId,
      setSelectedId,
      refresh,
    }),
    [destinations, selectedId, refresh],
  )

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__name">
            Queue<em>maxxing</em>
          </div>
          <div className="brand__sub">Webhook delivery demo</div>
        </div>
        <div className="topbar__actions">
          <span className={`status-dot${apiOk ? ' ok' : ''}`}>
            {apiOk ? 'Demo connected' : 'Demo offline'}
          </span>
          <button type="button" className="btn btn-primary" onClick={startTutorial}>
            Start tutorial
          </button>
        </div>
      </header>

      {apiError && (
        <div style={{ padding: '0.75rem 1.5rem 0' }}>
          <div className="error-banner">
            Can&apos;t reach the demo API. Run <code>npm run dev</code> so the queue (:8787)
            and webhook demo (:8790) are up. {apiError}
          </div>
        </div>
      )}

      <div className="workspace">
        <DestinationsPanel
          destinations={destinations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChanged={() => { void refresh() }}
          spotlight={spotlight === 'destinations'}
        />

        <main className="main">
          {showWelcome && !tutorialOpen && (
            <section className="welcome">
              <h1>
                Deliver webhooks with a <em>frankenstein</em> queue
              </h1>
              <p>
                Register a destination, enqueue events by customer tier, run several senders,
                and watch FIFO order, priority jumps, and 5xx delay backoff on a live yard.
              </p>
              <div className="welcome__actions">
                <button type="button" className="btn btn-primary" onClick={startTutorial}>
                  Start tutorial
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowWelcome(false)}
                >
                  Skip, I&apos;ll explore
                </button>
              </div>
            </section>
          )}

          <div className="flow" aria-label="Delivery flow">
            <div className="flow__step">
              <span className="flow__label">Destination</span>
              <span className="flow__value">{selected?.name ?? '—'}</span>
            </div>
            <div className="flow__step">
              <span className="flow__label">Queue</span>
              <span className="flow__value">{selected?.queueName ?? '—'}</span>
            </div>
            <div className="flow__step">
              <span className="flow__label">Senders</span>
              <span className="flow__value">
                {overview?.senders.running
                  ? `${overview.senders.senderCount} running`
                  : 'stopped'}
              </span>
            </div>
            <div className="flow__step">
              <span className="flow__label">Sink</span>
              <span className="flow__value">
                {selected ? selected.mode.replace(/_/g, ' ') : '—'}
              </span>
            </div>
          </div>

          <FireEventsPanel
            destinations={destinations}
            selectedId={selectedId}
            onFired={() => { void refresh() }}
            spotlight={spotlight === 'events'}
          />

          <SendersPanel
            senders={overview?.senders ?? emptySenders}
            onChanged={() => { void refresh() }}
            spotlight={spotlight === 'senders'}
          />

          <WebhookLaneBoard
            queue={selectedQueue}
            destinationName={selected?.name ?? null}
            spotlight={spotlight === 'yard'}
          />

          <ActivityFeed
            activity={overview?.activity ?? []}
            spotlight={spotlight === 'activity'}
          />

          <p className="footer-note">
            Queue brain on :8787 · webhook demo on :8790 · this UI is only the remote control
          </p>
        </main>
      </div>

      <Tutorial
        open={tutorialOpen}
        onClose={closeTutorial}
        ctx={tutorialCtx}
        onSpotlight={onSpotlight}
      />
    </div>
  )
}
