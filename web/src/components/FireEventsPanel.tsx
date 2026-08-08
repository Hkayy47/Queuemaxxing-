import { useState } from 'react'
import { demoApi, type CustomerTier, type Destination } from '../demoApi'

interface Props {
  destinations: Destination[]
  selectedId: string | null
  onFired: () => void
  spotlight?: boolean
}

const TIERS: { value: CustomerTier; label: string; detail: string }[] = [
  { value: 'enterprise', label: 'Enterprise', detail: 'priority 1' },
  { value: 'pro', label: 'Pro', detail: 'priority 5' },
  { value: 'free', label: 'Free', detail: 'priority 20' },
]

export default function FireEventsPanel({
  destinations,
  selectedId,
  onFired,
  spotlight,
}: Props) {
  const [tier, setTier] = useState<CustomerTier>('pro')
  const [payload, setPayload] = useState('{"type":"invoice.paid","amount":42}')
  const [showPayload, setShowPayload] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  const dest = destinations.find(d => d.id === selectedId) ?? null

  const fire = async () => {
    if (!dest) return
    setLoading(true)
    setError(null)
    try {
      let parsed: unknown = payload
      try {
        parsed = JSON.parse(payload)
      } catch {
        parsed = { text: payload }
      }
      const res = await demoApi.fireEvent({ destinationId: dest.id, tier, payload: parsed })
      setLastEvent(res.job.eventId)
      onFired()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const burst = async () => {
    if (!dest) return
    setLoading(true)
    setError(null)
    try {
      await demoApi.burst(dest.id, 6)
      setLastEvent('burst of 6')
      onFired()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      className={`section${spotlight ? ' is-spotlight' : ''}`}
      data-tour="events"
      id="tour-events"
    >
      <div className="section__head">
        <h2 className="section__title">
          {dest ? `Enqueue · ${dest.name}` : 'Enqueue events'}
        </h2>
        {lastEvent && <span className="section__meta">last {lastEvent}</span>}
      </div>

      {!dest ? (
        <p className="empty">Select a destination in the left rail first.</p>
      ) : (
        <>
          <p className="section__hint" style={{ marginBottom: '0.85rem' }}>
            Events are saved on disk in Queuemaxxing before senders touch them.
          </p>
          {error && <div className="error-banner" style={{ marginBottom: '0.75rem' }}>{error}</div>}

          <div className="field">
            <label>Customer tier</label>
            <div className="choice-row">
              {TIERS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className="choice"
                  aria-pressed={tier === t.value}
                  onClick={() => setTier(t.value)}
                >
                  {t.label}
                  <small>{t.detail}</small>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="details-toggle"
            onClick={() => setShowPayload(v => !v)}
          >
            {showPayload ? 'Hide payload' : 'Edit payload JSON'}
          </button>
          {showPayload && (
            <div className="field collapsed-payload">
              <label htmlFor="payload">Payload</label>
              <textarea
                id="payload"
                rows={4}
                value={payload}
                onChange={e => setPayload(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}

          <div className="btn-row" style={{ marginTop: '0.85rem' }}>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={() => { void fire() }}>
              {loading ? 'Saving…' : 'Enqueue one event'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => { void burst() }}>
              Burst 6 (mixed tiers)
            </button>
          </div>
        </>
      )}
    </section>
  )
}
