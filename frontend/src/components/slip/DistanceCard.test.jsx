// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import DistanceCard from './DistanceCard.jsx'

let root, host
globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

const RUN = '0685', BIKE = '2138', LIFT = '0025'
const w = (d, id, sets, mode = 'cardio') => ({ id: d + id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'),
  entries: [{ id, target: { mode }, sets }] })
const LOG = [
  w('2026-09-20', RUN, [{ min: 60, speed: 10, done: true }]),             // 10 km run, last month
  w('2026-10-02', BIKE, [{ min: 60, speed: 20, done: true }]),            // 20 km ride
  w('2026-10-09', RUN, [{ min: 30, speed: 10, done: true }]),             // 5 km run
]
function render(S) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<DistanceCard S={S} today="2026-10-16" />))
  return [...host.querySelectorAll('.distance-v')].map(e => e.textContent)
}

describe('<DistanceCard>', () => {
  it('shows lifetime, this month and the longest run in km', () => {
    expect(render({ unit: 'kg', workouts: LOG })).toEqual(['35 km', '25 km', '10 km'])
    expect(host.textContent).toContain('Longest run')
  })

  it('reads miles for a profile on mph', () => {
    expect(render({ unit: 'kg', speedUnit: 'mph', workouts: LOG })).toEqual(['21.7 mi', '15.5 mi', '6.2 mi'])
  })

  it('leaves the longest run out when no cardio was a run', () => {
    expect(render({ unit: 'kg', workouts: [LOG[1]] })).toEqual(['20 km', '20 km'])
    expect(host.textContent).not.toContain('Longest run')
  })

  it('is not there without any cardio', () => {
    render({ unit: 'kg', workouts: [w('2026-10-02', LIFT, [{ w: 60, r: 5, done: true }], 'reps')] })
    expect(host.querySelector('.distance-card')).toBeNull()
  })
})
