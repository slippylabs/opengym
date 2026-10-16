import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { EXIDX, isCardio } from '../exercises.js'
import { modeOf } from '../history.js'
import { policyFor } from '../progression.js'
import { SLIP_EXERCISES, ogIdOf } from './exercise-map.js'
import {
  generate, library, c25k, mobility, toOpenGym, routineExercise, libraryPlan, MORE_PLAN_KEYS,
  GOALS, MINUTES, EQUIPS, EXPERIENCE, DEFAULT_SCHEDULE, isC25k,
} from './programs.js'

// The ORACLE: SlipFit itself, loaded from its source the way its own tests load it (plain IIFE
// scripts that also module.exports). Only where the original lives on this machine; elsewhere
// the port is held to the conversion tests below alone.
const SLIPFIT = '/home/slippy/fit.slippylabs.com/js'
const haveOracle = existsSync(SLIPFIT + '/programs.js')
const oracle = (() => {
  if (!haveOracle) return null
  const require = createRequire(import.meta.url)
  const Ex = require(SLIPFIT + '/exercises.js')
  // The port never picks an exercise openGym's catalogue lacks (candidates() skips them), so
  // the original is asked the same question: its list without those. programs.js requires the
  // same module instance, so trimming LIST here is what its generator sees.
  for (let i = Ex.LIST.length - 1; i >= 0; i--) if (!ogIdOf(Ex.LIST[i].id)) Ex.LIST.splice(i, 1)
  return { Ex, P: require(SLIPFIT + '/programs.js') }
})()

// What the port adds to a SlipFit plan is `og` on every item, nothing else: strip it to compare,
// and check it is the mapped id.
const stripOg = plan => ({ ...plan, days: plan.days.map(d => ({ ...d, items: d.items.map(({ og, ...it }) => it) })) })
const ogMapped = plan => plan.days.every(d => d.items.every(it => it.og === ogIdOf(it.ex)))

describe('exercise map', () => {
  it('covers every SlipFit exercise, in SlipFit order', () => {
    if (oracle) {
      // The untrimmed list: re-read the ids from the ROWS the map was written from.
      const require = createRequire(import.meta.url)
      const src = require('node:fs').readFileSync(SLIPFIT + '/exercises.js', 'utf8')
      const ids = [...src.matchAll(/^\s*\['([a-z0-9-]+)', ("[^"]*"|'[^']*'), '[a-z]+', '[a-z_]+', '[a-z]+', '[a-z]'/gm)].map(m => m[1])
      expect(SLIP_EXERCISES.map(e => e.id)).toEqual(ids)
    }
    expect(new Set(SLIP_EXERCISES.map(e => e.id)).size).toBe(SLIP_EXERCISES.length)
  })

  it('carries SlipFit’s pattern, equipment and type unchanged', () => {
    if (!oracle) return
    const require = createRequire(import.meta.url)
    const src = require('node:fs').readFileSync(SLIPFIT + '/exercises.js', 'utf8')
    const rows = [...src.matchAll(/^\s*\['([a-z0-9-]+)', ("[^"]*"|'[^']*'), '[a-z]+', '([a-z_]+)', '([a-z]+)', '([a-z])'/gm)]
    expect(rows.length).toBe(SLIP_EXERCISES.length)
    for (const [, id, , pattern, equip, type] of rows) {
      const e = SLIP_EXERCISES.find(x => x.id === id)
      expect([e.pattern, e.equip, e.type], id).toEqual([pattern, equip, type])
    }
  })

  it('maps only to real catalogue entries', () => {
    for (const e of SLIP_EXERCISES) if (e.og) expect(EXIDX[e.og], e.id).toBeTruthy()
  })

  it('maps every strength-pattern exercise; the gaps are cardio and mobility only', () => {
    const unmapped = SLIP_EXERCISES.filter(e => !e.og).map(e => e.id)
    expect(unmapped).toEqual(['swim', 'hiit', 'hike', 'stretch', 'foam-roll', 'hip-opener'])
  })

  it('sends a minutes-based cardio exercise to a cardio catalogue entry', () => {
    // Otherwise it could not be logged in cardio mode (isCardio reads the body part).
    for (const e of SLIP_EXERCISES) if (e.og && e.type === 'c') expect(isCardio(e.og), e.id).toBe(true)
  })
})

describe.skipIf(!haveOracle)('oracle: the port generates exactly what SlipFit generates', () => {
  const combos = []
  for (const goal of GOALS) for (let days = 1; days <= 7; days++) for (const minutes of MINUTES)
    for (const equip of EQUIPS) for (const experience of EXPERIENCE) combos.push({ goal, days, minutes, equip, experience })

  it('covers every goal × days × minutes × equipment × experience', () => {
    expect(combos).toHaveLength(5 * 7 * 4 * 3 * 3)
  })

  it.each(GOALS)('goal %s, every combination', goal => {
    for (const o of combos.filter(c => c.goal === goal)) {
      const mine = generate(o)
      expect(stripOg(mine), JSON.stringify(o)).toEqual(JSON.parse(JSON.stringify(oracle.P.generate(o))))
      expect(ogMapped(mine), JSON.stringify(o)).toBe(true)
    }
  })

  it('the library, Couch to 5K and defaults match too', () => {
    expect(library().map(stripOg)).toEqual(JSON.parse(JSON.stringify(oracle.P.library())))
    expect(stripOg(c25k())).toEqual(JSON.parse(JSON.stringify(oracle.P.c25k())))
    expect(stripOg(generate())).toEqual(JSON.parse(JSON.stringify(oracle.P.generate())))
    expect(stripOg(generate({ goal: 'muscle', days: 12 }))).toEqual(JSON.parse(JSON.stringify(oracle.P.generate({ goal: 'muscle', days: 12 }))))
  })
})

describe('generated plans', () => {
  it('fill every lifting day for every combination', () => {
    for (const goal of GOALS.filter(g => g !== 'run')) for (let days = 1; days <= 7; days++)
      for (const minutes of MINUTES) for (const equip of EQUIPS) for (const experience of EXPERIENCE) {
        const p = generate({ goal, days, minutes, equip, experience })
        expect(p.days).toHaveLength(days)
        expect(p.schedule).toEqual(DEFAULT_SCHEDULE[days])
        for (const d of p.days) expect(d.items.length).toBeGreaterThan(1)
      }
  })
})

describe('routineExercise', () => {
  it('a rep item becomes a rep range under double progression, with its rest and note', () => {
    const r = routineExercise({ ex: 'bench', sets: 4, lo: 6, hi: 10, rest: 120, note: 'Pause on the chest.' })
    expect(r).toEqual({ id: '0025', sets: 4, reps: 10, repsMin: 6, weight: 0, mode: 'reps', prog: 'double', restSec: 120, note: 'Pause on the chest.' })
    expect(policyFor(r, null, modeOf(r))).toBe('double')
  })

  it('a bodyweight move keeps the bodyweight flag the catalogue gives it', () => {
    const r = routineExercise({ ex: 'pushup', sets: 3, lo: 8, hi: 15, rest: 60 })
    expect(r).toMatchObject({ id: '0662', bodyweight: true, reps: 15, repsMin: 8, prog: 'double' })
  })

  it('a timed hold starts at the bottom of its range and adds time', () => {
    const r = routineExercise({ ex: 'plank', sets: 3, lo: 30, hi: 60, rest: 60 })
    expect(r).toMatchObject({ id: '0463', mode: 'time', sets: 3, sec: 30, prog: 'time', restSec: 60 })
    expect(policyFor(r, null, modeOf(r))).toBe('time')
  })

  it('minutes of cardio become a cardio slot', () => {
    const r = routineExercise({ ex: 'run', sets: 1, min: 35, note: 'Zone 2.' })
    expect(r).toEqual({ id: '0685', sets: 1, mode: 'cardio', min: 35, speed: 8, note: 'Zone 2.' })
    expect(modeOf(r)).toBe('cardio')
    expect(routineExercise({ ex: 'walk', sets: 1, min: 30 })).toMatchObject({ id: '2258', mode: 'cardio', min: 30, speed: 5 })
  })

  it('minutes of something that is not cardio become one timed block', () => {
    expect(routineExercise({ ex: 'yoga', sets: 1, min: 20 })).toMatchObject({ id: '5980', mode: 'time', sets: 1, sec: 1200 })
  })

  it('an exercise with no catalogue entry is skipped, not guessed', () => {
    expect(routineExercise({ ex: 'hiit', sets: 1, min: 10 })).toBeNull()
    expect(routineExercise({ ex: 'no-such-thing', sets: 3, lo: 8, hi: 12 })).toBeNull()
  })
})

describe('toOpenGym', () => {
  it('turns a lifting plan into one routine per day on the plan’s weekdays', () => {
    const plan = generate({ goal: 'muscle', days: 4, minutes: 60, equip: 'gym', experience: 'intermediate' })
    const og = toOpenGym(plan)
    expect(og.routines.map(r => r.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B'])
    expect(og.schedule.map(s => [s.day, og.routines.find(r => r.id === s.routineId).name]))
      .toEqual([[1, 'Upper A'], [2, 'Lower A'], [4, 'Upper B'], [5, 'Lower B']])
    og.routines.forEach((r, i) => {
      expect(r.ex.map(e => e.id)).toEqual(plan.days[i].items.map(it => it.og))
      // a rep item's range is SlipFit's lo–hi; a timed hold opens at lo seconds
      expect(r.ex.map(e => [e.sets, e.mode === 'time' ? e.sec : e.repsMin, e.mode === 'time' ? null : e.reps]))
        .toEqual(plan.days[i].items.map(it => [it.sets, it.lo, it.ex === 'plank' || it.ex === 'side-plank' ? null : it.hi]))
    })
    expect(og.skipped).toEqual([])
    expect(og.unscheduled).toEqual([])
    expect(new Set(og.routines.map(r => r.id)).size).toBe(4)
  })

  it('drops the gym fat-loss finisher openGym has no exercise for, and says so', () => {
    const og = toOpenGym(libraryPlan('fat-loss'))
    expect(og.skipped).toEqual(['hiit'])
    for (const r of og.routines) expect(r.ex.length).toBe(4)
    // Away from the gym the finisher is burpees, which the catalogue has.
    const home = toOpenGym(generate({ goal: 'lose', days: 3, minutes: 45, equip: 'home', experience: 'beginner' }))
    expect(home.skipped).toEqual([])
    for (const r of home.routines) expect(r.ex.at(-1)).toMatchObject({ id: '1160', note: 'Finisher: keep it hard and short.' })
  })

  it('adds the run a one-day Run Builder cannot fit in a week unscheduled', () => {
    const og = toOpenGym(generate({ goal: 'run', days: 1, minutes: 45, equip: 'gym', experience: 'intermediate' }))
    expect(og.routines.map(r => r.name)).toEqual(['Easy Run', 'Long Run'])
    expect(og.schedule).toEqual([{ day: 3, routineId: og.routines[0].id }])
    expect(og.unscheduled).toEqual(['Long Run'])
  })

  it('drops a day left with nothing (the stretch-only Recovery day of a seven-day run plan)', () => {
    const og = toOpenGym(generate({ goal: 'run', days: 7, minutes: 45, equip: 'gym', experience: 'advanced' }))
    expect(og.routines.map(r => r.name)).not.toContain('Recovery')
    expect(og.skipped).toEqual(['stretch'])
    expect(og.schedule).toHaveLength(6)
  })

  it('keeps what the mobility plan can hold', () => {
    const og = toOpenGym(mobility())
    expect(og.routines.map(r => [r.name, r.ex.map(e => e.id)])).toEqual([
      ['Hips & Spine', ['4580', '4633', '2471']],
      ['Flow & Roll', ['5980', '5895']],
      ['Shoulders & Walk', ['8365', '1503', '1241', '2258']],
    ])
    expect(og.schedule.map(s => s.day)).toEqual([2, 4, 6])
    expect(og.skipped).toEqual(['hip-opener', 'stretch', 'foam-roll'])
  })

  it('every built-in converts to real exercises with a valid shape', () => {
    for (const key of MORE_PLAN_KEYS) {
      const og = toOpenGym(libraryPlan(key))
      expect(og.routines.length, key).toBeGreaterThan(0)
      for (const r of og.routines) for (const e of r.ex) {
        expect(EXIDX[e.id], key + ' ' + e.id).toBeTruthy()
        expect(e.sets).toBeGreaterThan(0)
        const m = modeOf(e)
        if (m === 'reps') expect(e.repsMin).toBeLessThan(e.reps)
        if (m === 'time') expect(e.sec).toBeGreaterThan(0)
        if (m === 'cardio') expect(e.min).toBeGreaterThan(0)
      }
      for (const s of og.schedule) expect(og.routines.some(r => r.id === s.routineId)).toBe(true)
    }
  })

  it('mints fresh routine ids on every conversion', () => {
    const a = toOpenGym(libraryPlan('beginner-full')), b = toOpenGym(libraryPlan('beginner-full'))
    expect(a.routines.map(r => r.id)).not.toEqual(b.routines.map(r => r.id))
  })
})

describe('Couch to 5K into openGym', () => {
  it('is one routine with one cardio run, three days a week', () => {
    const og = toOpenGym(c25k())
    expect(og.program).toBe('c25k')
    expect(og.routines).toHaveLength(1)
    const [r] = og.routines
    expect(r.name).toBe('Couch to 5K')
    expect(r.ex).toEqual([{ id: '0685', sets: 1, mode: 'cardio', min: 30, speed: 8, note: '5 min brisk walk, then: Run 60 s, walk 90 s. Repeat 8 times. Then a 5 min walk.' }])
    expect(og.runRoutineId).toBe(r.id)
    expect(og.schedule).toEqual([1, 3, 5].map(day => ({ day, routineId: r.id })))
  })

  it('a beginner Run goal is Couch to 5K at the asked number of days', () => {
    const two = generate({ goal: 'run', days: 2, minutes: 30, equip: 'home', experience: 'beginner' })
    expect(isC25k(two)).toBe(true)
    expect(toOpenGym(two).schedule.map(s => s.day)).toEqual([1, 4])
    const five = toOpenGym(generate({ goal: 'run', days: 5, minutes: 30, equip: 'home', experience: 'beginner' }))
    expect(five.routines.map(r => r.name)).toEqual(['Couch to 5K', 'Runner Strength'])
    const nameOf = id => five.routines.find(r => r.id === id).name
    expect(five.schedule.map(s => [s.day, nameOf(s.routineId)]))
      .toEqual([[1, 'Couch to 5K'], [3, 'Couch to 5K'], [5, 'Couch to 5K'], [2, 'Runner Strength'], [4, 'Runner Strength']])
  })

  it('an intermediate Run goal is not Couch to 5K', () => {
    expect(isC25k(generate({ goal: 'run', days: 3, experience: 'intermediate' }))).toBe(false)
    expect(toOpenGym(generate({ goal: 'run', days: 3, experience: 'intermediate' })).program).toBeUndefined()
  })
})
