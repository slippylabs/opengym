// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import WeeklyBars, { weeklyBars } from './WeeklyBars.jsx'

let root, host
globalThis.IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null })

const TODAY = '2026-10-16'   // a Friday
const w = d => ({ id: d, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), entries: [] })

describe('weeklyBars', () => {
  it('counts the last twelve weeks, oldest first, ending with this one', () => {
    const S = { workouts: [w('2026-10-12'), w('2026-10-16'), w('2026-10-05'), w('2026-07-20'), w('2026-07-19')] }
    const bars = weeklyBars(S, TODAY)
    expect(bars).toHaveLength(12)
    expect(bars.at(-1)).toEqual({ wk: '2026-10-12', n: 2 })
    expect(bars.at(-2)).toEqual({ wk: '2026-10-05', n: 1 })
    expect(bars[0]).toEqual({ wk: '2026-07-27', n: 0 })   // 20 July is week 13, out of the window
  })

  it('starts weeks on Sunday when the profile does', () => {
    // Sunday 11 Oct belongs to the week that starts on it, not to the Monday week before.
    const S = { weekStart: 0, workouts: [w('2026-10-11'), w('2026-10-10')] }
    const bars = weeklyBars(S, TODAY)
    expect(bars.at(-1)).toEqual({ wk: '2026-10-11', n: 1 })
    expect(bars.at(-2)).toEqual({ wk: '2026-10-04', n: 1 })
    expect(weeklyBars({ workouts: S.workouts }, TODAY).at(-2)).toEqual({ wk: '2026-10-05', n: 2 })
  })
})

describe('<WeeklyBars>', () => {
  it('draws a bar per week and the weekly goal as a line', () => {
    const S = { slipProfile: { targets: { weeklyGoal: 2 } }, workouts: [w('2026-10-12'), w('2026-10-14'), w('2026-10-06')] }
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    act(() => root.render(<WeeklyBars S={S} today={TODAY} />))
    const bars = host.querySelectorAll('[data-week]')
    expect(bars).toHaveLength(12)
    expect(bars[11].getAttribute('data-count')).toBe('2')
    expect(bars[11].querySelector('rect').getAttribute('fill')).toBe('var(--acc)')
    expect(bars[10].querySelector('rect').getAttribute('fill')).not.toBe('var(--acc)')   // 1 of 2: missed
    expect(host.querySelector('.goal-line')).not.toBeNull()
    expect(host.textContent).toContain('Workouts per week')
    expect(host.textContent).toContain('Goal hit 1 of 12 weeks')
  })

  it('falls back to the default goal of three', () => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    act(() => root.render(<WeeklyBars S={{ workouts: [w('2026-10-12')] }} today={TODAY} />))
    expect(host.querySelector('svg').getAttribute('aria-label')).toContain('goal 3 a week')
  })
})
