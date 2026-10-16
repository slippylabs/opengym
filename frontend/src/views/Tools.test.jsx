// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Tools, { CALCS } from './Tools.jsx'
import * as Calc from '../lib/slip/calc.js'
import { targetsOf } from '../lib/slip/state.js'
import { todayISO } from '../lib/format.js'

const navSpy = vi.fn()
const route = { id: undefined }
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy, useParams: () => ({ id: route.id }) }))

const clone = value => JSON.parse(JSON.stringify(value))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
function render(id) {
  route.id = id
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<Tools />))
  return host
}

// A controlled input only hears a value set through the prototype setter plus an input event.
function type(input, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const field = (host, label) => host.querySelector(`input[aria-label="${label}"]`)
const big = host => host.querySelector('.slip-result .big')?.textContent

function setState(patch = {}) {
  const S = clone(DEF)
  S.slipProfile = { body: { sex: 'm', birthYear: new Date().getFullYear() - 30, heightCm: 180, activity: 1.55, _ts: 1 } }
  S.bodyweight = [{ d: '2026-01-01', w: 85, t: 1 }, { d: '2026-02-01', w: 80, t: 2 }]
  Object.assign(S, patch)
  useStore.setState({ S, user: null })
}

beforeEach(() => {
  navSpy.mockClear()
  localStorage.clear()
  useUI.setState({ sheets: [] })
  setState()
  document.body.innerHTML = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('Tools list', () => {
  it('lists the twelve calculators and opens one', () => {
    const host = render()
    const rows = host.querySelectorAll('.slip-calc')
    expect(rows.length).toBe(12)
    expect([...rows].map(r => r.querySelector('.lrow-t').textContent)).toEqual(CALCS.map(c => c.title))
    act(() => rows[3].click())
    expect(navSpy).toHaveBeenCalledWith('/tools/onerm')
  })

  it('an unknown id falls back to the list', () => {
    expect(render('nope').querySelectorAll('.slip-calc').length).toBe(12)
  })
})

describe('each calculator', () => {
  it.each(CALCS.map(c => c.id))('%s renders with a back button to the list', id => {
    const host = render(id)
    expect(host.querySelector('h1').textContent).toBe(CALCS.find(c => c.id === id).title)
    act(() => host.querySelector('.hdr .iconbtn').click())
    expect(navSpy).toHaveBeenCalledWith('/tools')
  })

  it.each(CALCS.map(c => c.id))('%s renders for an lb profile too', id => {
    setState({ unit: 'lb', bodyweight: [{ d: '2026-02-01', w: 176, t: 2 }] })
    expect(render(id).querySelector('h1')).toBeTruthy()
  })
})

describe('calculators', () => {
  it('BMI starts from the profile height and the latest weigh-in', () => {
    const host = render('bmi')
    expect(big(host)).toBe('24.7')
    expect(host.textContent).toContain('Healthy weight')
    type(field(host, 'Weight'), 100)
    expect(big(host)).toBe('30.9')
    expect(host.textContent).toContain('Obese')
  })

  it('an lb profile types pounds and feet/inches, and gets the same BMI', () => {
    setState({ unit: 'lb', bodyweight: [{ d: '2026-02-01', w: Calc.kgToLb(80), t: 2 }] })
    const host = render('bmi')
    expect(field(host, 'Height (ft)').value).toBe('5')
    expect(field(host, '(in)').value).toBe('11')
    expect(big(host)).toBe('24.7')
    expect(host.textContent).toContain(' lb.')
  })

  it('Calories & macros: Mifflin target and "Use as my protein target"', () => {
    const host = render('calories')
    const bmr = Calc.bmrMifflin('m', 80, 180, 30)
    const tiles = [...host.querySelectorAll('.tile .v')].map(n => n.textContent)
    expect(tiles[0]).toBe(Math.round(bmr).toLocaleString('en'))
    expect(tiles[3]).toBe('128 g') // 1.6 g/kg at maintenance
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Use as my protein target')
    act(() => btn.click())
    expect(targetsOf(useStore.getState().S).protein).toBe(130) // rounded to 5 g, as SlipFit did
  })

  it('Body fat prefills the tape measurements and saves to the body log', () => {
    setState({ measurements: [{ d: '2026-01-05', t: 1, neck: 38.1, waist: 86.36, hips: null, other: [] }] })
    const host = render('bodyfat')
    expect(field(host, 'Neck').value).toBe('38.1')
    const bf = Calc.navyBodyFat('m', 180, 38.1, 86.4, 0) // the tape reads back to 0.1 cm
    expect(big(host)).toBe(bf.toFixed(1) + '%')
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Save to body log').click())
    const today = useStore.getState().S.measurements.find(e => e.d === todayISO())
    expect(today.bodyFat).toBe(Math.round(bf * 10) / 10)
    expect(today.waist).toBe(86.4)
  })

  it('One-rep max lists all seven formulas and the percentage table', () => {
    const host = render('onerm')
    expect(host.textContent).toContain('Enter a set you did')
    type(field(host, 'Weight'), 100)
    expect(big(host)).toBe('117 kg')
    expect(host.querySelectorAll('.sect').length).toBe(2)
    expect(host.textContent).toContain('O’Conner')
    expect(host.textContent).toContain('95%')
    expect(host.textContent).toContain('60%')
  })

  it('Plate loader uses the standard set without an inventory, the user\'s plates with one', () => {
    let host = render('plates')
    expect(big(host)).toBe('25 + 15')
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    setState({ plates: { kg: { 20: 2, 10: 1, _ts: 1 } } })
    host = render('plates')
    expect(big(host)).toBe('20 + 20')
    expect([...host.querySelectorAll('.slip-chips .chip')].map(c => c.textContent)).toEqual(['20', '10'])
    // switch the 20s off: one pair of 10s is all that is left, 60 kg short
    act(() => host.querySelector('.slip-chips .chip').click())
    expect(big(host)).toBe('10')
    expect(host.textContent).toContain('60 kg short of target')
  })

  it('Heart-rate zones by Karvonen', () => {
    const host = render('hr')
    expect(big(host)).toBe('190 bpm')
    expect(host.querySelectorAll('.slip-zone').length).toBe(5)
    expect(host.querySelector('.slip-zone.z2 .lrow-v').textContent).toBe('138–151 bpm')
  })

  it('Pace and Riegel predictions, in miles for an lb profile', () => {
    let host = render('pace')
    expect(big(host)).toBe('5:36 /km')
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    setState({ unit: 'lb' })
    host = render('pace')
    expect(big(host)).toMatch(/ \/mi$/)
    expect(host.textContent).toContain('Marathon')
  })

  it('Water and protein write their targets', () => {
    let host = render('water')
    expect(big(host)).toBe('3.6 L') // 80 kg × 35 ml + 45 min / 30 × 500 ml = 3550 ml
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Use as my water target').click())
    expect(targetsOf(useStore.getState().S).water).toBe(Math.round(Calc.waterMl(80, 45) / 250))
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    host = render('protein')
    expect(big(host)).toBe('128–176 g')
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.startsWith('Use 150 g')).click())
    expect(targetsOf(useStore.getState().S).protein).toBe(150)
  })

  it('Waist-to-height needs a waist, then rates it', () => {
    const host = render('whtr')
    expect(host.textContent).toContain('Enter your waist measurement.')
    type(field(host, 'Waist (at navel)'), 81)
    expect(big(host)).toBe('0.45')
    expect(host.textContent).toContain('Healthy')
  })
})
