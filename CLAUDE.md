# connect — agent guidance

`CroftCommunity/connect` is the **calling-contract owner** and the directory /
status web property for Croft calling. If you are working here, hold these facts
so the contract does not silently fork.

## What this repo is

- **`docs/contract.md` is THE calling contract** — the canonical definition of the
  atproto lexicon, the `croftcall://` deep link, and the capability model (grants,
  matchers, policies, per-device endpoints). It is cited as ground truth by
  `discovery/alpha/plans/2026-08-07-1-plan-croft-relay-tiered-admission.md` and by
  the `croft` client. **This repo owns it; other repos consume it.**
- **`web/`** is the directory / status page — the exchange: handle → DID → PDS →
  endpoint, callability status, and cap redeem. Deployed to GitHub Pages
  (`connect.croft.ing`), continuously from `main` (not release-gated).
- **`android/`** is a **retired** croftcall receiver — last release **v0.2.0**. The
  one Croft Call app is now **`croft/android`** (consolidated 2026-08-16). Do not
  develop this further; app changes go to `croft/android`.

## The relationships (get these right)

```
connect          ← THIS REPO. owns docs/contract.md; directory/status web;
                   stopgap android receiver.
croft (repo)     ← the NEW unified client (shared Rust core + web/android/apple
                   shells). A declared CONSUMER of this contract — its
                   docs/CONTRACT.md points here as canonical. The REAL calling
                   client lives there.
relay = croft-stack ← the Membership/admission backbone (CISS accounting, budgets,
                   call-time). Not connect, not the client.
```

- **The two android apps are now one** (consolidated 2026-08-16): `connect/android`
  is retired at v0.2.0; **`croft/android`** is the sole Croft Call app. Client-side
  cap consumption (redeem, callability, `evaluateGrant`) belongs there — see
  `docs/PHASE11-HANDOFF.md`.
- **The calling design takes input from all three surfaces** — connect (contract),
  relay (admission / the call-time §7 interface), and the app. Keep the contract
  cohesive with the relay's admission model; don't design the contract in isolation.

## Contract discipline

- A break to the contract (e.g. Phase 10: single `getRecord`/rkey `self` →
  per-device `listRecords` + cap records) is **this repo's to make deliberately**,
  then consumers (`croft`, the croft-relay plan) update in a coordinated change.
  **Never resolve contract ownership by drift.** Bump `Contract version:` in
  `docs/contract.md` on any change and record the app-version mapping.
- Update `docs/contract.md` **first**, then both halves' tests, then the
  implementations (the repo's stated rule).

## Dev + release

- **web:** `npm test` (vitest). `npm run mutate` (stryker) audits the verification
  path — expected clean on security-shaped code (secret verify, redeem).
- **android:** `./gradlew :app:testDebugUnitTest` (Robolectric on the JVM; needs an
  Android SDK — `local.properties` is gitignored). CI: `android.yml`.
- **releases + semver:** see `docs/RELEASING.md`. The APK is served from GitHub
  Releases (debug-signed); cut via tag push or `gh workflow run android.yml -f
  release_tag=vX.Y.Z`.
- **Git identity:** chasemp — `git@github-personal:CroftCommunity/connect.git`,
  committer `Chase Pettet <chase@owasp.org>`. Don't commit/push unless asked.

## Concurrent sessions (workspace norm)

Multiple agent sessions share the `CroftC/` workspace. Do multi-turn work in a dedicated
worktree — `git -C connect worktree add ../worktrees/connect/<slug> -b claude/<slug>` — never in
this checkout (peer sessions stage with `git add -A`; loose files get swept into unrelated
commits). Contested surfaces here — claim in `CroftC/.coordination/claims/` before
touching: **`docs/contract.md`** (the canonical calling contract — breaks are deliberate + coordinated, never by drift), OAuth client metadata under `web/`. Full protocol and the reasons behind it: `CroftC/.claude/COORDINATION.md`.
