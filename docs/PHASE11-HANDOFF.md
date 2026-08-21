# Phase 11 handoff — connect (contract owner) → croft (client)

**Status (2026-08-16):** contract **v2 is canonical and live** on connect `main`,
released as **v0.2.0**. The Phase 10 change croft was told to wait for — single
`getRecord`/rkey `self` → **per-device `listRecords` + the capability model** — has
landed. **Build against v2, not the single-record shape.** This resolves the
"Both are in flux / do not implement" and the "Open: canonical home" notes in
`croft/docs/CONTRACT.md`: connect stays canonical, and it moved deliberately.

**Client status (2026-08-18):** croft has shipped and device-validated items
1, 2 and 4 below — ticket redemption + deep-link consumption in croft
`v0.3.0`, the callability resolver and atproto OAuth identity proof
(`provenDid`) in croft `v0.4.0` (plan:
`croft/plans/2026-08-17-2-plan-m3-identity-proof.md`). The one
connect-side artifact that grew out of it is
`web/oauth-client-metadata.json` (the OAuth `client_id` document; croft
owns its contents). Item 3 — call-time `evaluateGrant` + relay
enforcement — is the remaining milestone (croft M4, with croft-stack).

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

1. **Callability resolver** ✅ (croft `v0.4.0`, engine since M2): for a
   principal, `listEndpoints` + read grants → derive `callable / not-listed /
   may-not-permit`. Croft's **resolution-cost / metadata-leak** decision
   (its D1): lazy-on-tap plus a TTL cache of derived state, identity-keyed
   — resolving callability is PDS lookups that reveal who you are looking at.
2. **Identity-proof acquisition** ✅ (croft `v0.4.0`) — the one thing the
   static page cannot do. To satisfy a `mutuals` / `registeredCallers`
   matcher, the caller presents a **proven DID** (`provenDid`) from an
   atproto **OAuth** session against the caller's PDS. Client metadata is
   hosted here (`web/oauth-client-metadata.json`, croft-owned contents);
   the redirect scheme is `ing.croft.connect:/oauth` per the spec's
   reverse-domain rule.
3. **Call-time evaluation as an effect.** 🟨 in progress (croft M4,
   2026-08-20; plan `croft/plans/2026-08-20-1-plan-m4-call-time-admission.md`).
   The relay side is BUILT (croft-stack Phase 8: `/grantCall` mints a
   sponsorship+scope relay token against fresh grant reads — §7 evaluated
   server-side, `usesSoFar`/revocation as call-time facts there). Client
   M4a+M4b landed: the admit client, the ticket secret retained through
   redeem, and the caller proof (`getServiceAuth` at the caller's PDS,
   DPoP `ath`-bound). One connect-side consequence, already live: the
   client metadata's `scope` grew `transition:generic` — under OAuth,
   `getServiceAuth` needs an RPC permission the bare `atproto` scope
   lacks, and the entryway does not yet advertise granular `rpc:` scopes.
   `evaluateGrant` is the §7 admission check
   (grant-exists AND matcher AND rules, with `usesSoFar`/`grantExists` as call-time
   facts). In croft's pure-core architecture this is an **effect + port**, never an
   awaited call inside a core: the core emits "evaluate this grant" as data; the
   shell (or the relay) performs it. `usesSoFar` (prior successful calls) and
   `grantExists` come from the relay/CISS Membership side, not the page.
4. **Deep-link consumption.** ✅ (croft `v0.3.0`) — `device` + `grant`
   captured from `croftcall://` and invite links redeemed per §6, in
   `croft/android` (the `connect/android` stopgap is retired).

## Ownership boundary (so neither side waits on the other)

- **connect owns:** `docs/contract.md`, the record/link shapes, and the
  `web/resolver.js` reference engine. A contract change is deliberate and
  coordinated — bump `Contract version`, and update `croft/docs/CONTRACT.md` + the
  croft-relay plan in the same change. Never resolve ownership by drift.
- **connect does NOT build:** the client OAuth, the callability-resolver UI, or the
  relay's call-time wiring. Those are Phase 11 / croft + croft-stack.
- **The two android apps are one, converging:** `connect/android` is a stopgap;
  the real client is `croft/android`.
