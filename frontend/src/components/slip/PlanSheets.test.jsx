// @vitest-environment happy-dom
// SlipFit's plans go through the starter plans' own apply path: what gets checked here is that
// the chooser still offers openGym's four plans first, that a preview loads exactly what it
// showed, that Couch to 5K starts one run record (and only one), and that a taken weekday asks.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { todayISO } from '../../lib/format.js'
import { runsOf } from '../../lib/slip/state.js'
import { starterPlanSheet } from '../../sheets.jsx'
import { planGeneratorSheet } from './PlanSheets.jsx'

const mounted = []
const S = () => useStore.getState().S
const nameOn = day => S().routines.find(r => r.id === [].concat(S().week[day] ?? [])[0])?.name

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

const rowFor = (host, title) => [...host.querySelectorAll('.lrow')].find(el => el.querySelector('.lrow-t')?.textContent === title)
const button = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)
const click = el => act(() => { el.click() })

// Chooser → a "More plans" row → its preview sheet.
function openPreview(title) {
  starterPlanSheet()
  click(rowFor(renderTop(), title))
  return renderTop()
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({
    S: { ...s.S, routines: [{ id: 'mine', name: 'My routine', emoji: 'star', ex: [] }], week: {}, workouts: [], slipRuns: {}, active: null },
  }))
  document.body.innerHTML = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('More plans in the starter chooser', () => {
  it('lists the generator and SlipFit’s eight built-ins after openGym’s own plans', () => {
    starterPlanSheet()
    const host = renderTop()
    expect([...host.querySelectorAll('.item .tt')].map(el => el.textContent))
      .toEqual(['Push / Pull / Legs', 'Upper / Lower', 'Full Body', '5×5'])
    expect([...host.querySelectorAll('.slip-more-plans .lrow-t')].map(el => el.textContent)).toEqual([
      'Build a plan for me', 'Beginner Full Body', 'Stronger Basics', 'Fat Loss Circuit', 'Home Dumbbells',
      'Bodyweight Anywhere', 'Couch to 5K', 'Run Builder', 'Mobility & Recovery',
    ])
  })

  it('previews a plan and loads exactly the routines it showed, on its weekdays', () => {
    const host = openPreview('Beginner Full Body')
    const shown = [...host.querySelectorAll('.sect-t')].map(el => el.textContent)
    expect(shown).toEqual(['Full Body A · Monday', 'Full Body B · Wednesday', 'Full Body C · Friday'])
    click(button(host, 'Load plan'))
    expect(nameOn(1)).toBe('Full Body A')
    expect(nameOn(3)).toBe('Full Body B')
    expect(nameOn(5)).toBe('Full Body C')
    const a = S().routines.find(r => r.name === 'Full Body A')
    expect(a.ex[0]).toMatchObject({ id: '0043', sets: 3, repsMin: 8, reps: 12, prog: 'double', restSec: 90 })
    expect(S().routines[0].name).toBe('My routine')
    expect(useUI.getState().toastMsg).toBe('Beginner Full Body loaded')
  })

  it('says what the library has no exercise for', () => {
    const host = openPreview('Fat Loss Circuit')
    expect(host.textContent).toContain('Not in the exercise library, so left out: HIIT Circuit.')
  })

  it('asks before taking a weekday that already has a routine', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 3: ['mine'] } } }))
    const host = openPreview('Bodyweight Anywhere')
    click(button(host, 'Load plan'))
    expect(nameOn(3)).toBe('My routine')
    click(button(renderTop(), 'Load plan'))   // the confirmation
    expect(nameOn(3)).toBe('Full Body B')
  })
})

describe('Couch to 5K', () => {
  it('creates one routine on three days and starts a run today', () => {
    click(button(openPreview('Couch to 5K'), 'Load plan'))
    const c = S().routines.filter(r => r.name === 'Couch to 5K')
    expect(c).toHaveLength(1)
    expect(c[0].ex).toHaveLength(1)
    expect(c[0].ex[0]).toMatchObject({ id: '0685', mode: 'cardio', min: 30 })
    expect([1, 3, 5].map(nameOn)).toEqual(['Couch to 5K', 'Couch to 5K', 'Couch to 5K'])
    expect(runsOf(S())).toEqual([expect.objectContaining({ program: 'c25k', routineId: c[0].id, start: todayISO() })])
  })

  it('loading it again keeps your place instead of starting over', () => {
    click(button(openPreview('Couch to 5K'), 'Load plan'))
    const [run] = runsOf(S())
    act(() => useStore.setState(s => ({ S: { ...s.S, slipRuns: { [run.id]: { ...s.S.slipRuns[run.id], start: '2026-09-01' } } } })))
    click(button(openPreview('Couch to 5K'), 'Load plan'))
    click(button(renderTop(), 'Load plan'))   // its own weekdays are taken now, by itself
    expect(S().routines.filter(r => r.name === 'Couch to 5K')).toHaveLength(1)
    expect(runsOf(S())).toEqual([expect.objectContaining({ id: run.id, start: '2026-09-01' })])
  })

  it('after graduating, loading it again starts a new run', () => {
    click(button(openPreview('Couch to 5K'), 'Load plan'))
    const [run] = runsOf(S())
    act(() => useStore.setState(s => ({ S: { ...s.S, slipRuns: { [run.id]: { ...s.S.slipRuns[run.id], finished: '2026-10-10' } } } })))
    click(button(openPreview('Couch to 5K'), 'Load plan'))
    click(button(renderTop(), 'Load plan'))
    const runs = runsOf(S())
    expect(runs).toHaveLength(2)
    expect(runs.filter(r => !r.finished)).toEqual([expect.objectContaining({ start: todayISO() })])
  })
})

describe('Build a plan for me', () => {
  it('previews the generated plan as the choices change, and applies it', () => {
    planGeneratorSheet()
    let host = renderTop()
    expect(host.querySelector('h3:nth-of-type(2)').textContent).toBe('General Fitness · 3×/week')
    click(button(host, 'Get Stronger'))
    click(button(host, '4'))
    click(button(host, '60'))
    expect([...host.querySelectorAll('.sect-t')].map(el => el.textContent))
      .toEqual(['Upper A · Monday', 'Lower A · Tuesday', 'Upper B · Thursday', 'Lower B · Friday'])
    click(button(host, 'Use this plan'))
    expect([1, 2, 4, 5].map(nameOn)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B'])
    // The main lifts of a strength plan: five heavy sets of three to five.
    expect(S().routines.find(r => r.name === 'Upper A').ex[0]).toMatchObject({ id: '0025', sets: 5, repsMin: 3, reps: 5, restSec: 180 })
    expect(useUI.getState().toastMsg).toBe('Get Stronger · 4×/week loaded')
  })

  it('a beginner who wants to run gets Couch to 5K and its run record', () => {
    planGeneratorSheet()
    const host = renderTop()
    click(button(host, 'Run'))
    click(button(host, '5'))
    expect(host.textContent).toContain('Couch to 5K')
    click(button(host, 'Use this plan'))
    expect(S().routines.map(r => r.name)).toEqual(['My routine', 'Couch to 5K', 'Runner Strength'])
    expect(runsOf(S())).toHaveLength(1)
    expect(nameOn(2)).toBe('Runner Strength')
  })
})
