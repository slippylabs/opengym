# slippylabs fork changelog

This fork of [openGym](https://github.com/DuarteSantos8/openGym) runs at
<https://fit.slippylabs.com>. It replaced SlipFit, the earlier slippylabs fitness app. Upstream's
own history is in [CHANGELOG.md](CHANGELOG.md); this file lists only what the fork changes.

Fork versions are semver on their own track, tagged `slip-vX.Y.Z`. The app shows them as the build
suffix (`1.4.1+slip1.0.0`).

## Unreleased

- **No AI.** The AI coach (server routes, jobs, provider adapters, prompts, the phone's
  bring-your-own-key mode, all of its screens and strings) and the MCP server are removed
  entirely, not switched off. The Android APK link is gone too, because the upstream APK still
  carries the coach.
- `GET /api/config` now marks a signed-in answer with `session: true`. This replaces the coach block
  that used to tell a client whether its cached copy was made for a session.
- The deployment variants this fork does not use are removed: Nix, Helm, Kubernetes, GitLab and
  Gitea CI, the project website, and the mirror and publish workflows.
- Settings → About links to this fork's source, as the AGPL requires.
