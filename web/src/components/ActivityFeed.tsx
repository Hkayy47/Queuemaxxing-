import type { ActivityEntry } from '../demoApi'

interface Props {
  activity: ActivityEntry[]
  spotlight?: boolean
}

function kindClass(kind: string): string {
  if (kind.includes('ok') || kind === 'enqueued' || kind === 'sender_start') return 'act-ok'
  if (kind.includes('5xx') || kind.includes('error') || kind === 'gave_up') return 'act-bad'
  if (kind.includes('4xx')) return 'act-warn'
  return ''
}

export default function ActivityFeed({ activity, spotlight }: Props) {
  return (
    <section
      className={`section${spotlight ? ' is-spotlight' : ''}`}
      data-tour="activity"
      id="tour-activity"
    >
      <div className="section__head">
        <h2 className="section__title">Activity</h2>
        <span className="section__meta">newest first</span>
      </div>

      {activity.length === 0 ? (
        <p className="empty">Enqueue events and start senders to see delivery attempts here.</p>
      ) : (
        <ul className="activity">
          {activity.map(a => (
            <li key={a.id} className={kindClass(a.kind)}>
              <time>{new Date(a.ts).toLocaleTimeString()}</time>
              <span className="activity__kind">{a.kind}</span>
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
