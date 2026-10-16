// @vitest-environment happy-dom
// Cardio distance and pace under each set row: derived from the minutes and the speed, in km or
// in miles as the profile reads speed, and typing a distance sets the speed that covers it.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const BIKE = '2138'   // stationary bike, cardio
let root, container

function mount(settings = {}, set = { min: 20, speed: 8, done: false }) {
  if (root) unmount()
  const S = { ...JSON.parse(JSON.stringify(DEF)), ...settings }
  S.active = {
    id: 'dist-test', d: '2026-10-16', start: Date.now(), routineId: null, name: 'Cardio', bw: null, cur: 0,
    entries: [{ id: BIKE, target: { sets: 1, min: 20, speed: 8 }, sets: [set] }],
  }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
}
function unmount() {
  act(() => root.unmount())
  container.remove()
  root = null
}
afterEach(() => { if (root) unmount() })

const line = () => container.querySelector('.distrow')
const field = () => line().querySelector('input')
const stored = () => useStore.getState().S.active.entries[0].sets[0]
function type(value) {
  const input = field()
  act(() => {
    Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('cardio distance in the workout', () => {
  it('shows the distance and pace a row covers, in km', () => {
    mount()
    expect(field().getAttribute('aria-label')).toBe('Distance (km)')
    expect(field().value).toBe('2.67')          // 20 min at 8 km/h
    expect(line().textContent).toContain('7:30 /km')
  })

  it('sets the speed from a typed distance and keeps the minutes', () => {
    mount()
    type('5')
    expect(stored()).toMatchObject({ min: 20, speed: 15 })
    expect(field().value).toBe('5')
    expect(line().textContent).toContain('4:00 /km')
    // The speed column follows.
    expect(container.querySelector('.setrow').querySelectorAll('.stp')[1].querySelector('input').value).toBe('15')
    act(() => line().querySelector('button[aria-label="More distance"]').click())
    expect(stored().speed).toBe(16.5)
  })

  it('keeps a typed distance on screen when the speed cannot hold it exactly', () => {
    mount({}, { min: 120, speed: 5, done: false })
    // 10.01 km in two hours is 5.005 km/h, kept as 5.01; read back from that, the field would
    // say 10.02 while you are still typing.
    type('10.01')
    expect(stored().speed).toBe(5.01)
    expect(field().value).toBe('10.01')
  })

  it('reads and takes miles for a profile on mph, and stores km/h', () => {
    mount({ unit: 'lb' })
    expect(field().getAttribute('aria-label')).toBe('Distance (mi)')
    expect(field().value).toBe('1.66')
    expect(line().textContent).toContain('/mi')
    type('3')
    expect(stored().speed).toBe(14.48)          // 3 mi in 20 min = 9 mph
    expect(field().value).toBe('3')
  })

  it('has no distance line while the row has no minutes', () => {
    mount({}, { min: 0, speed: 8, done: false })
    expect(line()).toBeNull()
  })
})
