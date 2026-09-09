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

## Status: backported 2026-09-08, checks closed the same day

All three types **predate this rule**, so the register was written after the fact and
opened with every ecosystem check marked `NOT DONE` — the rule's own instruction, because
a register that is fiction on the day it is written is worse than no register.

**The three checks were then done for real, against the corpora rather than from memory,
and the exemption list is now empty.** Forage reached zero the same way on 2026-08-29;
this list could only shrink and did.

**Method, so the checks can be judged rather than trusted.** The official corpus was
enumerated from `bluesky-social/atproto@main` — **404 lexicon files** on 2026-09-08 (forage
counted 435 on 2026-08-29; the corpus moves, which is why the date is on every check). The
names were grepped for `endpoint|device|service|key|invite|grant|policy|permission|capab`
and every record-typed hit was opened and read. The community namespace was read at its
**live** home: `tangled.org/lexicon.community/lexicons` — see the caution at the foot of
this file, because the GitHub repo it moved from is archived and still cited elsewhere.

## Types

### `ing.croft.iroh.endpoint`

- **Holds** — where one device of an account can be dialled: its iroh `endpointId`, an
  optional `homeRelay` hint, a human `label`, `createdAt`. One record per device, rkey
  `self` for the primary. World-readable and read unauthenticated, which is what lets the
  exchange page stay backendless.
- **Why ours** — the record answers "which transport identity is this person's device, and
  where does it camp". It is a *transport address for a device*, not a profile, a service
  declaration or a link.
- **Ecosystem check (2026-09-08).** The strongest candidate is not a lexicon at all:

  | Candidate | What it is | Why it does not hold this |
  |---|---|---|
  | DID document `service` entry | atproto's canonical answer to "where is this reachable", and the spec says third parties may add bespoke entries | **`serviceEndpoint` is constrained to an HTTPS URL — scheme, hostname, optional port.** An iroh `endpointId` is a 64-character public key and simply cannot be written there; `homeRelay` could be, but it is the optional half. Identity-scoped rather than per-device, and a DID update is a signed PLC operation — the wrong cost for a value that changes whenever a device rebinds |
  | `app.bsky.labeler.service` | the only record type in the official set that declares a "service" | `key: literal:self` — a singleton, so it cannot be one-per-device; and it holds `policies`/`labels`, not a network address. Even a labeler's own endpoint lives in its DID document, not here |
  | `app.bsky.actor.profile` | identity presentation | singleton, no address fields |

  **The pattern, which is why no fifth candidate would change the answer:** atproto puts
  *network location* in the DID document and everything else in records. There is no record
  type for "an address" because addresses were never meant to be records. Ours is a record
  precisely because it is **per-device and changes at a cadence a DID document cannot
  carry** — and because the value it must hold is a public key, which the DID document's
  service field is not allowed to contain.

### `ing.croft.call.grant`

- **Holds** — who may call: a `matcher` (tagged union), optionally the `devices` it
  authorizes and a `policyRef`. Keyed by an opaque grant id carried in the invite link.
  **World-readable, and deliberately does not name the grantee** (contract §8) — the
  capability is proven at mint time, not published.
- **Why ours** — a capability granted to an unnamed bearer, against the grantee's own
  device set. It is not a follow, a block, a list membership or an invite to a service.
- **Ecosystem check (2026-09-08).**

  | Candidate | Why it does not hold this |
  |---|---|
  | `app.bsky.graph.list` + `listitem` | a `listitem` **names the subject DID**. A grant must not name the grantee (contract §8) — that anonymity is the security property, not a detail. Also inverted authorship, the same asymmetry forage recorded for memberships |
  | `app.bsky.graph.starterpack` | a list plus feeds for onboarding; names its members |
  | `com.atproto.server.createInviteCode` / `createInviteCodes` | **procedures, not records** — server-side, for account creation, and nothing to put in a repo |
  | `tools.ozone.verification.grantVerifications` | an ozone procedure on the moderation side; "grant" is the same word for a different act |

  **The pattern:** every sharing primitive in the official set **names its subject** — that
  is what makes them useful for graphs. A bearer capability that is deliberately anonymous
  in the grantee has no analogue, and could not be built from one without giving up the
  property it exists for.

### `ing.croft.call.policy`

- **Holds** — the limits a grant is evaluated under, so conditions are edited once and
  referenced by many grants.
- **Why ours** — the conditions half of the capability model above; it exists only because
  `grant` exists.
- **Ecosystem check (2026-09-08).** Nothing in the official corpus holds "the conditions a
  capability is evaluated under". The nearest things are XRPC procedures that *apply*
  limits server-side (`com.atproto.server.*` invite handling, `tools.ozone.*`), and a
  procedure has no repo record to reference. `app.bsky.actor.defs` preference types are
  the closest record-shaped thing and are private-to-owner display settings, not
  third-party-evaluated conditions. It is a separate type from `grant` for one stated
  reason — editing conditions once for many grants — and would otherwise be inlined.

## Consumes (defined elsewhere, used here)

- `com.atproto.repo.getRecord` / `listRecords` — how every type above is read, unauthenticated.
- `com.atproto.repo.putRecord` / `deleteRecord` — how a subscriber publishes and revokes.

No type in `ing.croft.*` is minted for anything the `com.atproto.*` surface already does.

## Owed

- ~~Close the three ecosystem checks.~~ **Done 2026-09-08** — see each entry and the method
  note above. The exemption list is empty.
- ~~A test pinning this register.~~ **Done 2026-09-08** —
  `web-tests/lexicon-register.test.js`. The pin is **within-repo**: `contract.md` DEFINES
  the collections, so it is the authority, and the register must cover exactly what it
  defines — no missing entries, nothing invented, all three fields present, and no entry
  still saying `NOT DONE`.

  **It was watched fail before being trusted**, in all three directions: a renamed entry
  trips both the missing-entry and the invented-entry assertions, and a re-marked check
  trips the exemption assertion. There is also a non-vacuity assertion, because two empty
  sets compare equal and a regex that quietly stopped matching would otherwise make the
  whole file pass while checking nothing.

  **The trigger needed fixing for the gate to be real.** `web.yml` fired only on
  `web/**`, `web-tests/**` and the package files — so a collection added to
  `contract.md`, which is precisely the drift this gate exists to catch, touches only
  `docs/` and would have sailed past a gate that never ran. Both `contract.md` and this
  file are now in the `push` and `pull_request` path filters.

  **The trigger fix was proven end to end by a docs-only change.** The PR that added it
  also touched `web-tests/` and `web.yml`, which were already in the filter — so its green
  `test` job proved nothing about the new paths. This paragraph arrived in a commit
  touching **only this file**; that the suite ran at all is the evidence, and it is the
  reason the paragraph exists.

  Not covered, and deliberately: the client's own constants
  (`croft/android/app/.../caps/Xrpc.kt`) are in another repo, so this test cannot read
  them. A collection renamed there without the contract changing would still drift
  silently. Closing that needs a cross-repo check and is a different piece of work.

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
