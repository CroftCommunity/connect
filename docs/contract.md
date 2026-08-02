# Croft Call — shared contract

The lookup page (`web/`) and the Android app (`android/`) are two halves of one
system. They agree on exactly two things; this file is the source of truth for
both. If either changes, update this file first, then both halves' tests, then
the implementations.

## 1. Calling record (atproto lexicon)

- Collection: `ing.croft.iroh.endpoint`
- Record key (rkey): `self`
- Location: the subscriber's own atproto repo (their PDS)

Fields:

| field        | type   | required | meaning                                   |
|--------------|--------|----------|-------------------------------------------|
| `endpointId` | string | yes      | the iroh EndpointId to dial               |
| `homeRelay`  | string | no       | relay URL hint; discovery-only if absent  |
| `createdAt`  | string | no       | ISO-8601 timestamp                        |

The page reads it via `com.atproto.repo.getRecord?repo=<did>&collection=ing.croft.iroh.endpoint&rkey=self`.
A record with no `endpointId` is treated as malformed (not "not listed").

## 2. Deep link

```
croftcall://call?endpoint=<id>&relay=<url>&handle=<h>&did=<did>
```

- Scheme `croftcall`, host `call`.
- `endpoint` is **required**; `relay`, `handle`, `did` are optional.
- Every value is URL-encoded by the producer (the page) and URL-decoded by the
  consumer (the app). Empty optional values are omitted from the query.
- Unknown extra query params are ignored by the consumer.

Produced by `web/resolver.js#buildDeepLink`; consumed by
`android/.../DeepLink.kt#parse`. Both are unit-tested against the cases above.

## Resolution pipeline (page side, informative)

1. `handle -> did` via `com.atproto.identity.resolveHandle` on the public AppView.
2. `did -> pds`: `did:plc:` via `plc.directory/<did>`; `did:web:` via
   `https://<host>/.well-known/did.json`; pick the service whose id ends
   `#atproto_pds` or whose type is `AtprotoPersonalDataServer`.
3. `pds -> record` via `com.atproto.repo.getRecord` (fields above).
4. `record -> deep link` per section 2.
