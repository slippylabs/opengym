// Stats: every exercise's personal bests, SlipFit's PR board, read from game.js records() so the
// board, the PR events and the XP all score the same sets. Grouped by what an exercise is scored
// on (loaded lifts, bodyweight, holds, cardio), most recently improved first within a group, so
// what you are training now sits on top. A row opens the exercise's history sheet.
import { useMemo, useState } from 'react'
import Icon from '../Icon.jsx'
import { Button } from '../ui.jsx'
import { t } from '../../lib/i18n.js'
import { EXIDX } from '../../lib/exercises.js'
import { fmtNum, fmtDate, exerciseNameText } from '../../lib/format.js'
import { fmtSec } from '../../lib/history.js'
import { speedUnitOf } from '../../lib/speed.js'
import { records, PR_LABELS } from '../../lib/slip/game.js'
import { fmtDist } from '../../lib/slip/cardio.js'
import { exerciseHistorySheet } from '../../sheets.jsx'

// The kinds in the order they read on a row; the first kind present decides the group, since
// game.js entryKinds scores an exercise on exactly one family.
export const PR_GROUPS = [
  { key: 'lift', title: 'Lifts', kinds: ['e1rm', 'w', 'vol'] },
  { key: 'bw', title: 'Bodyweight', kinds: ['r', 'wadd'] },
  { key: 'hold', title: 'Holds', kinds: ['sec'] },
  { key: 'cardio', title: 'Cardio', kinds: ['km', 'min'] },
]

// How many rows a group shows before "Show all": the board sits in the middle of Stats.
const FOLD = 5

/**
 * records(S).best as groups of rows: [{ key, title, rows: [{ id, last, items: [{ kind, v, d }] }] }].
 * `last` is the newest of the row's record days, which orders the group (ties by id, so the order
 * is stable). Empty groups are left out.
 */
export function prBoard(best) {
  const groups = PR_GROUPS.map(g => ({ key: g.key, title: g.title, rows: [] }))
  for (const [id, kinds] of Object.entries(best || {})) {
    const gi = PR_GROUPS.findIndex(g => g.kinds.some(k => kinds[k]))
    if (gi < 0) continue
    const items = PR_GROUPS[gi].kinds.filter(k => kinds[k]?.v > 0).map(k => ({ kind: k, v: kinds[k].v, d: kinds[k].d }))
    if (!items.length) continue
    const last = items.reduce((m, x) => (x.d > m ? x.d : m), '')
    groups[gi].rows.push({ id, last, items })
  }
  for (const g of groups) g.rows.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return groups.filter(g => g.rows.length)
}

// "Best set" on a row of weights would read as one set's weight; the number is weight × reps.
const kindLabel = k => (k === 'vol' ? t('Best set volume') : t(PR_LABELS[k]))

export function fmtRecord(kind, v, S) {
  switch (kind) {
    case 'e1rm': case 'w': case 'vol': return fmtNum(v) + ' ' + S.unit
    case 'wadd': return '+' + fmtNum(v) + ' ' + S.unit
    // The plain 'reps' the charts use: a plural key would need forms in every pack.
    case 'r': return fmtNum(v) + ' ' + t('reps')
    case 'sec': return fmtSec(v)
    case 'km': return fmtDist(v, speedUnitOf(S))
    case 'min': return t('{0} min', fmtNum(v))
  }
  return fmtNum(v)
}

// A custom exercise is in EXIDX too (registerCustom); one deleted since keeps its stored name.
const nameOf = (id, S) => {
  if (EXIDX[id]) return exerciseNameText(EXIDX[id])
  const c = (S.customEx || []).find(x => x.id === id)
  return c?.n || t('Unknown exercise')
}

export default function PrBoard({ S }) {
  const [all, setAll] = useState(false)
  const groups = useMemo(() => prBoard(records(S).best), [S.workouts])
  if (!groups.length) return null
  const folded = groups.some(g => g.rows.length > FOLD)
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  return <div className="card pr-board">
    <h2>{t('Personal records')}</h2>
    {groups.map(g => <div key={g.key} className="pr-group" style={{ marginTop: 8 }}>
      <div className="small dim" style={{ margin: '0 0 4px' }}>{t(g.title)}</div>
      <div className="sect-b" style={{ background: 'var(--surface-2)' }}>
        {(all ? g.rows : g.rows.slice(0, FOLD)).map(r => (
          <button type="button" key={r.id} className="lrow tap pr-row" onClick={() => exerciseHistorySheet(r.id)}>
            <span className="lrow-m">
              <span className="lrow-t" style={{ fontSize: 15 }}>{nameOf(r.id, S)}</span>
              <span className="lrow-s">{r.items.map((x, i) => <span key={x.kind} style={{ display: 'inline-block', marginInlineEnd: 10 }}>
                {kindLabel(x.kind)} <b style={{ color: 'var(--label)', fontWeight: 600 }}>{fmtRecord(x.kind, x.v, S)}</b>
                {' '}<time dateTime={x.d} className="dim">{fmtDate(x.d, true)}</time>
              </span>)}</span>
            </span>
            <Icon name="chevronRight" className="lrow-c" />
          </button>
        ))}
      </div>
    </div>)}
    {folded && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
      <Button size="sm" variant="ghost" trailingIcon={all ? 'chevronUp' : 'chevronDown'} onClick={() => setAll(!all)}>
        {all ? t('Show fewer') : t('Show all {0}', total)}
      </Button>
    </div>}
  </div>
}
