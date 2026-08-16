import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { areMutuals, evaluateMatcher } from '../web/resolver.js';

const nodeSha = (s) => createHash('sha256').update(s).digest('hex');

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

// getRelationships(actor=A, others=[B]) → relationships[0].following present iff A→B,
// .followedBy present iff B→A. Mutual iff both.
const rel = (following, followedBy) => ({
  'app.bsky.graph.getRelationships': {
    json: { relationships: [{ did: 'did:plc:b', ...(following ? { following: 'at://f' } : {}), ...(followedBy ? { followedBy: 'at://g' } : {}) }] },
  },
});

describe('areMutuals (social-graph primitive, app.bsky.graph.getRelationships)', () => {
  it('is true only when the actor both follows and is followed by the other', async () => {
    const f = stubFetch(rel(true, true));
    expect(await areMutuals(f, 'did:plc:a', 'did:plc:b')).toBe(true);
    // queries the public AppView with both actors
    expect(f.calls[0]).toContain('app.bsky.graph.getRelationships');
    expect(f.calls[0]).toContain('actor=did%3Aplc%3Aa');
    expect(f.calls[0]).toContain('others=did%3Aplc%3Ab');
  });

  it('is false when only one direction holds, or neither', async () => {
    expect(await areMutuals(stubFetch(rel(true, false)), 'did:plc:a', 'did:plc:b')).toBe(false);
    expect(await areMutuals(stubFetch(rel(false, true)), 'did:plc:a', 'did:plc:b')).toBe(false);
    expect(await areMutuals(stubFetch(rel(false, false)), 'did:plc:a', 'did:plc:b')).toBe(false);
  });

  it('is false when the other actor is not found (no relationship object)', async () => {
    const f = stubFetch({ 'app.bsky.graph.getRelationships': { json: { relationships: [{ actor: 'did:plc:b' }] } } });
    expect(await areMutuals(f, 'did:plc:a', 'did:plc:b')).toBe(false);
  });
});

describe('evaluateMatcher (does this grant admit the caller?) — fails closed', () => {
  const calleeDid = 'did:plc:callee';

  it('ticket: true only when the presented secret matches', async () => {
    const m = { type: 'ticket', secretHash: nodeSha('s3cr3t') };
    expect(await evaluateMatcher(stubFetch({}), m, { secret: 's3cr3t' })).toBe(true);
    expect(await evaluateMatcher(stubFetch({}), m, { secret: 'wrong' })).toBe(false);
    expect(await evaluateMatcher(stubFetch({}), m, {})).toBe(false); // no secret
  });

  it('mutuals: true only when the proven caller is a mutual of the callee', async () => {
    const m = { type: 'mutuals' };
    expect(await evaluateMatcher(stubFetch(rel(true, true)), m, { provenDid: 'did:plc:a', calleeDid })).toBe(true);
    expect(await evaluateMatcher(stubFetch(rel(true, false)), m, { provenDid: 'did:plc:a', calleeDid })).toBe(false);
  });

  it('mutuals: false without a proven caller identity (never calls the graph)', async () => {
    const f = stubFetch(rel(true, true));
    expect(await evaluateMatcher(f, { type: 'mutuals' }, { calleeDid })).toBe(false);
    expect(f.calls.length).toBe(0);
  });

  it('registeredCallers: true iff the proven caller DID is in the list', async () => {
    const m = { type: 'registeredCallers', dids: ['did:plc:x', 'did:plc:a'] };
    expect(await evaluateMatcher(stubFetch({}), m, { provenDid: 'did:plc:a' })).toBe(true);
    expect(await evaluateMatcher(stubFetch({}), m, { provenDid: 'did:plc:z' })).toBe(false);
    expect(await evaluateMatcher(stubFetch({}), m, {})).toBe(false); // no proven caller
  });

  it('fails closed on an unknown matcher type', async () => {
    expect(await evaluateMatcher(stubFetch({}), { type: 'wat' }, { provenDid: 'did:plc:a' })).toBe(false);
    expect(await evaluateMatcher(stubFetch({}), {}, { provenDid: 'did:plc:a' })).toBe(false);
  });

  it('fails closed on a malformed registeredCallers matcher (no dids)', async () => {
    expect(await evaluateMatcher(stubFetch({}), { type: 'registeredCallers' }, { provenDid: 'did:plc:a' })).toBe(false);
  });

  it('areMutuals fails closed on an empty/malformed relationships response', async () => {
    expect(await areMutuals(stubFetch({ 'app.bsky.graph.getRelationships': { json: { relationships: [] } } }), 'did:plc:a', 'did:plc:b')).toBe(false);
    expect(await areMutuals(stubFetch({ 'app.bsky.graph.getRelationships': { json: {} } }), 'did:plc:a', 'did:plc:b')).toBe(false);
  });
});
