// @vitest-environment happy-dom
// The card decides what run you do next and writes two things back on its own (the routine's
// minutes, the finish date). Both have to land once and then stay put: an effect that writes on
// every render would stamp the routine forever and fight the other device over it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { todayISO } from '../../lib/format.js'
import { noteOf, SESSIONS } from '../../lib/slip/c25k.js'
import ProgramCard from './ProgramCard.jsx'

const mounted = []
const S = () => useStore.getState().S

const runRoutine = (ex = {}) => ({ id: 'c25k-r', name: 'Couch to 5K', emoji: 'figureRun', ex: [{ id: '0685', sets: 1, mode: 'cardio', min: 30, speed: 8, note: noteOf(SESSIONS[0][0]), ...ex }] })
const logged = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, d: '2026-10-' + String(i + 2).padStart(2, '0'), routineIds: ['c25k-r'], name: 'Couch to 5K', entries: [] }))
const RUN = { r1: { program: 'c25k', routineId: 'c25k-r', start: '2026-10-01', _ts: 1 } }

function setState(patch) {
  useStore.setState(s => ({ S: { ...s.S, routines: [runRoutine()], week: { 1: ['c25k-r'] }, workouts: [], slipRuns: RUN, active: null, ...patch } }))
}

function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<ProgramCard />))
  return host
}

const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('ProgramCard', () => {
  it('renders nothing without a run', () => {
    setState({ slipRuns: {} })
    expect(render().innerHTML).toBe('')
  })

  it('renders nothing when the run’s routine was deleted', () => {
    setState({ routines: [] })
    expect(render().innerHTML).toBe('')
  })

  it('shows the next session, its instructions, minutes and progress', () => {
    setState({ workouts: logged(7) })
    const host = render()
    expect(host.querySelector('.ttl').textContent).toBe('Week 3 · Run 2')
    expect(host.textContent).toContain('Twice: run 90 s, walk 90 s, run 3 min, walk 3 min.')
    expect(host.textContent).toContain('28 min')
    expect(host.textContent).toContain('7 of 27 runs done')
    expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('7')
  })

  it('keeps the routine’s minutes and note in step with the session, once', () => {
    setState({ workouts: logged(7) })
    render()
    expect(S().routines[0].ex[0]).toMatchObject({ min: 28, note: noteOf(SESSIONS[7][0]) })
    // Nothing left to change: another render writes nothing.
    const after = S()
    render()
    expect(S()).toBe(after)
  })

  it('leaves a note you wrote yourself alone, and still moves the minutes on', () => {
    setState({ workouts: logged(3), routines: [runRoutine({ note: 'Park loop, flat route' })] })
    render()
    expect(S().routines[0].ex[0]).toMatchObject({ min: 31, note: 'Park loop, flat route' })
  })

  it('starts the routine', () => {
    setState({ workouts: logged(1), weighIn: false })
    const host = render()
    act(() => { button(host, 'Start').click() })
    expect(S().active.routineIds).toEqual(['c25k-r'])
  })

  it('at 27 runs marks the run finished and graduates, until dismissed', () => {
    setState({ workouts: logged(27) })
    const host = render()
    expect(S().slipRuns.r1).toMatchObject({ finished: todayISO() })
    expect(host.textContent).toContain('Program complete!')
    // Finishing does not touch the routine: the last session is what it holds.
    expect(S().routines[0].ex[0].min).toBe(30)
    act(() => { button(host, 'Dismiss').click() })
    expect(S().slipRuns.r1).toMatchObject({ dismissed: true, finished: todayISO() })
    expect(host.innerHTML).toBe('')
  })

  it('a finished run does not hide a new one', () => {
    setState({ slipRuns: { old: { program: 'c25k', routineId: 'c25k-r', start: '2026-01-01', finished: '2026-03-01', dismissed: true, _ts: 1 }, ...RUN } })
    expect(render().querySelector('.ttl').textContent).toBe('Week 1 · Run 1')
  })
})
