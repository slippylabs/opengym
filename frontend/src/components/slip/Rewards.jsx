// Watches the store for the slippylabs fork's rewards, carried over from SlipFit, and renders
// nothing itself:
//   - a toast the moment a ticked set beats an exercise's record (SlipFit's live PR detection);
//   - badges earned and goals reached, stored and celebrated once no workout is running.
//
// Awards wait for the first sync of a signed-in session: a device that scored its stale copy
// before the pull would stamp today on badges another device earned weeks ago (a stamped map
// keeps the later stamp), so the earned date would move. SlipFit had the same rule for the same
// reason.
import { useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { todayISO, fmtNum, exerciseNameText } from '../../lib/format.js'
import { EXIDX } from '../../lib/exercises.js'
import { records, setBeats, rowValue, newBadges, summary, PR_LABELS } from '../../lib/slip/game.js'
import { goalsReached } from '../../lib/slip/goals.js'
import { goalsOf, awardBadges, saveGoal } from '../../lib/slip/state.js'
import { KM_PER_MI } from '../../lib/slip/cardio.js'
import { celebrateSheet } from './slip-sheets.jsx'

const SETTLE_MS = 1500

/** What a beaten record reads as in the toast: "Est. 1RM 120 kg". */
export function prText(S, kind, v) {
  const w = S.unit === 'lb' ? 'lb' : 'kg'
  const val = kind === 'e1rm' || kind === 'w' || kind === 'wadd' || kind === 'vol' ? fmtNum(v) + ' ' + w
    : kind === 'km' ? fmtNum(S.unit === 'lb' ? v / KM_PER_MI : v) + (S.unit === 'lb' ? ' mi' : ' km')
      : kind === 'min' ? fmtNum(v) + ' min' : kind === 'sec' ? fmtNum(v) + ' s' : fmtNum(v)
  return t(PR_LABELS[kind]) + ' ' + val
}

// The done state of every set of a running workout, keyed by entry and row.
const doneMap = A => {
  const m = new Map()
  ;(A?.entries || []).forEach((e, i) => (e.sets || []).forEach((s, j) => m.set(i + ':' + j, !!s?.done)))
  return m
}

export default function Rewards() {
  const ready = useStore(s => s.ready)
  const user = useStore(s => s.user)
  const sync = useStore(s => s.sync)
  const S = useStore(s => s.S)
  const pending = useRef({ ids: [], goals: [] })

  // Live PR toasts, from the store directly: a tick does not have to re-render this component.
  useEffect(() => {
    let prev = doneMap(useStore.getState().S.active)
    let cache = { of: null, best: null }
    return useStore.subscribe(state => {
      const A = state.S.active
      if (!A) { prev = new Map(); return }
      const now = doneMap(A)
      for (const [k, done] of now) {
        if (!done || prev.get(k)) continue
        const [i, j] = k.split(':').map(Number)
        const entry = A.entries[i], set = entry?.sets?.[j]
        if (!entry || !set) continue
        // The bests before this session: the saved log, with this session's own earlier sets on top.
        if (cache.of !== state.S.workouts) cache = { of: state.S.workouts, best: records(state.S).best }
        const best = structuredClone(cache.best || {})
        const mine = best[entry.id]
        if (mine) A.entries.forEach((e, ei) => (e.sets || []).forEach((s, sj) => {
          if (!s?.done || (ei === i && sj === j) || e.id !== entry.id) return
          for (const kind of Object.keys(mine)) mine[kind].v = Math.max(mine[kind].v, rowValue(kind, s))
        }))
        const beats = setBeats(best, entry.id, entry, set)
        if (!beats.length) continue
        const ex = EXIDX[entry.id] || (state.S.customEx || []).find(c => c.id === entry.id)
        const kind = beats[0]
        const v = rowValue(kind, set)
        useUI.getState().toast('🏆 ' + t('New PR: {0}', (ex ? exerciseNameText(ex) : t('Exercise')) + ' · ' + prText(state.S, kind, v)))
      }
      prev = now
    })
  }, [])

  // Badges and goals: settled a moment after the log stops changing.
  const synced = !user || (sync?.status === 'ok' && !!sync?.lastSynced)
  useEffect(() => {
    if (!ready || !synced) return
    const tm = setTimeout(() => {
      const st = useStore.getState().S
      const today = todayISO()
      const goalIds = goalsReached(st, today)
      const goals = goalsOf(st).filter(g => goalIds.includes(g.id))
      if (goalIds.length) useStore.getState().update(s => { for (const g of goals) saveGoal(s, { ...g, done: today }) })
      const after = useStore.getState().S
      const ids = newBadges(after, today, summary(after, today))
      if (ids.length) useStore.getState().update(s => { awardBadges(s, ids, today) })
      if (ids.length || goals.length) {
        pending.current = { ids: [...pending.current.ids, ...ids], goals: [...pending.current.goals, ...goals] }
      }
      // Celebrated between workouts, never over the set rows.
      if (!useStore.getState().S.active && (pending.current.ids.length || pending.current.goals.length)) {
        const { ids: i, goals: g } = pending.current
        pending.current = { ids: [], goals: [] }
        celebrateSheet(i, g)
      }
    }, SETTLE_MS)
    return () => clearTimeout(tm)
  }, [ready, synced, S.workouts, S.bodyweight, S.daily, S.slipGoals, S.slipRuns, S.slipProfile, S.active])

  return null
}
