import { useState } from 'react'
import { demoApi, type Destination, type SinkMode } from '../demoApi'

interface Props {
  destinations: Destination[]
  selectedId: string | null
  onSelect: (id: string) => void
  onChanged: () => void
  spotlight?: boolean
}

const MODES: { value: SinkMode; label: string }[] = [
  { value: 'always_ok', label: 'Always 200' },
  { value: 'always_5xx', label: 'Always 500' },
  { value: 'flaky', label: 'Flaky 50/50' },
]

export default function DestinationsPanel({
  destinations,
  selectedId,
  onSelect,
  onChanged,
  spotlight,
}: Props) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<SinkMode>('always_ok')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const dest = await demoApi.createDestination({ name: trimmed, mode })
      setName('')
      onChanged()
      onSelect(dest.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const setDestMode = async (id: string, next: SinkMode) => {
    try {
      await demoApi.updateDestination(id, next)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remove this destination?')) return
    try {
      await demoApi.deleteDestination(id)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <aside
      className={`rail${spotlight ? ' is-spotlight' : ''}`}
      data-tour="destinations"
      id="tour-destinations"
    >
      <div className="section__head" style={{ marginBottom: 0 }}>
        <h2 className="section__title">Destinations</h2>
      </div>
      <p className="section__hint">
        Customer endpoints. Each one owns a FIFO priority queue.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {destinations.length === 0 ? (
        <p className="empty">None yet — add one below or start the tutorial.</p>
      ) : (
        <ul className="dest-list">
          {destinations.map(d => (
            <li key={d.id}>
              <button
                type="button"
                className={`dest-item${selectedId === d.id ? ' is-selected' : ''}`}
                onClick={() => onSelect(d.id)}
              >
                <span className="dest-item__name">{d.name}</span>
                <span className="dest-item__meta">
                  <span>{d.queueName}</span>
                  <span>{d.receivedOk} ok · {d.receivedFail} fail</span>
                </span>
              </button>
              {selectedId === d.id && (
                <div style={{ padding: '0 0.25rem 0.35rem' }}>
                  <label className="section__meta" htmlFor={`mode-${d.id}`}>Sink response</label>
                  <select
                    id={`mode-${d.id}`}
                    className="mode-select"
                    value={d.mode}
                    onChange={e => { void setDestMode(d.id, e.target.value as SinkMode) }}
                  >
                    {MODES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="btn-row" style={{ marginTop: '0.45rem' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void remove(d.id) }}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rail-form">
        <div className="field">
          <label htmlFor="dest-name">New destination</label>
          <input
            id="dest-name"
            value={name}
            placeholder="acme-billing"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void create() }}
          />
        </div>
        <div className="field">
          <label>Default sink behavior</label>
          <div className="choice-row">
            {MODES.map(m => (
              <button
                key={m.value}
                type="button"
                className="choice"
                aria-pressed={mode === m.value}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading || !name.trim()}
          onClick={() => { void create() }}
        >
          {loading ? 'Adding…' : 'Add destination'}
        </button>
      </div>
    </aside>
  )
}
