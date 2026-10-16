// Home's card for a one-way program in progress: Couch to 5K (lib/slip/c25k.js).
//
// The weekly plan only says "Couch to 5K" on Monday, Wednesday and Friday; this card says which
// of the 27 runs that is, what to do in it and how far along you are. Progress is read off the
// workouts you logged, so the card holds no state of its own. Two things it does write, both
// from an effect and both only when they differ from what is stored (so rendering again, or on a
// second device, writes nothing):
//   - the routine's run follows the current session: its minutes, and its note while the note is
//     still one the program wrote (a note you typed yourself is left alone);
//   - at 27 runs the run record is marked finished, and the card turns into a graduation you
//     can dismiss.
// Renders nothing when there is no run, or when its routine has been deleted.
import { useEffect } from 'react'
import { useStore } from '../../store/useStore.js'
import { todayISO } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { nav } from '../../lib/nav.js'
import { startFlow } from '../../sheets.jsx'
import { runsOf, saveRun } from '../../lib/slip/state.js'
import { PROGRAM, TOTAL, RUN_EX, SESSIONS, ROUTINE_NAME, noteOf, progressOf } from '../../lib/slip/c25k.js'
import { Button } from '../ui.jsx'
import Icon from '../Icon.jsx'

const update = (...a) => useStore.getState().update(...a)
const PROGRAM_NOTES = new Set(SESSIONS.map(([text]) => noteOf(text)))

// The routine slot the program drives: its run, or failing that its first exercise (someone may
// have swapped the run for a treadmill run and still be following the program).
const slotOf = routine => {
  const i = routine.ex.findIndex(e => e.id === RUN_EX)
  return i >= 0 ? i : (routine.ex.length ? 0 : -1)
}

export default function ProgramCard() {
  const S = useStore(s => s.S)
  const runs = runsOf(S).filter(r => r.program === PROGRAM)
  const active = runs.find(r => !r.finished) || null
  const routine = active ? (S.routines || []).find(r => r.id === active.routineId) || null : null
  const p = active && routine ? progressOf(S, active) : null
  const graduated = !active ? runs.find(r => r.finished && !r.dismissed) || null : null

  const slot = routine ? slotOf(routine) : -1
  const cur = slot >= 0 ? routine.ex[slot] : null
  const needMin = !!(p && !p.finished && cur && cur.min !== p.session.min)
  const needNote = !!(p && !p.finished && cur && cur.note !== p.session.note && (!cur.note || PROGRAM_NOTES.has(cur.note)))
  const finishNow = !!(p && p.finished)

  useEffect(() => {
    if (finishNow) { update(s => saveRun(s, { id: active.id, finished: todayISO() })); return }
    if (!needMin && !needNote) return
    update(s => {
      const x = (s.routines || []).find(r => r.id === routine.id)?.ex[slot]
      if (!x) return
      if (needMin) x.min = p.session.min
      if (needNote) x.note = p.session.note
    })
    // The flags are the whole decision: they are false again once the write has landed.
  }, [finishNow, needMin, needNote, active?.id, routine?.id, slot, p?.session.min, p?.session.note])

  if (graduated) {
    return <div className="card slip-program">
      <div className="row" style={{ gap: 9, marginBottom: 8 }}>
        <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="trophy" /></span>
        <div>
          <div className="lbl2">{ROUTINE_NAME}</div>
          <div className="ttl">{t('Program complete!')}</div>
        </div>
      </div>
      <div className="small muted" style={{ marginBottom: 10 }}>{t('All {0} runs done. You can run 5 km.', TOTAL)}</div>
      <Button size="sm" onClick={() => update(s => saveRun(s, { id: graduated.id, dismissed: true }))}>{t('Dismiss')}</Button>
    </div>
  }
  if (!p || p.finished) return null

  const { session, done } = p
  const pct = Math.round(done / TOTAL * 100)
  const onStart = () => { if (S.active) nav('/workout'); else startFlow([routine.id]) }
  return <div className="card slip-program">
    <div className="row between" style={{ gap: 9, marginBottom: 6 }}>
      <div className="row" style={{ gap: 9, minWidth: 0 }}>
        <span className="lrow-i" style={{ background: 'var(--acc)' }}><Icon name="figureRun" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{ROUTINE_NAME}</div>
          <div className="ttl">{t('Week {0} · Run {1}', session.week, session.run)}</div>
        </div>
      </div>
      <Button size="sm" variant="tinted" icon="play" onClick={onStart}>{S.active ? t('Resume') : t('Start')}</Button>
    </div>
    <div className="small" style={{ marginBottom: 4 }}>{session.text}</div>
    <div className="small muted" style={{ marginBottom: 8 }}>{t('{0} min, with a 5 min walk to warm up and cool down', session.min)}</div>
    <div role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={done} aria-label={ROUTINE_NAME}
      style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <i style={{ display: 'block', height: '100%', width: pct + '%', background: 'var(--acc)', borderRadius: 3 }} />
    </div>
    <div className="small dim" style={{ marginTop: 4 }}>{t('{0} of {1} runs done', done, TOTAL)}</div>
  </div>
}
