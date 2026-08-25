# ADR-0002: Resolving the iroh `VERIFY` markers in CallPeer.kt

Status: accepted (2026-08-02)
Tags: iroh, calling, android

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
| read from stream    | `stream.recvExact(2u)`              | `bi.recv().readExact(2u)` (`readExact(size: UInt) -> ByteArray`)      |
| remote id           | `conn.remoteId()`                   | `conn.remoteId()` (already correct)                                  |

`remoteId()` and the bind/identity/lifecycle calls were already correct and are
unchanged.

## Residual uncertainty — resolved by CI

`readExact`'s size argument was first written as `ULong` (uniffi u64
convention). The first CI compile of `:app:compileDebugKotlin` rejected it with
the only two errors in the whole build:

```
CallPeer.kt:137 Argument type mismatch: actual type is 'ULong', but 'UInt' was expected.
CallPeer.kt:138 Argument type mismatch: actual type is 'ULong', but 'UInt' was expected.
```

So the real signature is `readExact(size: UInt) -> ByteArray`; corrected to
`2u` / `.toUInt()`. Every other corrected name above compiled on the first pass,
confirming the reference-app grounding.

## Not changed

Architecture, state machine, the `endpointOptions` relay seam, and the
`presetN0()` default all stay as scaffolded.
