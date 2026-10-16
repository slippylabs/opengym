// The calculators carried over from SlipFit: /tools lists them, /tools/:id is one of them with
// its inputs on top and results that recompute as you type. The maths is lib/slip/calc.js, which
// is metric only; this screen converts at its edges, so an lb profile types pounds, inches and
// miles and never sees a kilogram.
//
// Inputs start from what the app already knows (lib/slip/state.js bodyOf/ageOf, the last
// weigh-in, the last tape measurements) and stay local to the screen: changing a number here
// to try something out does not rewrite the profile. Only the explicit "Use as my…" and
// "Save to body log" buttons write anything.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { fmtPlate, todayISO } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Row, Section, Segmented, SelectRow, TextField } from '../components/ui.jsx'
import * as Calc from '../lib/slip/calc.js'
import { bodyOf, ageOf, setTargets } from '../lib/slip/state.js'
import { FORMULA_NAMES, formulaOf } from '../lib/onerm.js'
import { inventoryFor, ownsPlates, plateStack } from '../lib/plates.js'
import { defaultBarWeight } from '../lib/bar.js'
import {
  emptyMeasurement, latestMeasurement, normalizeMeasurementsState, toMeasurementDisplay,
} from '../lib/measurements.js'
import '../slip.css'

// SlipFit's list, in its order, with its one-line descriptions.
export const CALCS = [
  { id: 'calories', icon: 'flame', title: 'Calories & macros', sub: 'BMR, TDEE and a target for your goal' },
  { id: 'bmi', icon: 'scale', title: 'BMI', sub: 'Body-mass index and healthy range' },
  { id: 'bodyfat', icon: 'figure', title: 'Body fat', sub: 'U.S. Navy tape-measure method' },
  { id: 'onerm', icon: 'barbell', title: 'One-rep max', sub: '7 formulas plus a percentage chart' },
  { id: 'plates', icon: 'plate', title: 'Plate loader', sub: 'What to put on each side of the bar' },
  { id: 'hr', icon: 'heart', title: 'Heart-rate zones', sub: 'Karvonen zones from age and resting HR' },
  { id: 'pace', icon: 'stopwatch', title: 'Pace & race times', sub: 'Pace, time, distance and race predictions' },
  { id: 'burn', icon: 'bolt', title: 'Calories burned', sub: 'By activity, weight and time' },
  { id: 'ideal', icon: 'target', title: 'Ideal weight', sub: 'Four formulas and the BMI range' },
  { id: 'water', icon: 'cloud', title: 'Water intake', sub: 'Daily water target' },
  { id: 'protein', icon: 'dumbbell', title: 'Protein', sub: 'How much protein for your goal' },
  { id: 'whtr', icon: 'ruler', title: 'Waist-to-height', sub: 'A simple health-risk ratio' },
]

const toast = message => useUI.getState().toast(message)
const update = fn => useStore.getState().update(fn)

// A number in the reader's locale with exactly `dp` decimals; a dash for anything not finite,
// so a half-typed input shows a dash rather than NaN.
const nf = (n, dp = 0) => (Number.isFinite(n)
  ? n.toLocaleString(dateLocale(), { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : '–')

// Unit handling: weights are in the profile unit (S.unit) the way every weight in state is,
// lengths follow it (cm with kg, in with lb, as lib/measurements.js does), and so do distances.
function unitsOf(S) {
  const metric = S.unit !== 'lb'
  return {
    metric,
    w: metric ? 'kg' : 'lb',
    l: metric ? 'cm' : 'in',
    d: metric ? 'km' : 'mi',
    toKg: v => (metric ? v : Calc.lbToKg(v)),
    fromKg: kg => (metric ? kg : Calc.kgToLb(kg)),
    toCm: v => (metric ? v : Calc.inToCm(v)),
    fromCm: cm => (metric ? cm : Calc.cmToIn(cm)),
  }
}

// What the calculators start from. Body weight is the last weigh-in (S.bodyweight is kept in
// date order and in the profile unit); without one, a 75 kg placeholder you are meant to edit.
function prefill(S) {
  const u = unitsOf(S)
  const body = bodyOf(S)
  const last = (S.bodyweight || []).at(-1)
  const tape = key => toMeasurementDisplay(latestMeasurement(S, key)?.value ?? null, S.unit)
  return {
    sex: body.sex === 'f' ? 'f' : 'm',
    age: ageOf(S),
    cm: Number(body.heightCm) || 175,
    activity: Number(body.activity) || 1.55,
    w: last?.w > 0 ? last.w : Math.round(u.fromKg(75)),
    neck: tape('neck'), waist: tape('waist'), hips: tape('hips'),
  }
}

const SEX = () => [{ value: 'm', label: t('Male') }, { value: 'f', label: t('Female') }]

/* ---------------------------------------------------------------- inputs -- */

function Field({ label, unit, value, onChange, decimal = true }) {
  return <label className="measure-field">
    <span>{label}</span>
    <span className="measure-input">
      <NumberField nullable decimal={decimal} value={value} onChange={onChange} aria-label={label} />
      {unit && <i>{unit}</i>}
    </span>
  </label>
}

// Height is kept in cm whatever the unit. Imperial shows feet and inches, both derived from the
// cm on every render (whole inches, as SlipFit did), so typing in one never fights the other.
function Height({ cm, onChange, u }) {
  if (u.metric) return <Field label={t('Height')} unit="cm" value={cm == null ? null : Math.round(cm * 10) / 10} onChange={onChange} />
  const total = Math.round(Calc.cmToIn(cm || 0))
  const ft = Math.floor(total / 12), inch = total % 12
  return <>
    <Field label={t('Height (ft)')} unit="ft" decimal={false} value={ft} onChange={v => onChange(Calc.inToCm((v || 0) * 12 + inch))} />
    <Field label={t('(in)')} unit="in" decimal={false} value={inch} onChange={v => onChange(Calc.inToCm(ft * 12 + (v || 0)))} />
  </>
}

const Grid = ({ children }) => <div className="measure-form">{children}</div>
const Label = ({ children }) => <div className="slip-label">{children}</div>

function Big({ value, label, sub }) {
  return <div className="card slip-result">
    <div className="big">{value}</div>
    <div className="slip-result-l">{label}</div>
    {sub && <div className="muted small slip-result-s">{sub}</div>}
  </div>
}

function Tiles({ items }) {
  return <div className="tiles slip-tiles">
    {items.map(([v, l]) => <div className="tile" key={l}><div className="l">{l}</div><div className="v">{v}</div></div>)}
  </div>
}

const Hint = ({ children }) => <div className="card muted small">{children}</div>
const Note = ({ children }) => <p className="muted small slip-note">{children}</p>

/* ---------------------------------------------------------- calculators -- */

function Calories({ S, p, u }) {
  // SlipFit took the goal from its own profile, which openGym does not have: start on maintain.
  const [d, setD] = useState({ sex: p.sex, age: p.age, cm: p.cm, w: p.w, bf: null, act: p.activity, goal: 'keep' })
  const set = k => v => setD(x => ({ ...x, [k]: v }))
  const kg = u.toKg(d.w || 0)
  const bmr = d.bf ? Calc.bmrKatch(kg, d.bf) : Calc.bmrMifflin(d.sex, kg, d.cm || 0, d.age || 0)
  const td = Calc.tdee(bmr, d.act)
  const mc = Calc.macros(td, d.goal, kg)
  const ok = kg > 0 && d.cm > 0 && bmr > 0
  const protein = Math.round(mc.protein / 5) * 5
  return <>
    <div className="card">
      <Label>{t('Sex')}</Label>
      <Segmented value={d.sex} onChange={set('sex')} options={SEX()} />
      <Grid>
        <Field label={t('Age')} value={d.age} decimal={false} onChange={set('age')} />
        <Height cm={d.cm} onChange={set('cm')} u={u} />
        <Field label={t('Weight')} unit={u.w} value={d.w} onChange={set('w')} />
        <Field label={t('Body fat % (optional)')} unit="%" value={d.bf} onChange={set('bf')} />
      </Grid>
      <div className="sect-b measure-select slip-select">
        <SelectRow title={t('Activity')} value={d.act} onChange={set('act')}
          options={Calc.ACTIVITY.map(([v, l]) => ({ value: v, label: t(l) }))} />
      </div>
      <Label>{t('Goal')}</Label>
      <Segmented value={d.goal} onChange={set('goal')}
        options={[{ value: 'lose', label: t('Lose fat') }, { value: 'keep', label: t('Maintain') }, { value: 'gain', label: t('Gain muscle') }]} />
    </div>
    {ok ? <>
      <div className="slip-tiles3"><Tiles items={[[nf(bmr), t('BMR kcal')], [nf(td), t('maintenance')], [nf(mc.kcal), t('your target')]]} /></div>
      <div className="slip-tiles3"><Tiles items={[[nf(mc.protein) + ' g', t('protein')], [nf(mc.carbs) + ' g', t('carbs')], [nf(mc.fat) + ' g', t('fat')]]} /></div>
      <Note>{(d.bf ? t('Katch-McArdle BMR × activity.') : t('Mifflin-St Jeor BMR × activity.')) + ' ' +
        (d.goal === 'lose' ? t('20% deficit: about 0.5-1% of bodyweight a week.') : d.goal === 'gain' ? t('10% surplus for lean gains.') : t('Maintenance calories.'))}</Note>
      <Button size="sm" icon="target" onClick={() => {
        update(s => setTargets(s, { protein }))
        toast(t('Protein target set to {0} g.', protein))
      }}>{t('Use as my protein target')}</Button>
    </> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

function Bmi({ p, u }) {
  const [cm, setCm] = useState(p.cm)
  const [w, setW] = useState(p.w)
  const kg = u.toKg(w || 0)
  const v = Calc.bmi(kg, cm || 0)
  const iw = Calc.idealWeights('m', cm || 0)
  return <>
    <div className="card"><Grid><Height cm={cm} onChange={setCm} u={u} /><Field label={t('Weight')} unit={u.w} value={w} onChange={setW} /></Grid></div>
    {kg > 0 && cm > 0 ? <>
      <Big value={nf(v, 1)} label={t(Calc.bmiCategory(v))} />
      <div className="slip-scale" aria-hidden="true"><span style={{ left: Math.max(0, Math.min(100, (v - 15) / 25 * 100)) + '%' }} /></div>
      <div className="slip-scale-l muted small"><span>18.5</span><span>25</span><span>30</span></div>
      <Note>{t('Healthy range for your height: {0}–{1} {2}. BMI ignores muscle, so lifters often read "overweight"; body fat and waist-to-height are better guides.',
        nf(u.fromKg(iw.bmiLow)), nf(u.fromKg(iw.bmiHigh)), u.w)}</Note>
    </> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

function BodyFat({ p, u }) {
  const [d, setD] = useState({ sex: p.sex, cm: p.cm, neck: p.neck, waist: p.waist, hips: p.hips })
  const set = k => v => setD(x => ({ ...x, [k]: v }))
  const female = d.sex === 'f'
  const have = d.neck > 0 && d.waist > 0 && (!female || d.hips > 0) && d.cm > 0
  const bf = have ? Calc.navyBodyFat(d.sex, d.cm, u.toCm(d.neck), u.toCm(d.waist), female ? u.toCm(d.hips) : 0) : NaN
  // Writes today's measurement check-in, the way the Measurements screen does: one entry per
  // day, so a row already logged today gets these fields filled in rather than a second row.
  const save = () => update(s => {
    const iso = todayISO()
    if (!Array.isArray(s.measurements)) s.measurements = []
    let e = s.measurements.find(x => x.d === iso)
    if (!e) { e = emptyMeasurement(iso, s.customMeasurements || []); s.measurements.push(e) }
    e.bodyFat = Math.round(bf * 10) / 10
    e.neck = u.toCm(d.neck)
    e.waist = u.toCm(d.waist)
    if (female) e.hips = u.toCm(d.hips)
    e.t = Date.now()
    normalizeMeasurementsState(s)
  })
  return <>
    <div className="card">
      <Label>{t('Sex')}</Label>
      <Segmented value={d.sex} onChange={set('sex')} options={SEX()} />
      <Grid>
        <Height cm={d.cm} onChange={set('cm')} u={u} />
        <Field label={t('Neck')} unit={u.l} value={d.neck} onChange={set('neck')} />
        <Field label={t('Waist (at navel)')} unit={u.l} value={d.waist} onChange={set('waist')} />
        {female && <Field label={t('Hips (widest)')} unit={u.l} value={d.hips} onChange={set('hips')} />}
      </Grid>
    </div>
    {!have ? <Hint>{t('Measure with a soft tape, relaxed, not sucking in.')}</Hint>
      : !Number.isFinite(bf) ? <Hint>{t('Waist must be larger than neck.')}</Hint>
        : <>
          <Big value={nf(bf, 1) + '%'} label={t(Calc.bodyFatCategory(d.sex, bf))}
            sub={t('Lean mass ≈ {0} · fat ≈ {1}', nf(p.w * (1 - bf / 100)) + ' ' + u.w, nf(p.w * bf / 100) + ' ' + u.w)} />
          <Button size="sm" icon="ruler" onClick={() => { save(); toast(t('Saved to your body log.')) }}>{t('Save to body log')}</Button>
        </>}
  </>
}

const PERCENTS = [95, 90, 85, 80, 75, 70, 65, 60]

function OneRm({ S, u }) {
  const [w, setW] = useState(null)
  const [r, setR] = useState(5)
  // The headline follows the formula picked in Settings, so this agrees with the 1RM the rest of
  // the app shows; the blended 'weighted' estimator needs logged sets, so it reads as Epley here.
  const pick = formulaOf(S)
  const head = Object.hasOwn(Calc.ONE_RM, pick) ? pick : 'epley'
  const ok = w > 0 && r >= 1
  const all = ok ? Calc.oneRepMaxAll(w, r) : null
  const one = ok ? all[head] : 0
  return <>
    <div className="card"><Grid>
      <Field label={t('Weight')} unit={u.w} value={w} onChange={setW} />
      <Field label={t('Reps')} decimal={false} value={r} onChange={setR} />
    </Grid></div>
    {!ok ? <Hint>{t('Enter a set you did: weight and reps (best accuracy under 10 reps).')}</Hint> : <>
      <Big value={nf(one) + ' ' + u.w} label={t('Estimated 1RM ({0})', FORMULA_NAMES[head])} />
      <Section>
        {Object.keys(Calc.ONE_RM).map(k => <Row key={k} title={FORMULA_NAMES[k]} value={nf(all[k], 1) + ' ' + u.w} />)}
        <Row title={<b>{t('Average')}</b>} value={nf(all.average, 1) + ' ' + u.w} />
      </Section>
      <Section title={t('Training percentages')}>
        {PERCENTS.map(pc => <Row key={pc} title={pc + '%'} subtitle={t('≈ {0} reps', Math.max(1, Math.round(30 * (100 / pc - 1))))}
          value={nf(one * pc / 100) + ' ' + u.w} />)}
      </Section>
    </>}
  </>
}

function Plates({ S, u }) {
  // The user's own plate inventory for this unit when they have counted one (lib/plates.js),
  // the standard set otherwise. Loading is plateStack's: exact with the fewest plates, else the
  // closest load under the target, never more pairs of a size than you own.
  const inv = inventoryFor(S)
  const own = ownsPlates(S)
  const [target, setTarget] = useState(u.metric ? 100 : 225)
  const [bar, setBar] = useState(defaultBarWeight('barbell', u.w))
  const [off, setOff] = useState(() => new Set())
  const have = inv.filter(x => !off.has(x.w))
  const toggle = w => setOff(s => { const n = new Set(s); if (n.has(w)) n.delete(w); else n.add(w); return n })
  const b = bar || 0
  let out = null
  if (!(target > 0)) out = null
  else if (target < b) out = <Hint>{t('That is less than the bar.')}</Hint>
  else {
    const perSide = (target - b) / 2
    const { plates, missing } = plateStack(perSide, have)
    const total = Math.round((b + 2 * (perSide - missing)) * 100) / 100
    const short = Math.round((target - total) * 100) / 100
    const top = Math.max(...inv.map(x => x.w), 1)
    out = <>
      <div className="slip-bar" aria-hidden="true">
        <span className="slip-bar-end" />
        {[...plates].reverse().map((w, i) => <span key={i} className="slip-plate" style={{ height: (34 + w / top * 60) + 'px' }}>{fmtPlate(w)}</span>)}
        <span className="slip-bar-shaft" />
      </div>
      <Big value={plates.length ? plates.map(fmtPlate).join(' + ') : t('Just the bar')}
        label={t('per side')}
        sub={t('Total {0} {1}', fmtPlate(total), u.w) + (short > 0 ? ' ' + t('({0} {1} short of target; nearest you can load)', fmtPlate(short), u.w) : '')} />
    </>
  }
  return <>
    <div className="card">
      <Grid>
        <Field label={t('Target')} unit={u.w} value={target} onChange={setTarget} />
        <Field label={t('Bar')} unit={u.w} value={bar} onChange={setBar} />
      </Grid>
      <Label>{t('Plates you have')}</Label>
      <div className="chips slip-chips">
        {inv.map(x => <button key={x.w} type="button" className={'chip' + (off.has(x.w) ? '' : ' on')} aria-pressed={!off.has(x.w)}
          onClick={() => toggle(x.w)}>{String(x.w)}</button>)}
      </div>
      <div className="muted small">{own ? t('Your plate inventory for {0}.', u.w) : t('A standard plate set. Count your own plates in a barbell exercise\'s plate settings.')}</div>
    </div>
    {out}
  </>
}

function HeartRate({ p }) {
  const [age, setAge] = useState(p.age)
  const [rest, setRest] = useState(60)
  const [method, setMethod] = useState('fox')
  const ok = age > 0 && rest > 0
  const mx = Calc.maxHeartRate(age || 0, method)
  return <>
    <div className="card">
      <Grid>
        <Field label={t('Age')} decimal={false} value={age} onChange={setAge} />
        <Field label={t('Resting heart rate')} unit="bpm" decimal={false} value={rest} onChange={setRest} />
      </Grid>
      <div className="muted small slip-gap">{t('Count your pulse for 60 s on waking.')}</div>
      <Label>{t('Max HR formula')}</Label>
      <Segmented value={method} onChange={setMethod} options={[{ value: 'fox', label: t('220 − age') }, { value: 'tanaka', label: 'Tanaka' }]} />
    </div>
    {ok && mx > rest ? <>
      <Big value={nf(mx) + ' bpm'} label={t('Estimated max heart rate')} />
      <Section>
        {Calc.karvonen(mx, rest).map((z, i) => <Row key={z.name} className={'slip-zone z' + (i + 1)} title={t(z.name)} subtitle={t(z.label)}
          value={nf(z.lo) + '–' + nf(z.hi) + ' bpm'} />)}
      </Section>
    </> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

const RACES = [['5K', 5], ['10K', 10], ['Half marathon', 21.0975], ['Marathon', 42.195]]

function Pace({ u }) {
  const [dist, setDist] = useState(u.metric ? 5 : 3.1)
  const [time, setTime] = useState('28:00')
  const sec = Calc.parseDuration(time)
  const ok = sec > 0 && dist > 0
  const km = u.metric ? dist : Calc.miToKm(dist || 0)
  const pk = sec / km, pm = sec / Calc.kmToMi(km)
  const speed = km / (sec / 3600) * (u.metric ? 1 : 1 / Calc.KM_PER_MI)
  return <>
    <div className="card">
      <Grid>
        <Field label={t('Distance')} unit={u.d} value={dist} onChange={setDist} />
        <label className="measure-field"><span>{t('Time')}</span>
          <TextField className="slip-time" value={time} inputMode="numeric" placeholder={t('mm:ss or h:mm:ss')} aria-label={t('Time')}
            onChange={e => setTime(e.target.value)} /></label>
      </Grid>
      <div className="chips slip-chips">
        {[['5K', 5], ['10K', 10], ['Half', 21.0975], ['Marathon', 42.195]].map(([l, k]) => <button key={l} type="button" className="chip"
          onClick={() => setDist(Math.round((u.metric ? k : Calc.kmToMi(k)) * 100) / 100)}>{t(l)}</button>)}
      </div>
    </div>
    {!ok ? <Hint>{t('Enter a distance and a time like 28:00.')}</Hint> : <>
      <Big value={Calc.fmtDuration(u.metric ? pk : pm) + ' /' + u.d} label={t('Pace')}
        sub={(u.metric ? Calc.fmtDuration(pm) + ' /mi' : Calc.fmtDuration(pk) + ' /km') + ' · ' + nf(speed, 1) + (u.metric ? ' km/h' : ' mph')} />
      <Section title={t('Predicted race times (Riegel)')} footer={t('Predictions assume you have trained for the distance.')}>
        {RACES.map(([l, k]) => {
          const tt = Calc.riegel(sec, km, k)
          return <Row key={l} title={t(l)} subtitle={Calc.fmtDuration(tt / (u.metric ? k : Calc.kmToMi(k))) + ' /' + u.d} value={Calc.fmtDuration(tt)} />
        })}
      </Section>
    </>}
  </>
}

function Burn({ p, u }) {
  const [met, setMet] = useState(4) // index into METS: running at 6 mph, SlipFit's default
  const [min, setMin] = useState(30)
  const [w, setW] = useState(p.w)
  const kg = u.toKg(w || 0)
  const ok = kg > 0 && min > 0
  return <>
    <div className="card">
      <div className="sect-b measure-select slip-select">
        <SelectRow title={t('Activity')} value={met} onChange={setMet} stackedValue
          options={Calc.METS.map(([l, m], i) => ({ value: i, label: t(l) + ' (' + nf(m, 1) + ' MET)' }))} />
      </div>
      <Grid>
        <Field label={t('Minutes')} value={min} onChange={setMin} />
        <Field label={t('Weight')} unit={u.w} value={w} onChange={setW} />
      </Grid>
    </div>
    {ok ? <Big value={nf(Calc.caloriesBurned(Calc.METS[met][1], kg, min)) + ' kcal'} label={t('Calories burned')}
      sub={t('MET × body weight × hours. Values from the Compendium of Physical Activities.')} />
      : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

function Ideal({ p, u }) {
  const [sex, setSex] = useState(p.sex)
  const [cm, setCm] = useState(p.cm)
  const r = Calc.idealWeights(sex, cm || 0)
  const wf = kg => nf(u.fromKg(kg)) + ' ' + u.w
  return <>
    <div className="card">
      <Label>{t('Sex')}</Label>
      <Segmented value={sex} onChange={setSex} options={SEX()} />
      <Grid><Height cm={cm} onChange={setCm} u={u} /></Grid>
    </div>
    {cm > 0 ? <Section footer={t('These are rough population formulas. Muscle, frame and age all move the right number; use them as a sanity check, not a target.')}>
      {[['Devine (1974)', r.devine], ['Robinson (1983)', r.robinson], ['Miller (1983)', r.miller], ['Hamwi (1964)', r.hamwi]].map(([l, v]) =>
        <Row key={l} title={l} value={wf(v)} />)}
      <Row title={<b>{t('Healthy BMI range')}</b>} value={nf(u.fromKg(r.bmiLow)) + '–' + nf(u.fromKg(r.bmiHigh)) + ' ' + u.w} />
    </Section> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

function Water({ p, u }) {
  const [w, setW] = useState(p.w)
  const [min, setMin] = useState(45)
  const kg = u.toKg(w || 0)
  const ml = Calc.waterMl(kg, min || 0)
  const glasses = Math.round(ml / 250)
  return <>
    <div className="card"><Grid>
      <Field label={t('Weight')} unit={u.w} value={w} onChange={setW} />
      <Field label={t('Exercise today (min)')} value={min} onChange={setMin} />
    </Grid></div>
    {kg > 0 ? <>
      <Big value={u.metric ? nf(ml / 1000, 1) + ' L' : nf(ml / 29.5735) + ' fl oz'} label={t('Daily water')}
        sub={t('≈ {0} glasses of 250 ml. Food provides some of this too.', glasses)} />
      <Button size="sm" icon="target" onClick={() => {
        update(s => setTargets(s, { water: glasses }))
        toast(t('Water target set to {0} glasses.', glasses))
      }}>{t('Use as my water target')}</Button>
    </> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

const PROTEIN_KINDS = [['sedentary', 'Sedentary / minimum'], ['general', 'Active, general fitness'], ['endurance', 'Endurance training'], ['muscle', 'Building muscle'], ['lose', 'Losing fat, keeping muscle']]

function Protein({ p, u }) {
  const [w, setW] = useState(p.w)
  // SlipFit started from its profile goal; a gym tracker's user is most often building muscle.
  const [kind, setKind] = useState('muscle')
  const kg = u.toKg(w || 0)
  const r = Calc.proteinRange(kg, kind)
  const mid = Math.round((r[0] + r[1]) / 2 / 5) * 5
  return <>
    <div className="card">
      <Grid><Field label={t('Weight')} unit={u.w} value={w} onChange={setW} /></Grid>
      <div className="sect-b measure-select slip-select">
        <SelectRow title={t('Goal')} value={kind} onChange={setKind} options={PROTEIN_KINDS.map(([v, l]) => ({ value: v, label: t(l) }))} />
      </div>
    </div>
    {kg > 0 ? <>
      <Big value={nf(r[0]) + '–' + nf(r[1]) + ' g'} label={t('Protein per day')}
        sub={t('{0} g per kg of bodyweight, spread over 3-5 meals.', Calc.PROTEIN_RANGES[kind].map(x => nf(x, 1)).join('–'))} />
      <Button size="sm" icon="target" onClick={() => {
        update(s => setTargets(s, { protein: mid }))
        toast(t('Protein target set to {0} g.', mid))
      }}>{t('Use {0} g as my protein target', mid)}</Button>
    </> : <Hint>{t('Check the numbers.')}</Hint>}
  </>
}

function WaistHeight({ p, u }) {
  const [cm, setCm] = useState(p.cm)
  const [waist, setWaist] = useState(p.waist)
  const r = waist > 0 && cm > 0 ? Calc.waistToHeight(u.toCm(waist), cm) : NaN
  return <>
    <div className="card"><Grid>
      <Height cm={cm} onChange={setCm} u={u} />
      <Field label={t('Waist (at navel)')} unit={u.l} value={waist} onChange={setWaist} />
    </Grid></div>
    {Number.isFinite(r)
      ? <Big value={nf(r, 2)} label={t(r < 0.4 ? 'Low' : r < 0.5 ? 'Healthy' : r < 0.6 ? 'Increased risk' : 'High risk')}
        sub={t('Keep your waist under half your height: under {0} {1}.', nf(u.fromCm(cm / 2)), u.l)} />
      : <Hint>{t('Enter your waist measurement.')}</Hint>}
  </>
}

const VIEWS = {
  calories: Calories, bmi: Bmi, bodyfat: BodyFat, onerm: OneRm, plates: Plates, hr: HeartRate,
  pace: Pace, burn: Burn, ideal: Ideal, water: Water, protein: Protein, whtr: WaistHeight,
}

/* ---------------------------------------------------------------- screen -- */

export default function Tools() {
  const nav = useNavigate()
  const { id } = useParams() || {}
  const S = useStore(s => s.S)
  const calc = CALCS.find(c => c.id === id)

  if (!calc) {
    return <div className="narrow slip-tools">
      <div className="hdr">
        <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
        <div style={{ flex: 1, marginInlineStart: 10 }}><h1>{t('Tools')}</h1><div className="sub">{t('Calculators pre-filled from your profile.')}</div></div>
      </div>
      <Section>
        {CALCS.map(c => <Row key={c.id} icon={c.icon} title={t(c.title)} subtitle={t(c.sub)} accessory="chevron"
          className="slip-calc" onClick={() => nav('/tools/' + c.id)} />)}
      </Section>
    </div>
  }

  const View = VIEWS[calc.id]
  const u = unitsOf(S)
  return <div className="narrow slip-tools" data-calc={calc.id}>
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/tools')} aria-label={t('Tools')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 10 }}><h1>{t(calc.title)}</h1><div className="sub">{t(calc.sub)}</div></div>
    </div>
    {/* keyed: moving from one calculator to another starts the next one from the profile again */}
    <View key={calc.id} S={S} p={prefill(S)} u={u} />
  </div>
}
