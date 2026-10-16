// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('../../sheets.jsx', () => ({ exerciseHistorySheet: mocks.history }))

import PrBoard, { prBoard, fmtRecord } from './PrBoard.jsx'

let root, host
globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; mocks.history.mockReset() })

const BENCH = '0025', SQUAT = '0043', RUN = '0685'
const w = (d, entries) => ({ id: d, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), entries })
const lift = (id, sets) => ({ id, target: { mode: 'reps' }, sets: sets.map(([wt, r]) => ({ w: wt, r, done: true })) })

describe('prBoard', () => {
  it('groups by what an exercise is scored on, the most recently improved first', () => {
    const groups = prBoard({
      a: { e1rm: { v: 100, d: '2026-10-01' }, w: { v: 90, d: '2026-09-01' }, vol: { v: 500, d: '2026-09-01' } },
      b: { w: { v: 50, d: '2026-10-10' } },
      c: { km: { v: 5, d: '2026-08-01' }, min: { v: 30, d: '2026-08-01' } },
      d: { r: { v: 20, d: '2026-07-01' } },
    })
    expect(groups.map(g => g.key)).toEqual(['lift', 'bw', 'cardio'])
    expect(groups[0].rows.map(r => r.id)).toEqual(['b', 'a'])
    expect(groups[0].rows[1]).toEqual({ id: 'a', last: '2026-10-01', items: [
      { kind: 'e1rm', v: 100, d: '2026-10-01' }, { kind: 'w', v: 90, d: '2026-09-01' }, { kind: 'vol', v: 500, d: '2026-09-01' },
    ] })
    expect(prBoard({})).toEqual([])
  })

  it('formats each kind in its own unit', () => {
    const S = { unit: 'lb' }
    expect(fmtRecord('w', 225, S)).toBe('225 lb')
    expect(fmtRecord('wadd', 25, S)).toBe('+25 lb')
    expect(fmtRecord('r', 12, S)).toBe('12 reps')
    expect(fmtRecord('sec', 90, S)).toBe('1:30')
    expect(fmtRecord('km', 1.609344 * 3, S)).toBe('3 mi')        // a pound profile reads mph
    expect(fmtRecord('km', 5, { unit: 'kg' })).toBe('5 km')
    expect(fmtRecord('min', 30, S)).toBe('30 min')
  })
})

describe('<PrBoard>', () => {
  const S = { unit: 'kg', customEx: [], workouts: [
    w('2026-10-01', [lift(BENCH, [[60, 5]]), lift(SQUAT, [[100, 5]]), { id: RUN, target: { mode: 'cardio' }, sets: [{ min: 30, speed: 10, done: true }] }]),
    w('2026-10-08', [lift(BENCH, [[70, 5]])]),
  ] }
  function render(state) {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    act(() => root.render(<PrBoard S={state} />))
  }

  it('lists every exercise with its bests and their days, and opens its history', () => {
    render(S)
    const rows = [...host.querySelectorAll('.pr-row')]
    expect(rows).toHaveLength(3)
    // Bench improved last, so it leads the lifts.
    expect(rows[0].textContent).toMatch(/bench press/i)
    expect(rows[0].textContent).toContain('Heaviest 70 kg')
    expect(rows[0].querySelector('time').getAttribute('dateTime')).toBe('2026-10-08')
    expect(host.textContent).toContain('Longest distance 5 km')
    act(() => rows[0].click())
    expect(mocks.history).toHaveBeenCalledWith(BENCH)
  })

  it('folds a long group behind Show all', () => {
    const many = Array.from({ length: 7 }, (_, i) => 'c' + i)
    render({ unit: 'kg', customEx: many.map(id => ({ id, n: 'Custom ' + id, custom: true })),
      workouts: [w('2026-10-01', many.map(id => lift(id, [[10, 5]])))] })
    expect(host.querySelectorAll('.pr-row')).toHaveLength(5)
    expect(host.textContent).toContain('Custom c0')   // named from S.customEx
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Show all')).click())
    expect(host.querySelectorAll('.pr-row')).toHaveLength(7)
  })

  it('renders nothing before anything is logged', () => {
    render({ unit: 'kg', workouts: [] })
    expect(host.querySelector('.pr-board')).toBeNull()
  })
})
