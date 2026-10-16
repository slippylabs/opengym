// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { trainingDaysIcs, plannedWeekdays, icsEscape, foldLine } from './ics.js'

const S = {
  reminder: { time: '07:30' },
  routines: [
    { id: 'a', name: 'Push, heavy', ex: [{ id: '0025' }] },
    { id: 'b', name: 'Legs', ex: [{ id: '0043' }] },
    { id: 'c', name: 'Empty', ex: [] },
  ],
  week: { 1: ['a'], 3: ['b', 'a'], 5: ['c'] },
}
const now = new Date(2026, 9, 16, 10, 0)   // Friday 16 October 2026

describe('training days as .ics', () => {
  it('one weekly event per planned weekday, empty routines left out', () => {
    expect(plannedWeekdays(S)).toEqual({ 1: ['Push, heavy'], 3: ['Legs', 'Push, heavy'] })
    const ics = trainingDaysIcs(S, { now })
    const events = ics.split('BEGIN:VEVENT').length - 1
    expect(events).toBe(2)
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE')
    expect(ics).not.toContain('BYDAY=FR')
  })

  it('starts each on its next occurrence, at the reminder time', () => {
    const ics = trainingDaysIcs(S, { now })
    expect(ics).toContain('DTSTART:20261019T073000')   // Monday after
    expect(ics).toContain('DTSTART:20261021T073000')   // Wednesday after
  })

  it('escapes text and ends lines with CRLF', () => {
    const ics = trainingDaysIcs(S, { now })
    expect(ics).toContain('SUMMARY:🏋️ Push\\, heavy')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(icsEscape('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })

  it('folds long lines without splitting a character', () => {
    const long = 'SUMMARY:' + '💪'.repeat(40)
    const folded = foldLine(long)
    expect(folded.split('\r\n ').join('')).toBe(long)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
  })

  it('nothing planned, no file', () => {
    expect(trainingDaysIcs({ routines: [], week: {} }, { now })).toBeNull()
  })
})
