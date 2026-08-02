# Croft Connect

Two halves of one small system for calling people by their Bluesky handle over
[iroh](https://iroh.computer):

- **Croft Exchange** (`web/`) — a static lookup page. Type a handle; it resolves
  the DID, finds the data server, reads the caller's `ing.croft.iroh.endpoint`
  record, and hands your device a `croftcall://` deep link. Deployed to GitHub
  Pages at **https://connect.croft.ing**.
- **Croft Call** (`android/`) — a minimal Android app that receives the deep
  link and dials the endpoint over iroh (v0 "call" = authenticated connect +
  hello-frame exchange, ALPN `croft-call/0`).

The two agree on exactly one contract — the deep link and the record shape —
documented once in [`docs/contract.md`](docs/contract.md) and tested from both
sides.

## Layout

| path                    | what                                                        |
|-------------------------|-------------------------------------------------------------|
| `web/`                  | Pages site: `index.html` shell + `resolver.js` module       |
| `web-tests/`            | vitest unit tests for `resolver.js`                         |
| `android/`              | the Kotlin/Gradle app (`ing.croft.call`)                   |
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
- Android: `VERIFY` markers in `CallPeer.kt` resolved against n0's reference app
  (see [ADR-0002](docs/adr/0002-callpeer-api-verification.md)); build + tests
  run in CI. Instrumented/two-device E2E is manual — see `android/README.md`.
- Deferred (needs the human's keystore): Android App Links on
  `https://connect.croft.ing` — see [ADR-0003](docs/adr/0003-custom-domain-connect-croft-ing.md).
