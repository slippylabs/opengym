// The slippylabs additions' own state: profile and targets, daily check-ins, goals, badges and
// program runs. Carried over from SlipFit, the app this fork replaced.
//
// Every one of them is a stamped map (lib/sync-merge.js STAMPED_MAPS): one entry per key, each
// with its own `_ts`, so two devices merge entry by entry: a water glass logged on the phone and
// a goal ticked on the laptop both survive. Nothing is ever deleted outright. A removed goal
// keeps its key with `gone: true` and a fresh stamp, because a missing key would come back from
// the other device's copy on the next merge.
//
//   slipProfile  { body: { sex, birthYear, heightCm, activity, _ts },
//                  targets: { weeklyGoal, water, protein, sleep, steps, _ts },
//                  setup: { done, _ts } }
//   daily        { 'YYYY-MM-DD': { water, protein, sleep, steps, _ts } }   water in glasses (250 ml)
//   slipGoals    { id: { id, type, title, target, unit?, exId?, start?, from?, deadline?, done?, doneAt?, gone?, created, _ts } }
//   badges       { badgeId: { d: 'YYYY-MM-DD', _ts } }                     first earned, never removed
//   slipRuns     { runId: { program, routineId, start, finished?, _ts } }  one-way programs (Couch to 5K)
//
// Heights are stored in cm, protein in grams, goal weights in kg and goal distances in km,
// whatever the profile's units: lib/units.js converts only the weights it knows about when the
// unit is switched, so these are kept in one fixed unit and converted for display.
import { uid } from '../format.js'

export const SLIP_MAPS = ['slipProfile', 'daily', 'slipGoals', 'badges', 'slipRuns']

export const BODY_DEFAULTS = { sex: 'm', birthYear: 1995, heightCm: 175, activity: 1.55 }
export const TARGET_DEFAULTS = { weeklyGoal: 3, water: 8, protein: 140, sleep: 7.5, steps: 8000 }

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const strip = ({ _ts, ...rest }) => rest

/** The body facts the calculators start from, with defaults filled in. */
export function bodyOf(S) {
  const b = isMap(S?.slipProfile?.body) ? strip(S.slipProfile.body) : {}
  return { ...BODY_DEFAULTS, ...b }
}

/** Whether the profile was ever filled in (not just defaults). */
export const hasBody = S => isMap(S?.slipProfile?.body)

/** The daily and weekly targets, with defaults filled in. */
export function targetsOf(S) {
  const t = isMap(S?.slipProfile?.targets) ? strip(S.slipProfile.targets) : {}
  return { ...TARGET_DEFAULTS, ...t }
}

export const setupDone = S => !!S?.slipProfile?.setup?.done

export function ageOf(S, now = new Date()) {
  const y = Number(bodyOf(S).birthYear)
  return Number.isFinite(y) && y > 1900 ? now.getFullYear() - y : 30
}

/** Writers: each takes the draft state of a store update(s => …) and changes one entry. */
export function setBody(s, patch) {
  if (!isMap(s.slipProfile)) s.slipProfile = {}
  s.slipProfile.body = { ...bodyOf(s), ...patch, _ts: Date.now() }
}
export function setTargets(s, patch) {
  if (!isMap(s.slipProfile)) s.slipProfile = {}
  s.slipProfile.targets = { ...targetsOf(s), ...patch, _ts: Date.now() }
}
export function setSetupDone(s, done = true) {
  if (!isMap(s.slipProfile)) s.slipProfile = {}
  s.slipProfile.setup = { done: !!done, _ts: Date.now() }
}

/* ---------- daily check-ins ---------- */

export const CHECKIN_KEYS = ['water', 'protein', 'sleep', 'steps']

export function dailyOf(S, iso) {
  const d = isMap(S?.daily?.[iso]) ? strip(S.daily[iso]) : {}
  return { water: 0, protein: 0, sleep: 0, steps: 0, ...d }
}

export function setDaily(s, iso, patch) {
  if (!isMap(s.daily)) s.daily = {}
  const next = { ...dailyOf(s, iso), ...patch }
  for (const k of CHECKIN_KEYS) next[k] = Math.max(0, Number(next[k]) || 0)
  s.daily[iso] = { ...next, _ts: Date.now() }
}

/** The days that have anything logged. */
export function checkinDays(S) {
  const d = isMap(S?.daily) ? S.daily : {}
  return Object.keys(d).filter(k => CHECKIN_KEYS.some(c => (Number(d[k]?.[c]) || 0) > 0)).sort()
}

/** How many of the four targets a day met (0–4). */
export function checkinHits(S, iso) {
  const c = dailyOf(S, iso), t = targetsOf(S)
  return CHECKIN_KEYS.filter(k => t[k] > 0 && c[k] >= t[k]).length
}

/* ---------- goals ---------- */

export const GOAL_TYPES = ['weight', 'lift', 'run', 'workouts', 'custom']

/** Live goals, oldest first. */
export function goalsOf(S) {
  const m = isMap(S?.slipGoals) ? S.slipGoals : {}
  return Object.values(m).filter(g => isMap(g) && !g.gone).sort((a, b) => (a.created || 0) - (b.created || 0))
}

export function saveGoal(s, goal) {
  if (!isMap(s.slipGoals)) s.slipGoals = {}
  const id = goal.id || uid()
  const prev = isMap(s.slipGoals[id]) ? s.slipGoals[id] : {}
  s.slipGoals[id] = { ...prev, ...goal, id, created: prev.created || goal.created || Date.now(), _ts: Date.now() }
  return id
}

export function removeGoal(s, id) {
  if (!isMap(s.slipGoals) || !s.slipGoals[id]) return
  s.slipGoals[id] = { id, gone: true, _ts: Date.now() }
}

/* ---------- badges ---------- */

export function badgesOf(S) {
  const m = isMap(S?.badges) ? S.badges : {}
  const out = {}
  for (const [k, v] of Object.entries(m)) if (isMap(v) && v.d) out[k] = v.d
  return out
}

export function awardBadges(s, ids, iso) {
  if (!ids.length) return
  if (!isMap(s.badges)) s.badges = {}
  const now = Date.now()
  for (const id of ids) if (!isMap(s.badges[id])) s.badges[id] = { d: iso, _ts: now }
}

/* ---------- program runs ---------- */

export function runsOf(S) {
  const m = isMap(S?.slipRuns) ? S.slipRuns : {}
  return Object.entries(m).filter(([, v]) => isMap(v) && !v.gone).map(([id, v]) => ({ ...strip(v), id }))
}

export function saveRun(s, run) {
  if (!isMap(s.slipRuns)) s.slipRuns = {}
  const id = run.id || uid()
  const prev = isMap(s.slipRuns[id]) ? s.slipRuns[id] : {}
  const { id: _, ...rest } = run
  s.slipRuns[id] = { ...prev, ...rest, _ts: Date.now() }
  return id
}

export const finishedPrograms = S => runsOf(S).filter(r => r.finished)
