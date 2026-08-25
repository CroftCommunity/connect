# Croft Connect

**Croft Exchange** — the directory / status web page and the **canonical calling
contract** for Croft, calling people by their Bluesky handle over
[iroh](https://iroh.computer):

- **`web/`** — a static lookup page. Type a handle; it resolves the DID, finds the
  data server, reads the `ing.croft.iroh.endpoint` record(s), and hands your device
  a `croftcall://` deep link. Deployed to GitHub Pages at
  **https://connect.croft.ing**.
- **`docs/contract.md`** — the canonical calling contract (lexicon, deep link, and
  the capability model / grants). Owned here; consumed by the client.

The Croft Call **app** lives in **`CroftCommunity/croft`** (`croft/android`).
`connect/android` here is a **retired stopgap** — a minimal deep-link receiver,
last released as **v0.2.0** — kept for history, not developed further. See
[`CLAUDE.md`](CLAUDE.md) for the connect/croft/relay split and
[`docs/PHASE11-HANDOFF.md`](docs/PHASE11-HANDOFF.md) for the client handoff.

## Layout

| path                    | what                                                        |
|-------------------------|-------------------------------------------------------------|
| `web/`                  | Pages site: `index.html` shell + `resolver.js` module       |
| `web-tests/`            | vitest unit tests for `resolver.js`                         |
| `web/oauth-client-metadata.json` | atproto OAuth client metadata for the croft client (`client_id` URL); contents owned by `croft` (its M3 plan) |
| `android/`              | **retired** stopgap receiver (last release v0.2.0); the app is `croft/android` |
| `docs/contract.md`      | the shared deep-link + record contract (source of truth)   |
| `docs/adr/`             | architecture decision records                              |
| `.github/workflows/`    | `web.yml` (test + Pages deploy), `android.yml` (test + APK) |

## Develop

Web:

```bash
npm ci
npm test            # vitest
npx serve web       # manual smoke test against live atproto APIs
```

Android:

```bash
cd android
./gradlew test           # JVM unit tests (DeepLink + WireFormat)
./gradlew assembleDebug  # app-debug.apk
```

CI publishes the page on push to `main` and uploads `app-debug.apk` as a
workflow artifact (attached to a GitHub Release on a `v*` tag).

## Status

- Web: unit-tested, deploys to `connect.croft.ing` (custom domain, DNS verified).
- Android: **retired** at v0.2.0. The Croft Call app is now `croft/android`
  (`CroftCommunity/croft`); the two-device call test runs there against
  the released croft/android app (v0.4.0 at time of writing). connect/android history in
  [ADR-0002](docs/adr/0002-callpeer-api-verification.md).
- Deferred (needs the human's keystore): Android App Links on
  `https://connect.croft.ing` — see [ADR-0003](docs/adr/0003-custom-domain-connect-croft-ing.md).
