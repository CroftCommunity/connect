# Changelog — connect

What changed for whoever consumes this repo: the calling **contract** (`docs/contract.md`,
`Contract version: N` — its own clock, bumped only when the shape other repos speak
changes), the **web** module (the directory + OAuth client metadata, continuously deployed
to Pages), and the **android** app it once shipped (retired 2026-08 — `croft/android` is
the one Croft Call app). Release tags follow the app `versionName`; the contract version is
recorded in the release entry.

Contexts: contract · web · android

Format: [Keep a Changelog](https://keepachangelog.com/), per `CroftC/.claude/CHANGELOGS.md`:
the branch that changes something a consumer runs adds its entry here before it lands; at
release the section is renamed in the bump commit. Started 2026-08-29 and backfilled from
the two tags; earlier detail is in `git log` and `docs/RELEASING.md`.

## [Unreleased]

- **contract:** an unevaluable expiry is expired, not eternal — `evaluateRules` treats a
  malformed `expiresAt` as already past (E126 port-back from the relay's resolver, which
  had diverged the same way).
- **web:** the atproto OAuth client metadata for Croft Call declares
  `transition:generic` — the mint's identity proof (croft M4 O2) needs it.
- **web:** the atproto OAuth client metadata file for Croft Call is published from this
  repo (croft Phase 11 M3); the README names the file and its owner.
- **android:** retired — `connect/android` is removed and `croft/android` is the one app
  (contract v2). Docs aligned to the one-app merge; `docs/PHASE11-HANDOFF.md` carries the
  connect → croft vocabulary bridge.

## [0.2.0] — 2026-08-16

App 0.2.0 ships **contract v2**. Minor bump — backward-compatible: a v1 single-self repo
still resolves.

- **contract:** the capability model — grants, matchers, policies, per-device endpoints;
  the ticket redeem path; `listRecords` enumeration; the matcher + call-time evaluation
  engine.
- **android:** `versionName` 0.1.0 → 0.2.0 (`versionCode` 1 → 2), `package.json` in
  lockstep.

## [0.1.0] — 2026-08-02

- **android:** first tagged release — the `app-debug.apk` attached to the GitHub Release.
  The release path runs from inside Actions (`workflow_dispatch` with a `release_tag`
  input driving `action-gh-release`), because tag-ref pushes were blocked for the session's
  git proxy; the on-tag path is preserved.
- **contract:** v1 — the single-self repo shape this release resolves.
