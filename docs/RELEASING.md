# Releasing Croft Connect

This repo owns the **web page** and the **contract**. Releases follow
[Semantic Versioning](https://semver.org): `vMAJOR.MINOR.PATCH`.

> **The android app is retired here — final release `v0.2.0`.** Ongoing app
> releases (the APK served for the two-device call test and beyond) live in
> `croft/ops/RELEASING.md` — candidate prereleases, validated then promoted. The
> android sections below are the **record of how connect v0.2.0 was cut**;
> connect's live release concerns are now the web page (continuous Pages deploy)
> and the contract version.

## What carries a version

| thing | version field | where |
|---|---|---|
| Android app (the release artifact) | `versionName` + `versionCode` | `android/app/build.gradle.kts` |
| Web module | `version` | `package.json` |
| Shared contract | `Contract version: N` | `docs/contract.md` |

- **The release version is the app `versionName`** — it names the GitHub Release
  and the `app-debug.apk` served from it. Keep `package.json` `version` in lockstep
  so both halves report the same number.
- **`versionCode` is a monotonic integer** — increment by 1 every release, never
  reuse or decrease. Android uses it (not `versionName`) to decide "is this newer".
- **The contract version is a separate integer** that bumps on any contract change.
  Record the mapping in the release notes (e.g. "app 0.2.0 ships contract v2").

## Semver policy (what bumps which digit)

- **MAJOR** — a breaking contract change: a record shape or link that an older
  app/page cannot consume (e.g. renaming a required field, changing the deep-link
  scheme). Pair it with a contract-version bump.
- **MINOR** — a new, backward-compatible capability (e.g. the cap model added on
  top of the v1 endpoint record — that is a 0.1 → 0.2 change, not a break).
- **PATCH** — bug fixes and internal changes with no contract or behavior change
  visible to the other half.

Pre-1.0 caveat: while `0.y.z`, treat `0.MINOR` as the compatibility line — a break
bumps MINOR, a feature bumps... also MINOR is acceptable per semver's 0.x rule, so
keep breaks and features distinct in the **release notes** even when the digit is
the same. Move to `1.0.0` when the contract is declared stable.

## Cutting a release

1. **Bump versions together** in one commit:
   - `android/app/build.gradle.kts`: `versionName` (semver) and `versionCode` (+1).
   - `package.json`: `version` to the same semver.
   - `docs/contract.md`: bump `Contract version` only if the contract changed.
2. **Write the release notes** — what changed, and the contract-version mapping.
   `android.yml` also auto-generates notes from commits (`generate_release_notes`).
3. **Commit** as `release: vX.Y.Z`.
4. **Trigger the release build.** `android.yml`'s `release` job builds
   `assembleDebug` and attaches `app-debug.apk` to a GitHub Release. Two triggers:
   - **Tag push** (preferred when allowed): `git tag vX.Y.Z && git push origin vX.Y.Z`.
   - **Workflow dispatch** (when tag pushes are blocked, as in agent sessions):
     ```
     gh workflow run android.yml -R CroftCommunity/connect \
       -f release_tag=vX.Y.Z --ref main
     ```
     The action creates the tag `vX.Y.Z` from the checked-out commit if it does not
     yet exist. Run it against the ref that holds the release commit (normally `main`).
5. **Verify**:
   ```
   gh release view vX.Y.Z -R CroftCommunity/connect --json tagName,assets \
     -q '.tagName, (.assets[].name)'
   ```
   Expect the tag and `app-debug.apk`. The public download URL is
   `https://github.com/CroftCommunity/connect/releases/download/vX.Y.Z/app-debug.apk`.

## Signing: debug now, release keystore later

The served APK is **debug-signed** — installable (users allow "install unknown
apps"), no secrets required. Good enough for alpha hand-outs, with one caveat:

> **Debug signing is not stable for in-place updates.** The debug keystore is
> generated per build environment, so an APK from one CI run may refuse to install
> over an APK from another (Android rejects a signature-identity change on update).

For a channel where people *update* over an existing install, add a **release
keystore** shared across builds:

1. Generate a keystore once; base64-encode it.
2. Store as repo secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`.
3. Add a `release` `signingConfig` in `android/app/build.gradle.kts` reading those
   from the environment, and have the `release` job run `assembleRelease` with the
   keystore decoded from the secret.

Until then, treat each debug release as a fresh install (uninstall the old APK
first if an update refuses).

## The web half is not release-gated

`web/` deploys continuously to GitHub Pages (`web.yml`) on push to `main` — it is
not tied to these version tags. Bump `package.json` `version` for reporting
parity, but the live page always reflects `main`.
