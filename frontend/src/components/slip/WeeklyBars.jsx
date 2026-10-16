// Stats: workouts per week for the last twelve weeks against the weekly goal, SlipFit's goal
// chart. Weeks start on the profile's day (S.weekStart, 0 Sunday or 1 Monday) and are counted by
// game.js weekCounts, the same counts the goal streaks are scored on, so the bars and the streak
// can never disagree about a week. Drawn like LineChart: a 340-wide viewBox that stretches, the
// goal as its dashed yellow line.
import { t, tn } from '../../lib/i18n.js'
import { fmtDate, todayISO, MONTHS } from '../../lib/format.js'
import { weekCounts, weekStartOfDay, addDays } from '../../lib/slip/game.js'
import { targetsOf } from '../../lib/slip/state.js'

const W = 340, H = 130
const P = { l: 8, r: 8, t: 14, b: 20 }

/** The last `n` weeks up to and including the one holding `today`, oldest first: [{ wk, n }]. */
export function weeklyBars(S, today, n = 12) {
  const ws = S?.weekStart === 0 ? 0 : 1
  const counts = weekCounts(S)
  const last = weekStartOfDay(today, ws)
  return Array.from({ length: n }, (_, i) => {
    const wk = addDays(last, -7 * (n - 1 - i))
    return { wk, n: counts[wk] || 0 }
  })
}

export default function WeeklyBars({ S, today = todayISO() }) {
  const weeks = weeklyBars(S, today)
  const goal = Math.max(1, Number(targetsOf(S).weeklyGoal) || 3)
  const top = Math.max(goal, ...weeks.map(w => w.n)) + 1
  const slot = (W - P.l - P.r) / weeks.length
  const barW = slot * 0.62
  const Y = v => P.t + (1 - v / top) * (H - P.t - P.b)
  const hits = weeks.filter(w => w.n >= goal).length
  const label = wk => { const p = wk.split('-'); return Number(p[2]) + ' ' + t(MONTHS[Number(p[1]) - 1]) }
  return <div className="card weekly-bars">
    <div className="row between" style={{ marginBottom: 12, alignItems: 'baseline' }}>
      <h2 style={{ margin: 0 }}>{t('Workouts per week')}</h2>
      <span className="small dim">{t('Goal hit {0} of {1} weeks', hits, weeks.length)}</span>
    </div>
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}
        role="img" aria-label={t('Workouts per week for the last {0} weeks, goal {1} a week', weeks.length, goal)}>
        {weeks.map((w, i) => {
          const x = P.l + i * slot + (slot - barW) / 2
          const y = Y(w.n)
          const hit = w.n >= goal
          return <g key={w.wk} data-week={w.wk} data-count={w.n}>
            <title>{t('Week of {0}', fmtDate(w.wk, true)) + ': ' + tn('{0} workout', '{0} workouts', w.n)}</title>
            {/* An empty week keeps a sliver, so a gap reads as a week with nothing, not a missing bar. */}
            <rect x={x} y={w.n ? y : H - P.b - 2} width={barW} height={w.n ? H - P.b - y : 2} rx="3"
              fill={hit ? 'var(--acc)' : 'color-mix(in srgb, var(--acc) 40%, var(--surface-2))'} />
            {w.n > 0 && <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9.5" fill="var(--label-2)">{w.n}</text>}
            {/* Every fourth week is named, from the newest back, so the current week always is. */}
            {(weeks.length - 1 - i) % 4 === 0 && <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--label-2)">{label(w.wk)}</text>}
          </g>
        })}
        <line className="goal-line" x1={P.l} y1={Y(goal)} x2={W - P.r} y2={Y(goal)} stroke="var(--yellow)" strokeWidth="1.6" strokeDasharray="7 4" />
        <text x={W - P.r - 2} y={Y(goal) - 4} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--yellow)">{goal}</text>
      </svg>
    </div>
  </div>
}
