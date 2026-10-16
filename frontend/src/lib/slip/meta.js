// The slippylabs fork's own release notes (Settings → About → What's new, and shown once after an
// update) and the feedback link. CHANGELOG-slippylabs.md in the repo root is the long form; this
// is what the app shows, newest first. The first entry's version is the fork's version.
export const SLIP_CHANGELOG = [
  {
    v: '1.0.0', d: '2026-10-16', items: [
      'fit.slippylabs.com now runs openGym, replacing SlipFit. Everything SlipFit did is here too.',
      'Calculators: calories and macros, BMI, body fat, one-rep max, plates, heart-rate zones, pace, calories burned, ideal weight, water, protein, waist-to-height.',
      'Daily check-ins for water, protein, sleep and steps, against your own targets.',
      'Goals for body weight, a lift, a run distance, a number of workouts, or anything you like, with a projected finish date.',
      'XP, levels, a weekly-goal streak and 46 achievements.',
      'Cardio distance and pace, the longest run, a personal-record board and workouts per week.',
      'More plans, a plan generator and Couch to 5K.',
      'Your training days as a calendar file, a feedback button and these notes.',
      'No AI anywhere: the AI coach of the original openGym is removed.',
    ],
  },
]

export const SLIP_VERSION = SLIP_CHANGELOG[0].v

/** The report form on slippylabs.com, prefilled with what helps to reproduce a problem. */
export function feedbackUrl({ version, screen, ua = typeof navigator !== 'undefined' ? navigator.userAgent : '' } = {}) {
  const details = ['App version: ' + (version || ''), 'Screen: ' + (screen || ''), 'Browser: ' + ua].join('\n')
  return 'https://slippylabs.com/report.html?project=fit&title=&details=' + encodeURIComponent(details + '\n\n')
}
