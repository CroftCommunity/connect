# ADR-0003: Custom domain `connect.croft.ing`, App Links still deferred

Status: accepted (2026-08-02)

## Context

The build instructions' Phase 4 template used the placeholder domain
`call.croft.ing`. The actual repository is `croftcommunity/connect`, and the
human has already configured GitHub Pages for it with the custom domain
**`connect.croft.ing`** — DNS check successful (verified from the Pages
settings screenshot supplied with the task). This is the human go-ahead the
template gated the domain step on.

## Decision

- Serve the page from `connect.croft.ing`. `web/CNAME` contains
  `connect.croft.ing` so the Actions-based Pages deploy preserves the domain.
- Because a custom domain is used, the site is served at the domain root
  (`https://connect.croft.ing/`), not a `/<repo>/` subpath. All page asset
  references are relative, so nothing else changes.
- App Links (the `https://` intent filter that opens the app without the
  scheme-picker) remain **deferred**. They need the release signing cert
  SHA-256 in `web/.well-known/assetlinks.json`, which only the human's keystore
  can provide. Until then:
  - `web/.well-known/assetlinks.json` holds a placeholder fingerprint.
  - The Android manifest's `https` intent filter stays commented out; its host,
    when enabled, is `connect.croft.ing` (updated from the template's
    `call.croft.ing`).
  - The `croftcall://` custom-scheme link works everywhere today (with the
    chooser prompt), so this blocks nothing.

## Consequences

- The live deploy provisions a TLS certificate for `connect.croft.ing`; once
  issued, "Enforce HTTPS" becomes available in Pages settings.
- Enabling App Links later is a two-line change (real fingerprint + uncomment
  the manifest filter) with no code impact.
