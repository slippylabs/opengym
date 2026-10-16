import { describe, expect, it } from 'vitest'
import { SESSIONS, TOTAL, sessionOf, progressOf, noteOf } from './c25k.js'
import { c25k } from './programs.js'

const run = { id: 'r1', program: 'c25k', routineId: 'c', start: '2026-10-01' }
const w = (d, routineIds, extra = {}) => ({ id: d + routineIds.join(), d, routineIds, ...extra })

describe('sessions', () => {
  it('are the 27 runs of the nine-week schedule, 3 a week, ending at 30 minutes of running', () => {
    expect(SESSIONS).toHaveLength(27)
    expect(TOTAL).toBe(27)
    expect(SESSIONS[0]).toEqual(['Run 60 s, walk 90 s. Repeat 8 times.', 30])
    expect(SESSIONS[14]).toEqual(['Run 20 minutes without stopping.', 30])
    expect(SESSIONS[26]).toEqual(['Run 30 minutes, or 5 km. You did it.', 40])
    for (const [text, min] of SESSIONS) { expect(text).toMatch(/^(Run|Twice)/); expect(min).toBeGreaterThanOrEqual(28) }
  })

  it('name their week and run, and clamp out-of-range indexes', () => {
    expect(sessionOf(0)).toMatchObject({ index: 0, week: 1, run: 1, name: 'Week 1 · Run 1', min: 30 })
    expect(sessionOf(7)).toMatchObject({ week: 3, run: 2, name: 'Week 3 · Run 2', min: 28 })
    expect(sessionOf(26)).toMatchObject({ week: 9, run: 3 })
    expect(sessionOf(99).index).toBe(26)
    expect(sessionOf(-3).index).toBe(0)
    expect(sessionOf('x').index).toBe(0)
  })

  it('carry the same note the SlipFit plan writes', () => {
    const plan = c25k()
    plan.days.forEach((d, i) => {
      expect(d.name).toBe(sessionOf(i).name)
      expect(d.items[0].note).toBe(sessionOf(i).note)
      expect(d.items[0].min).toBe(sessionOf(i).min)
    })
    expect(noteOf('Run 25 minutes.')).toBe('5 min brisk walk, then: Run 25 minutes. Then a 5 min walk.')
  })
})

describe('progressOf', () => {
  it('starts at the first session', () => {
    expect(progressOf({ workouts: [] }, run)).toMatchObject({ done: 0, index: 0, finished: false, session: { name: 'Week 1 · Run 1' } })
    expect(progressOf({}, run).done).toBe(0)
  })

  it('counts workouts from the routine on or after the start date only', () => {
    const S = {
      workouts: [
        w('2026-09-30', ['c']),            // before the start: an earlier attempt
        w('2026-10-01', ['c']),            // the start day counts
        w('2026-10-03', ['other']),        // another routine
        w('2026-10-04', ['c']),
        w('2026-10-06', ['legs', 'c']),    // combined with another routine: the run was in it
        { id: 'old', d: '2026-10-08', routineId: 'c' },   // a workout from before routineIds
      ],
    }
    expect(progressOf(S, run)).toMatchObject({ done: 4, index: 4, session: { name: 'Week 2 · Run 2' }, finished: false })
  })

  it('caps at 27 and reports finished on the last session', () => {
    const S = { workouts: Array.from({ length: 30 }, (_, i) => w('2026-10-' + String(i + 1).padStart(2, '0'), ['c'])) }
    expect(progressOf(S, run)).toMatchObject({ done: 27, index: 26, finished: true, session: { name: 'Week 9 · Run 3' } })
    const S26 = { workouts: S.workouts.slice(0, 26) }
    expect(progressOf(S26, run)).toMatchObject({ done: 26, index: 26, finished: false })
  })

  it('counts nothing for a run with no routine', () => {
    expect(progressOf({ workouts: [w('2026-10-02', ['c'])] }, { ...run, routineId: undefined }).done).toBe(0)
  })
})
