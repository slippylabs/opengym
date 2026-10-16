// Distance for cardio, which openGym stores as minutes and a speed (km/h) per set (lib/speed.js).
// SlipFit logged a distance instead; here a distance is derived from the two, and entering one
// sets the speed (speedFor). So nothing new is stored and every other reader of a cardio set
// (progression, the .FIT export, the charts) keeps working unchanged.
import { EXIDX } from '../exercises.js'
import { metricRowsForEntry, workoutDay } from '../history.js'

export const KM_PER_MI = 1.609344

/** km covered by one cardio row: minutes × km/h. */
export const rowKm = s => {
  const min = Number(s?.min) || 0, speed = Number(s?.speed) || 0
  return min > 0 && speed > 0 ? (min * speed) / 60 : 0
}

/** The km/h that covers `km` in `min` minutes, kept to hundredths like a typed speed. */
export const speedFor = (km, min) => {
  const k = Number(km) || 0, m = Number(min) || 0
  return k > 0 && m > 0 ? Math.round((k / (m / 60)) * 100) / 100 : 0
}

/** Seconds per km (or per mile with `perMile`) of a row, 0 when it has no distance. */
export const paceOf = (s, perMile = false) => {
  const km = rowKm(s)
  if (!km) return 0
  const sec = (Number(s.min) || 0) * 60
  return perMile ? sec / (km / KM_PER_MI) : sec / km
}

/** "5:30" for a pace in seconds. */
export const fmtPace = sec => {
  if (!(sec > 0) || !Number.isFinite(sec)) return '–'
  const r = Math.round(sec)
  return Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0')
}

const RUN_RE = /\b(run|running|jog|jogging|sprint|sprints|treadmill)\b/i
const NOT_RUN_RE = /walk|bike|cycle|elliptical|skating|swim|rope|burpee|punch|lunge|jack|squat|knee|hop|kick|wave|ski/i

/** Whether an exercise is a run, for the 5K / 10K badges and run goals. */
export function isRunEx(id, S) {
  const ex = EXIDX[id] || (S?.customEx || []).find(c => c.id === id)
  if (!ex) return false
  const n = String(ex.n || '')
  return RUN_RE.test(n) && !NOT_RUN_RE.test(n.replace(/treadmill/i, ''))
}

/** Completed cardio rows of a workout entry, warm-ups left out. */
export const cardioRows = entry => metricRowsForEntry(entry, 'cardio')

/** Total km and minutes of cardio in a workout. */
export function workoutCardio(w) {
  let km = 0, min = 0
  for (const e of w?.entries || []) for (const s of cardioRows(e)) { km += rowKm(s); min += Number(s.min) || 0 }
  return { km, min }
}

/** The longest single run row of a workout, in km. */
export function longestRunKm(w, S) {
  let best = 0
  for (const e of w?.entries || []) {
    if (!isRunEx(e.id, S)) continue
    for (const s of cardioRows(e)) best = Math.max(best, rowKm(s))
  }
  return best
}

/** Lifetime km, and km per day for charts. */
export function distanceTotals(S) {
  let total = 0
  const byDay = {}
  for (const w of S?.workouts || []) {
    const { km } = workoutCardio(w)
    if (!km) continue
    total += km
    const d = workoutDay(w)
    if (d) byDay[d] = (byDay[d] || 0) + km
  }
  return { total, byDay }
}
