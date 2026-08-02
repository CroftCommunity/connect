# ADR-0002: Resolving the iroh `VERIFY` markers in CallPeer.kt

Status: accepted (2026-08-02)

## Context

The Android scaffold's `net/CallPeer.kt` carried `VERIFY` markers on the
accept/connect/bi-stream/stream-io API names. The bind/identity/lifecycle calls
were already verified against docs.iroh.computer/languages/kotlin; the
stream-level names were written against the docs' "maps 1:1 to Rust" claim and
needed confirmation before first compile.

## What was checked, and when

Fetched 2026-08-02:

- n0's reference Android app, `hello-iroh-ffi/kotlin-android/app/src/main/java/`
  `computer/iroh/dot/net/IrohPeer.kt` and `.../net/PeerSession.kt` — the
  known-good, compiling accept/connect/stream shape the scaffold's comments
  point to.
- iroh-ffi `src/net.rs` — confirmed `EndpointAddr` shape used by `connect`.

## Corrections (names/signatures only; architecture untouched)

| concern             | scaffold (VERIFY, wrong)            | corrected (reference app)                                             |
|---------------------|-------------------------------------|----------------------------------------------------------------------|
| accept a connection | `ep.accept()`                       | `ep.acceptNext()` → `incoming.accept()` → `accepting.connect()`      |
| dial a peer         | `ep.connect(EndpointId.fromString(id), ALPN)` | `EndpointId.fromString(id)` → `EndpointAddr(id, null, emptyList())` → `ep.connect(addr, ALPN)` |
| bi-stream (in/out)  | `conn.acceptBi()` / `conn.openBi()` returning a sendable stream | same calls, but they return a `BiStream` split via `bi.send()` / `bi.recv()` |
| write to stream     | `stream.send(bytes)`                | `bi.send().writeAll(bytes)`                                          |
| read from stream    | `stream.recvExact(2u)` (UInt)       | `bi.recv().readExact(2uL)` (`readExact(size: ULong) -> ByteArray`)   |
| remote id           | `conn.remoteId()`                   | `conn.remoteId()` (already correct)                                  |

`remoteId()` and the bind/identity/lifecycle calls were already correct and are
unchanged.

## Residual uncertainty

`readExact`'s argument is passed as `ULong` here, matching uniffi's u64 size
convention and the reference app's usage. This is the one name/type that the
Dokka class page could not be opened to confirm character-for-character; the CI
compile in `android.yml` is the backstop. If it rejects `ULong`, the only change
is the literal suffix (`2u` vs `2uL`) and the `.toULong()`/`.toUInt()` on
`frameLength`, isolated to `CallPeer.readHello`.

## Not changed

Architecture, state machine, the `endpointOptions` relay seam, and the
`presetN0()` default all stay as scaffolded.
