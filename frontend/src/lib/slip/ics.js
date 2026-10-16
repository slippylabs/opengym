// Training days as a calendar file (.ics), carried over from SlipFit: one weekly repeating event per
// weekday that has a routine planned, at the reminder time, with an alarm. Opening the file adds
// them to any calendar app, which is a reminder that works without notifications or an account.
//
// The weekly plan only (S.week). A rotation has no weekdays to put in a calendar, and day
// overrides are one-offs, so neither is exported.

const CODE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad = n => String(n).padStart(2, '0')
const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())

// RFC 5545 text: backslash, semicolon and comma escaped, newlines as \n.
export const icsEscape = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Lines longer than 75 octets are folded (RFC 5545 3.1). Counted in UTF-8 bytes, never splitting a
// character, since routine names may hold emoji or non-Latin text.
export function foldLine(line) {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out = []
  let cur = '', bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0 }
    cur += ch; bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** Weekday (0 Sunday … 6 Saturday) → the names of the routines planned on it. */
export function plannedWeekdays(S) {
  const out = {}
  for (let wd = 0; wd < 7; wd++) {
    const names = [].concat(S?.week?.[wd] || [])
      .map(id => (S?.routines || []).find(r => r.id === id))
      .filter(r => r && (r.ex || []).length)
      .map(r => r.name || 'Workout')
    if (names.length) out[wd] = names
  }
  return out
}

/**
 * The .ics text, or null when nothing is planned. `now` is passed in so tests can pin the clock;
 * each event starts on the next occurrence of its weekday from today.
 */
export function trainingDaysIcs(S, { now = new Date(), time, minutes = 45, url = 'https://fit.slippylabs.com/' } = {}) {
  const days = plannedWeekdays(S)
  const wds = Object.keys(days).map(Number)
  if (!wds.length) return null
  const hhmm = (time || S?.reminder?.time || '18:00').replace(':', '') + '00'
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//slippylabs//openGym fork//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const wd of wds) {
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((wd - now.getDay() + 7) % 7))
    lines.push(
      'BEGIN:VEVENT',
      'UID:opengym-day-' + wd + '@fit.slippylabs.com',
      'DTSTAMP:' + stamp,
      'DTSTART:' + ymd(first) + 'T' + hhmm,
      'DURATION:PT' + Math.max(15, Math.round(minutes)) + 'M',
      'RRULE:FREQ=WEEKLY;BYDAY=' + CODE[wd],
      'SUMMARY:' + icsEscape('🏋️ ' + days[wd].join(' + ')),
      'DESCRIPTION:' + icsEscape('Open openGym to start today\'s session: ' + url),
      'URL:' + url,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Time to train'), 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
