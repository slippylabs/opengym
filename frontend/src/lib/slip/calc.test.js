import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as C from './calc.js'
import { FORMULAS } from '../onerm.js'

// Two layers. The oracle diffs this port against SlipFit's own js/calc.js, loaded as the CommonJS
// module it also is, over a grid of inputs for every export: a transcription slip anywhere shows
// up as a mismatch. It needs the SlipFit checkout beside this one, so it skips where that is
// absent (CI). The worked values below it are SlipFit's tools/test_calc.js, ported: numbers
// worked by hand from each published formula, or computed in Python from the formula's ORIGINAL
// units (the Navy method's inch form, not the cm form calc.js uses), so they hold on their own.

const SLIPFIT = '/home/slippy/fit.slippylabs.com/js/calc.js'
const haveSlipFit = existsSync(SLIPFIT)
const O = haveSlipFit ? createRequire(import.meta.url)(SLIPFIT) : null

// The seven 1RM formulas come from lib/onerm.js, where O'Conner is written w*(1 + r/40) and
// SlipFit wrote w*(1 + 0.025*r): the same formula, which can differ in the last bit. Everything
// else is compared exactly.
const close = (got, want) => {
  if (typeof want === 'number') {
    if (Number.isNaN(want)) return expect(got).toBeNaN()
    return expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(want)))
  }
  if (Array.isArray(want)) { expect(got).toHaveLength(want.length); return want.forEach((w, i) => close(got[i], w)) }
  if (want && typeof want === 'object') {
    expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort())
    for (const k of Object.keys(want)) close(got[k], want[k])
    return
  }
  expect(got).toEqual(want)
}

const SEXES = ['m', 'f', 'x']
const KGS = [0, 45, 62.5, 80, 101.3, 150]
const CMS = [140, 152.4, 165, 177.8, 190, 210]
const AGES = [14, 25, 40, 67, 90]
const REPS = [0, 1, 2, 3, 5, 8, 10, 12, 13, 20, 1.5]
const WEIGHTS = [-5, 0, 20, 62.5, 100, 140, 225]

describe.skipIf(!haveSlipFit)('calc.js against SlipFit js/calc.js (oracle)', () => {
  it('exports the same names', () => {
    expect(Object.keys(C).sort()).toEqual(Object.keys(O).sort())
  })

  it('constants and tables are identical', () => {
    for (const k of ['KG_PER_LB', 'CM_PER_IN', 'KM_PER_MI', 'ACTIVITY', 'GOAL_PROTEIN', 'PROTEIN_RANGES', 'PLATE_SETS', 'HR_ZONES', 'METS']) {
      expect(C[k], k).toEqual(O[k])
    }
    expect(Object.keys(C.ONE_RM)).toEqual(Object.keys(O.ONE_RM))
    expect(C.ONE_RM).toBe(FORMULAS)
  })

  it('unit conversions and round', () => {
    for (const x of [0, 1, 2.54, 45, 185.5, 225, 26.2188, -3, 1e6]) {
      for (const f of ['lbToKg', 'kgToLb', 'inToCm', 'cmToIn', 'miToKm', 'kmToMi']) expect(C[f](x), f + x).toBe(O[f](x))
      for (const dp of [undefined, 0, 1, 2, 3]) expect(C.round(x / 7, dp)).toBe(O.round(x / 7, dp))
    }
  })

  it('BMI, BMR, TDEE and macros', () => {
    for (const kg of KGS) for (const cm of CMS) {
      expect(C.bmi(kg, cm)).toBe(O.bmi(kg, cm))
      for (const sex of SEXES) for (const age of AGES) expect(C.bmrMifflin(sex, kg, cm, age)).toBe(O.bmrMifflin(sex, kg, cm, age))
    }
    for (let v = 10; v < 45; v += 0.37) expect(C.bmiCategory(v)).toBe(O.bmiCategory(v))
    for (const kg of KGS) for (const bf of [0, 8, 15, 22.5, 35, 60]) expect(C.bmrKatch(kg, bf)).toBe(O.bmrKatch(kg, bf))
    for (const bmr of [1200, 1780, 2100.5]) for (const [act] of O.ACTIVITY) {
      expect(C.tdee(bmr, act)).toBe(O.tdee(bmr, act))
      for (const goal of ['lose', 'keep', 'gain', 'nonsense', undefined]) for (const kg of KGS) {
        expect(C.macros(bmr * act, goal, kg)).toEqual(O.macros(bmr * act, goal, kg))
      }
    }
  })

  it('Navy body fat and its categories', () => {
    for (const sex of SEXES) for (const h of CMS) for (const neck of [30, 34, 38.1, 43]) for (const waist of [30, 60, 78.74, 96.52, 120]) {
      for (const hip of [0, 85, 96.52, 110]) close(C.navyBodyFat(sex, h, neck, waist, hip), O.navyBodyFat(sex, h, neck, waist, hip))
    }
    for (const sex of SEXES) for (let p = 0; p < 50; p += 0.5) expect(C.bodyFatCategory(sex, p)).toBe(O.bodyFatCategory(sex, p))
  })

  it('ideal weight, waist-to-height, water, protein', () => {
    for (const sex of SEXES) for (const cm of CMS) expect(C.idealWeights(sex, cm)).toEqual(O.idealWeights(sex, cm))
    for (const w of [60, 81, 94.5]) for (const cm of CMS) expect(C.waistToHeight(w, cm)).toBe(O.waistToHeight(w, cm))
    for (const kg of KGS) for (const min of [undefined, 0, 30, 45, 90]) expect(C.waterMl(kg, min)).toBe(O.waterMl(kg, min))
    for (const kg of KGS) for (const kind of [...Object.keys(O.PROTEIN_RANGES), 'nonsense']) expect(C.proteinRange(kg, kind)).toEqual(O.proteinRange(kg, kind))
  })

  it('one-rep max, every formula, estimate and inverse', () => {
    for (const w of WEIGHTS) for (const r of REPS) {
      for (const f of [undefined, ...Object.keys(O.ONE_RM)]) close(C.oneRepMax(w, r, f), O.oneRepMax(w, r, f))
      close(C.oneRepMaxAll(w, r), O.oneRepMaxAll(w, r))
      close(C.estimate1RM(w, r), O.estimate1RM(w, r))
      expect(C.weightForReps(w, r)).toBe(O.weightForReps(w, r))
    }
  })

  it('plate loader', () => {
    const sets = [[20, [25, 20, 15, 10, 5, 2.5, 1.25]], [45, [45, 35, 25, 10, 5, 2.5]], [20, [20, 10, 2.5]], [20, [25, 20, 15]], [15, [1.25, 0.5]]]
    for (const [bar, have] of sets) for (let t = bar - 10; t <= bar + 200; t += 1.25) {
      expect(C.plates(t, bar, have)).toEqual(O.plates(t, bar, have))
    }
  })

  it('heart rate', () => {
    for (const age of AGES) for (const m of [undefined, 'fox', 'tanaka']) expect(C.maxHeartRate(age, m)).toBe(O.maxHeartRate(age, m))
    for (const mx of [160, 187, 200]) for (const rest of [40, 60, 75]) expect(C.karvonen(mx, rest)).toEqual(O.karvonen(mx, rest))
  })

  it('pace, Riegel and durations', () => {
    for (const s of [0, 1500, 1680, 3723.5]) for (const d of [-1, 0, 3.1, 5, 42.195]) {
      expect(C.pace(s, d)).toBe(O.pace(s, d))
      expect(C.timeFor(s / 10, d)).toBe(O.timeFor(s / 10, d))
      expect(C.distanceFor(s, d * 60)).toBe(O.distanceFor(s, d * 60))
      if (d > 0) for (const d2 of [5, 10, 21.0975, 42.195]) expect(C.riegel(s, d, d2)).toBe(O.riegel(s, d, d2))
    }
    for (const s of [-1, 0, 0.4, 59, 59.5, 60, 3599, 3600, 3725, 86399.6, Infinity, NaN]) expect(C.fmtDuration(s)).toBe(O.fmtDuration(s))
    for (const s of ['', ' ', '90', '7.5', '25:30', '1:02:03', '1:2:3:4', '1h', '1h 5m', '45m', '45min', '30s', '2h3m4s', 'abc', '12:3x', null, undefined, ':', '5:']) {
      close(C.parseDuration(s), O.parseDuration(s))
    }
  })

  it('calories burned, trend, moving average', () => {
    for (const [, met] of O.METS) for (const kg of KGS) for (const min of [0, 30, 75]) expect(C.caloriesBurned(met, kg, min)).toBe(O.caloriesBurned(met, kg, min))
    const series = [null, [], [[0, 1]], [[3, 1], [3, 2]], [[0, 100], [7, 99], [14, 98], [21, 97]], [[1, 80.2], [2, 80.9], [5, 79.4], [9, 79.8], [12, 78.1]]]
    for (const p of series) expect(C.trend(p)).toEqual(O.trend(p))
    for (const w of [1, 2, 3, 7]) expect(C.movingAverage([1, 2, 3, 4, 10, 0.5], w)).toEqual(O.movingAverage([1, 2, 3, 4, 10, 0.5], w))
  })
})

// ---- SlipFit tools/test_calc.js, ported. oracle_calc.json's values are inlined. ----
const NAVY = [
  { sex: 'm', h: 177.8, neck: 38.1, waist: 86.36, hip: 0, bf: 17.51308539731425 },
  { sex: 'm', h: 182.88, neck: 40.64, waist: 96.52, hip: 0, bf: 22.1323493949755 },
  { sex: 'm', h: 172.72, neck: 36.83, waist: 78.74, hip: 0, bf: 13.125037286980593 },
  { sex: 'm', h: 187.96, neck: 43.18, waist: 106.68, hip: 0, bf: 26.073961264204648 },
  { sex: 'f', h: 162.56, neck: 33.02, waist: 73.66, hip: 96.52, bf: 27.913438993265572 },
  { sex: 'f', h: 167.64000000000001, neck: 34.29, waist: 81.28, hip: 101.6, bf: 32.281343324470356 },
  { sex: 'f', h: 157.48, neck: 31.75, waist: 68.58, hip: 91.44, bf: 24.510679568908728 },
]
const ONERM_100x5 = { epley: 116.66666666666667, brzycki: 112.5, lombardi: 117.4618943088019, oconner: 112.5, mayhew: 119.01068045151959, wathan: 116.58250529118924, lander: 113.70891767872341 }
const IDEAL_M_70IN = { devine: 73.0, robinson: 71.0, miller: 70.3, hamwi: 75.0, cm: 177.8 }

const near = (got, want, tol = 1e-6) => expect(Math.abs(got - want)).toBeLessThanOrEqual(tol)

describe('calc.js worked values (SlipFit test_calc.js)', () => {
  it('units: exact definitions', () => {
    near(C.lbToKg(225), 102.05828325, 1e-9)
    near(C.kgToLb(C.lbToKg(185.5)), 185.5, 1e-9)
    near(C.inToCm(70), 177.8, 1e-9)
    near(C.miToKm(26.2188), 42.195, 1e-3)
  })

  it('BMI 80 / 1.8^2 and the WHO categories', () => {
    near(C.bmi(80, 180), 24.691358, 1e-5)
    expect([18.4, 18.5, 24.99, 25, 29.9, 30].map(C.bmiCategory)).toEqual(['Underweight', 'Healthy weight', 'Healthy weight', 'Overweight', 'Overweight', 'Obese'])
  })

  it('Mifflin-St Jeor, Katch-McArdle, TDEE', () => {
    near(C.bmrMifflin('m', 80, 180, 30), 800 + 1125 - 150 + 5)
    near(C.bmrMifflin('f', 60, 165, 25), 600 + 1031.25 - 125 - 161)
    near(C.bmrKatch(80, 20), 370 + 21.6 * 64, 1e-9)
    near(C.tdee(1780, 1.55), 2759)
  })

  it('macros add back up to the calories; protein by g/kg', () => {
    for (const g of ['lose', 'keep', 'gain']) {
      const m = C.macros(2700, g, 80)
      near(m.protein * 4 + m.carbs * 4 + m.fat * 9, m.kcal, 1e-6)
      near(m.fat * 9 / m.kcal, 0.25, 1e-9)
    }
    near(C.macros(2700, 'lose', 80).kcal, 2160)
    near(C.macros(2700, 'gain', 80).kcal, 2970)
    near(C.macros(2700, 'lose', 80).protein, 160)
  })

  it('Navy body fat: cm form against the inch form', () => {
    // the two published forms differ by up to ~0.35 points
    for (const c of NAVY) near(C.navyBodyFat(c.sex, c.h, c.neck, c.waist, c.hip), c.bf, 0.4)
    expect(C.navyBodyFat('m', 180, 40, 38, 0)).toBeNaN()
  })

  it('one-rep max', () => {
    for (const k of Object.keys(ONERM_100x5)) near(C.oneRepMax(100, 5, k), ONERM_100x5[k], 1e-9)
    for (const k of Object.keys(C.ONE_RM)) near(C.oneRepMax(140, 1, k), 140)
    near(C.oneRepMax(225, 8), 225 * (1 + 8 / 30), 1e-9)
    near(C.weightForReps(C.oneRepMax(100, 6), 6), 100, 1e-9)
    expect(C.estimate1RM(50, 20)).toBe(0)
  })

  it('ideal weight against the inch form', () => {
    const iw = C.idealWeights('m', IDEAL_M_70IN.cm)
    for (const k of ['devine', 'robinson', 'miller', 'hamwi']) near(iw[k], IDEAL_M_70IN[k], 1e-9)
    near(iw.bmiLow, 18.5 * 1.778 * 1.778, 1e-9)
  })

  it('heart rate', () => {
    near(C.maxHeartRate(30), 190)
    near(C.maxHeartRate(30, 'tanaka'), 187)
    const z = C.karvonen(190, 60)
    near(z[1].lo, 60 + 0.6 * 130)
    near(z[4].hi, 190)
    expect(z.slice(1).every((zz, i) => Math.abs(zz.lo - z[i].hi) < 1e-9)).toBe(true)
  })

  it('running', () => {
    near(C.riegel(1500, 5, 10), 1500 * Math.pow(2, 1.06), 1e-9)
    near(C.riegel(1500, 5, 5), 1500, 1e-9)
    near(C.pace(1500, 5), 300)
    near(C.timeFor(300, 5), 1500)
    near(C.distanceFor(1500, 300), 5)
    expect([59, 60, 3599, 3600, 3725, 0].map(C.fmtDuration)).toEqual(['0:59', '1:00', '59:59', '1:00:00', '1:02:05', '0:00'])
    expect(['25:30', '1:02:03', '90', '1h 5m', '45m', '30s', '', 'abc', '1:2:3:4'].map(s => { const v = C.parseDuration(s); return isNaN(v) ? null : v }))
      .toEqual([1530, 3723, 90, 3900, 2700, 30, null, null, null])
    for (let s = 0; s < 20000; s += 37) expect(C.parseDuration(C.fmtDuration(s))).toBe(s)
  })

  it('energy', () => {
    near(C.caloriesBurned(9.8, 70, 60), 686, 1e-9)
    near(C.waterMl(80, 60), 2800 + 1000)
    expect(C.proteinRange(80, 'muscle').map(x => Math.round(x * 10) / 10)).toEqual([128, 176])
  })

  it('trend and moving average', () => {
    const tr = C.trend([[0, 100], [7, 99], [14, 98], [21, 97]])
    near(tr.slope, -1 / 7, 1e-12)
    near(tr.intercept, 100, 1e-9)
    expect(C.trend([[3, 1], [3, 2]])).toBe(null)
    expect(C.movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5])
  })

  // DP against brute force over every target: the closest load at or under, fewest plates.
  it('plate loader matches brute force', () => {
    function brute(perSide, plates) {
      // every multiset of up to 12 plates, by DFS over sorted denominations
      const u = plates.map(p => Math.round(p * 100)).sort((a, b) => b - a), goal = Math.round(perSide * 100)
      let best = { sum: 0, n: 0 }
      ;(function dfs(i, sum, n) {
        if (sum > goal) return
        if (sum > best.sum || (sum === best.sum && n < best.n)) best = { sum, n }
        if (i >= u.length || n >= 12) return
        dfs(i, sum + u[i], n + 1)
        dfs(i + 1, sum, n)
      })(0, 0, 0)
      return best
    }
    const sets = [['kg', [25, 20, 15, 10, 5, 2.5, 1.25], 20, 1.25], ['lb', [45, 35, 25, 10, 5, 2.5], 45, 2.5], ['odd', [20, 10, 2.5], 20, 1], ['no-small', [25, 20, 15], 20, 2.5]]
    for (const [name, plates, bar, step] of sets) {
      for (let t = bar; t <= bar + 260; t += step) {
        const r = C.plates(t, bar, plates)
        const b = brute((t - bar) / 2, plates)
        const sum = r.perSide.reduce((a, x) => a + x, 0)
        expect(Math.abs(r.total - (bar + 2 * sum)), name + t).toBeLessThanOrEqual(1e-9)
        expect(Math.round(sum * 100), name + t).toBe(b.sum)
        expect(r.perSide.length, name + t).toBe(b.n)
        expect(r.total, name + t).toBeLessThanOrEqual(t + 1e-9)
      }
    }
    expect(C.plates(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).total).toBe(100)
    expect(C.plates(225, 45, [45, 35, 25, 10, 5, 2.5]).perSide).toEqual([45, 45])
  })
})
