# ADR-0001: One repo for the page and the app

Status: accepted (2026-08-02)
Tags: repo-structure, web, android

## Context

Croft Call has two deliverables: a static lookup page (Croft Exchange) deployed
to GitHub Pages, and an Android app. They share one contract — the
`croftcall://call` deep link and the `ing.croft.iroh.endpoint` record shape
(see `docs/contract.md`).

## Decision

Keep both halves in one repository (`croftcommunity/connect`) with the layout:

```
web/          Pages site root (index.html shell + resolver.js module)
web-tests/    vitest unit tests for resolver.js
android/      the Kotlin/Gradle project
docs/         contract + ADRs
.github/workflows/  web.yml, android.yml
```

## Consequences

- The two halves of the contract are versioned together; a change to the deep
  link or record shape lands in one commit touching both sides' tests.
- Pages can serve the app's `.well-known/assetlinks.json` from the same origin
  the page lives on (`connect.croft.ing`), which is what Android App Links need.
- Two independent CI workflows, each path-filtered, so a web change does not run
  the Android build and vice versa.
