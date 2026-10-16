// SlipFit's plans in openGym: the "More plans" group of the starter-plan chooser, the plan
// generator ("Build a plan for me") and the preview both open before anything is applied.
// Every plan goes through sheets.jsx applyPlan, the path openGym's own starter plans take, so
// reloading one reuses its routines and a taken weekday is asked about the same way.
//
// Plan and routine names stay the plain English SlipFit gave them: they become ordinary user
// routines, which are not translated (lib/starter.js).
import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { EXIDX } from '../../lib/exercises.js'
import { setsRepsOf } from '../../lib/history.js'
import { DAYN, todayISO } from '../../lib/format.js'
import { t, exerciseNameFor } from '../../lib/i18n.js'
import { applyPlan, confirmPlanDays } from '../../sheets.jsx'
import { generate, library, toOpenGym, MORE_PLAN_KEYS, GOALS, MINUTES, EQUIPS, EXPERIENCE } from '../../lib/slip/programs.js'
import { runsOf, saveRun } from '../../lib/slip/state.js'
import { PROGRAM } from '../../lib/slip/c25k.js'
import { slipExercise } from '../../lib/slip/exercise-map.js'
import { Button, Section, Row } from '../ui.jsx'

const ui = () => useUI.getState()

// The one-line blurb for each built-in, as t() literals so check-source-strings sees them
// (the plan objects carry SlipFit's English copy, which would stay English everywhere).
const MORE_COPY = {
  'beginner-full': () => t('The best place to start in a gym.'),
  'strength-basics': () => t('Squat, press and pull heavy, three times a week.'),
  'fat-loss': () => t('Keep the muscle, lose the fat.'),
  'home-db': () => t('Dumbbells, bands and your bodyweight.'),
  bodyweight: () => t('No equipment, no excuses; 30 minutes.'),
  c25k: () => t('Nine weeks from walking to running 5 km without stopping.'),
  'run-builder': () => t('Easy miles, one quality session and a long run each week.'),
  mobility: () => t('Short sessions for stiff hips, shoulders and backs.'),
}
const MORE_ICON = { c25k: 'figureRun', 'run-builder': 'figureRun', mobility: 'stretch', bodyweight: 'figureStrength', 'home-db': 'dumbbell', 'fat-loss': 'flame', 'strength-basics': 'barbell', 'beginner-full': 'figureStrength' }

const GOAL_LABEL = { muscle: () => t('Build Muscle'), strength: () => t('Get Stronger'), lose: () => t('Lose Fat'), general: () => t('General Fitness'), run: () => t('Run') }
const EQUIP_LABEL = { gym: () => t('Gym'), home: () => t('Home'), bodyweight: () => t('Bodyweight') }
const EXPERIENCE_LABEL = { beginner: () => t('Beginner'), intermediate: () => t('Intermediate'), advanced: () => t('Advanced') }

const perWeekLine = plan => plan.mode === 'sequence'
  ? t('{0} days per week', plan.perWeek) + ' · ' + t('{0} sessions', plan.days.filter(d => d.name !== 'Runner Strength').length)
  : t('{0} days per week', plan.perWeek)

/**
 * Applies a SlipFit plan through the starter plans' path. Couch to 5K also starts its run record
 * (lib/slip/c25k.js) in the same update: unless a run already in progress uses that very routine
 * (loading the plan again keeps your place), a new run starts today and any other unfinished
 * one is retired, so Home never shows two programs at once.
 */
export function applySlipPlan(plan) {
  const og = toOpenGym(plan)
  const days = [...new Set(og.schedule.map(s => s.day))].sort((a, b) => a - b)
  confirmPlanDays(days, plan.name, () => {
    applyPlan(og, (st, idOf) => {
      if (og.program !== PROGRAM) return
      const routineId = idOf[og.runRoutineId]
      const live = runsOf(st).filter(r => r.program === PROGRAM && !r.finished)
      if (live.some(r => r.routineId === routineId)) return
      live.forEach(r => saveRun(st, { id: r.id, gone: true }))
      saveRun(st, { program: PROGRAM, routineId, start: todayISO() })
    })
    ui().toast(t('{0} loaded', plan.name))
  })
}

// What the plan becomes in openGym, routine by routine: the weekday(s) it lands on, then each
// exercise as the routine editor would summarise it. Read off toOpenGym, not the SlipFit plan,
// so the preview cannot promise an exercise the conversion drops.
export function PlanPreview({ plan }) {
  const og = useMemo(() => toOpenGym(plan), [plan])
  const daysOf = id => og.schedule.filter(s => s.routineId === id).map(s => t(DAYN[s.day]))
  const dropped = og.skipped.map(id => slipExercise(id)?.name || id)
  return <div className="slip-plan-preview">
    {plan.desc && <div className="small muted" style={{ margin: '0 0 10px', lineHeight: 1.45 }}>{plan.desc}</div>}
    {og.routines.map(r => <Section key={r.id} title={r.name + (daysOf(r.id).length ? ' · ' + daysOf(r.id).join(', ') : ' · ' + t('not on the weekly plan'))}>
      {r.ex.map((e, i) => <Row key={i} title={EXIDX[e.id] ? exerciseNameFor(EXIDX[e.id]) : e.id} value={setsRepsOf(e)} subtitle={e.note} />)}
    </Section>)}
    {og.program === PROGRAM && <div className="small dim" style={{ margin: '0 0 10px' }}>
      {t('Home shows the run to do next and moves the routine on after every run you log, 27 runs in all.')}
    </div>}
    {og.unscheduled.length > 0 && <div className="small dim" style={{ margin: '0 0 10px' }}>
      {t('A weekly plan has no room for {0}: it is added as a routine to start whenever you like.', og.unscheduled.join(', '))}
    </div>}
    {dropped.length > 0 && <div className="small dim" style={{ margin: '0 0 10px' }}>
      {t('Not in the exercise library, so left out: {0}.', dropped.join(', '))}
    </div>}
  </div>
}

function PlanPreviewSheet({ plan, close }) {
  return <>
    <h3>{plan.name}</h3>
    <PlanPreview plan={plan} />
    <Button variant="primary" icon="clipboard" onClick={() => { close(); applySlipPlan(plan) }}>{t('Load plan')}</Button>
  </>
}

export const planPreviewSheet = plan => ui().openSheet(close => <PlanPreviewSheet plan={plan} close={close} />)

// One row of chips: the generator's choices, the way the starter chooser offers equipment.
function Chips({ label, options, value, onChange, labelOf }) {
  return <div className="chips" style={{ margin: '0 0 8px', flexWrap: 'wrap' }} role="group" aria-label={label}>
    <div className="small dim" style={{ width: '100%' }}>{label}</div>
    {options.map(o => <button key={o} type="button" className={'chip nocap' + (o === value ? ' on' : '')} aria-pressed={o === value} onClick={() => onChange(o)}>{labelOf(o)}</button>)}
  </div>
}

function PlanGenerator({ close }) {
  const [opts, setOpts] = useState({ goal: 'general', days: 3, minutes: 45, equip: 'gym', experience: 'beginner' })
  const set = k => v => setOpts(o => ({ ...o, [k]: v }))
  const plan = useMemo(() => generate(opts), [opts])
  return <>
    <h3>{t('Build a plan for me')}</h3>
    <Chips label={t('Goal')} options={GOALS} value={opts.goal} onChange={set('goal')} labelOf={g => GOAL_LABEL[g]()} />
    <Chips label={t('Days per week')} options={[1, 2, 3, 4, 5, 6, 7]} value={opts.days} onChange={set('days')} labelOf={String} />
    <Chips label={t('Minutes per session')} options={MINUTES} value={opts.minutes} onChange={set('minutes')} labelOf={String} />
    <Chips label={t('Equipment')} options={EQUIPS} value={opts.equip} onChange={set('equip')} labelOf={e => EQUIP_LABEL[e]()} />
    <Chips label={t('Experience')} options={EXPERIENCE} value={opts.experience} onChange={set('experience')} labelOf={e => EXPERIENCE_LABEL[e]()} />
    <h3 style={{ marginTop: 14 }}>{plan.name}</h3>
    <PlanPreview plan={plan} />
    <Button variant="primary" icon="clipboard" onClick={() => { close(); applySlipPlan(plan) }}>{t('Use this plan')}</Button>
  </>
}

export const planGeneratorSheet = () => ui().openSheet(close => <PlanGenerator close={close} />)

/** The starter chooser's second group: SlipFit's built-ins and the generator. */
export function MorePlans({ close }) {
  // Built once per open: generating the library is cheap, but not free on every render.
  const plans = useMemo(() => {
    const lib = library()
    return MORE_PLAN_KEYS.map(k => lib.find(p => p.key === k))
  }, [])
  const open = sheet => { close(); sheet() }
  // Re-render when a run starts or ends, so Couch to 5K can say it is under way.
  const live = useStore(s => runsOf(s.S).some(r => r.program === PROGRAM && !r.finished))
  return <Section title={t('More plans')} className="slip-more-plans">
    <Row icon="sparkles" title={t('Build a plan for me')} subtitle={t('Pick a goal, days, time and equipment.')} accessory="chevron" onClick={() => open(planGeneratorSheet)} />
    {plans.map(p => <Row key={p.key} icon={MORE_ICON[p.key]} title={p.name}
      subtitle={perWeekLine(p) + ' · ' + MORE_COPY[p.key]() + (p.key === 'c25k' && live ? ' · ' + t('In progress') : '')}
      accessory="chevron" onClick={() => open(() => planPreviewSheet(p))} />)}
  </Section>
}
