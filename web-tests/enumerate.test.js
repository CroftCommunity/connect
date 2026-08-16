import { describe, it, expect } from 'vitest';
import { listEndpoints, COLLECTION } from '../web/resolver.js';

// Declarative stub (same shape as resolver.test.js): first route substring wins.
function stubFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error('no stub route for ' + url);
    const spec = routes[key];
    const status = spec.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => spec.json };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('listEndpoints (per-device enumeration via listRecords, contract §1)', () => {
  it('lists every device, deriving rkey from the record uri', async () => {
    const f = stubFetch({
      'com.atproto.repo.listRecords': {
        json: {
          records: [
            { uri: 'at://did:plc:abc/ing.croft.iroh.endpoint/self', value: { endpointId: 'ep-self', label: 'Primary' } },
            { uri: 'at://did:plc:abc/ing.croft.iroh.endpoint/phone', value: { endpointId: 'ep-phone', homeRelay: 'https://r' } },
          ],
        },
      },
    });
    const devices = await listEndpoints(f, 'https://pds.example.com/', 'did:plc:abc');
    expect(devices).toEqual([
      { rkey: 'self', endpointId: 'ep-self', homeRelay: '', label: 'Primary' },
      { rkey: 'phone', endpointId: 'ep-phone', homeRelay: 'https://r', label: '' },
    ]);
    // uses listRecords (not getRecord), trims the trailing slash, names the collection
    expect(f.calls[0]).toContain('https://pds.example.com/xrpc/com.atproto.repo.listRecords');
    expect(f.calls[0]).toContain('collection=' + COLLECTION);
    expect(f.calls[0]).not.toContain('getRecord');
  });

  it('skips malformed records (no endpointId)', async () => {
    const f = stubFetch({
      'com.atproto.repo.listRecords': {
        json: {
          records: [
            { uri: 'at://did:plc:abc/ing.croft.iroh.endpoint/self', value: { endpointId: 'ep-self' } },
            { uri: 'at://did:plc:abc/ing.croft.iroh.endpoint/broken', value: { homeRelay: 'https://r' } },
          ],
        },
      },
    });
    const devices = await listEndpoints(f, 'https://pds.example.com', 'did:plc:abc');
    expect(devices.map((d) => d.rkey)).toEqual(['self']);
  });

  it('returns an empty array when the repo has no endpoint records', async () => {
    const f = stubFetch({ 'com.atproto.repo.listRecords': { json: { records: [] } } });
    expect(await listEndpoints(f, 'https://pds.example.com', 'did:plc:abc')).toEqual([]);
  });
});
