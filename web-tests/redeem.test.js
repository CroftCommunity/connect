import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  sha256Hex,
  buildInviteLink,
  parseInviteLink,
  verifyTicketSecret,
  fetchEndpoint,
  fetchGrant,
  fetchPolicy,
  redeemTicket,
  buildDeepLink,
  GRANT_COLLECTION,
  POLICY_COLLECTION,
} from '../web/resolver.js';

// Independent SHA-256 (node stdlib) so we never test sha256Hex against itself.
const nodeSha = (s) => createHash('sha256').update(s).digest('hex');

// Same declarative stub as resolver.test.js: first route substring in the URL wins.
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

const PLC_DOC = {
  service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }],
};

describe('sha256Hex', () => {
  it('matches the canonical "abc" vector, lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with an independent SHA-256 for arbitrary input', async () => {
    expect(await sha256Hex('a longer secret value')).toBe(nodeSha('a longer secret value'));
  });
});

describe('buildInviteLink', () => {
  it('puts the ticket secret in the FRAGMENT, repo+grant in the query', () => {
    const link = buildInviteLink({ repo: 'did:plc:callee', grant: 'g1', secret: 's3cr3t' });
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe('https://connect.croft.ing/redeem');
    expect(u.searchParams.get('repo')).toBe('did:plc:callee');
    expect(u.searchParams.get('grant')).toBe('g1');
    // secret is NOT a query param
    expect(u.searchParams.get('secret')).toBeNull();
    expect(u.hash).toBe('#s3cr3t');
  });

  it('includes device when given and omits it otherwise', () => {
    expect(new URL(buildInviteLink({ repo: 'r', grant: 'g', device: 'phone', secret: 's' })).searchParams.get('device')).toBe('phone');
    expect(new URL(buildInviteLink({ repo: 'r', grant: 'g', secret: 's' })).searchParams.get('device')).toBeNull();
  });

  it('omits the fragment for a rule grant (no secret)', () => {
    const link = buildInviteLink({ repo: 'r', grant: 'g' });
    expect(new URL(link).hash).toBe('');
  });

  it('URL-encodes values and honours a custom origin', () => {
    const link = buildInviteLink({ origin: 'https://staging.example', repo: 'did:web:a.b:c', grant: 'g/1', secret: 'a b+c' });
    const u = new URL(link);
    expect(u.origin).toBe('https://staging.example');
    expect(u.searchParams.get('repo')).toBe('did:web:a.b:c');
    expect(u.searchParams.get('grant')).toBe('g/1');
    expect(decodeURIComponent(u.hash.slice(1))).toBe('a b+c');
  });

  it('throws when repo or grant is missing', () => {
    expect(() => buildInviteLink({ grant: 'g', secret: 's' })).toThrow(/repo/i);
    expect(() => buildInviteLink({ repo: 'r', secret: 's' })).toThrow(/grant/i);
  });

  it('trims a trailing slash on a custom origin', () => {
    const link = buildInviteLink({ origin: 'https://x.example/', repo: 'r', grant: 'g', secret: 's' });
    expect(new URL(link).pathname).toBe('/redeem');
  });
});

describe('parseInviteLink', () => {
  it('round-trips buildInviteLink, recovering the secret from the fragment', () => {
    const link = buildInviteLink({ repo: 'did:plc:callee', grant: 'g1', device: 'phone', secret: 's3cr3t' });
    expect(parseInviteLink(link)).toEqual({ repo: 'did:plc:callee', grant: 'g1', device: 'phone', secret: 's3cr3t' });
  });

  it('returns empty strings for absent optionals and ignores unknown params', () => {
    const parsed = parseInviteLink('https://connect.croft.ing/redeem?repo=r&grant=g&extra=ignored');
    expect(parsed).toEqual({ repo: 'r', grant: 'g', device: '', secret: '' });
  });

  it('throws when repo or grant is missing', () => {
    expect(() => parseInviteLink('https://connect.croft.ing/redeem?grant=g#s')).toThrow(/repo/i);
    expect(() => parseInviteLink('https://connect.croft.ing/redeem?repo=r#s')).toThrow(/grant/i);
  });
});

describe('verifyTicketSecret', () => {
  it('is true when the secret hashes to the stored hash', async () => {
    expect(await verifyTicketSecret('s3cr3t', nodeSha('s3cr3t'))).toBe(true);
  });

  it('is false on any mismatch', async () => {
    expect(await verifyTicketSecret('wrong', nodeSha('s3cr3t'))).toBe(false);
  });
});

describe('fetchEndpoint (per-device)', () => {
  it('reads a named device rkey from the endpoint collection', async () => {
    const f = stubFetch({ 'com.atproto.repo.getRecord': { json: { value: { endpointId: 'ep-phone', homeRelay: 'https://r' } } } });
    const rec = await fetchEndpoint(f, 'https://pds.example.com', 'did:plc:abc', 'phone');
    expect(rec.endpointId).toBe('ep-phone');
    expect(f.calls[0]).toContain('collection=ing.croft.iroh.endpoint');
    expect(f.calls[0]).toContain('rkey=phone');
  });

  it('defaults to the self device', async () => {
    const f = stubFetch({ 'com.atproto.repo.getRecord': { json: { value: { endpointId: 'ep-self' } } } });
    await fetchEndpoint(f, 'https://pds.example.com', 'did:plc:abc');
    expect(f.calls[0]).toContain('rkey=self');
  });
});

describe('fetchGrant / fetchPolicy', () => {
  it('reads a grant record and returns its matcher, devices, policyRef', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': { json: { value: { matcher: { type: 'ticket', secretHash: 'ab' }, devices: ['phone'], policyRef: 'p1' } } },
    });
    const g = await fetchGrant(f, 'https://pds.example.com', 'did:plc:abc', 'g1');
    expect(g.matcher).toEqual({ type: 'ticket', secretHash: 'ab' });
    expect(g.devices).toEqual(['phone']);
    expect(g.policyRef).toBe('p1');
    expect(f.calls[0]).toContain('collection=' + GRANT_COLLECTION);
    expect(f.calls[0]).toContain('rkey=g1');
  });

  it('throws when a grant has no matcher', async () => {
    const f = stubFetch({ 'com.atproto.repo.getRecord': { json: { value: { devices: ['phone'] } } } });
    await expect(fetchGrant(f, 'https://pds.example.com', 'did:plc:abc', 'g1')).rejects.toThrow(/matcher/i);
  });

  it('reads a policy record and returns its rules', async () => {
    const f = stubFetch({
      'com.atproto.repo.getRecord': { json: { value: { rules: [{ type: 'expires', at: '2999-01-01T00:00:00Z' }] } } },
    });
    const p = await fetchPolicy(f, 'https://pds.example.com', 'did:plc:abc', 'p1');
    expect(p.rules).toEqual([{ type: 'expires', at: '2999-01-01T00:00:00Z' }]);
    expect(f.calls[0]).toContain('collection=' + POLICY_COLLECTION);
    expect(f.calls[0]).toContain('rkey=p1');
  });
});

describe('buildDeepLink (v2 device + grant)', () => {
  it('appends device and grant after the v1 fields', () => {
    const uri = buildDeepLink({ endpointId: 'ep1', relay: 'https://r', did: 'did:plc:abc', device: 'phone', grant: 'g1' });
    expect(uri).toBe('croftcall://call?endpoint=ep1&relay=https%3A%2F%2Fr&did=did%3Aplc%3Aabc&device=phone&grant=g1');
  });

  it('omits device and grant when absent (v1 output unchanged)', () => {
    expect(buildDeepLink({ endpointId: 'ep1' })).toBe('croftcall://call?endpoint=ep1');
  });
});

describe('redeemTicket (ticket path, end to end with injected fetch)', () => {
  const secret = 's3cr3t';
  const did = 'did:plc:callee';
  function routes({ secretHash = nodeSha(secret), rules = [{ type: 'expires', at: '2999-01-01T00:00:00Z' }] } = {}) {
    return {
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'ticket', secretHash }, devices: ['phone'], policyRef: 'p1' } } },
      ['collection=' + POLICY_COLLECTION]: { json: { value: { rules } } },
      'collection=ing.croft.iroh.endpoint': { json: { value: { endpointId: 'ep-phone', homeRelay: 'https://relay.x' } } },
    };
  }
  const now = Date.parse('2026-06-01T00:00:00Z');

  it('resolves a valid ticket invite to a croftcall deep link carrying grant + device', async () => {
    const f = stubFetch(routes());
    const link = buildInviteLink({ repo: did, grant: 'g1', device: 'phone', secret });
    const deep = await redeemTicket(f, link, { now });
    const u = new URL(deep.replace('croftcall://', 'https://'));
    expect(u.searchParams.get('endpoint')).toBe('ep-phone');
    expect(u.searchParams.get('relay')).toBe('https://relay.x');
    expect(u.searchParams.get('did')).toBe(did);
    expect(u.searchParams.get('device')).toBe('phone');
    expect(u.searchParams.get('grant')).toBe('g1');
  });

  it('rejects when the presented secret does not match the grant', async () => {
    const f = stubFetch(routes({ secretHash: nodeSha('a-different-secret') }));
    const link = buildInviteLink({ repo: did, grant: 'g1', device: 'phone', secret });
    await expect(redeemTicket(f, link, { now })).rejects.toThrow(/secret|ticket/i);
  });

  it('rejects when the policy has expired (redeem-time enforceable)', async () => {
    const f = stubFetch(routes({ rules: [{ type: 'expires', at: '2020-01-01T00:00:00Z' }] }));
    const link = buildInviteLink({ repo: did, grant: 'g1', device: 'phone', secret });
    await expect(redeemTicket(f, link, { now })).rejects.toThrow(/expired/i);
  });

  it('resolves a handle repo before reading records', async () => {
    const f = stubFetch({ ...routes(), 'com.atproto.identity.resolveHandle': { json: { did } } });
    const link = buildInviteLink({ repo: 'callee.bsky.social', grant: 'g1', device: 'phone', secret });
    const deep = await redeemTicket(f, link, { now });
    expect(deep).toContain('endpoint=ep-phone');
    expect(f.calls.some((c) => c.includes('resolveHandle'))).toBe(true);
  });

  it('rejects a non-ticket (rule) grant — redeemTicket is ticket-only', async () => {
    const f = stubFetch({
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'mutuals' } } } },
    });
    const link = buildInviteLink({ repo: did, grant: 'g1', secret });
    await expect(redeemTicket(f, link, { now })).rejects.toThrow(/not a ticket/i);
  });

  it('skips the policy fetch when the grant has no policyRef', async () => {
    // No policy route stubbed: if redeem tried to fetch one, the stub would throw.
    const f = stubFetch({
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'ticket', secretHash: nodeSha(secret) }, devices: ['phone'] } } },
      'collection=ing.croft.iroh.endpoint': { json: { value: { endpointId: 'ep-phone', homeRelay: 'https://relay.x' } } },
    });
    const link = buildInviteLink({ repo: did, grant: 'g1', device: 'phone', secret });
    expect(await redeemTicket(f, link, { now })).toContain('endpoint=ep-phone');
    expect(f.calls.some((c) => c.includes('collection=' + POLICY_COLLECTION))).toBe(false);
  });

  it("falls back to the grant's first device when the invite has no device hint", async () => {
    const f = stubFetch({
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'ticket', secretHash: nodeSha(secret) }, devices: ['laptop'] } } },
      'collection=ing.croft.iroh.endpoint': { json: { value: { endpointId: 'ep-laptop' } } },
    });
    const link = buildInviteLink({ repo: did, grant: 'g1', secret }); // no device
    const deep = await redeemTicket(f, link, { now });
    expect(new URL(deep.replace('croftcall://', 'https://')).searchParams.get('device')).toBe('laptop');
    expect(f.calls.some((c) => c.includes('rkey=laptop'))).toBe(true);
  });

  it('omits the device param when the resolved device is self', async () => {
    const f = stubFetch({
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'ticket', secretHash: nodeSha(secret) }, devices: [] } } },
      'collection=ing.croft.iroh.endpoint': { json: { value: { endpointId: 'ep-self' } } },
    });
    const link = buildInviteLink({ repo: did, grant: 'g1', secret }); // no device
    const deep = await redeemTicket(f, link, { now });
    expect(new URL(deep.replace('croftcall://', 'https://')).searchParams.get('device')).toBeNull();
    expect(f.calls.some((c) => c.includes('rkey=self'))).toBe(true);
  });

  it('does not enforce use-based rules at redeem — maxUses is call-time (§6/§7)', async () => {
    const f = stubFetch({
      'plc.directory': { json: PLC_DOC },
      ['collection=' + GRANT_COLLECTION]: { json: { value: { matcher: { type: 'ticket', secretHash: nodeSha(secret) }, devices: ['phone'], policyRef: 'p1' } } },
      ['collection=' + POLICY_COLLECTION]: { json: { value: { rules: [{ type: 'maxUses', n: 1 }] } } },
      'collection=ing.croft.iroh.endpoint': { json: { value: { endpointId: 'ep-phone' } } },
    });
    const link = buildInviteLink({ repo: did, grant: 'g1', device: 'phone', secret });
    expect(await redeemTicket(f, link, { now })).toContain('endpoint=ep-phone');
  });
});

describe('grant / policy default fields', () => {
  it('fetchGrant defaults devices to [] and policyRef to "" when absent', async () => {
    const f = stubFetch({ 'com.atproto.repo.getRecord': { json: { value: { matcher: { type: 'ticket', secretHash: 'ab' } } } } });
    const g = await fetchGrant(f, 'https://pds.example.com', 'did:plc:abc', 'g1');
    expect(g.devices).toEqual([]);
    expect(g.policyRef).toBe('');
  });

  it('fetchPolicy defaults rules to [] when absent', async () => {
    const f = stubFetch({ 'com.atproto.repo.getRecord': { json: { value: {} } } });
    const p = await fetchPolicy(f, 'https://pds.example.com', 'did:plc:abc', 'p1');
    expect(p.rules).toEqual([]);
  });
});
