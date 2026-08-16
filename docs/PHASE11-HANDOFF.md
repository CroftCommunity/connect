# Phase 11 handoff — connect (contract owner) → croft (client)

**Status (2026-08-16):** contract **v2 is canonical and live** on connect `main`,
released as **v0.2.0**. The Phase 10 change croft was told to wait for — single
`getRecord`/rkey `self` → **per-device `listRecords` + the capability model** — has
landed. **Build against v2, not the single-record shape.** This resolves the
"Both are in flux / do not implement" and the "Open: canonical home" notes in
`croft/docs/CONTRACT.md`: connect stays canonical, and it moved deliberately.

## What connect provides (the callee-side surface — done)

- **Record shapes** (`docs/contract.md` §1–§3): per-device `endpoint`, `grant`
  (matcher union: `ticket` | `mutuals` | `registeredCallers`), `policy`
  (composable rules: `expires` | `maxUses` | `burnOnSuccess`).
- **Links** (§4–§5): invite link (ticket secret in the URL fragment), deep link
  (`croftcall://call?…&device=&grant=`).
- **A reference engine** in `web/resolver.js` — the logic the client should mirror,
  not reinvent:
  - discovery: `resolveHandle`, `resolvePds`, `fetchEndpoint`, `listEndpoints`
    (per-device enumeration), `fetchGrant`, `fetchPolicy`
  - tickets: `sha256Hex`, `buildInviteLink`, `parseInviteLink`,
    `verifyTicketSecret`, `redeemTicket`
  - evaluation: `areMutuals`, `evaluateMatcher`, `evaluateRules`, `evaluateGrant`
    (the §7 call-time reference — fails closed)

## Vocabulary bridge (croft ↔ connect) — read this to avoid drift

`croft/docs/CONTRACT.md` uses an earlier, simpler vocabulary. Map it onto v2:

| croft term | connect v2 equivalent |
|---|---|
| callability `callable` | an endpoint record exists **and** `evaluateGrant(...)` admits the caller |
| callability `not-listed` | no `endpoint` record for the principal (`listEndpoints` empty) — the normal case |
| callability `may-not-permit` | endpoint exists but no grant admits this caller (`evaluateGrant` → false) |
| request policy `anyone` | a grant that admits without identity (a public/ticket grant) |
| request policy `mutuals` | a `mutuals` matcher grant |
| request policy `nobody` | no admitting grant |

**Key correction for the client:** request policy is **not a single enum field on
the endpoint** — it is *derived from the set of grant records* in the callee's
repo. v2 is richer than `anyone|mutuals|nobody`: it also has `registeredCallers`
(explicit DID list), `ticket` (handed-out invites), and revocation rules
(`expires`/`maxUses`/`burnOnSuccess`). Model callability as "does any grant admit
me, and do its rules still hold," i.e. `evaluateGrant`, not a three-value lookup.

## What the client (croft) must build — Phase 11

1. **Callability resolver** (the rendered-principal seam croft already owns): for a
   principal, `listEndpoints` + read grants → derive `callable / not-listed /
   may-not-permit`. Honour croft's own **resolution-cost / metadata-leak** decision
   (lazy-on-tap vs cached-TTL vs batched) — resolving callability is PDS lookups
   that reveal who you are looking at.
2. **Identity-proof acquisition** — the one thing the static page cannot do. To
   satisfy a `mutuals` / `registeredCallers` matcher, the caller must present a
   **proven DID** (`provenDid`). That means an atproto **OAuth** session against the
   caller's PDS. The engine consumes `provenDid`; obtaining it is client work.
3. **Call-time evaluation as an effect.** `evaluateGrant` is the §7 admission check
   (grant-exists AND matcher AND rules, with `usesSoFar`/`grantExists` as call-time
   facts). In croft's pure-core architecture this is an **effect + port**, never an
   awaited call inside a core: the core emits "evaluate this grant" as data; the
   shell (or the relay) performs it. `usesSoFar` (prior successful calls) and
   `grantExists` come from the relay/CISS Membership side, not the page.
4. **Deep-link consumption.** Capture `device` + `grant` from `croftcall://` (the
   `connect/android` stopgap already does — see `Callee`). The real client
   consumes them in `croft/android`.

## Ownership boundary (so neither side waits on the other)

- **connect owns:** `docs/contract.md`, the record/link shapes, and the
  `web/resolver.js` reference engine. A contract change is deliberate and
  coordinated — bump `Contract version`, and update `croft/docs/CONTRACT.md` + the
  croft-relay plan in the same change. Never resolve ownership by drift.
- **connect does NOT build:** the client OAuth, the callability-resolver UI, or the
  relay's call-time wiring. Those are Phase 11 / croft + croft-stack.
- **The two android apps are one, converging:** `connect/android` is a stopgap;
  the real client is `croft/android`.
