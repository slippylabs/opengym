// Personal records, weekly-goal streaks, XP, levels and the 46 achievements, ported from
// SlipFit's gamify.js onto openGym's workout log.
//
// Everything here is DERIVED from the log on every call; nothing is a running counter. A deleted
// workout takes its XP with it, two devices can never disagree about a level, and a fix here
// re-scores the whole history. The one stored output is the day each badge was first earned
// (S.badges, lib/slip/state.js), so a badge stays earned. `today` is passed in so tests can pin
// the clock.
//
// Weights in a workout are in S.unit. Records keep that unit (they are compared with each other
// and with the body weight, which is in the same unit); the volume badges are defined in kg, so
// the total volume is converted for them.
import { EXIDX, isAssisted } from '../exercises.js'
import { isBw, metricModeForEntry, metricRowsForEntry, workoutDay, workoutVolume, workoutDuration, workoutAt } from '../history.js'
import { isWarmupRow } from '../workout-model.js'
import { rowKm, workoutCardio, longestRunKm } from './cardio.js'
import { targetsOf, checkinDays, checkinHits, dailyOf, goalsOf, badgesOf, finishedPrograms } from './state.js'

const KG_PER_LB = 0.45359237

/* ---------- dates: calendar days as YYYY-MM-DD, counted in UTC so DST never bites ---------- */

const pad = n => String(n).padStart(2, '0')
export const dayNum = s => { const p = s.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000) }
export const fromDayNum = n => { const d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) }
export const addDays = (s, k) => fromDayNum(dayNum(s) + k)
export const weekday = s => (dayNum(s) + 4) % 7                     // 1970-01-01 was a Thursday; Sunday = 0
/** The first day of the week holding `s`: Monday, or Sunday with `weekStart` 0. */
export const weekStartOfDay = (s, weekStart = 1) => addDays(s, -((weekday(s) - weekStart + 7) % 7))

/* ---------- the log, in order ---------- */

export function sortedWorkouts(S) {
  return (S?.workouts || []).filter(w => workoutDay(w))
    .slice().sort((a, b) => {
      const da = workoutDay(a), db = workoutDay(b)
      return da < db ? -1 : da > db ? 1 : (workoutAt(a) || 0) - (workoutAt(b) || 0)
    })
}

/* ---------- personal records ----------
 * Walk the log in order keeping each exercise's bests. The first time an exercise is done sets
 * the baseline and is not a PR, or every new exercise would shower you with them. A set that
 * beats the baseline is.
 */
export const PR_LABELS = {
  e1rm: 'Est. 1RM', w: 'Heaviest', vol: 'Best set', r: 'Most reps', wadd: 'Heaviest added',
  sec: 'Longest hold', km: 'Longest distance', min: 'Longest time',
}

/** Estimated 1RM by Epley, only for 1–12 reps (above that it is noise). */
export const e1rm = (w, r) => (r >= 1 && r <= 12 && w > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0)

/** The record kinds an entry is scored on, and its rows. */
export function entryKinds(entry) {
  const mode = metricModeForEntry(entry)
  const rows = mode ? metricRowsForEntry(entry, mode).filter(s => !isWarmupRow(s)) : []
  if (mode === 'cardio') return { kinds: ['km', 'min'], rows }
  if (mode === 'time') return { kinds: ['sec'], rows }
  const cfg = entry?.target ? { ...entry.target, id: entry.id } : { id: entry?.id }
  if (isBw(cfg)) return { kinds: ['r', 'wadd'], rows }
  // An assistance machine's best is the least help, so a "heaviest" record would reward the
  // opposite of progress. Reps are still fair game.
  if (isAssisted({ id: entry?.id })) return { kinds: ['r'], rows }
  return { kinds: ['e1rm', 'w', 'vol'], rows }
}

export function rowValue(kind, s) {
  const w = Number(s?.w) || 0, r = Number(s?.r) || 0
  switch (kind) {
    case 'e1rm': return e1rm(w, r)
    case 'w': case 'wadd': return w
    case 'vol': return w * r
    case 'r': return r
    case 'sec': return Number(s?.sec) || 0
    case 'km': return rowKm(s)
    case 'min': return Number(s?.min) || 0
  }
  return 0
}

/** Every exercise's bests and every PR in the order it happened. `stopAt` stops before a workout id. */
export function records(S, { stopAt } = {}) {
  const best = {}                 // exId -> kind -> { v, d, wid }
  const events = []
  for (const w of sortedWorkouts(S)) {
    if (stopAt && w.id === stopAt) break
    const d = workoutDay(w)
    for (const entry of w.entries || []) {
      if (!entry?.id) continue
      const { kinds, rows } = entryKinds(entry)
      const b = best[entry.id] || (best[entry.id] = {})
      for (const k of kinds) {
        let top = 0
        for (const s of rows) top = Math.max(top, rowValue(k, s))
        if (!(top > 0)) continue
        const prev = b[k]
        if (prev && top > prev.v + 1e-9) events.push({ wid: w.id, d, ex: entry.id, kind: k, v: top, prev: prev.v })
        if (!prev || top > prev.v) b[k] = { v: top, d, wid: w.id }
      }
    }
  }
  // One heavy set can beat the 1RM, heaviest and best-set records at once. That is one PR moment,
  // so XP and badges count (workout, exercise) pairs.
  const moments = new Set(events.map(e => e.wid + '|' + e.ex))
  return { best, events, count: moments.size }
}

/** The record kinds one just-ticked set beats, against the bests before it. [] for none or a baseline. */
export function setBeats(best, exId, entry, set) {
  const b = best?.[exId]
  if (!b || !set || isWarmupRow(set)) return []
  const { kinds } = entryKinds({ ...entry, sets: [{ ...set, done: true }] })
  return kinds.filter(k => b[k] && rowValue(k, set) > b[k].v + 1e-9)
}

/* ---------- weeks and streaks ----------
 * A streak counts WEEKS in which the weekly goal was hit, so planned rest days never break it.
 * The week in progress can only extend a streak, never end it: on Monday nothing is missed yet.
 */
export function weekCounts(S) {
  const ws = S?.weekStart === 0 ? 0 : 1
  const m = {}
  for (const w of S?.workouts || []) {
    const d = workoutDay(w)
    if (!d) continue
    const k = weekStartOfDay(d, ws)
    m[k] = (m[k] || 0) + 1
  }
  return m
}

export function goalStreaks(S, today) {
  const goal = Math.max(1, Number(targetsOf(S).weeklyGoal) || 3)
  const ws = S?.weekStart === 0 ? 0 : 1
  const counts = weekCounts(S)
  const thisWeek = weekStartOfDay(today, ws)
  const hit = wk => (counts[wk] || 0) >= goal
  let current = 0
  let wk = hit(thisWeek) ? thisWeek : addDays(thisWeek, -7)
  while (hit(wk)) { current++; wk = addDays(wk, -7) }
  const hitWeeks = Object.keys(counts).filter(hit).sort()
  let best = 0, run = 0, last = null
  for (const k of hitWeeks) { run = last && dayNum(k) - dayNum(last) === 7 ? run + 1 : 1; best = Math.max(best, run); last = k }
  return { current, best: Math.max(best, current), goal, thisWeek: counts[thisWeek] || 0, hitThisWeek: hit(thisWeek), hitWeeks }
}

/* ---------- XP ---------- */

export const XP = { workout: 50, set: 5, maxSets: 40, cardioMin: 2, maxCardio: 60, pr: 25, checkin: 5, weighIn: 5, weekHit: 100, streakStep: 10, streakCap: 100, goal: 250, badge: 50 }

export function workoutXp(w) {
  let sets = 0, mins = 0
  for (const entry of w?.entries || []) {
    const { kinds, rows } = entryKinds(entry)
    if (kinds[0] === 'km') for (const s of rows) mins += Number(s.min) || 0
    else sets += rows.length
  }
  return XP.workout + Math.min(sets, XP.maxSets) * XP.set + Math.min(Math.round(mins), XP.maxCardio) * XP.cardioMin
}

const weighDays = S => new Set((S?.bodyweight || []).filter(b => Number(b?.w) > 0).map(b => b.d)).size

export function totalXp(S, today, recs = records(S), st = goalStreaks(S, today)) {
  const parts = { workouts: 0, prs: 0, checkins: 0, weighIns: 0, weeks: 0, goals: 0, badges: 0 }
  for (const w of S?.workouts || []) parts.workouts += workoutXp(w)
  parts.prs = recs.count * XP.pr
  for (const d of checkinDays(S)) parts.checkins += checkinHits(S, d) * XP.checkin
  parts.weighIns = weighDays(S) * XP.weighIn
  // Each hit week pays a base plus a bonus for how long the streak had run.
  let run = 0, last = null
  for (const k of st.hitWeeks) {
    run = last && dayNum(k) - dayNum(last) === 7 ? run + 1 : 1; last = k
    parts.weeks += XP.weekHit + Math.min((run - 1) * XP.streakStep, XP.streakCap)
  }
  parts.goals = goalsOf(S).filter(g => g.done).length * XP.goal
  parts.badges = Object.keys(badgesOf(S)).length * XP.badge
  const total = Object.values(parts).reduce((a, b) => a + b, 0)
  return { total, parts }
}

// Total XP needed to REACH level L: 50 * L * (L - 1). L2 = 100, L5 = 1000, L10 = 4500.
export const xpForLevel = L => 50 * L * (L - 1)
export const TITLES = [[1, 'Rookie'], [3, 'Regular'], [5, 'Grinder'], [8, 'Iron Apprentice'], [12, 'Athlete'],
  [16, 'Iron Veteran'], [20, 'Beast'], [25, 'Titan'], [30, 'Legend'], [40, 'Mythic'], [50, 'Olympian']]
export function titleFor(L) { let t = TITLES[0][1]; for (const x of TITLES) if (L >= x[0]) t = x[1]; return t }
export function levelFor(xp) {
  let L = 1
  while (xpForLevel(L + 1) <= xp) L++
  const lo = xpForLevel(L), hi = xpForLevel(L + 1)
  return { level: L, into: xp - lo, need: hi - lo, next: hi, title: titleFor(L) }
}

/* ---------- achievements ---------- */

// The big four for the strength badges. A record on any of these ids counts.
export const LIFTS = {
  bench: ['0025'],                       // barbell bench press
  squat: ['0043'],                       // barbell full squat
  dead: ['0032', '0966', '0967', '6692'], // barbell deadlift and its camera angles
  ohp: ['1162', '1165', '0091'],         // barbell standing / seated military press
}
// "Train every muscle group in one week": the body parts SlipFit's groups map onto. SlipFit had
// biceps and triceps apart (both are 'upper arms' here), legs ('upper legs'), core ('waist') and
// mobility, which has no body part of its own in this catalogue and is left out.
export const ALL_GROUPS = ['chest', 'back', 'shoulders', 'upper arms', 'upper legs', 'waist', 'cardio']

export function latestBodyweight(S) {
  const b = (S?.bodyweight || []).filter(x => Number(x?.w) > 0).slice().sort((a, c) => (a.d < c.d ? -1 : a.d > c.d ? 1 : 0))
  return b.length ? Number(b[b.length - 1].w) : 0
}

export function summary(S, today) {
  const ws = S?.workouts || []
  const recs = records(S)
  const st = goalStreaks(S, today)
  const toKg = S?.unit === 'lb' ? KG_PER_LB : 1
  let volume = 0, km = 0, maxSets = 0, maxDur = 0, early = false, late = false, longestRun = 0
  const exSeen = new Set()
  const groupsByWeek = {}
  const weekendWeeks = {}
  for (const w of ws) {
    const d = workoutDay(w)
    if (!d) continue
    volume += workoutVolume(w) * toKg
    km += workoutCardio(w).km
    longestRun = Math.max(longestRun, longestRunKm(w, S))
    let sets = 0
    for (const e of w.entries || []) sets += entryKinds(e).rows.length
    maxSets = Math.max(maxSets, sets)
    maxDur = Math.max(maxDur, workoutDuration(w) / 60000)
    if (Number.isFinite(w.start)) {
      const h = new Date(w.start).getHours()
      if (h < 7) early = true
      if (h >= 21) late = true
    }
    const wk = weekStartOfDay(d, 1)
    const g = groupsByWeek[wk] || (groupsByWeek[wk] = new Set())
    const wd = weekday(d)
    if (wd === 6 || wd === 0) (weekendWeeks[wk] || (weekendWeeks[wk] = new Set())).add(wd)
    for (const e of w.entries || []) {
      if (!entryKinds(e).rows.length) continue
      exSeen.add(e.id)
      const bp = EXIDX[e.id]?.bp
      if (bp) g.add(bp)
    }
  }
  const fullWeek = Object.values(groupsByWeek).some(g => ALL_GROUPS.every(x => g.has(x)))
  // A Monday-to-Sunday week ends on its weekend, so one week holds both of its days.
  const weekend = Object.values(weekendWeeks).some(set => set.has(6) && set.has(0))
  const bw = latestBodyweight(S)
  const lift = key => Math.max(0, ...LIFTS[key].map(id => recs.best[id]?.e1rm?.v || 0))
  const t = targetsOf(S)
  const waterDays = checkinDays(S).filter(d => dailyOf(S, d).water >= t.water).length
  const goals = goalsOf(S)
  return {
    workouts: ws.length, prs: recs.count, volume, km, maxSets, maxDur, early, late,
    run5: longestRun >= 5, run10: longestRun >= 10, exercises: exSeen.size, fullWeek, weekend,
    streak: st.current, bestStreak: st.best, bw,
    bench: lift('bench'), squat: lift('squat'), dead: lift('dead'), ohp: lift('ohp'),
    checkinDays: checkinDays(S).length, waterDays, weighIns: weighDays(S),
    goalsSet: goals.length, goalsDone: goals.filter(g => g.done).length,
    plansFinished: finishedPrograms(S).length,
    recs, st,
  }
}

// [id, icon, name, description, test(summary)] — names and texts as SlipFit had them.
export const BADGES = [
  ['first-workout', '🎯', 'First Rep', 'Log your first workout.', s => s.workouts >= 1],
  ['w5', '🔥', 'Warming Up', 'Log 5 workouts.', s => s.workouts >= 5],
  ['w10', '💪', 'Habit Forming', 'Log 10 workouts.', s => s.workouts >= 10],
  ['w25', '🏋️', 'Committed', 'Log 25 workouts.', s => s.workouts >= 25],
  ['w50', '⚡', 'Half Century', 'Log 50 workouts.', s => s.workouts >= 50],
  ['w100', '💯', 'Centurion', 'Log 100 workouts.', s => s.workouts >= 100],
  ['w200', '🛡️', 'Iron Will', 'Log 200 workouts.', s => s.workouts >= 200],
  ['w365', '👑', 'A Year of Sweat', 'Log 365 workouts.', s => s.workouts >= 365],
  ['s2', '📅', 'Back Again', 'Hit your weekly goal 2 weeks running.', s => s.bestStreak >= 2],
  ['s4', '🗓️', 'One Month Strong', '4-week streak.', s => s.bestStreak >= 4],
  ['s8', '🚀', 'Two Months Strong', '8-week streak.', s => s.bestStreak >= 8],
  ['s12', '🌟', 'Quarter Year', '12-week streak.', s => s.bestStreak >= 12],
  ['s26', '🏔️', 'Half-Year Hero', '26-week streak.', s => s.bestStreak >= 26],
  ['s52', '🏆', 'Unbroken Year', '52-week streak.', s => s.bestStreak >= 52],
  ['pr1', '📈', 'New Best', 'Set your first personal record.', s => s.prs >= 1],
  ['pr10', '🥉', 'Record Breaker', 'Set 10 personal records.', s => s.prs >= 10],
  ['pr50', '🥈', 'Always Improving', 'Set 50 personal records.', s => s.prs >= 50],
  ['pr100', '🥇', 'PR Machine', 'Set 100 personal records.', s => s.prs >= 100],
  ['vol1t', '🧱', 'First Tonne', 'Lift 1,000 kg (2,205 lb) in total.', s => s.volume >= 1000],
  ['vol10t', '🚚', 'Ten Tonnes', 'Lift 10,000 kg (22,046 lb) in total.', s => s.volume >= 10000],
  ['vol100t', '🐋', 'Blue Whale', 'Lift 100,000 kg in total; about the weight of a blue whale.', s => s.volume >= 100000],
  ['vol1m', '🌋', 'Mountain Mover', 'Lift 1,000,000 kg in total.', s => s.volume >= 1000000],
  ['km5', '👟', 'First Steps', 'Cover 5 km of cardio in total.', s => s.km >= 5],
  ['km42', '🏅', 'Marathon Banked', 'Cover 42.2 km of cardio in total.', s => s.km >= 42.195],
  ['km100', '🛣️', 'Century Road', 'Cover 100 km of cardio in total.', s => s.km >= 100],
  ['km500', '🌍', 'Long Hauler', 'Cover 500 km of cardio in total.', s => s.km >= 500],
  ['run5k', '🏃', '5K Finisher', 'Run 5 km in one go.', s => s.run5],
  ['run10k', '🦌', '10K Runner', 'Run 10 km in one go.', s => s.run10],
  ['bench-bw', '🛋️', 'Bodyweight Bench', 'Estimated bench 1RM at least your bodyweight.', s => s.bw > 0 && s.bench >= s.bw],
  ['squat-15', '🦵', 'Squat 1.5× Bodyweight', 'Estimated squat 1RM at least 1.5× bodyweight.', s => s.bw > 0 && s.squat >= 1.5 * s.bw],
  ['dead-2', '🏗️', 'Double-Bodyweight Pull', 'Estimated deadlift 1RM at least 2× bodyweight.', s => s.bw > 0 && s.dead >= 2 * s.bw],
  ['ohp-bw', '🙌', 'Overhead Champion', 'Estimated overhead press 1RM at least your bodyweight.', s => s.bw > 0 && s.ohp >= s.bw],
  ['early', '🌅', 'Early Bird', 'Start a workout before 7 am.', s => s.early],
  ['late', '🌙', 'Night Owl', 'Start a workout after 9 pm.', s => s.late],
  ['weekend', '🎉', 'Weekend Warrior', 'Train on both Saturday and Sunday of the same weekend.', s => s.weekend],
  ['long', '⏳', 'Marathon Session', 'A workout lasting 90 minutes or more.', s => s.maxDur >= 90],
  ['big', '🧮', 'Volume Day', '25 or more sets in one workout.', s => s.maxSets >= 25],
  ['variety25', '🎨', 'Explorer', 'Try 25 different exercises.', s => s.exercises >= 25],
  ['allgroups', '🧩', 'Total Package', 'Train every muscle group in one week.', s => s.fullWeek],
  ['water7', '💧', 'Hydrated', 'Hit your water goal on 7 days.', s => s.waterDays >= 7],
  ['checkin30', '📝', 'Daily Tracker', 'Log check-ins on 30 days.', s => s.checkinDays >= 30],
  ['weigh10', '⚖️', 'On the Scale', 'Log your weight on 10 days.', s => s.weighIns >= 10],
  ['goal-set', '🎯', 'Eyes on the Prize', 'Set your first goal.', s => s.goalsSet >= 1],
  ['goal-done', '✅', 'Goal Getter', 'Complete a goal.', s => s.goalsDone >= 1],
  ['goal5', '🏁', 'Serial Achiever', 'Complete 5 goals.', s => s.goalsDone >= 5],
  ['plan-done', '🎓', 'Program Graduate', 'Finish a whole program like Couch to 5K.', s => s.plansFinished >= 1],
]
export const BADGE = Object.fromEntries(BADGES.map(b => [b[0], { id: b[0], icon: b[1], name: b[2], desc: b[3] }]))

/** Badges this state has earned that are not stored yet. Level badges are deliberately absent:
 *  XP includes badge XP, and a badge for a level would feed back into the level it measures. */
export function newBadges(S, today, s = summary(S, today)) {
  const have = badgesOf(S)
  return BADGES.filter(b => !have[b[0]] && b[4](s)).map(b => b[0])
}

/** The closest unearned badges by a rough progress fraction. */
export function nextBadges(S, s, n = 3) {
  const have = badgesOf(S)
  const frac = {
    w5: s.workouts / 5, w10: s.workouts / 10, w25: s.workouts / 25, w50: s.workouts / 50, w100: s.workouts / 100,
    w200: s.workouts / 200, w365: s.workouts / 365, s2: s.bestStreak / 2, s4: s.bestStreak / 4, s8: s.bestStreak / 8,
    s12: s.bestStreak / 12, s26: s.bestStreak / 26, s52: s.bestStreak / 52, pr1: s.prs, pr10: s.prs / 10, pr50: s.prs / 50,
    pr100: s.prs / 100, vol1t: s.volume / 1000, vol10t: s.volume / 10000, vol100t: s.volume / 100000, vol1m: s.volume / 1e6,
    km5: s.km / 5, km42: s.km / 42.195, km100: s.km / 100, km500: s.km / 500, variety25: s.exercises / 25,
    water7: s.waterDays / 7, checkin30: s.checkinDays / 30, weigh10: s.weighIns / 10,
    'bench-bw': s.bw ? s.bench / s.bw : 0, 'squat-15': s.bw ? s.squat / (1.5 * s.bw) : 0, 'dead-2': s.bw ? s.dead / (2 * s.bw) : 0,
  }
  return BADGES.filter(b => !have[b[0]] && frac[b[0]] !== undefined && frac[b[0]] < 1)
    .map(b => ({ ...BADGE[b[0]], p: Math.max(0, Math.min(1, frac[b[0]])) }))
    .sort((a, b) => b.p - a.p).slice(0, n)
}
