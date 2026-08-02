import { describe, it, expect } from 'vitest';
import {
  resolveHandle,
  resolvePds,
  pdsFromDidDoc,
  fetchCallingRecord,
  buildDeepLink,
  normalizeHandle,
} from '../web/resolver.js';

// Minimal stub fetch: `routes` maps a URL-substring to a response spec.
// spec = { json } (200) or { status, json } (error). The first substring that
// appears in the requested URL wins, so tests stay declarative.
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error('no stub route for ' + url);
    const spec = routes[key];
    const status = spec.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => spec.json,
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('resolveHandle', () => {
  it('resolves a handle to a DID and URL-encodes the query', async () => {
    const f = stubFetch({
      'com.atproto.identity.resolveHandle': { json: { did: 'did:plc:abc123' } },
    });
    const did = await resolveHandle(f, 'Alice.bsky.social');
    expect(did).toBe('did:plc:abc123');
    // normalized: leading @ dropped, lowercased
    expect(f.calls[0]).toContain('handle=alice.bsky.social');
  });

  it('strips a leading @ before resolving', async () => {
    const f = stubFetch({
      'com.atproto.identity.resolveHandle': { json: { did: 'did:plc:xyz' } },
    });
    await resolveHandle(f, '@bob.test');
    expect(f.calls[0]).toContain('handle=bob.test');
  });

  it('throws when the account is not found', async () => {
    const f = stubFetch({
      'com.atproto.identity.resolveHandle': { status: 400, json: { message: 'Unable to resolve handle' } },
    });
    await expect(resolveHandle(f, 'nope.invalid')).rejects.toThrow(/resolve handle/i);
  });
});

describe('pdsFromDidDoc / resolvePds', () => {
  const plcDoc = {
    service: [
      { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' },
    ],
  };

  it('extracts the PDS by fragment id', () => {
    expect(pdsFromDidDoc(plcDoc)).toBe('https://pds.example.com');
  });

  it('extracts the PDS by full did-scoped id', () => {
    const doc = { service: [{ id: 'did:plc:abc#atproto_pds', serviceEndpoint: 'https://pds2.example.com' }] };
    expect(pdsFromDidDoc(doc)).toBe('https://pds2.example.com');
  });

  it('returns null when no PDS service is present', () => {
    expect(pdsFromDidDoc({ service: [{ id: '#atproto_labeler', serviceEndpoint: 'x' }] })).toBeNull();
    expect(pdsFromDidDoc({})).toBeNull();
  });

  it('resolves a did:plc via plc.directory', async () => {
    const f = stubFetch({ 'plc.directory': { json: plcDoc } });
    const pds = await resolvePds(f, 'did:plc:abc123');
    expect(pds).toBe('https://pds.example.com');
    expect(f.calls[0]).toContain('plc.directory/did%3Aplc%3Aabc123');
  });

  it('resolves a did:web using the host segment only', async () => {
    const webDoc = { service: [{ id: '#atproto_pds', serviceEndpoint: 'https://self.example.org' }] };
    const f = stubFetch({ '/.well-known/did.json': { json: webDoc } });
    // host has a path segment after the colon that must be dropped
    const pds = await resolvePds(f, 'did:web:example.org:extra:path');
    expect(pds).toBe('https://self.example.org');
    expect(f.calls[0]).toBe('https://example.org/.well-known/did.json');
  });

  it('throws when the DID document has no PDS service', async () => {
    const f = stubFetch({ 'plc.directory': { json: { service: [] } } });
    await expect(resolvePds(f, 'did:plc:none')).rejects.toThrow(/no PDS service/i);
  });

  it('throws on an unsupported DID method', async () => {
    const f = stubFetch({});
    await expect(resolvePds(f, 'did:key:zzzz')).rejects.toThrow(/unsupported DID method/i);
  });
});

describe('fetchCallingRecord', () => {
  it('returns endpointId and homeRelay from the record value', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': {
        json: { value: { endpointId: 'ep-abc', homeRelay: 'https://relay.example', createdAt: '2026-01-01' } },
      },
    });
    const rec = await fetchCallingRecord(f, 'https://pds.example.com/', 'did:plc:abc');
    expect(rec).toEqual({ endpointId: 'ep-abc', homeRelay: 'https://relay.example', createdAt: '2026-01-01' });
    // trailing slash on the PDS url is trimmed, contract collection/rkey present
    expect(f.calls[0]).toContain('https://pds.example.com/xrpc/com.atproto.repo.getRecord');
    expect(f.calls[0]).toContain('collection=ing.croft.iroh.endpoint');
    expect(f.calls[0]).toContain('rkey=self');
  });

  it('defaults homeRelay to empty string when absent', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': { json: { value: { endpointId: 'ep-only' } } },
    });
    const rec = await fetchCallingRecord(f, 'https://pds.example.com', 'did:plc:abc');
    expect(rec.endpointId).toBe('ep-only');
    expect(rec.homeRelay).toBe('');
  });

  it('throws when the record is missing (404)', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': { status: 404, json: { message: 'Could not locate record' } },
    });
    await expect(fetchCallingRecord(f, 'https://pds.example.com', 'did:plc:abc')).rejects.toThrow(/locate record/i);
  });

  it('throws when the record exists but has no endpointId', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': { json: { value: { homeRelay: 'https://relay.example' } } },
    });
    await expect(fetchCallingRecord(f, 'https://pds.example.com', 'did:plc:abc')).rejects.toThrow(/endpointId/i);
  });
});

describe('buildDeepLink', () => {
  it('builds the contract link with every field, in order', () => {
    const uri = buildDeepLink({ endpointId: 'ep1', relay: 'https://r', handle: 'alice.test', did: 'did:plc:abc' });
    expect(uri).toBe('croftcall://call?endpoint=ep1&relay=https%3A%2F%2Fr&handle=alice.test&did=did%3Aplc%3Aabc');
  });

  it('omits optional fields when empty', () => {
    expect(buildDeepLink({ endpointId: 'ep1' })).toBe('croftcall://call?endpoint=ep1');
  });

  it('URL-encodes +, /, and : inside values', () => {
    const uri = buildDeepLink({ endpointId: 'a+b/c:d', relay: 'wss://relay.example/path?x=1' });
    expect(uri).toContain('endpoint=a%2Bb%2Fc%3Ad');
    expect(uri).toContain('relay=wss%3A%2F%2Frelay.example%2Fpath%3Fx%3D1');
    // decoding round-trips back to the originals
    const params = new URLSearchParams(uri.split('?')[1]);
    expect(params.get('endpoint')).toBe('a+b/c:d');
    expect(params.get('relay')).toBe('wss://relay.example/path?x=1');
  });

  it('throws when endpointId is missing', () => {
    expect(() => buildDeepLink({ handle: 'x' })).toThrow(/endpointId required/i);
    expect(() => buildDeepLink()).toThrow(/endpointId required/i);
  });
});

describe('normalizeHandle', () => {
  it('trims, drops @, lowercases, and tolerates nullish input', () => {
    expect(normalizeHandle('  @Alice.BSKY.Social ')).toBe('alice.bsky.social');
    expect(normalizeHandle(null)).toBe('');
    expect(normalizeHandle(undefined)).toBe('');
  });
});
