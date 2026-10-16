// Goals, carried over from SlipFit: a body weight, a lift's estimated 1RM, a distance in one run, a
// number of workouts, or anything else ticked by hand. Each has an optional deadline; progress,
// "on track" and a projected finish date are derived from the log, the way SlipFit did it.
//
// Stored in fixed units (lib/slip/state.js): `target` and `start` in kg for weight and lift goals,
// km for a run goal. The log is in S.unit, so current values are converted to kg here.
import { workoutDay } from '../history.js'
import { records, e1rm, entryKinds, sortedWorkouts, addDays, dayNum, latestBodyweight } from './game.js'
import { longestRunKm } from './cardio.js'
import { goalsOf } from './state.js'

const KG_PER_LB = 0.45359237
export const toKg = (v, unit) => (unit === 'lb' ? v * KG_PER_LB : v)
export const fromKg = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg)

/** Least-squares slope of value against day number: units per day. Needs two days or more. */
export function trend(points) {
  if (!points || points.length < 2) return null
  const n = points.length
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y }
  const den = n * sxx - sx * sx
  if (den === 0) return null
  const slope = (n * sxy - sx * sy) / den
  return { slope, intercept: (sy - slope * sx) / n }
}

/** Where a goal stands now: kg, km, a count, or 0/1 for a ticked goal. */
export function goalCurrent(S, g) {
  if (g.type === 'weight') return toKg(latestBodyweight(S), S?.unit)
  if (g.type === 'lift') return toKg(records(S).best[g.exId]?.e1rm?.v || 0, S?.unit)
  if (g.type === 'run') return Math.max(0, ...(S?.workouts || []).map(w => longestRunKm(w, S)))
  if (g.type === 'workouts') return (S?.workouts || []).filter(w => (workoutDay(w) || '') >= (g.from || '')).length
  return g.checked ? 1 : 0
}

/** { cur, frac 0–1, onTrack: true | false | null, eta: 'YYYY-MM-DD' | null } */
export function goalProgress(S, g, today) {
  const cur = goalCurrent(S, g)
  let frac
  if (g.type === 'weight') {
    const span = g.target - g.start
    frac = Math.abs(span) < 0.05 ? (Math.abs(cur - g.target) < 0.25 ? 1 : 0) : (cur - g.start) / span
    if (cur > 0 && (span < 0 ? cur <= g.target : cur >= g.target)) frac = 1
  } else if (g.type === 'custom') frac = cur
  else frac = g.target > 0 ? cur / g.target : 0
  frac = Math.max(0, Math.min(1, frac || 0))
  let onTrack = null, eta = null
  if (g.deadline && frac < 1 && g.from) {
    const total = dayNum(g.deadline) - dayNum(g.from), el = dayNum(today) - dayNum(g.from)
    if (total > 0) onTrack = frac >= Math.min(1, el / total) - 0.05
  }
  // A projection from the trend of what the goal measures: six weeks of weigh-ins, twelve of lifts.
  if (frac < 1 && (g.type === 'weight' || g.type === 'lift')) {
    const pts = []
    if (g.type === 'weight') {
      for (const b of S?.bodyweight || []) if (Number(b?.w) > 0 && b.d >= addDays(today, -42)) pts.push([dayNum(b.d), toKg(Number(b.w), S?.unit)])
    } else {
      for (const w of sortedWorkouts(S)) {
        const d = workoutDay(w)
        if (d < addDays(today, -84)) continue
        for (const e of w.entries || []) {
          if (e.id !== g.exId) continue
          const top = Math.max(0, ...entryKinds(e).rows.map(s => e1rm(Number(s.w) || 0, Number(s.r) || 0)))
          if (top > 0) pts.push([dayNum(d), toKg(top, S?.unit)])
        }
      }
    }
    const tr = trend(pts)
    if (tr && pts.length >= 3) {
      const need = g.target - cur
      if (tr.slope !== 0 && Math.sign(tr.slope) === Math.sign(need)) {
        const days = Math.ceil(need / tr.slope)
        if (days < 3650) eta = addDays(today, days)
      }
    }
  }
  return { cur, frac, onTrack, eta }
}

/** Goals the log has just completed: the ids to mark done. */
export function goalsReached(S, today) {
  return goalsOf(S).filter(g => !g.done && goalProgress(S, g, today).frac >= 1).map(g => g.id)
}
