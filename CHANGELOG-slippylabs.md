# slippylabs fork changelog

This fork of [openGym](https://github.com/DuarteSantos8/openGym) runs at
<https://fit.slippylabs.com>. It replaced SlipFit, the earlier slippylabs fitness app. Upstream's
own history is in [CHANGELOG.md](CHANGELOG.md); this file lists only what the fork changes.

Fork versions are semver on their own track, tagged `slip-vX.Y.Z`. The app shows them as the build
suffix (`1.4.1+slip1.0.0`).

## slip-v1.0.0 (2026-10-16)

First release at fit.slippylabs.com, replacing SlipFit. Every SlipFit feature openGym lacked is
ported, each against SlipFit's own code where it had logic (lib/slip/oracle holds the originals):

- **Calculators** (/tools): calories and macros, BMI, body fat (U.S. Navy), one-rep max with a
  percentage table, plate loader, heart-rate zones, pace and race prediction, calories burned, ideal
  weight, water, protein and waist-to-height.
- **Profile and targets** (Settings → Body & targets, and a first-run setup on Home).
- **Daily check-ins** for water, protein, sleep and steps against those targets.
- **Goals**: body weight, a lift's estimated 1RM, a run distance, a number of workouts, or free
  text, with a deadline, on-track status and a projected finish date.
- **XP, levels, a weekly-goal streak and the 46 achievements**, with a celebration when earned, and a
  toast the moment a set beats a personal record.
- **Cardio distance and pace** on the workout screen, in set labels and on Stats: lifetime and monthly
  distance, the longest run, workouts per week against the goal, and a personal-record board.
- **Programs**: SlipFit's plan generator and built-in plans, including Couch to 5K as a one-way
  program with its own Home card.
- **Training days as a calendar file** (Plan → menu), a feedback button, What's new, privacy and the
  disclaimer.
- Link previews and the Slippy Deck player, as on every slippylabs page.

New data rides openGym's per-entry sync (stamped maps): `slipProfile`, `daily`, `slipGoals`,
`badges` and `slipRuns`. The API gained an optional `HOST` to bind to. `deploy/` holds the unit,
the vhost and the deploy script.

### Removed

- **No AI.** The AI coach (server routes, jobs, provider adapters, prompts, the phone's
  bring-your-own-key mode, all of its screens and strings) and the MCP server are removed
  entirely, not switched off. The Android APK link is gone too, because the upstream APK still
  carries the coach.
- `GET /api/config` now marks a signed-in answer with `session: true`. This replaces the coach block
  that used to tell a client whether its cached copy was made for a session.
- The deployment variants this fork does not use are removed: Nix, Helm, Kubernetes, GitLab and
  Gitea CI, the project website, and the mirror and publish workflows.
- Settings → About links to this fork's source, as the AGPL requires.
