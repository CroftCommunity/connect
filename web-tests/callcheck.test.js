import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { evaluateGrant, evaluateRules } from '../web/resolver.js';

const nodeSha = (s) => createHash('sha256').update(s).digest('hex');
const noFetch = async () => { throw new Error('no network expected'); };
const now = Date.parse('2026-06-01T00:00:00Z');
const future = '2999-01-01T00:00:00Z';
const past = '2020-01-01T00:00:00Z';

// A ticket grant is the simplest matcher to drive without the graph/network.
const ticketGrant = (rules = []) => ({ matcher: { type: 'ticket', secretHash: nodeSha('s3cr3t') }, rules });
const okCtx = (extra = {}) => ({ secret: 's3cr3t', grantExists: true, now, usesSoFar: 0, ...extra });

describe('evaluateRules (composable revocation rules) — fails closed', () => {
  it('denies a rule whose expiry does not parse — the relay mirror already does (contract §7 divergence, ported back)', () => {
    // Date.parse('never') is NaN and `now > NaN` is false: the old code let
    // an unparseable expiry hold FOREVER. An unevaluable rule cannot be
    // honoured — fail closed, exactly croft-relay-admit's caps.rs posture.
    expect(evaluateRules([{ type: 'expires', at: 'never' }], { now, usesSoFar: 0 })).toBe(false);
    expect(evaluateRules([{ type: 'expires' }], { now, usesSoFar: 0 })).toBe(false);
  });

  it('holds AT the expiry instant and denies one tick past it (mirror: caps.rs "now <= at")', () => {
    const atNow = new Date(now).toISOString();
    expect(evaluateRules([{ type: 'expires', at: atNow }], { now, usesSoFar: 0 })).toBe(true);
    expect(evaluateRules([{ type: 'expires', at: atNow }], { now: now + 1, usesSoFar: 0 })).toBe(false);
  });

  it('passes when every rule holds and denies when any fails', () => {
    expect(evaluateRules([{ type: 'expires', at: future }], { now, usesSoFar: 0 })).toBe(true);
    expect(evaluateRules([{ type: 'expires', at: past }], { now, usesSoFar: 0 })).toBe(false);
    expect(evaluateRules([{ type: 'maxUses', n: 3 }], { now, usesSoFar: 2 })).toBe(true);
    expect(evaluateRules([{ type: 'maxUses', n: 3 }], { now, usesSoFar: 3 })).toBe(false);
    expect(evaluateRules([{ type: 'burnOnSuccess' }], { now, usesSoFar: 0 })).toBe(true);
    expect(evaluateRules([{ type: 'burnOnSuccess' }], { now, usesSoFar: 1 })).toBe(false);
  });

  it('requires ALL rules to hold (composition is AND)', () => {
    const rules = [{ type: 'expires', at: future }, { type: 'maxUses', n: 2 }];
    expect(evaluateRules(rules, { now, usesSoFar: 1 })).toBe(true);
    expect(evaluateRules(rules, { now, usesSoFar: 2 })).toBe(false); // maxUses fails though expires holds
  });

  it('treats an empty/absent rule set as no constraint', () => {
    expect(evaluateRules([], { now })).toBe(true);
    expect(evaluateRules(undefined, { now })).toBe(true);
  });

  it('fails closed on an unknown rule type', () => {
    expect(evaluateRules([{ type: 'wat' }], { now })).toBe(false);
  });
});

describe('evaluateGrant (call-time §7) — grant exists AND matcher holds AND rules hold', () => {
  it('admits a valid ticket with satisfied rules', async () => {
    expect(await evaluateGrant(noFetch, ticketGrant([{ type: 'expires', at: future }]), okCtx())).toBe(true);
  });

  it('denies when the grant no longer exists (deleted = revoked)', async () => {
    expect(await evaluateGrant(noFetch, ticketGrant(), okCtx({ grantExists: false }))).toBe(false);
  });

  it('denies when the matcher fails (wrong secret)', async () => {
    expect(await evaluateGrant(noFetch, ticketGrant(), okCtx({ secret: 'wrong' }))).toBe(false);
  });

  it('denies when a revocation rule fails (expired / over maxUses / already burned)', async () => {
    expect(await evaluateGrant(noFetch, ticketGrant([{ type: 'expires', at: past }]), okCtx())).toBe(false);
    expect(await evaluateGrant(noFetch, ticketGrant([{ type: 'maxUses', n: 1 }]), okCtx({ usesSoFar: 1 }))).toBe(false);
    expect(await evaluateGrant(noFetch, ticketGrant([{ type: 'burnOnSuccess' }]), okCtx({ usesSoFar: 1 }))).toBe(false);
  });
});
