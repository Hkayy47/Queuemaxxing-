import type { QueueDetail, QueueMessage } from '../demoApi'

interface Props {
  queue: QueueDetail | null
  destinationName: string | null
  spotlight?: boolean
}

function parseJob(body: string): { eventId?: string; tier?: string } {
  try {
    const j = JSON.parse(body) as { eventId?: string; tier?: string }
    return { eventId: j.eventId, tier: j.tier }
  } catch {
    return {}
  }
}

function Ticket({ msg }: { msg: QueueMessage }) {
  const job = parseJob(msg.body)
  const now = Date.now()
  const delayed = msg.status === 'ready' && msg.visibleAt > now
  const waitSec = delayed ? Math.max(0, Math.ceil((msg.visibleAt - now) / 1000)) : 0

  return (
    <div
      className={`ticket${msg.status === 'in_flight' ? ' is-flight' : ''}${delayed ? ' is-delayed' : ''}`}
    >
      <div className="ticket__id">{job.eventId ?? msg.id.slice(0, 8)}</div>
      <div className="ticket__meta">
        <span className={`tier-${job.tier ?? 'free'}`}>{job.tier ?? '?'}</span>
        <span>p{msg.priority}</span>
        {msg.receiveCount > 0 && <span>×{msg.receiveCount}</span>}
        {delayed && <span>in {waitSec}s</span>}
      </div>
    </div>
  )
}

export default function WebhookLaneBoard({ queue, destinationName, spotlight }: Props) {
  const now = Date.now()
  const active = queue?.messages.filter(m => m.status !== 'acked') ?? []
  const ready = active.filter(m => m.status === 'ready' && m.visibleAt <= now)
  const delayed = active.filter(m => m.status === 'ready' && m.visibleAt > now)
  const inFlight = active.filter(m => m.status === 'in_flight')

  return (
    <section
      className={`section${spotlight ? ' is-spotlight' : ''}`}
      data-tour="yard"
      id="tour-yard"
    >
      <div className="section__head">
        <h2 className="section__title">
          {destinationName ? `Delivery yard · ${destinationName}` : 'Delivery yard'}
        </h2>
        {queue && (
          <span className="section__meta">
            {queue.config.order} · priority · {queue.config.name}
          </span>
        )}
      </div>

      {!queue ? (
        <p className="empty">Pick a destination to watch its queue lanes.</p>
      ) : (
        <>
          <div className="yard-stats">
            <span>ready {queue.stats.ready}</span>
            <span>delayed {queue.stats.delayed}</span>
            <span>in-flight {queue.stats.inFlight}</span>
            <span>acked {queue.stats.acked}</span>
          </div>

          {(
            [
              ['Ready', ready],
              ['Delayed', delayed],
              ['In-flight', inFlight],
            ] as const
          ).map(([label, msgs]) => (
            <div className="lane" key={label}>
              <div className="lane__label">{label}</div>
              <div className="lane__track">
                {msgs.length === 0 && <span className="lane__empty">empty</span>}
                {msgs.map(m => <Ticket key={m.id} msg={m} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
