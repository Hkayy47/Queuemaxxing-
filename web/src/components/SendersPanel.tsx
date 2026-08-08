import { useState } from 'react'
import { demoApi, type SenderStatus } from '../demoApi'

interface Props {
  senders: SenderStatus
  onChanged: () => void
  spotlight?: boolean
}

export default function SendersPanel({ senders, onChanged, spotlight }: Props) {
  const [count, setCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      await demoApi.startSenders(count)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const stop = async () => {
    setLoading(true)
    setError(null)
    try {
      await demoApi.stopSenders()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      className={`section${spotlight ? ' is-spotlight' : ''}`}
      data-tour="senders"
      id="tour-senders"
    >
      <div className="senders">
        <div>
          <div className="section__head" style={{ marginBottom: '0.35rem' }}>
            <h2 className="section__title">Senders</h2>
          </div>
          <p className="section__hint">
            Workers that pull jobs and POST to the destination. 5xx → delayed retry.
          </p>
        </div>

        <div className="senders__stats">
          <div className="metric">
            <span className="metric__label">Status</span>
            <span className={`metric__value${senders.running ? ' live' : ''}`}>
              {senders.running ? `${senders.senderCount} on` : 'off'}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">Delivered</span>
            <span className="metric__value">{senders.deliveriesOk}</span>
          </div>
          <div className="metric">
            <span className="metric__label">Retries</span>
            <span className="metric__value">{senders.retries}</span>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginTop: '0.75rem' }}>{error}</div>}

      <div className="btn-row" style={{ marginTop: '0.9rem', alignItems: 'center' }}>
        <div className="stepper" aria-label="Sender count">
          <button type="button" onClick={() => setCount(c => Math.max(1, c - 1))} aria-label="Fewer">−</button>
          <span>{count}</span>
          <button type="button" onClick={() => setCount(c => Math.min(12, c + 1))} aria-label="More">+</button>
        </div>
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => { void start() }}>
          {senders.running ? 'Restart senders' : 'Start senders'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={loading || !senders.running}
          onClick={() => { void stop() }}
        >
          Stop
        </button>
      </div>
    </section>
  )
}
