// Home's cards for the slippylabs fork's additions, carried over from SlipFit's Today screen:
// level and XP with the closest badges, today's check-ins against their targets, and goals.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { t } from '../../lib/i18n.js'
import { todayISO, fmtNum, fmtDate } from '../../lib/format.js'
import Icon from '../Icon.jsx'
import { Button } from '../ui.jsx'
import { tappable } from '../../lib/use-sheet-keyboard.js'
import { summary, totalXp, levelFor, nextBadges } from '../../lib/slip/game.js'
import { dailyOf, setDaily, targetsOf, goalsOf, checkinHits } from '../../lib/slip/state.js'
import { goalProgress } from '../../lib/slip/goals.js'
import { goalEditSheet, goalLabel, goalNow } from './slip-sheets.jsx'
import './slip-ui.css'

export function Bar({ frac, tone = '', thin = false }) {
  const pct = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100)
  return <div className={'slip-prog' + (tone ? ' ' + tone : '') + (thin ? ' thin' : '')} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: pct + '%' }} />
  </div>
}

/** Everything the level card and the achievements screen read, worked out once per change. */
export function useProgress() {
  const S = useStore(s => s.S)
  const today = todayISO()
  return useMemo(() => {
    const sum = summary(S, today)
    const xp = totalXp(S, today, sum.recs, sum.st)
    return { S, today, sum, xp, lvl: levelFor(xp.total), next: nextBadges(S, sum, 3) }
    // Workouts, weigh-ins, check-ins, goals, badges, targets: everything XP is made of.
  }, [S.workouts, S.bodyweight, S.daily, S.slipGoals, S.badges, S.slipProfile, S.slipRuns, S.unit, S.weekStart, today])
}

export function LevelCard() {
  const nav = useNavigate()
  const { sum, lvl, next } = useProgress()
  const st = sum.st
  return <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => nav('/achievements'))}>
    <div className="slip-level">
      <div className="lv" aria-label={t('Level {0}', lvl.level)}><div>{lvl.level}<small>{t('Level')}</small></div></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <strong>{t(lvl.title)}</strong>
          <span className="small muted">{t('{0} / {1} XP', fmtNum(lvl.into), fmtNum(lvl.need))}</span>
        </div>
        <Bar frac={lvl.into / lvl.need} />
        <div className="small muted" style={{ marginTop: 6 }}>
          {st.current > 0 ? t('Goal streak: {0} wk', st.current) : t('No goal streak yet')}
          {' · '}{t('weekly goal {0} of {1}', st.thisWeek, st.goal)}
          {st.best > st.current ? ' · ' + t('best {0}', st.best) : ''}
        </div>
      </div>
      <Icon name="chevronRight" className="chev" />
    </div>
    {next.length > 0 && <div className="slip-next">
      {next.map(b => <div className="nb" key={b.id}>
        <span className="ic" aria-hidden="true">{b.icon}</span>
        <div className="tx">
          <div className="row between small"><span style={{ fontWeight: 600 }}>{t(b.name)}</span><span className="muted">{Math.round(b.p * 100)}%</span></div>
          <Bar frac={b.p} thin />
        </div>
      </div>)}
    </div>}
  </div>
}

// [key, label, step buttons, unit shown, icon]
const CHECKINS = [
  ['water', 'Water', [-1, 1], 'glasses', '💧'],
  ['protein', 'Protein', [10, 25], 'g', '🥩'],
  ['sleep', 'Sleep', [-0.5, 0.5], 'h', '😴'],
  ['steps', 'Steps', [1000, 2500], '', '👟'],
]

export function CheckinCard() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = todayISO()
  const c = dailyOf(S, today), tg = targetsOf(S)
  const hits = checkinHits(S, today)
  const bump = (k, d) => update(s => { setDaily(s, today, { [k]: Math.max(0, Math.round(((dailyOf(s, today)[k] || 0) + d) * 10) / 10) }) })
  const reset = k => update(s => { setDaily(s, today, { [k]: 0 }) })
  return <div className="card">
    <div className="row between" style={{ marginBottom: 10 }}>
      <h2 style={{ margin: 0 }}>{t('Today\'s check-in')}</h2>
      <span className="small muted">{t('{0} of 4 targets', hits)}</span>
    </div>
    <div className="slip-checkins">
      {CHECKINS.map(([k, label, steps, unit, icon]) => {
        const v = c[k], target = tg[k], hit = target > 0 && v >= target
        return <div key={k} className={'slip-ci' + (hit ? ' hit' : '')}>
          <div className="t"><span>{icon} {t(label)}</span>{v > 0 && <button className="small dim" style={{ minHeight: 28 }} onClick={() => reset(k)} aria-label={t('Reset {0}', t(label))}><Icon name="reset" /></button>}</div>
          <div className="v">{fmtNum(v)} <small>/ {fmtNum(target)} {t(unit)}</small></div>
          <Bar frac={target ? v / target : 0} tone={hit ? 'good' : ''} thin />
          <div className="btns">
            {steps.map(d => <button key={d} onClick={() => bump(k, d)} aria-label={(d > 0 ? '+' : '') + d + ' ' + t(label)}>{d > 0 ? '+' : '−'}{fmtNum(Math.abs(d))}</button>)}
          </div>
        </div>
      })}
    </div>
  </div>
}

export function GoalsCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const goals = goalsOf(S)
  const open = goals.filter(g => !g.done), done = goals.filter(g => g.done)
  return <div className="card">
    <div className="row between" style={{ marginBottom: open.length ? 4 : 8 }}>
      <h2 style={{ margin: 0 }}>{t('Goals')}</h2>
      <Button size="sm" icon="plus" onClick={() => goalEditSheet()}>{t('Add')}</Button>
    </div>
    {!open.length && <div className="muted small">{done.length ? t('Every goal reached. Set the next one!') : t('Set a goal: a body weight, a lift, a run, a number of workouts, or anything you like.')}</div>}
    {open.map(g => {
      const p = goalProgress(S, g, today)
      return <div key={g.id} className="slip-goal" {...tappable(() => goalEditSheet(g))} style={{ cursor: 'pointer' }}>
        <div className="top">
          <strong>{goalLabel(S, g)}</strong>
          {p.onTrack === true ? <span className="slip-tag good">{t('On track')}</span> : p.onTrack === false ? <span className="slip-tag warn">{t('Behind')}</span> : null}
        </div>
        <Bar frac={p.frac} tone={p.onTrack === false ? 'warn' : ''} />
        <div className="small muted" style={{ marginTop: 5 }}>
          {g.type !== 'custom' ? t('Now {0}', goalNow(S, g, p.cur)) + ' · ' + Math.round(p.frac * 100) + '%' : t('Tap to mark it done')}
          {g.deadline ? ' · ' + t('by {0}', fmtDate(g.deadline)) : ''}
          {p.eta ? ' · ' + t('on pace for {0}', fmtDate(p.eta, false, true)) : ''}
        </div>
      </div>
    })}
    {done.length > 0 && <div className="small dim" style={{ marginTop: 8 }}>{t('Goals reached: {0}', done.length)}</div>}
  </div>
}
