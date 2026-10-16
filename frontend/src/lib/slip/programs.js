// SlipFit's programs: the plan generator, the built-in library, Couch to 5K and the run plans,
// ported from SlipFit's js/programs.js, plus toOpenGym() which turns one of its plans into
// openGym routines and a weekly schedule.
//
// A SlipFit plan is plain data:
//   { name, goal, desc, mode: 'cycle' | 'sequence', perWeek, schedule: [weekday…],
//     days: [{ name, items: [{ ex, og, sets, lo, hi, rest, min?, note? }] }], gen?, key?, builtin? }
// `ex` is the SlipFit exercise id and `og` the openGym catalogue id it maps to (null when the
// catalogue has no such exercise; toOpenGym skips those). Everything else is exactly what
// SlipFit's generate() produces, and the oracle test holds the two to that, so the port is
// kept line for line with the original rather than tidied: a "cleaner" rewrite is how two
// generators quietly drift apart. Weekdays are JS weekday numbers, Sunday = 0, which is also
// what openGym's S.week is keyed by.
//
// mode 'cycle' repeats days in order (lifting splits). mode 'sequence' walks through its days
// once (Couch to 5K). lo/hi are reps for 'w'/'b' exercises and seconds for 't'; cardio and
// mobility items carry `min` instead.
import { uid } from '../format.js'
import { isCardio } from '../exercises.js'
import { defaultConfig } from '../history.js'
import { normalizeRepRange } from '../rep-range.js'
import { SLIP_EXERCISES, ogIdOf, slipExercise } from './exercise-map.js'
import { SESSIONS, ROUTINE_NAME, RUN_EX, PROGRAM, noteOf } from './c25k.js'

export const EQUIP_SETS = {
  gym: ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'bodyweight', 'cardio'],
  home: ['dumbbell', 'kettlebell', 'band', 'bodyweight', 'cardio'],
  bodyweight: ['bodyweight', 'cardio'],
}

// Spread so no two lifting days are always back to back.
export const DEFAULT_SCHEDULE = {
  1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
}

export const ISOLATION = new Set(['lat_raise', 'bicep', 'tricep', 'rear_delt', 'calf', 'chest_iso', 'quad_iso', 'ham_iso', 'shrug'])
export const COMPOUND = new Set(['squat', 'hinge', 'hpush', 'vpush', 'hpull', 'vpull', 'lunge'])
// Moves a beginner is better off building toward than starting with.
const HARD = new Set(['pullup', 'chinup', 'dips', 'front-squat', 'nordic', 'hanging-raise', 'ab-wheel', 'pike-pushup', 'jump-squat', 'sumo-dl'])

const EASIER = {
  pullup: 'Can\'t do one yet? Jump to the top and lower yourself as slowly as you can; each lowering is a rep.',
  chinup: 'Can\'t do one yet? Jump to the top and lower yourself as slowly as you can; each lowering is a rep.',
  'pike-pushup': 'Too hard? Lower your hips and bend less at the waist; it gets easier the more upright you are.',
  dips: 'Too hard? Do bench dips with your feet on the floor instead.',
}

export const SPLITS = {
  fullA: ['Full Body A', ['squat', 'hpush', 'hpull', 'lat_raise', 'core', 'bicep', 'calf']],
  fullB: ['Full Body B', ['hinge', 'vpush', 'vpull', 'lunge', 'tricep', 'core', 'rear_delt']],
  fullC: ['Full Body C', ['squat', 'hpush', 'hpull', 'glute', 'rear_delt', 'core', 'calf']],
  upperA: ['Upper A', ['hpush', 'hpull', 'vpush', 'vpull', 'lat_raise', 'bicep', 'tricep']],
  lowerA: ['Lower A', ['squat', 'hinge', 'lunge', 'ham_iso', 'calf', 'core']],
  upperB: ['Upper B', ['vpush', 'vpull', 'hpush', 'hpull', 'rear_delt', 'tricep', 'bicep']],
  lowerB: ['Lower B', ['hinge', 'squat', 'glute', 'quad_iso', 'calf', 'core']],
  push: ['Push', ['hpush', 'vpush', 'hpush', 'lat_raise', 'tricep', 'chest_iso', 'tricep']],
  pull: ['Pull', ['vpull', 'hpull', 'hpull', 'rear_delt', 'bicep', 'shrug', 'bicep']],
  legs: ['Legs', ['squat', 'hinge', 'lunge', 'ham_iso', 'quad_iso', 'calf', 'core']],
  upper: ['Upper', ['hpush', 'hpull', 'vpush', 'vpull', 'lat_raise', 'bicep', 'tricep']],
  lower: ['Lower', ['squat', 'hinge', 'lunge', 'ham_iso', 'calf', 'core']],
}

export const SPLIT_FOR_DAYS = {
  1: ['fullA'], 2: ['fullA', 'fullB'], 3: ['fullA', 'fullB', 'fullC'], 4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upper', 'lower', 'push', 'pull', 'legs'], 6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  7: ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'fullA'],
}

export const GOAL_NAMES = { muscle: 'Build Muscle', strength: 'Get Stronger', lose: 'Lose Fat', general: 'General Fitness', run: 'Run' }
export const GOALS = Object.keys(GOAL_NAMES)
export const MINUTES = [30, 45, 60, 75]
export const EQUIPS = Object.keys(EQUIP_SETS)
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced']

// Exercises per session by length in minutes.
export function itemCount(minutes) {
  if (minutes <= 30) return 4
  if (minutes <= 45) return 5
  if (minutes <= 60) return 6
  return 7
}

// SlipFit's own filter, plus one: an exercise openGym's catalogue has no entry for is never a
// candidate, so a slot hands its place to the next exercise rather than to one that would be
// dropped on the way into openGym.
export function candidates(pattern, equip, experience) {
  const allowed = EQUIP_SETS[equip] || EQUIP_SETS.gym
  const list = SLIP_EXERCISES.filter(e => e.og && e.pattern === pattern && allowed.indexOf(e.equip) >= 0)
  // Stable re-rank: timed holds and (for beginners) hard moves go to the back,
  // but are still used rather than leaving the slot empty.
  const rank = e => (e.type === 't' && pattern !== 'core' ? 2 : 0) + (experience === 'beginner' && HARD.has(e.id) ? 1 : 0)
  return list.map((e, i) => [e, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(p => p[0])
}

function prescription(goal, pattern, ex, slotIndex, equip) {
  if (ex.type === 't') return { sets: 3, lo: 30, hi: 60, rest: 60 }
  if (ex.type === 'c' || ex.type === 'm') return { sets: 1, min: 10, rest: 0 }
  const iso = ISOLATION.has(pattern) || pattern === 'core' || pattern === 'glute'
  const main = slotIndex < 2 && COMPOUND.has(pattern)
  if (ex.type === 'b' && equip === 'bodyweight') return { sets: 3, lo: iso ? 12 : 8, hi: iso ? 20 : 15, rest: 60 }
  if (pattern === 'core') return { sets: 3, lo: 10, hi: 15, rest: 60 }
  switch (goal) {
    case 'strength':
      return main ? { sets: 5, lo: 3, hi: 5, rest: 180 } : iso ? { sets: 3, lo: 10, hi: 15, rest: 75 } : { sets: 3, lo: 6, hi: 10, rest: 120 }
    case 'muscle':
      return main ? { sets: 4, lo: 6, hi: 10, rest: 120 } : iso ? { sets: 3, lo: 10, hi: 15, rest: 60 } : { sets: 3, lo: 8, hi: 12, rest: 90 }
    case 'lose':
      return iso ? { sets: 3, lo: 12, hi: 15, rest: 45 } : { sets: 3, lo: 10, hi: 15, rest: 60 }
    default:
      return iso ? { sets: 3, lo: 10, hi: 15, rest: 60 } : { sets: 3, lo: 8, hi: 12, rest: 90 }
  }
}

function buildDay(splitKey, opts, occurrences) {
  const def = SPLITS[splitKey]
  const n = itemCount(opts.minutes || 45) - (opts.goal === 'lose' && (opts.minutes || 45) >= 45 ? 1 : 0)
  // Walk the whole slot list and stop at n filled: a slot with no exercise for
  // this equipment (no lateral raise without weights) hands its place on.
  const slots = def[1]
  const used = new Set()
  const items = []
  slots.forEach(pattern => {
    if (items.length >= n) return
    const i = items.length
    const c = candidates(pattern, opts.equip, opts.experience)
    if (!c.length) return
    // Rotate variants each time a pattern recurs in the plan, so Upper A and
    // Upper B don't repeat the same press -- except the main lifts of a
    // strength plan, which you want to practise every session.
    const seen = occurrences[pattern] || 0
    occurrences[pattern] = seen + 1
    const keepMain = opts.goal === 'strength' && i < 2
    const k = keepMain ? 0 : seen
    let ex = null
    for (let t = 0; t < c.length; t++) {
      const e = c[(k + t) % c.length]
      if (!used.has(e.id)) { ex = e; break }
    }
    if (!ex) return
    used.add(ex.id)
    const rx = prescription(opts.goal, pattern, ex, i, opts.equip)
    if (opts.experience === 'beginner' && HARD.has(ex.id) && ex.type === 'b') {
      // Nothing easier fits this slot with this equipment, so make it doable.
      Object.assign(rx, { lo: 3, hi: 8, note: EASIER[ex.id] || 'Start with whatever range you can control and build toward the full move.' })
    }
    items.push(Object.assign({ ex: ex.id }, rx))
  })
  if (opts.goal === 'lose' && (opts.minutes || 45) >= 45) {
    items.push({ ex: opts.equip === 'gym' ? 'hiit' : 'burpee', sets: opts.equip === 'gym' ? 1 : 3,
      min: opts.equip === 'gym' ? 10 : undefined, lo: 10, hi: 15, rest: 45, note: 'Finisher: keep it hard and short.' })
  }
  return { name: def[0], items }
}

// Every item learns its openGym id here, once, at the end: the generator itself stays the
// SlipFit original.
function withOg(plan) {
  plan.days.forEach(d => d.items.forEach(it => { it.og = ogIdOf(it.ex) }))
  return plan
}

function generatePlan(opts) {
  opts = Object.assign({ goal: 'general', days: 3, minutes: 45, equip: 'gym', experience: 'beginner' }, opts || {})
  const days = Math.max(1, Math.min(7, opts.days | 0))
  if (opts.goal === 'run') return runPlan(opts, days)
  const occurrences = {}
  const plan = {
    name: GOAL_NAMES[opts.goal] + ' · ' + days + '×/week',
    goal: opts.goal, mode: 'cycle', perWeek: days, schedule: DEFAULT_SCHEDULE[days].slice(),
    desc: describe(opts, days),
    days: SPLIT_FOR_DAYS[days].map(k => buildDay(k, opts, occurrences)),
    gen: { goal: opts.goal, days, minutes: opts.minutes, equip: opts.equip, experience: opts.experience },
  }
  // Six-day PPL repeats Push/Pull/Legs; give the second round distinct names.
  const seen = {}
  plan.days.forEach(d => { seen[d.name] = (seen[d.name] || 0) + 1; if (seen[d.name] > 1) d.name += ' 2' })
  return plan
}

/** SlipFit's plan generator: { goal, days, minutes, equip, experience } → a plan. */
export const generate = opts => withOg(generatePlan(opts))

function describe(opts, days) {
  const split = days <= 3 ? 'full-body sessions' : days === 4 ? 'an upper/lower split' : days === 5 ? 'upper, lower, push, pull and legs' : 'push / pull / legs twice through'
  const how = {
    strength: 'Heavy main lifts in low reps with long rests; add weight whenever you hit the top of the range.',
    muscle: 'Moderate weights in the 6-15 rep range. When every set reaches the top of the range, add weight next time.',
    lose: 'Higher reps, short rests and a conditioning finisher to keep your heart rate up. Pair with the calorie target from the calculators.',
    general: 'Balanced strength work for every muscle group. Add reps, then weight.',
  }[opts.goal] || ''
  return days + ' days a week of ' + split + ', about ' + (opts.minutes || 45) + ' minutes each. ' + how
}

/* ---------- running ---------- */

function c25kPlan() {
  return {
    name: 'Couch to 5K', goal: 'run', mode: 'sequence', perWeek: 3, schedule: DEFAULT_SCHEDULE[3].slice(),
    desc: 'Nine weeks, three runs a week, from walking to running 5 km (or 30 minutes) without stopping. Repeat a week whenever it felt too hard; there is no prize for rushing.',
    days: SESSIONS.map((r, i) => ({
      name: 'Week ' + (Math.floor(i / 3) + 1) + ' · Run ' + (i % 3 + 1),
      items: [{ ex: /walk/.test(r[0]) ? 'run-intervals' : 'run',
        sets: 1, min: r[1], note: noteOf(r[0]) }],
    })),
  }
}

/** Couch to 5K as a SlipFit plan: 27 sessions in sequence. */
export const c25k = () => withOg(c25kPlan())

function runPlan(opts, days) {
  if (opts.experience === 'beginner') {
    const p = c25kPlan()
    if (days < 3) {
      // Fewer runs a week just stretches the nine weeks out; the sessions are the same.
      p.perWeek = days
      p.schedule = DEFAULT_SCHEDULE[days].slice()
      p.desc += ' At ' + days + ' run' + (days === 1 ? '' : 's') + ' a week it takes longer, and that is fine.'
    }
    if (days > 3) {
      // Extra days become easy strength so legs and core can handle the mileage.
      p.desc += ' Your extra days are short strength sessions.'
      p.perWeek = days
      p.schedule = DEFAULT_SCHEDULE[days].slice()
      p.mode = 'sequence'
      const s = buildDay('fullA', Object.assign({}, opts, { goal: 'general', minutes: 30 }), {})
      s.name = 'Runner Strength'
      const out = []
      p.days.forEach((d, i) => { out.push(d); if (i % 3 === 2) for (let k = 3; k < days; k++) out.push(JSON.parse(JSON.stringify(s))) })
      p.days = out
    }
    return p
  }
  const runs = [
    { name: 'Easy Run', items: [{ ex: 'run', sets: 1, min: 35, note: 'Conversational pace (Zone 2).' }] },
    { name: 'Intervals', items: [{ ex: 'run', sets: 1, min: 40, note: '10 min easy, 6 × (2 min hard / 2 min jog), 6 min easy.' }] },
    { name: 'Long Run', items: [{ ex: 'run', sets: 1, min: 55, note: 'Slow and steady; add 5 minutes each week up to 90.' }] },
    { name: 'Tempo Run', items: [{ ex: 'run', sets: 1, min: 40, note: '10 min easy, 20 min comfortably hard, 10 min easy.' }] },
  ]
  const strength = buildDay('fullA', Object.assign({}, opts, { goal: 'general', minutes: 30 }), {})
  strength.name = 'Runner Strength'
  const order = days <= 2 ? [runs[0], runs[2]] : days === 3 ? [runs[0], runs[1], runs[2]]
    : days === 4 ? [runs[0], runs[1], strength, runs[2]] : days === 5 ? [runs[0], runs[1], strength, runs[3], runs[2]]
      : [runs[0], runs[1], strength, runs[0], runs[3], runs[2]].concat(days === 7 ? [{ name: 'Recovery', items: [{ ex: 'stretch', sets: 1, min: 20 }] }] : [])
  return {
    name: 'Run Builder · ' + days + '×/week', goal: 'run', mode: 'cycle', perWeek: days, schedule: DEFAULT_SCHEDULE[days].slice(),
    desc: 'Easy miles, one quality session and a long run each week. Most running should feel easy.',
    days: JSON.parse(JSON.stringify(order)),
    gen: { goal: 'run', days, minutes: opts.minutes, equip: opts.equip, experience: opts.experience },
  }
}

/* ---------- built-in library ---------- */

function mobilityPlan() {
  return {
    name: 'Mobility & Recovery', goal: 'general', mode: 'cycle', perWeek: 3, schedule: [2, 4, 6],
    desc: 'Short sessions for stiff hips, shoulders and backs. Great alongside any plan or on rest days.',
    days: [
      { name: 'Hips & Spine', items: [{ ex: 'cat-cow', sets: 2, lo: 8, hi: 10, rest: 0 }, { ex: 'worlds-greatest', sets: 2, lo: 5, hi: 6, rest: 0 }, { ex: 'hip-opener', sets: 1, min: 10 }, { ex: 'glute-bridge', sets: 2, lo: 12, hi: 15, rest: 30 }, { ex: 'stretch', sets: 1, min: 10 }] },
      { name: 'Flow & Roll', items: [{ ex: 'foam-roll', sets: 1, min: 10 }, { ex: 'yoga', sets: 1, min: 20 }, { ex: 'meditate', sets: 1, min: 5 }] },
      { name: 'Shoulders & Walk', items: [{ ex: 'shoulder-mob', sets: 1, min: 10 }, { ex: 'band-pull-apart', sets: 3, lo: 15, hi: 20, rest: 30 }, { ex: 'bird-dog', sets: 2, lo: 8, hi: 10, rest: 30 }, { ex: 'walk', sets: 1, min: 30 }] },
    ],
  }
}

export const mobility = () => withOg(mobilityPlan())

function libraryPlans() {
  const g = (o, name, desc) => { const p = generatePlan(o); p.name = name; if (desc) p.desc = desc + ' ' + p.desc; p.builtin = true; return p }
  const lib = [
    ['beginner-full', g({ goal: 'general', days: 3, minutes: 45, equip: 'gym', experience: 'beginner' }, 'Beginner Full Body', 'The best place to start in a gym.')],
    ['strength-basics', g({ goal: 'strength', days: 3, minutes: 60, equip: 'gym', experience: 'intermediate' }, 'Stronger Basics', 'Squat, press and pull heavy, three times a week.')],
    ['upper-lower', g({ goal: 'muscle', days: 4, minutes: 60, equip: 'gym', experience: 'intermediate' }, 'Upper / Lower', 'A classic four-day muscle builder.')],
    ['ppl', g({ goal: 'muscle', days: 6, minutes: 60, equip: 'gym', experience: 'advanced' }, 'Push / Pull / Legs', 'High-frequency six-day split for experienced lifters.')],
    ['fat-loss', g({ goal: 'lose', days: 4, minutes: 45, equip: 'gym', experience: 'beginner' }, 'Fat Loss Circuit', 'Keep the muscle, lose the fat.')],
    ['home-db', g({ goal: 'general', days: 3, minutes: 45, equip: 'home', experience: 'beginner' }, 'Home Dumbbells', 'Dumbbells, bands and your bodyweight.')],
    ['bodyweight', g({ goal: 'general', days: 3, minutes: 30, equip: 'bodyweight', experience: 'beginner' }, 'Bodyweight Anywhere', 'No equipment, no excuses; 30 minutes.')],
    ['c25k', Object.assign(c25kPlan(), { builtin: true })],
    ['run-builder', Object.assign(generatePlan({ goal: 'run', days: 4, minutes: 45, equip: 'gym', experience: 'intermediate' }), { name: 'Run Builder', builtin: true })],
    ['mobility', Object.assign(mobilityPlan(), { builtin: true })],
  ]
  return lib.map(p => Object.assign(p[1], { key: p[0] }))
}

/** SlipFit's built-in plans, each with its `key`. */
export const library = () => libraryPlans().map(withOg)

// The built-ins openGym's own starter chooser does not already offer (it has Upper / Lower and
// Push / Pull / Legs), in SlipFit's order. These are what "More plans" lists.
export const MORE_PLAN_KEYS = ['beginner-full', 'strength-basics', 'fat-loss', 'home-db', 'bodyweight', 'c25k', 'run-builder', 'mobility']

/** One built-in plan by key, freshly built, or null. */
export const libraryPlan = key => library().find(p => p.key === key) || null

/** Whether a plan is Couch to 5K (the built-in, or what a beginner's Run goal generates). */
export const isC25k = plan => !!plan && plan.mode === 'sequence' && plan.goal === 'run'

/* ---------- into openGym ---------- */

// Routine glyphs (lib/glyphs.js) by what the day is.
function glyphFor(day) {
  const n = day.name
  if (day.items.every(it => { const t = slipExercise(it.ex)?.type; return t === 'c' })) return 'figureRun'
  if (/Hips|Flow|Shoulders|Recovery/.test(n)) return 'stretch'
  if (/Lower|Legs/.test(n)) return 'legs'
  if (/Pull/.test(n)) return 'pullup'
  if (/Upper|Push/.test(n)) return 'barbell'
  return 'figureStrength'
}

// Starting speeds for a cardio slot, km/h (lib/speed.js stores km/h): what the session note
// says is easy, not a target. The routine editor changes it like any other.
const SPEED = { walk: 5, hike: 4 }

/**
 * One SlipFit plan item as an openGym routine exercise, or null when the catalogue has no such
 * exercise. Built on defaultConfig so a new field there (the bodyweight flag) carries over.
 *   minutes on a cardio exercise   → mode 'cardio', min, speed
 *   minutes on anything else       → a timed hold of that many minutes (yoga, breathing)
 *   a timed SlipFit hold (type t)  → mode 'time', sec at the bottom of the range, 'Add time'
 *   reps                           → a rep range under double progression, the way SlipFit
 *                                    prescribes it ("8–12, add weight at the top")
 * Rest and the note ride along whatever the mode.
 */
export function routineExercise(item) {
  const id = item.og ?? ogIdOf(item.ex)
  if (!id) return null
  const sx = slipExercise(item.ex)
  const extra = {}
  if (item.rest > 0) extra.restSec = item.rest
  if (item.note) extra.note = item.note
  if (item.min > 0) {
    if (isCardio(id)) return { id, ...defaultConfig(id, 'cardio'), mode: 'cardio', sets: 1, min: item.min, speed: SPEED[item.ex] || 8, ...extra }
    return { id, ...defaultConfig(id, 'time'), sets: item.sets || 1, sec: item.min * 60, ...extra }
  }
  if (sx?.type === 't') return { id, ...defaultConfig(id, 'time'), sets: item.sets || 3, sec: item.lo || 30, prog: 'time', ...extra }
  const { reps, repsMin } = normalizeRepRange(item.hi, item.lo)
  return { id, ...defaultConfig(id, 'reps'), sets: item.sets || 3, reps, repsMin, prog: 'double', ...extra }
}

const toRoutine = (day, name = day.name) => {
  const ex = day.items.map(routineExercise).filter(Boolean)
  return { id: uid(), name, emoji: glyphFor(day), ex }
}

/**
 * A SlipFit plan as openGym data, in the shape lib/starter.js buildStarterPlan returns, so it
 * goes through the same apply path:
 *   { routines, schedule: [{ day, routineId }], skipped: [slipId…], unscheduled: [routineName…],
 *     program?: 'c25k', runRoutineId? }
 * A cycle plan becomes one routine per day, each on the plan's weekday at the same position.
 * A plan with more days than weekdays (a one-day Run Builder alternates Easy and Long runs)
 * cannot be said by a weekly plan, so the extra routines are added unscheduled and named in
 * `unscheduled`, for the preview to say so. A day left with no exercise at all is dropped.
 * Couch to 5K becomes ONE routine (lib/slip/c25k.js says why) plus, when the plan asked for
 * more than three days, one Runner Strength routine on the days between runs.
 */
export function toOpenGym(plan) {
  const skipped = []
  for (const d of plan.days) for (const it of d.items) if (!(it.og ?? ogIdOf(it.ex))) skipped.push(it.ex)
  if (isC25k(plan)) return c25kToOpenGym(plan, [...new Set(skipped)])
  const kept = plan.days.map(d => toRoutine(d)).map((r, i) => [r, i]).filter(([r]) => r.ex.length)
  const schedule = [], unscheduled = []
  for (const [r, i] of kept) {
    const day = plan.schedule[i]
    if (day == null) unscheduled.push(r.name)
    else schedule.push({ day, routineId: r.id })
  }
  return { routines: kept.map(([r]) => r), schedule, skipped: [...new Set(skipped)], unscheduled }
}

// Runs keep SlipFit's weekdays up to three a week. Past that, runs stay on Monday, Wednesday and
// Friday and the strength days fill the gaps, so no strength day lands the day before a run it
// would tire the legs for any more than it has to.
const STRENGTH_DAYS = [2, 4, 6, 0]
function c25kToOpenGym(plan, skipped) {
  const first = sessionOfPlan(plan)
  const run = {
    id: uid(), name: ROUTINE_NAME, emoji: 'figureRun',
    ex: [{ id: RUN_EX, ...defaultConfig(RUN_EX, 'cardio'), mode: 'cardio', sets: 1, min: first.min, speed: 8, note: first.note }],
  }
  const strengthDay = plan.days.find(d => d.name === 'Runner Strength')
  const strength = strengthDay ? toRoutine(strengthDay) : null
  const runsPerWeek = Math.min(3, plan.perWeek)
  const runDays = runsPerWeek < 3 ? DEFAULT_SCHEDULE[runsPerWeek] : DEFAULT_SCHEDULE[3]
  const schedule = runDays.map(day => ({ day, routineId: run.id }))
  if (strength && strength.ex.length) {
    STRENGTH_DAYS.slice(0, Math.max(0, plan.perWeek - 3)).forEach(day => schedule.push({ day, routineId: strength.id }))
  }
  const routines = strength && strength.ex.length ? [run, strength] : [run]
  return { routines, schedule, skipped, unscheduled: [], program: PROGRAM, runRoutineId: run.id }
}

// The first run of the program, read off the plan rather than assumed.
function sessionOfPlan(plan) {
  const d = plan.days.find(x => x.items.some(it => it.ex === 'run' || it.ex === 'run-intervals'))
  const it = d.items[0]
  return { min: it.min, note: it.note }
}
