# The `ing.croft.*` register

connect defines record types of its own. The canonical shapes are in
[`contract.md`](contract.md); this file is the **register** the workspace rule requires
(`CroftC/.claude/LEXICONS.md` § 1), and it answers a different question. The contract says
*what the record is*. The register says *why it exists at all rather than an existing
type*, and *what was actually opened and read* in the ecosystem before it was minted.

The third field is the only one that costs anything, and it is the reason the register
exists: an `ing.croft.*` type that duplicates an official lexicon is a fork of the network
wearing a namespace. Models to follow: `forage/docs/LEXICON-REGISTER.md` (per-type, with
rejected candidates in a table) and `arecipe/docs/LEXICONS.md` (which also tracks
*consumes* and *dropped*).

## Status: backported 2026-09-08, and honest about what that means

All three types below **predate this rule**. The register is being written now, after the
fact, so the ecosystem-check field reads **NOT DONE** rather than a reconstruction.

That is the rule's own instruction, not a shortcut:

> **A type that predates the rule says so.** Do not back-fill checks you did not perform —
> a register that is fiction on the day it is written is worse than no register.

Forage carried nine such entries and then closed them properly on 2026-08-29, at which
point its exemption list reached zero. **This list can only shrink.** Doing these three
checks for real is filed work, not a formality — see *Owed* below.

## Types

### `ing.croft.iroh.endpoint`

- **Holds** — where one device of an account can be dialled: its iroh `endpointId`, an
  optional `homeRelay` hint, a human `label`, `createdAt`. One record per device, rkey
  `self` for the primary. World-readable and read unauthenticated, which is what lets the
  exchange page stay backendless.
- **Why ours** — the record answers "which transport identity is this person's device, and
  where does it camp". It is a *transport address for a device*, not a profile, a service
  declaration or a link.
- **Ecosystem check** — **NOT DONE** (predates the rule).

### `ing.croft.call.grant`

- **Holds** — who may call: a `matcher` (tagged union), optionally the `devices` it
  authorizes and a `policyRef`. Keyed by an opaque grant id carried in the invite link.
  **World-readable, and deliberately does not name the grantee** (contract §8) — the
  capability is proven at mint time, not published.
- **Why ours** — a capability granted to an unnamed bearer, against the grantee's own
  device set. It is not a follow, a block, a list membership or an invite to a service.
- **Ecosystem check** — **NOT DONE** (predates the rule).

### `ing.croft.call.policy`

- **Holds** — the limits a grant is evaluated under, so conditions are edited once and
  referenced by many grants.
- **Why ours** — the conditions half of the capability model above; it exists only because
  `grant` exists.
- **Ecosystem check** — **NOT DONE** (predates the rule).

## Consumes (defined elsewhere, used here)

- `com.atproto.repo.getRecord` / `listRecords` — how every type above is read, unauthenticated.
- `com.atproto.repo.putRecord` / `deleteRecord` — how a subscriber publishes and revokes.

No type in `ing.croft.*` is minted for anything the `com.atproto.*` surface already does.

## Owed

- **Close the three ecosystem checks**, against the real corpora rather than from memory.
  Forage's 2026-08-29 pass counted **26 record types** among the 435 official lexicons —
  a set small enough to read properly — plus the community namespace.
- **A test pinning this register against the collections the code actually names**
  (`croft/android/app/.../caps/Xrpc.kt` holds them as `ENDPOINT_COLLECTION`,
  `GRANT_COLLECTION`, `POLICY_COLLECTION`). Forage gates its register this way and it is
  what stops the register drifting into fiction. Until that exists, this file is prose and
  should be read as such.

## A caution for whoever closes those checks

**`community.lexicon.*` moved.** The `lexicon-community/lexicon` GitHub repository was
**archived 2026-07-27**; development now lives at
`tangled.org/lexicon.community/lexicons` (seven namespaces as of 2026-09-08: app,
bookmarks, calendar, interaction, location, payments, preference — none cryptographic).

A check that opens the GitHub repo today reads an archive and concludes from it. Worth
saying plainly because at least one register in this workspace cites
`lexicon-community/lexicon@main` for a check dated **after** that archive date; whether the
content had diverged by then is unknown to this file, and the point is that the citation no
longer identifies a live source. Verified 2026-09-08 while running the R8 investigation
(croft `plans/2026-09-08-plan-one-stream-calling-and-chat.md`).
