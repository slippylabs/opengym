// Stats: how far the cardio has carried you, ported from SlipFit's distance tiles. Every number is
// derived from the minutes and speed of the logged rows (lib/slip/cardio.js), and reads in miles
// when the profile reads speed in mph, the same unit the set rows and labels use.
import { t } from '../../lib/i18n.js'
import { fmtDate, todayISO } from '../../lib/format.js'
import { speedUnitOf } from '../../lib/speed.js'
import { distanceSummary, fmtDist } from '../../lib/slip/cardio.js'

function Figure({ label, value, sub }) {
  return <div style={{ minWidth: 0 }}>
    <div className="small dim">{label}</div>
    <div className="distance-v" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em', marginTop: 3, lineHeight: 1.15 }}>{value}</div>
    {sub && <div className="small dim" style={{ marginTop: 2 }}>{sub}</div>}
  </div>
}

// `today` is a prop so a test can pin the month; the app passes nothing and gets the real day.
export default function DistanceCard({ S, today = todayISO() }) {
  const sum = distanceSummary(S, today)
  // A profile that never logged cardio has no distance to show, and an empty card of zeros
  // would only push the rest of Stats down.
  if (!sum.has) return null
  const unit = speedUnitOf(S)
  return <div className="card distance-card">
    <h2>{t('Distance')}</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 12 }}>
      <Figure label={t('All time')} value={fmtDist(sum.total, unit)} />
      <Figure label={t('This month')} value={fmtDist(sum.month, unit)} />
      {sum.longest && <Figure label={t('Longest run')} value={fmtDist(sum.longest.km, unit)} sub={fmtDate(sum.longest.d, true)} />}
    </div>
  </div>
}
