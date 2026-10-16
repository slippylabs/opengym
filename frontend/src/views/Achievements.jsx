// Level, XP and the 46 achievements carried over from SlipFit (lib/slip/game.js). Everything is
// derived from the log; only the day each badge was first earned is stored.
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { fmtNum, fmtDate } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { BADGES, XP, TITLES } from '../lib/slip/game.js'
import { badgesOf } from '../lib/slip/state.js'
import { Bar, useProgress } from '../components/slip/SlipCards.jsx'
import '../components/slip/slip-ui.css'

const PART_LABEL = {
  workouts: 'Workouts', prs: 'Personal records', checkins: 'Check-in targets hit', weighIns: 'Weigh-ins',
  weeks: 'Weekly goals hit', goals: 'Goals reached', badges: 'Achievements',
}

export default function Achievements() {
  const nav = useNavigate()
  const { S, sum, xp, lvl } = useProgress()
  const have = badgesOf(S)
  const earned = BADGES.filter(b => have[b[0]]).length
  const nextTitle = TITLES.find(([L]) => L > lvl.level)
  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 8 }}><h1 style={{ margin: 0 }}>{t('Achievements')}</h1>
        <div className="sub">{t('{0} of {1} unlocked', earned, BADGES.length)}</div></div>
    </div>

    <div className="card">
      <div className="slip-level">
        <div className="lv"><div>{lvl.level}<small>{t('Level')}</small></div></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <strong>{t(lvl.title)}</strong><span className="small muted">{fmtNum(xp.total)} XP</span>
          </div>
          <Bar frac={lvl.into / lvl.need} />
          <div className="small muted" style={{ marginTop: 6 }}>
            {t('{0} XP to level {1}', fmtNum(lvl.need - lvl.into), lvl.level + 1)}
            {nextTitle ? ' · ' + t('“{0}” at level {1}', t(nextTitle[1]), nextTitle[0]) : ''}
          </div>
        </div>
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {Object.entries(xp.parts).map(([k, v]) => <div key={k} className="row between small" style={{ padding: '6px 2px', borderBottom: 'var(--hair) solid var(--sep)' }}>
          <span className="muted">{t(PART_LABEL[k])}</span><span style={{ fontWeight: 600 }}>{fmtNum(v)}</span>
        </div>)}
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('XP: {0} per workout plus {1} per set, {2} per cardio minute, {3} per PR, {4} per check-in target or weigh-in day, {5}+ per week you hit your goal, {6} per goal, {7} per achievement.',
          XP.workout, XP.set, XP.cardioMin, XP.pr, XP.checkin, XP.weekHit, XP.goal, XP.badge)}
      </div>
    </div>

    <div className="tiles">
      <div className="tile"><div className="l">{t('Goal streak')}</div><div className="v">{t('{0} wk', sum.st.current)}</div></div>
      <div className="tile"><div className="l">{t('Best streak')}</div><div className="v">{t('{0} wk', sum.st.best)}</div></div>
      <div className="tile"><div className="l">{t('Personal records')}</div><div className="v">{fmtNum(sum.prs)}</div></div>
      <div className="tile"><div className="l">{t('Exercises tried')}</div><div className="v">{fmtNum(sum.exercises)}</div></div>
    </div>

    <div className="slip-badges">
      {BADGES.map(([id, icon, name, desc]) => {
        const d = have[id]
        return <div key={id} className={'slip-badge' + (d ? '' : ' locked')} title={t(desc)}>
          <div className="ic" aria-hidden="true">{icon}</div>
          <div className="nm">{t(name)}</div>
          <div className="ds">{d ? fmtDate(d, false, true) : t(desc)}</div>
        </div>
      })}
    </div>
    <div style={{ height: 16 }} />
  </div>
}
