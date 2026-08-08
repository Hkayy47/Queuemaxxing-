import { useEffect, useState } from 'react'
import {
  TUTORIAL_STEPS,
  type TutorialContext,
  type TutorialStep,
} from '../tutorialSteps'

interface Props {
  open: boolean
  onClose: () => void
  ctx: TutorialContext
  onSpotlight: (target: TutorialStep['target']) => void
}

export default function Tutorial({ open, onClose, ctx, onSpotlight }: Props) {
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionDone, setActionDone] = useState(false)

  const step = TUTORIAL_STEPS[index]

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setError(null)
    setActionDone(false)
  }, [open])

  useEffect(() => {
    if (!open || !step) {
      onSpotlight(null)
      return
    }
    onSpotlight(step.target)
    setActionDone(!step.actionLabel)
    setError(null)
  }, [open, step, onSpotlight])

  if (!open || !step) return null

  const isLast = index >= TUTORIAL_STEPS.length - 1
  const centered = step.target === null

  const runAction = async () => {
    if (!step.run) {
      setActionDone(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await step.run(ctx)
      setActionDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const goNext = () => {
    if (isLast) {
      onClose()
      return
    }
    setIndex(i => i + 1)
  }

  return (
    <>
      <div className="tutorial-veil" aria-hidden />
      <div
        className={`tutorial-card ${centered ? 'tutorial-card--center' : 'tutorial-card--dock'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <div className="tutorial-progress" aria-hidden>
          {TUTORIAL_STEPS.map((s, i) => (
            <span key={s.id} className={i <= index ? 'is-done' : ''} />
          ))}
        </div>
        <div className="tutorial-card__step">
          Tutorial · {index + 1} / {TUTORIAL_STEPS.length}
        </div>
        <h2 id="tutorial-title">{step.title}</h2>
        <p>{step.body}</p>
        {error && <div className="error-banner" style={{ marginBottom: '0.75rem' }}>{error}</div>}
        <div className="tutorial-card__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Exit
          </button>
          {step.actionLabel && !actionDone && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => { void runAction() }}
            >
              {busy ? 'Working…' : step.actionLabel}
            </button>
          )}
          {(actionDone || !step.actionLabel) && (
            <button type="button" className="btn btn-primary btn-sm" onClick={goNext}>
              {step.nextLabel ?? (isLast ? 'Finish' : 'Next')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
