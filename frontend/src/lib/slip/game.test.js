// @vitest-environment node
// The port of SlipFit's progress engine held against the original. SlipFit's gamify.js loads under
// Node, so the same random history is written in both apps' formats and scored by both: every
// number the user sees (XP and its parts, level, streaks, records, the badges earned and the next
// ones) has to come out the same. Only the "every muscle group in one week" badge is left out,
// because the two catalogues group muscles differently (see ALL_GROUPS in game.js).
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import {
  records, goalStreaks, totalXp, levelFor, summary, newBadges, nextBadges, setBeats, e1rm, weekStartOfDay,
} from './game.js'

const require = createRequire(import.meta.url)
const Game = require('./oracle/gamify.cjs')

// SlipFit exercise → [openGym id, how openGym logs it]. Bench, squat, deadlift and the overhead
// press are the lifts the strength badges read.
const EX = {
  bench: ['0025', 'reps'], squat: ['0043', 'reps'], deadlift: ['0032', 'reps'], ohp: ['1162', 'reps'],
  pushup: ['0662', 'bw'], plank: ['0463', 'time'], run: ['0685', 'cardio'],
}

// Seeded, so a failure reproduces.
function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const pad = n => String(n).padStart(2, '0')
const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())

function history(seed, days = 160) {
  const r = rng(seed)
  const pick = xs => xs[Math.floor(r() * xs.length)]
  const start = Date.UTC(2026, 3, 6)  // a Monday
  const slip = { profile: { weeklyGoal: 3, waterGoal: 8, proteinGoal: 130, sleepGoal: 7.5, stepsGoal: 8000, weightKg: 80 }, workouts: [], body: [], daily: {}, goals: [], badges: {}, finishedPlans: [] }
  const og = { unit: 'kg', weekStart: 1, workouts: [], bodyweight: [], daily: {}, slipGoals: {}, badges: {}, slipRuns: {},
    slipProfile: { targets: { weeklyGoal: 3, water: 8, protein: 130, sleep: 7.5, steps: 8000, _ts: 1 } } }
  let n = 0
  for (let i = 0; i < days; i++) {
    const day = new Date(start + i * 86400000)
    const d = iso(day)
    if (r() < 0.45) {
      const st = Date.UTC(2026, 3, 6 + i, Math.floor(r() * 18) + 5, Math.floor(r() * 60))
      const en = st + (30 + Math.floor(r() * 80)) * 60000
      const names = [...new Set(Array.from({ length: 2 + Math.floor(r() * 4) }, () => pick(Object.keys(EX))))]
      const id = 'w' + (++n)
      const sw = { id, d, st, en, ex: [] }
      const ow = { id, d, start: st, end: en, name: 'W', entries: [] }
      for (const name of names) {
        const [ogId, mode] = EX[name]
        const sets = 1 + Math.floor(r() * 5)
        const ss = [], os = []
        for (let k = 0; k < sets; k++) {
          if (mode === 'reps') {
            const w = 40 + Math.round(r() * 120 / 2.5) * 2.5, reps = 1 + Math.floor(r() * 14)
            ss.push({ w, r: reps }); os.push({ w, r: reps, done: true })
          } else if (mode === 'bw') {
            const w = r() < 0.3 ? Math.round(r() * 20) : 0, reps = 5 + Math.floor(r() * 25)
            ss.push({ w, r: reps }); os.push({ w, r: reps, done: true })
          } else if (mode === 'time') {
            const t = 20 + Math.floor(r() * 120)
            ss.push({ t }); os.push({ sec: t, w: 0, done: true })
          } else {
            const min = 10 + Math.floor(r() * 50), km = Math.round((min / 60) * (7 + r() * 6) * 100) / 100
            ss.push({ min, km }); os.push({ min, speed: km / (min / 60), done: true })
          }
        }
        sw.ex.push({ id: name, s: ss })
        ow.entries.push({ id: ogId, target: mode === 'time' ? { mode: 'time' } : mode === 'cardio' ? { mode: 'cardio' } : {}, sets: os })
      }
      slip.workouts.push(sw); og.workouts.push(ow)
    }
    if (r() < 0.3) {
      const w = Math.round((82 - i * 0.02 + r()) * 10) / 10
      slip.body.push({ d, w }); og.bodyweight.push({ d, w, t: 1 })
    }
    if (r() < 0.5) {
      const c = { water: Math.floor(r() * 11), protein: Math.floor(r() * 180), sleep: Math.round(r() * 18) / 2, steps: Math.floor(r() * 14000) + 1 }
      slip.daily[d] = c; og.daily[d] = { ...c, _ts: 1 }
    }
  }
  for (let g = 0; g < 4; g++) {
    const done = r() < 0.5
    slip.goals.push({ id: 'g' + g, done }); og.slipGoals['g' + g] = { id: 'g' + g, type: 'custom', title: 'G', done, created: g, _ts: 1 }
  }
  const today = iso(new Date(start + (days - 1) * 86400000))
  return { slip, og, today }
}

const SEEDS = [1, 2, 3, 7, 42, 1234, 99, 2026]

describe('the progress engine against SlipFit\'s', () => {
  for (const seed of SEEDS) {
    it(`scores the same history the same (seed ${seed})`, () => {
      const { slip, og, today } = history(seed)
      const a = Game.records(slip), b = records(og)
      expect(b.count).toBe(a.count)
      expect(b.events.length).toBe(a.events.length)
      // A distance is minutes × speed here and was typed in SlipFit, so allow float noise.
      b.events.forEach((e, i) => expect(e.v).toBeCloseTo(a.events[i].v, 9))

      const sa = Game.streaks(slip, today), sb = goalStreaks(og, today)
      expect([sb.current, sb.best, sb.thisWeek, sb.hitWeeks]).toEqual([sa.current, sa.best, sa.thisWeek, sa.hitWeeks])

      const xa = Game.totalXp(slip, today), xb = totalXp(og, today)
      expect(xb.parts).toEqual(xa.parts)
      expect(levelFor(xb.total)).toEqual(Game.levelFor(xa.total))

      const ua = Game.summary(slip, today), ub = summary(og, today)
      for (const k of ['workouts', 'prs', 'maxSets', 'early', 'late', 'run5', 'run10', 'exercises', 'weekend',
        'streak', 'bestStreak', 'bw', 'bench', 'squat', 'dead', 'ohp', 'checkinDays', 'waterDays', 'weighIns', 'goalsSet', 'goalsDone']) {
        expect(ub[k], k).toEqual(ua[k])
      }
      for (const k of ['volume', 'km', 'maxDur']) expect(ub[k], k).toBeCloseTo(ua[k], 6)

      const ba = Game.newBadges(slip, today, ua).filter(x => x !== 'allgroups')
      const bb = newBadges(og, today, ub).filter(x => x !== 'allgroups')
      expect(bb).toEqual(ba)
      expect(nextBadges(og, ub, 5).map(x => x.id)).toEqual(Game.nextBadges(slip, ua, 5).map(x => x.id))
    })
  }

  it('keeps earned badges and pays XP for them', () => {
    const { slip, og, today } = history(5)
    slip.badges = { w5: '2026-05-01', pr1: '2026-05-02' }
    og.badges = { w5: { d: '2026-05-01', _ts: 1 }, pr1: { d: '2026-05-02', _ts: 1 } }
    expect(totalXp(og, today).parts.badges).toBe(Game.totalXp(slip, today).parts.badges)
    expect(newBadges(og, today)).not.toContain('w5')
  })
})

describe('pieces', () => {
  it('Epley only for 1–12 reps, and a single is the max', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 10)).toBeCloseTo(133.333, 3)
    expect(e1rm(100, 13)).toBe(0)
  })

  it('weeks start on Monday, or on Sunday when the profile says so', () => {
    expect(weekStartOfDay('2026-10-18', 1)).toBe('2026-10-12')   // a Sunday belongs to the Monday before
    expect(weekStartOfDay('2026-10-18', 0)).toBe('2026-10-18')
    expect(weekStartOfDay('2026-10-16', 0)).toBe('2026-10-11')
  })

  it('a ticked set beats the bests before it, a first time is only a baseline', () => {
    const S = { workouts: [{ id: 'a', d: '2026-10-01', entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] }] }
    const { best } = records(S)
    expect(setBeats(best, '0025', { id: '0025' }, { w: 102.5, r: 5 })).toEqual(['e1rm', 'w', 'vol'])
    expect(setBeats(best, '0025', { id: '0025' }, { w: 90, r: 8 })).toEqual(['vol'])   // 114 est. 1RM, under 116.7
    expect(setBeats(best, '0025', { id: '0025' }, { w: 90, r: 3 })).toEqual([])
    expect(setBeats(best, '0043', { id: '0043' }, { w: 200, r: 1 })).toEqual([])
  })
})
