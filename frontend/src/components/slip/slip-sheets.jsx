// Sheets for the slippylabs fork's additions: the body-and-targets profile (and its first-run
// setup), a goal, a badge celebration and the fork's release notes.
import { useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { fmtNum, fmtDate, todayISO, exerciseNameText } from '../../lib/format.js'
import { EXIDX, allExercises } from '../../lib/exercises.js'
import { Button, Segmented, Row, SelectRow, NumberField, TextField } from '../ui.jsx'
import Stepper from '../Stepper.jsx'
import { exercisePicker } from '../../sheets.jsx'
import { bodyOf, targetsOf, setBody, setTargets, setSetupDone, saveGoal, removeGoal } from '../../lib/slip/state.js'
import { goalCurrent, toKg, fromKg } from '../../lib/slip/goals.js'
import { records, BADGE } from '../../lib/slip/game.js'
import { KM_PER_MI } from '../../lib/slip/cardio.js'
import { SLIP_CHANGELOG } from '../../lib/slip/meta.js'
import './slip-ui.css'

const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)

// SlipFit's activity factors for the calorie calculator.
export const ACTIVITY = [
  [1.2, 'Sedentary (desk job, little exercise)'],
  [1.375, 'Light (exercise 1-3 days a week)'],
  [1.55, 'Moderate (exercise 3-5 days a week)'],
  [1.725, 'Very active (hard exercise 6-7 days)'],
  [1.9, 'Athlete (twice a day or physical job)'],
]

export const DISCLAIMER = 'openGym is a training log and planner, not medical advice. Talk to a doctor before starting if you have a health condition, an injury, are pregnant, or have not exercised in a long time. Stop if something hurts.'

/* ============================ body & targets ============================ */

function ProfileSheet({ close, setup, onSaved }) {
  const S = useStore(s => s.S)
  const imperial = S.unit === 'lb'
  const [b, setB] = useState(bodyOf(S))
  const [tg, setTg] = useState(targetsOf(S))
  const heightShown = imperial ? Math.round(b.heightCm / 2.54) : Math.round(b.heightCm)
  const save = () => {
    update(s => { setBody(s, b); setTargets(s, tg); if (setup) setSetupDone(s, true) })
    close()
    toast(t('Saved'))
    if (onSaved) onSaved()
  }
  return <>
    <h3>{setup ? t('About you') : t('Body & targets')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {setup ? t('A few facts for the calculators and your daily targets. You can change them any time in Settings.')
        : t('Used by the calculators, the daily check-ins and the weekly streak.')}
    </div>
    <div className="list menu-list">
      <Row title={t('Sex')}><Segmented className="seg-inline" value={b.sex} onChange={v => setB({ ...b, sex: v })}
        options={[{ value: 'm', label: t('Male') }, { value: 'f', label: t('Female') }]} /></Row>
      <Row title={t('Year of birth')}><Stepper value={b.birthYear} min={1920} max={new Date().getFullYear() - 10} decimal={false}
        onChange={v => setB({ ...b, birthYear: v })} ariaLabel={t('Year of birth')} /></Row>
      <Row title={imperial ? t('Height (in)') : t('Height (cm)')}><Stepper value={heightShown} min={imperial ? 36 : 90} max={imperial ? 96 : 245} decimal={false}
        onChange={v => setB({ ...b, heightCm: imperial ? v * 2.54 : v })} ariaLabel={t('Height')} /></Row>
      <SelectRow title={t('Activity')} value={b.activity} onChange={v => setB({ ...b, activity: v })} stackedValue
        options={ACTIVITY.map(([v, label]) => ({ value: v, label: t(label) }))} />
    </div>
    <h4 className="sec">{t('Targets')}</h4>
    <div className="list menu-list">
      <Row title={t('Workouts per week')} subtitle={t('Hit it to keep your streak going.')}><Stepper value={tg.weeklyGoal} min={1} max={7} decimal={false}
        onChange={v => setTg({ ...tg, weeklyGoal: v })} ariaLabel={t('Workouts per week')} /></Row>
      <Row title={t('Water (glasses of 250 ml)')}><Stepper value={tg.water} min={1} max={30} decimal={false} onChange={v => setTg({ ...tg, water: v })} ariaLabel={t('Water')} /></Row>
      <Row title={t('Protein (g)')}><Stepper value={tg.protein} min={20} max={400} step={5} decimal={false} onChange={v => setTg({ ...tg, protein: v })} ariaLabel={t('Protein')} /></Row>
      <Row title={t('Sleep (hours)')}><Stepper value={tg.sleep} min={4} max={12} step={0.5} onChange={v => setTg({ ...tg, sleep: v })} ariaLabel={t('Sleep')} /></Row>
      <Row title={t('Steps')}><Stepper value={tg.steps} min={1000} max={40000} step={500} decimal={false} onChange={v => setTg({ ...tg, steps: v })} ariaLabel={t('Steps')} /></Row>
    </div>
    {setup && <div className="small dim" style={{ margin: '12px 2px 0' }}>{t(DISCLAIMER)}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{setup ? t('Continue') : t('Save')}</Button>
  </>
}
export const profileSheet = (opts = {}) => ui().openSheet(close => <ProfileSheet close={close} {...opts} />)

/* ============================ goals ============================ */

const GOAL_KINDS = [
  { value: 'weight', label: 'Weight' }, { value: 'lift', label: 'Lift' }, { value: 'run', label: 'Run' },
  { value: 'workouts', label: 'Workouts' }, { value: 'custom', label: 'Other' },
]

/** A goal's one-line name, in the profile's units. */
export function goalLabel(S, g) {
  const lb = S.unit === 'lb', mi = S.unit === 'lb'
  const w = kg => fmtNum(fromKg(kg, S.unit)) + ' ' + (lb ? 'lb' : 'kg')
  const d = km => fmtNum(mi ? km / KM_PER_MI : km) + ' ' + (mi ? 'mi' : 'km')
  if (g.type === 'weight') return t('Reach {0} body weight', w(g.target))
  if (g.type === 'lift') {
    const ex = EXIDX[g.exId] || allExercises(S).find(e => e.id === g.exId)
    return t('{0}: {1} (est. 1RM)', ex ? exerciseNameText(ex) : t('Exercise'), w(g.target))
  }
  if (g.type === 'run') return t('Run {0} in one go', d(g.target))
  if (g.type === 'workouts') return t('{0} workouts', g.target)
  return g.title || t('Goal')
}

/** What a goal's current value reads as. */
export function goalNow(S, g, cur) {
  if (g.type === 'weight' || g.type === 'lift') return fmtNum(fromKg(cur, S.unit)) + ' ' + (S.unit === 'lb' ? 'lb' : 'kg')
  if (g.type === 'run') return fmtNum(S.unit === 'lb' ? cur / KM_PER_MI : cur) + ' ' + (S.unit === 'lb' ? 'mi' : 'km')
  if (g.type === 'workouts') return String(cur)
  return ''
}

function GoalSheet({ close, goal }) {
  const S = useStore(s => s.S)
  const editing = !!goal
  const [type, setType] = useState(goal?.type || 'weight')
  const [exId, setExId] = useState(goal?.exId || '0025')
  const [title, setTitle] = useState(goal?.title || '')
  const [deadline, setDeadline] = useState(goal?.deadline || '')
  const shownTarget = g => (g.type === 'weight' || g.type === 'lift' ? fromKg(g.target, S.unit) : g.type === 'run' && S.unit === 'lb' ? g.target / KM_PER_MI : g.target)
  const [target, setTarget] = useState(goal && goal.type !== 'custom' ? Math.round(shownTarget(goal) * 10) / 10 : null)
  const unitW = S.unit === 'lb' ? 'lb' : 'kg', unitD = S.unit === 'lb' ? 'mi' : 'km'
  const ex = EXIDX[exId] || allExercises(S).find(e => e.id === exId)
  const bestNow = records(S).best[exId]?.e1rm?.v

  const pickExercise = () => {
    const p = exercisePicker(e => { setExId(e.id); p.close() }, { title: t('Lift') })
  }
  const save = () => {
    const today = todayISO()
    const g = { ...(goal || {}), type }
    if (type === 'custom') {
      if (!title.trim()) { toast(t('Describe the goal')); return }
      g.title = title.trim().slice(0, 80)
    } else {
      const v = Number(target)
      if (!(v > 0)) { toast(t('Enter a target')); return }
      g.target = type === 'weight' || type === 'lift' ? toKg(v, S.unit) : type === 'run' ? (S.unit === 'lb' ? v * KM_PER_MI : v) : Math.round(v)
    }
    if (type === 'lift') g.exId = exId
    g.deadline = deadline || null
    if (!editing) {
      g.from = today
      g.start = goalCurrent(S, g)
    }
    update(s => { saveGoal(s, g) })
    close()
    toast(editing ? t('Goal updated') : t('Goal set. Go get it!'))
  }
  return <>
    <h3>{editing ? t('Edit goal') : t('New goal')}</h3>
    {!editing && <Segmented value={type} onChange={v => { setType(v); setTarget(null) }}
      options={GOAL_KINDS.map(k => ({ value: k.value, label: t(k.label) }))} />}
    <div style={{ height: 12 }} />
    {type === 'weight' && <div className="slip-field"><label>{t('Target body weight ({0})', unitW)}</label>
      <NumberField className="field" value={target ?? ''} onChange={setTarget} placeholder={t('e.g. 75')} /></div>}
    {type === 'lift' && <>
      <div className="list menu-list" style={{ marginBottom: 12 }}>
        <Row title={t('Exercise')} value={ex ? exerciseNameText(ex) : '–'} accessory="chevron" onClick={pickExercise} />
      </div>
      <div className="slip-field"><label>{t('Target one-rep max ({0})', unitW)}</label>
        <NumberField className="field" value={target ?? ''} onChange={setTarget} placeholder={bestNow ? t('Now about {0}', fmtNum(bestNow)) : ''} />
        <div className="small dim">{t('Estimated from your sets, so you never have to max out to hit it.')}</div></div>
    </>}
    {type === 'run' && <div className="slip-field"><label>{t('Distance in one run ({0})', unitD)}</label>
      <NumberField className="field" value={target ?? ''} onChange={setTarget} placeholder={S.unit === 'lb' ? '3.1' : '5'} /></div>}
    {type === 'workouts' && <div className="slip-field"><label>{t('Number of workouts')}</label>
      <NumberField className="field" decimal={false} value={target ?? ''} onChange={setTarget} placeholder="20" /></div>}
    {type === 'custom' && <div className="slip-field"><label>{t('Your goal')}</label>
      <TextField className="field" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. Do a full pull-up')} /></div>}
    <div className="slip-field"><label>{t('Deadline (optional)')}</label>
      <input className="field" type="date" value={deadline} min={todayISO()} onChange={e => setDeadline(e.target.value)} /></div>
    <Button variant="primary" onClick={save}>{editing ? t('Save') : t('Set goal')}</Button>
    {editing && goal.type === 'custom' && !goal.done && <><div style={{ height: 8 }} />
      <Button icon="checkCircle" onClick={() => { update(s => { saveGoal(s, { ...goal, checked: true }) }); close() }}>{t('Mark done')}</Button></>}
    {editing && <><div style={{ height: 8 }} />
      <Button variant="danger" onClick={() => { update(s => { removeGoal(s, goal.id) }); close(); toast(t('Goal removed')) }}>{t('Delete goal')}</Button></>}
  </>
}
export const goalEditSheet = goal => ui().openSheet(close => <GoalSheet close={close} goal={goal} />)

/* ============================ celebrations ============================ */

function BadgeCelebration({ ids, goals, close }) {
  const S = useStore(s => s.S)
  const badges = ids.map(id => BADGE[id]).filter(Boolean)
  const first = badges[0]
  return <div className="slip-celebrate">
    {first ? <>
      <div className="ic" aria-hidden="true">{first.icon}</div>
      <h3 style={{ marginTop: 6 }}>{badges.length > 1 ? t('{0} new achievements!', badges.length) : t('Achievement unlocked!')}</h3>
      {badges.map(b => <div key={b.id} style={{ margin: '8px 0' }}><strong>{b.icon} {t(b.name)}</strong><div className="small muted">{t(b.desc)}</div></div>)}
    </> : <div className="ic" aria-hidden="true">🏁</div>}
    {goals.map(g => <div key={g.id} style={{ margin: '8px 0' }}><strong>✅ {t('Goal reached')}</strong><div className="small muted">{goalLabel(S, g)}</div></div>)}
    <div style={{ height: 10 }} />
    <Button variant="primary" onClick={close}>{t('Nice!')}</Button>
  </div>
}
export const celebrateSheet = (ids, goals = []) => ui().openSheet(close => <BadgeCelebration ids={ids} goals={goals} close={close} />, { kind: 'center' })

/* ============================ what's new ============================ */

function WhatsNew({ close }) {
  return <>
    <h3>{t('What\'s new')}</h3>
    {SLIP_CHANGELOG.map(e => <div key={e.v} style={{ marginBottom: 12 }}>
      <div className="small muted" style={{ marginBottom: 6 }}>v{e.v} · {fmtDate(e.d, false, true)}</div>
      <ul className="slip-notes small" style={{ paddingInlineStart: 18, margin: 0 }}>{e.items.map((x, i) => <li key={i}>{t(x)}</li>)}</ul>
    </div>)}
    <Button variant="primary" onClick={close}>{t('Close')}</Button>
  </>
}
export const whatsNewSheet = () => ui().openSheet(close => <WhatsNew close={close} />)
