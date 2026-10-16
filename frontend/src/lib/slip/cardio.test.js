import { describe, expect, it } from 'vitest'
import {
  rowKm, speedFor, paceOf, fmtPace, paceLabel, distUnitOf, toDist, fromDist, fmtDist, speedForDist,
  isRunEx, workoutCardio, longestRunKm, distanceTotals, distanceSummary, KM_PER_MI,
} from './cardio.js'

const RUN = '0685'    // "run"
const BIKE = '2138'   // "stationary bike run v. 3": a bike, whatever its name says
const LIFT = '0025'
const cardio = (id, sets) => ({ id, target: { mode: 'cardio' }, sets })
const w = (id, d, entries) => ({ id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), name: 'x', entries })

describe('a cardio row', () => {
  it('covers minutes × km/h, and nothing without either', () => {
    expect(rowKm({ min: 30, speed: 10 })).toBe(5)
    expect(rowKm({ min: 30 })).toBe(0)
    expect(rowKm({ speed: 10 })).toBe(0)
    expect(rowKm(null)).toBe(0)
  })

  it('turns a distance back into the speed, kept to hundredths', () => {
    expect(speedFor(5, 30)).toBe(10)
    expect(speedFor(5, 33)).toBe(9.09)
    expect(speedFor(5, 0)).toBe(0)
    expect(speedFor(0, 30)).toBe(0)
  })

  it('paces per km or per mile', () => {
    expect(paceOf({ min: 30, speed: 10 })).toBe(360)
    expect(fmtPace(paceOf({ min: 30, speed: 10 }))).toBe('6:00')
    expect(fmtPace(paceOf({ min: 30, speed: 10 }, true))).toBe('9:39')
    expect(paceOf({ min: 30 })).toBe(0)
    expect(fmtPace(0)).toBe('–')
    expect(paceLabel({ min: 30, speed: 10 }, 'kmh')).toBe('6:00 /km')
    expect(paceLabel({ min: 30, speed: 10 }, 'mph')).toBe('9:39 /mi')
    expect(paceLabel({ min: 30 }, 'kmh')).toBe('')
  })
})

describe('distance in the speed unit', () => {
  it('is km on km/h and miles on mph', () => {
    expect(distUnitOf('kmh')).toBe('km')
    expect(distUnitOf('mph')).toBe('mi')
    expect(distUnitOf(undefined)).toBe('km')
    expect(toDist(KM_PER_MI * 3, 'mph')).toBeCloseTo(3, 9)
    expect(toDist(5, 'kmh')).toBe(5)
    expect(fromDist(3, 'mph')).toBeCloseTo(4.828032, 9)
    expect(fmtDist(5, 'kmh')).toBe('5 km')
    expect(fmtDist(KM_PER_MI * 3.1, 'mph')).toBe('3.1 mi')
  })

  it('sets the km/h that covers a typed distance in either unit', () => {
    expect(speedForDist(5, 30, 'kmh')).toBe(10)
    expect(speedForDist(3, 20, 'mph')).toBe(14.48)   // 9 mph
    expect(speedForDist(3, 0, 'mph')).toBe(0)
  })
})

describe('reading cardio off the log', () => {
  it('knows a run from a bike', () => {
    expect(isRunEx(RUN)).toBe(true)
    expect(isRunEx(BIKE)).toBe(false)
    expect(isRunEx(LIFT)).toBe(false)
    expect(isRunEx('c1', { customEx: [{ id: 'c1', n: 'Trail running' }] })).toBe(true)
  })

  it('totals done work rows only, warm-ups and open rows left out', () => {
    const one = w('a', '2026-10-01', [cardio(RUN, [
      { min: 10, speed: 6, done: true, phase: 'warmup' },
      { min: 30, speed: 10, done: true },
      { min: 30, speed: 10, done: false },
    ])])
    expect(workoutCardio(one)).toEqual({ km: 5, min: 30 })
    expect(longestRunKm(one)).toBe(5)
  })

  it('counts only runs as the longest run', () => {
    const ride = w('b', '2026-10-02', [cardio(BIKE, [{ min: 60, speed: 25, done: true }])])
    expect(workoutCardio(ride).km).toBe(25)
    expect(longestRunKm(ride)).toBe(0)
  })

  it('sums lifetime and per-day distance', () => {
    const S = { workouts: [
      w('a', '2026-10-01', [cardio(RUN, [{ min: 30, speed: 10, done: true }])]),
      w('b', '2026-10-01', [cardio(BIKE, [{ min: 30, speed: 20, done: true }])]),
      w('c', '2026-10-03', [{ id: LIFT, target: { mode: 'reps' }, sets: [{ w: 60, r: 5, done: true }] }]),
    ] }
    expect(distanceTotals(S)).toEqual({ total: 15, byDay: { '2026-10-01': 15 } })
  })
})

describe('the Stats distance summary', () => {
  it('splits out this month and finds the longest run with its day', () => {
    const S = { workouts: [
      w('a', '2026-09-28', [cardio(RUN, [{ min: 60, speed: 10, done: true }])]),
      w('b', '2026-10-02', [cardio(RUN, [{ min: 30, speed: 10, done: true }])]),
      w('c', '2026-10-05', [cardio(BIKE, [{ min: 60, speed: 30, done: true }])]),
      w('d', '2026-10-09', [cardio(RUN, [{ min: 60, speed: 10, done: true }])]),
    ] }
    const sum = distanceSummary(S, '2026-10-16')
    expect(sum.has).toBe(true)
    expect(sum.total).toBe(55)
    expect(sum.month).toBe(45)
    // The 10 km on 9 Oct equals the one on 28 Sep: the record is the earlier day.
    expect(sum.longest).toEqual({ km: 10, d: '2026-09-28', wid: 'a' })
  })

  it('has cardio with minutes and no speed, and none for a lifter', () => {
    expect(distanceSummary({ workouts: [w('a', '2026-10-01', [cardio(BIKE, [{ min: 20, done: true }])])] }, '2026-10-16'))
      .toEqual({ has: true, total: 0, month: 0, longest: null })
    expect(distanceSummary({ workouts: [w('a', '2026-10-01', [{ id: LIFT, target: { mode: 'reps' }, sets: [{ w: 60, r: 5, done: true }] }])] }, '2026-10-16').has).toBe(false)
    expect(distanceSummary({}, '2026-10-16').has).toBe(false)
  })
})
