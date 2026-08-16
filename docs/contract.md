# Croft Call — shared contract

The lookup page (`web/`) and the Android app (`android/`) are two halves of one
system. They agree on a small set of record shapes and links; this file is the
source of truth for both. If either changes, update this file first, then both
halves' tests, then the implementations.

> **Ownership & consumers.** This file is the **canonical** calling contract, and
> `connect` owns it. Consumers — the `croft` unified client (which points here as
> ground truth) and the croft-relay tiered-admission plan — track it; they do not
> redefine it. A breaking change is deliberate and coordinated (bump
> `Contract version` below, update the consumers in the same change). Do not fork
> this contract into another repo. See `CLAUDE.md` for the connect/croft/relay split.

**Contract version: 2.** v1 defined a single endpoint record + the deep link.
v2 adds the **capability model** — *who* may call you — as public records in
your own atproto repo: per-device endpoints, grants, and policies. The v1 shapes
are a strict subset (a repo with one `self` endpoint and no grants behaves
exactly as before).

The design and the reasoning behind it live in
`discovery/alpha/plans/2026-08-14-1-plan-connect-cap-issue-redeem.md`. The
one-line model: **a grant is a public record that resolves to yes/no for a
caller at call time; the only thing that varies is *how* a caller qualifies —
by possession (a ticket) or by identity (a rule).**

---

## 1. Endpoint records (per device)

- Collection: `ing.croft.iroh.endpoint`
- Record key (rkey): **one per device.** `self` is the primary device (v1
  compatible); additional devices use any stable slug (e.g. `phone`, `laptop`).
- Location: the subscriber's own atproto repo (their PDS)

Fields:

| field        | type   | required | meaning                                   |
|--------------|--------|----------|-------------------------------------------|
| `endpointId` | string | yes      | the iroh EndpointId to dial               |
| `homeRelay`  | string | no       | relay URL hint; discovery-only if absent  |
| `label`      | string | no       | human name for the device                 |
| `createdAt`  | string | no       | ISO-8601 timestamp                        |

- A specific device is read via
  `com.atproto.repo.getRecord?repo=<did>&collection=ing.croft.iroh.endpoint&rkey=<device>`.
- All of a repo's devices are enumerated via
  `com.atproto.repo.listRecords?repo=<did>&collection=ing.croft.iroh.endpoint`
  (no auth; the exchange page stays backendless).
- The deep link and invite link carry an optional **`?device=<rkey>`** hint
  selecting which device to dial; absent ⇒ `self`.
- A record with no `endpointId` is malformed (not "not listed").

## 2. Grant records — *who may call*

- Collection: `ing.croft.call.grant`
- Record key (rkey): the **grant id** (opaque, referenced by the invite link)
- Location: the subscriber's own atproto repo. **World-readable — a grant must
  not name the grantee** (see §8).

Fields:

| field       | type     | required | meaning                                          |
|-------------|----------|----------|--------------------------------------------------|
| `matcher`   | object   | yes      | how a caller qualifies (tagged union, below)     |
| `devices`   | string[] | no       | endpoint rkeys this grant authorizes; omit = all |
| `policyRef` | string   | no       | rkey into `ing.croft.call.policy` (§3)           |
| `createdAt` | string   | no       | ISO-8601 timestamp                               |

**Matchers combine by OR:** a caller is admitted if *any* grant matches. The
`matcher` object is an open tagged union keyed on `type`:

```
# ticket — qualify by POSSESSION (no caller identity needed)
{ "type": "ticket", "secretHash": "<hex sha256 of the invite secret>" }

# mutuals — qualify by IDENTITY, a preset that names no one
{ "type": "mutuals" }

# registeredCallers — qualify by IDENTITY, an explicit list
{ "type": "registeredCallers", "dids": ["did:plc:...", "did:web:..."] }
```

- `secretHash` is `sha256(secret)` as lowercase hex; the secret itself lives
  only in the invite link's fragment (§4), never in any record.
- `registeredCallers.dids` is stored **plaintext** in v2. Hiding it is a parked
  dial, not a v2 requirement (§8).
- New matcher types (`followsMe`, group/attribute checks) append here with no
  reshape.

## 3. Policy records — *under what limits*

- Collection: `ing.croft.call.policy`
- Record key (rkey): the **policy id**, referenced by `grant.policyRef`
- One policy governs many grants (edit conditions once).

Fields:

| field       | type     | required | meaning                                   |
|-------------|----------|----------|-------------------------------------------|
| `rules`     | object[] | yes      | composable revocation rules (tagged)      |
| `label`     | string   | no       | human name for the policy                 |
| `createdAt` | string   | no       | ISO-8601 timestamp                        |

`rules` is an array of tagged objects, all of which must hold for the grant to
still admit:

```
{ "type": "expires",       "at": "<ISO-8601>" }   # enforceable at redeem AND call time
{ "type": "maxUses",       "n": 10 }              # call-time only (see §7)
{ "type": "burnOnSuccess" }                        # one-use: call-time only (see §7)
```

- **Manual revoke is not a rule** — it is deleting the grant record; readers see
  it gone via `listRecords`/`getRecord`.
- Only `expires` is enforceable by the static redeem page. Everything that
  depends on *use* (`maxUses`, `burnOnSuccess`) is call-time only, because "used"
  means *a call succeeded* — observable only on the callee side (§7).
- New rule types append here with no reshape.

## 4. Invite link — *how a grant is handed out*

```
https://connect.croft.ing/redeem?repo=<did-or-handle>&grant=<rkey>&device=<rkey>#<secret>
```

- `repo` and `grant` are **required**; `device` is optional (§1).
- For a **ticket** grant, the invite secret goes in the URL **fragment**
  (`#<secret>`) — never the query. The fragment never leaves the browser and
  never reaches a server log, which is what keeps redemption backendless and the
  bearer secret private. For **rule** grants there is no fragment.
- Every query value is URL-encoded by the producer and decoded by the consumer.
- Produced by `web/resolver.js#buildInviteLink`; consumed by the redeem flow
  (§6). Both unit-tested.

## 5. Deep link

```
croftcall://call?endpoint=<id>&relay=<url>&handle=<h>&did=<did>&device=<rkey>&grant=<rkey>
```

- Scheme `croftcall`, host `call`. `endpoint` is **required**; all others
  optional.
- Produced by the page **after a successful redeem** (§6); consumed by
  `android/.../DeepLink.kt#parse`.
- `grant` (and, for tickets, a possession proof carried out-of-query — see §7)
  travel to the app so the call can be re-validated at call time. Unknown extra
  query params are ignored by the consumer.
- Every value URL-encoded by the producer, decoded by the consumer; empty
  optionals omitted.

## 6. Redeem flow (page side — normative for `web/`)

The redeem flow is **pure read**. It writes nothing.

1. Parse the invite link (§4): `repo`, `grant`, optional `device`, fragment
   `secret`.
2. Resolve `repo` → `did` → `pds` (resolution pipeline below).
3. `getRecord` the grant (`ing.croft.call.grant`, rkey `grant`).
4. Evaluate the matcher for what the page *can* check now:
   - `ticket`: require a fragment secret and `sha256(secret) == matcher.secretHash`.
   - `mutuals` / `registeredCallers`: identity-proving is a call-time/rule
     concern (§7); the page surfaces the grant as "callable if you are X" rather
     than minting a link for an unproven caller. (Rule redemption UX is M3+.)
5. `getRecord` the policy (if `policyRef`) and enforce the redeem-time rules
   (`expires`). Use-based rules are not checked here (§7).
6. Resolve the device endpoint(s) (§1; `device` hint or `self`).
7. Build the `croftcall://` deep link (§5), carrying `grant` (and, for tickets,
   the possession proof).

## 7. Call-time check (callee side — interface only, wired in Phase 11)

Redemption authorizes *building a link*; it cannot enforce use-based rules,
because a static page cannot observe or record "a call happened." The durable
gate is the callee's device/relay re-validating when a call actually arrives:

- **Input:** the presented `grant` rkey, a possession/identity proof (ticket
  secret, or a DID + signature for rule matchers), and the callee's observed
  history for that grant.
- **Checks (composable):** grant still exists; matcher still holds; every policy
  rule holds — `expires`, `maxUses`, `burnOnSuccess`.
- **"Used" = a call succeeded**, which only this side can observe. `burnOnSuccess`
  (one-use) and `maxUses` are therefore enforced here, never at redeem.
- **Output:** admit / deny.

This is the seam where Cap meets the Membership backbone (relay/CISS). The wire
format of the proof and the history store are Phase 11 / Milestone C work; this
section fixes only the interface so both halves agree on the shape.

## 8. Confidentiality (v2 posture)

- `ticket` grants (a hash) and the `mutuals` preset (names no one) are opaque by
  construction.
- `registeredCallers` stores DIDs **plaintext** in v2 — a reader could see the
  list. This is an accepted, tiered starting point, not the end state.
- **Parked dials** (named, not designed away): hash the DID list (resists
  browsing, not a confirmed guess); hash PDS-derived content to define
  "registered" without an explicit list; fold membership into a broader
  attribute check. Any of these is an additive matcher/field change.

---

## Resolution pipeline (page side, informative)

1. `handle -> did` via `com.atproto.identity.resolveHandle` on the public AppView.
2. `did -> pds`: `did:plc:` via `plc.directory/<did>`; `did:web:` via
   `https://<host>/.well-known/did.json`; pick the service whose id ends
   `#atproto_pds` or whose type is `AtprotoPersonalDataServer`.
3. `pds -> record(s)`: `getRecord` for a known rkey (endpoint `self`/`device`,
   grant, policy); `listRecords` to enumerate a repo's devices or grants.
4. `record -> link` per §4 (invite) or §5 (deep link).
