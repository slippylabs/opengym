// @vitest-environment happy-dom
// The slippylabs fork's Home cards, the achievements screen and the rewards watcher, rendered
// against a real store.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { todayISO } from '../../lib/format.js'
import { LevelCard, CheckinCard, GoalsCard } from './SlipCards.jsx'
import Achievements from '../../views/Achievements.jsx'
import Rewards from './Rewards.jsx'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../../sheets.jsx', () => ({ exercisePicker: vi.fn() }))

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useUI.setState({ sheets: [], toastMsg: '' })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const today = todayISO()
const workout = (id, d, sets) => ({ id, d, start: new Date(d + 'T18:00:00').getTime(), end: new Date(d + 'T19:00:00').getTime(), entries: [{ id: '0025', sets }] })
const setS = (over = {}) => useStore.setState(s => ({
  ready: true, user: null,
  S: { ...s.S, unit: 'kg', routines: [], week: {}, workouts: [], bodyweight: [], active: null, daily: {}, slipGoals: {}, badges: {}, slipRuns: {}, slipProfile: {}, ...over },
}))
const mount = el => act(() => root.render(el))

describe('Home cards', () => {
  it('the level card shows level 1 with no log, and the closest badges', () => {
    setS()
    mount(<LevelCard />)
    expect(host.textContent).toContain('Rookie')
    expect(host.textContent).toContain('No goal streak yet')
  })

  it('a check-in button adds to today and counts a met target', () => {
    setS({ slipProfile: { targets: { weeklyGoal: 3, water: 2, protein: 100, sleep: 8, steps: 5000, _ts: 1 } } })
    mount(<CheckinCard />)
    const plus = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '+1 Water')
    act(() => plus.click()); act(() => plus.click())
    expect(useStore.getState().S.daily[today].water).toBe(2)
    expect(useStore.getState().S.daily[today]._ts).toBeGreaterThan(0)
    expect(host.textContent).toContain('1 of 4 targets')
  })

  it('goals list with progress; a removed goal is gone', () => {
    setS({
      workouts: [workout('a', '2026-09-01', [{ w: 100, r: 1, done: true }])],
      slipGoals: {
        g: { id: 'g', type: 'lift', exId: '0025', target: 120, start: 100, from: '2026-09-01', created: 1, _ts: 1 },
        x: { id: 'x', gone: true, _ts: 2 },
      },
    })
    mount(<GoalsCard />)
    expect(host.textContent).toContain('120 kg (est. 1RM)')
    expect(host.textContent).toContain('Now 100 kg · 83%')
    expect(host.querySelectorAll('.slip-goal').length).toBe(1)
  })
})

describe('achievements', () => {
  it('lists all 46, earned ones with their date', () => {
    setS({ badges: { 'first-workout': { d: '2026-09-01', _ts: 1 } } })
    mount(<Achievements />)
    expect(host.querySelectorAll('.slip-badge').length).toBe(46)
    expect(host.querySelectorAll('.slip-badge.locked').length).toBe(45)
    expect(host.textContent).toContain('1 of 46 unlocked')
  })
})

describe('rewards', () => {
  it('awards earned badges once the log settles, and celebrates them', async () => {
    vi.useFakeTimers()
    setS({ workouts: [workout('a', today, [{ w: 60, r: 5, done: true }])] })
    mount(<Rewards />)
    await act(async () => { vi.advanceTimersByTime(2000) })
    const b = useStore.getState().S.badges
    expect(b['first-workout'].d).toBe(today)
    expect(useUI.getState().sheets.length).toBe(1)
  })

  it('waits for the first sync of a signed-in session', async () => {
    vi.useFakeTimers()
    setS({ workouts: [workout('a', today, [{ w: 60, r: 5, done: true }])] })
    useStore.setState({ user: { id: 'u' }, sync: { ...useStore.getState().sync, status: 'pending', lastSynced: null } })
    mount(<Rewards />)
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(useStore.getState().S.badges['first-workout']).toBeUndefined()
  })

  it('toasts a PR the moment a ticked set beats the record', () => {
    setS({ workouts: [workout('a', '2026-09-01', [{ w: 100, r: 5, done: true }])] })
    mount(<Rewards />)
    const active = { start: Date.now(), entries: [{ id: '0025', sets: [{ w: 105, r: 5, done: false }] }] }
    act(() => useStore.setState(s => ({ S: { ...s.S, active } })))
    act(() => useStore.setState(s => ({ S: { ...s.S, active: { ...active, entries: [{ id: '0025', sets: [{ w: 105, r: 5, done: true }] }] } } })))
    expect(useUI.getState().toastMsg).toMatch(/New PR: Barbell Bench Press · Est\. 1RM 122\.5 kg/)
  })

  it('no toast for an exercise done for the first time', () => {
    setS()
    mount(<Rewards />)
    act(() => useStore.setState(s => ({ S: { ...s.S, active: { start: 1, entries: [{ id: '0025', sets: [{ w: 105, r: 5, done: true }] }] } } })))
    expect(useUI.getState().toastMsg).toBe('')
  })
})
