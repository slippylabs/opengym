// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { goalCurrent, goalProgress, goalsReached, trend, toKg, fromKg } from './goals.js'

const today = '2026-10-16'
const weighIns = [['2026-09-10', 90], ['2026-09-20', 88.5], ['2026-09-30', 87.5], ['2026-10-10', 86.5]]
const S = {
  unit: 'kg',
  bodyweight: weighIns.map(([d, w]) => ({ d, w, t: 1 })),
  workouts: [
    { id: 'a', d: '2026-09-01', entries: [{ id: '0025', sets: [{ w: 80, r: 5, done: true }] }] },
    { id: 'b', d: '2026-09-15', entries: [{ id: '0025', sets: [{ w: 85, r: 5, done: true }] }, { id: '0685', target: { mode: 'cardio' }, sets: [{ min: 30, speed: 10, done: true }] }] },
    { id: 'c', d: '2026-10-01', entries: [{ id: '0025', sets: [{ w: 90, r: 5, done: true }] }] },
  ],
}

describe('goals', () => {
  it('a weight goal measures the way from where it started', () => {
    const g = { type: 'weight', target: 80, start: 90, from: '2026-09-10' }
    const p = goalProgress(S, g, today)
    expect(p.cur).toBe(86.5)
    expect(p.frac).toBeCloseTo(0.35, 6)
    expect(p.eta > today).toBe(true)          // losing, so a finish date is projected
  })

  it('reached once the weight is past the target in the right direction', () => {
    expect(goalProgress(S, { type: 'weight', target: 87, start: 90 }, today).frac).toBe(1)
    expect(goalProgress(S, { type: 'weight', target: 95, start: 90 }, today).frac).toBe(0)
  })

  it('a lift goal reads the best estimated 1RM, converted from pounds', () => {
    expect(goalCurrent(S, { type: 'lift', exId: '0025' })).toBeCloseTo(105, 6)   // 90 × (1 + 5/30)
    const lb = { ...S, unit: 'lb' }
    expect(goalCurrent(lb, { type: 'lift', exId: '0025' })).toBeCloseTo(toKg(105, 'lb'), 6)
    expect(fromKg(toKg(100, 'lb'), 'lb')).toBeCloseTo(100, 9)
  })

  it('a run goal is the longest single run, a workouts goal counts from its start', () => {
    expect(goalCurrent(S, { type: 'run' })).toBeCloseTo(5, 9)
    expect(goalProgress(S, { type: 'run', target: 10 }, today).frac).toBeCloseTo(0.5, 9)
    expect(goalCurrent(S, { type: 'workouts', from: '2026-09-10' })).toBe(2)
  })

  it('on track compares progress with the share of time gone', () => {
    const g = { type: 'workouts', target: 4, from: '2026-09-10', deadline: '2026-11-10' }
    expect(goalProgress(S, g, today).onTrack).toBe(false)   // half done, 60 % of the time gone
    expect(goalProgress(S, { ...g, target: 3 }, today).onTrack).toBe(true)
  })

  it('reports which goals the log has just completed', () => {
    const st = { ...S, slipGoals: {
      x: { id: 'x', type: 'run', target: 5, created: 1, _ts: 1 },
      y: { id: 'y', type: 'run', target: 6, created: 2, _ts: 1 },
      z: { id: 'z', type: 'run', target: 3, done: '2026-09-20', created: 3, _ts: 1 },
      gone: { id: 'gone', gone: true, _ts: 1 },
    } }
    expect(goalsReached(st, today)).toEqual(['x'])
  })

  it('trend is the least-squares slope', () => {
    expect(trend([[0, 1], [1, 3], [2, 5]]).slope).toBeCloseTo(2, 9)
    expect(trend([[1, 1]])).toBeNull()
  })
})
