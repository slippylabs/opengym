// Couch to 5K as a one-way program, carried over from SlipFit.
//
// openGym's weekly plan repeats the same seven days forever, which cannot say "the next run is
// longer than the last". So the program is ONE routine ("Couch to 5K", a single run in cardio
// mode) on three weekdays, plus a run record in S.slipRuns (lib/slip/state.js) that remembers
// when it started. Where you are in the nine weeks is not stored anywhere: it is the number of
// workouts logged from that routine since the start, so a deleted workout steps you back and a
// workout logged on another device counts as soon as it syncs. Nothing to keep in step.

// Josh Clark's 9-week schedule, three runs a week. Every run has a 5-minute walk warm-up and
// cool-down, included in the minutes. [instruction, minutes]
export const SESSIONS = [
  ['Run 60 s, walk 90 s. Repeat 8 times.', 30],
  ['Run 60 s, walk 90 s. Repeat 8 times.', 30],
  ['Run 60 s, walk 90 s. Repeat 8 times.', 30],
  ['Run 90 s, walk 2 min. Repeat 6 times.', 31],
  ['Run 90 s, walk 2 min. Repeat 6 times.', 31],
  ['Run 90 s, walk 2 min. Repeat 6 times.', 31],
  ['Twice: run 90 s, walk 90 s, run 3 min, walk 3 min.', 28],
  ['Twice: run 90 s, walk 90 s, run 3 min, walk 3 min.', 28],
  ['Twice: run 90 s, walk 90 s, run 3 min, walk 3 min.', 28],
  ['Run 3 min, walk 90 s, run 5 min, walk 2.5 min, run 3 min, walk 90 s, run 5 min.', 32],
  ['Run 3 min, walk 90 s, run 5 min, walk 2.5 min, run 3 min, walk 90 s, run 5 min.', 32],
  ['Run 3 min, walk 90 s, run 5 min, walk 2.5 min, run 3 min, walk 90 s, run 5 min.', 32],
  ['Run 5 min, walk 3 min. Repeat 3 times.', 34],
  ['Run 8 min, walk 5 min, run 8 min.', 31],
  ['Run 20 minutes without stopping.', 30],
  ['Run 5 min, walk 3 min, run 8 min, walk 3 min, run 5 min.', 34],
  ['Run 10 min, walk 3 min, run 10 min.', 33],
  ['Run 25 minutes without stopping.', 35],
  ['Run 25 minutes.', 35], ['Run 25 minutes.', 35], ['Run 25 minutes.', 35],
  ['Run 28 minutes.', 38], ['Run 28 minutes.', 38], ['Run 28 minutes.', 38],
  ['Run 30 minutes.', 40], ['Run 30 minutes.', 40], ['Run 30 minutes, or 5 km. You did it.', 40],
]

export const TOTAL = SESSIONS.length

/** The run the program calls "run" in openGym's catalogue. */
export const RUN_EX = '0685'
export const PROGRAM = 'c25k'
export const ROUTINE_NAME = 'Couch to 5K'

// The routine exercise's note: the whole session, warm-up and cool-down included, since that is
// what you read mid-run. Same wording as SlipFit's plan.
export const noteOf = text => '5 min brisk walk, then: ' + text + ' Then a 5 min walk.'

/** Session `index` (0–26, clamped): { index, week, run, name, text, min, note }. */
export function sessionOf(index) {
  const i = Math.max(0, Math.min(TOTAL - 1, Math.floor(Number(index) || 0)))
  const [text, min] = SESSIONS[i]
  const week = Math.floor(i / 3) + 1, run = i % 3 + 1
  return { index: i, week, run, name: 'Week ' + week + ' · Run ' + run, text, min, note: noteOf(text) }
}

const routineIdsOf = w => (Array.isArray(w?.routineIds) ? w.routineIds : (w?.routineId ? [w.routineId] : []))

/**
 * Where a run stands: { done, index, session, finished }.
 * done      workouts logged from the run's routine on or after its start date, capped at 27
 * index     the session to do next (the last one once finished)
 * finished  all 27 done
 * A workout that combined the run with another routine counts too: the run was in it.
 */
export function progressOf(S, run) {
  const start = run?.start || ''
  const rid = run?.routineId
  const logged = rid
    ? (Array.isArray(S?.workouts) ? S.workouts : []).filter(w => w && (w.d || '') >= start && routineIdsOf(w).includes(rid)).length
    : 0
  const done = Math.min(TOTAL, logged)
  const index = Math.min(TOTAL - 1, done)
  return { done, index, session: sessionOf(index), finished: done >= TOTAL }
}
