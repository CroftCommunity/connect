// Croft Exchange resolution pipeline.
//
// Pure, dependency-free ES module: the whole atproto -> iroh lookup as four
// async functions plus small helpers. Every network-touching function takes a
// `fetch` implementation as its first argument so tests inject a stub and the
// browser injects the real `window.fetch`. Nothing here reads the DOM.
//
// This module is the source of truth for the client half of the contract in
// docs/contract.md (record shape + deep link); index.html is only glue.

export const COLLECTION = 'ing.croft.iroh.endpoint';
export const GRANT_COLLECTION = 'ing.croft.call.grant';
export const POLICY_COLLECTION = 'ing.croft.call.policy';
export const RKEY = 'self';
export const SCHEME = 'croftcall';
export const EXCHANGE_ORIGIN = 'https://connect.croft.ing';
export const APPVIEW = 'https://public.api.bsky.app';

/** GET `url` and parse JSON, throwing an Error (with `.status`) on non-2xx. */
export async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (_) { /* body not JSON */ }
    const err = new Error(detail || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Normalise user input into a bare lowercase handle (drops a leading @). */
export function normalizeHandle(handle) {
  return String(handle == null ? '' : handle).trim().replace(/^@/, '').toLowerCase();
}

/** handle -> DID via the public AppView identity XRPC. */
export async function resolveHandle(fetchImpl, handle) {
  const clean = normalizeHandle(handle);
  const r = await getJson(
    fetchImpl,
    'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=' +
      encodeURIComponent(clean),
  );
  return r.did;
}

/** Pull the atproto PDS service endpoint out of a DID document, or null. */
export function pdsFromDidDoc(doc) {
  const services = (doc && doc.service) || [];
  const svc = services.find((s) =>
    s.id === '#atproto_pds' ||
    (s.id || '').endsWith('#atproto_pds') ||
    s.type === 'AtprotoPersonalDataServer');
  return svc ? svc.serviceEndpoint : null;
}

/**
 * DID -> PDS base URL. `did:plc:` resolves via plc.directory; `did:web:` via
 * the host's /.well-known/did.json (host is the segment after `did:web:`,
 * before any `:` path). Throws if the method is unsupported or no PDS is listed.
 */
export async function resolvePds(fetchImpl, did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    doc = await getJson(fetchImpl, 'https://plc.directory/' + encodeURIComponent(did));
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).split(':')[0];
    doc = await getJson(fetchImpl, 'https://' + host + '/.well-known/did.json');
  } else {
    throw new Error('unsupported DID method');
  }
  const pds = pdsFromDidDoc(doc);
  if (!pds) throw new Error('no PDS service in DID document');
  return pds;
}

/** GET one record's `value` from a repo by collection + rkey (getRecord). */
async function getRecordValue(fetchImpl, pdsUrl, did, collection, rkey) {
  const r = await getJson(
    fetchImpl,
    pdsUrl.replace(/\/$/, '') +
      '/xrpc/com.atproto.repo.getRecord?repo=' + encodeURIComponent(did) +
      '&collection=' + collection + '&rkey=' + encodeURIComponent(rkey),
  );
  return r.value || {};
}

/**
 * Read one device's `ing.croft.iroh.endpoint` record (rkey `self` by default,
 * or a named device per contract §1). Returns { endpointId, homeRelay,
 * createdAt }. Throws if the record is absent (getJson rejects on 4xx) or
 * present but missing `endpointId`.
 */
export async function fetchEndpoint(fetchImpl, pdsUrl, did, rkey = RKEY) {
  const value = await getRecordValue(fetchImpl, pdsUrl, did, COLLECTION, rkey);
  if (!value.endpointId) throw new Error('record missing endpointId');
  return {
    endpointId: value.endpointId,
    homeRelay: value.homeRelay || '',
    createdAt: value.createdAt,
  };
}

/** v1 compatibility: the primary (`self`) device's endpoint record. */
export function fetchCallingRecord(fetchImpl, pdsUrl, did) {
  return fetchEndpoint(fetchImpl, pdsUrl, did, RKEY);
}

/**
 * Enumerate a repo's devices via `com.atproto.repo.listRecords` (contract §1;
 * no auth). Returns [{ rkey, endpointId, homeRelay, label }] with the rkey
 * derived from each record's `uri`, skipping malformed records (no endpointId).
 */
export async function listEndpoints(fetchImpl, pdsUrl, did) {
  const r = await getJson(
    fetchImpl,
    pdsUrl.replace(/\/$/, '') +
      '/xrpc/com.atproto.repo.listRecords?repo=' + encodeURIComponent(did) +
      '&collection=' + COLLECTION,
  );
  return (r.records || [])
    .map((rec) => {
      const value = rec.value || {};
      return {
        rkey: String(rec.uri || '').split('/').pop() || '',
        endpointId: value.endpointId || '',
        homeRelay: value.homeRelay || '',
        label: value.label || '',
      };
    })
    .filter((d) => d.endpointId);
}

/**
 * Read a grant record (contract §2). Returns { matcher, devices, policyRef,
 * createdAt }. Throws if the record has no `matcher`.
 */
export async function fetchGrant(fetchImpl, pdsUrl, did, rkey) {
  const value = await getRecordValue(fetchImpl, pdsUrl, did, GRANT_COLLECTION, rkey);
  if (!value.matcher) throw new Error('grant record missing matcher');
  return {
    matcher: value.matcher,
    devices: value.devices || [],
    policyRef: value.policyRef || '',
    createdAt: value.createdAt,
  };
}

/** Read a policy record (contract §3). Returns { rules, label, createdAt }. */
export async function fetchPolicy(fetchImpl, pdsUrl, did, rkey) {
  const value = await getRecordValue(fetchImpl, pdsUrl, did, POLICY_COLLECTION, rkey);
  return { rules: value.rules || [], label: value.label, createdAt: value.createdAt };
}

/**
 * Build the croftcall deep link per docs/contract.md:
 *   croftcall://call?endpoint=<id>&relay=<url>&handle=<h>&did=<did>
 * `endpoint` is required; every value is URL-encoded; optional empty values
 * are omitted.
 */
export function buildDeepLink({ endpointId, relay, handle, did, device, grant } = {}) {
  if (!endpointId) throw new Error('endpointId required');
  let uri = SCHEME + '://call?endpoint=' + encodeURIComponent(endpointId);
  if (relay) uri += '&relay=' + encodeURIComponent(relay);
  if (handle) uri += '&handle=' + encodeURIComponent(handle);
  if (did) uri += '&did=' + encodeURIComponent(did);
  if (device) uri += '&device=' + encodeURIComponent(device);
  if (grant) uri += '&grant=' + encodeURIComponent(grant);
  return uri;
}

// --- Capability model: tickets, invite links, redemption (contract §2, §4, §6) ---

/** SHA-256 of `input` as lowercase hex, via WebCrypto (browser + Node). */
export async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build an invite link per contract §4:
 *   https://connect.croft.ing/redeem?repo=<did-or-handle>&grant=<rkey>[&device=<rkey>]#<secret>
 * `repo` and `grant` are required. A ticket's `secret` goes in the FRAGMENT
 * (never the query, so it never reaches a server); rule grants omit it.
 */
export function buildInviteLink({ origin = EXCHANGE_ORIGIN, repo, grant, device, secret } = {}) {
  if (!repo) throw new Error('repo required');
  if (!grant) throw new Error('grant required');
  let url = origin.replace(/\/$/, '') + '/redeem?repo=' + encodeURIComponent(repo) +
    '&grant=' + encodeURIComponent(grant);
  if (device) url += '&device=' + encodeURIComponent(device);
  if (secret) url += '#' + encodeURIComponent(secret);
  return url;
}

/** Parse an invite link back into { repo, grant, device, secret }. */
export function parseInviteLink(link) {
  const u = new URL(link);
  const repo = u.searchParams.get('repo') || '';
  if (!repo) throw new Error('invite link missing repo');
  const grant = u.searchParams.get('grant') || '';
  if (!grant) throw new Error('invite link missing grant');
  return {
    repo,
    grant,
    device: u.searchParams.get('device') || '',
    secret: u.hash ? decodeURIComponent(u.hash.slice(1)) : '',
  };
}

/** True iff `secret` hashes to `secretHash` (contract §2 ticket matcher). */
export async function verifyTicketSecret(secret, secretHash) {
  return (await sha256Hex(secret)) === String(secretHash).toLowerCase();
}

/**
 * Enforce the subset of policy rules a static page can honestly check at redeem
 * time (contract §6): only `expires`. Use-based rules (`maxUses`,
 * `burnOnSuccess`) are call-time only (§7) and deliberately ignored here.
 */
function enforceRedeemTimeRules(rules, now) {
  for (const rule of rules || []) {
    if (rule.type === 'expires' && now > Date.parse(rule.at)) {
      throw new Error('grant expired');
    }
  }
}

/**
 * Redeem a ticket invite link to a `croftcall://` deep link (contract §6).
 * Pure read: resolves the repo, verifies the ticket secret against the grant,
 * enforces redeem-time policy rules, reads the chosen device endpoint, and
 * builds the deep link carrying `grant` (and `device`) for call-time re-check.
 */
export async function redeemTicket(fetchImpl, inviteLink, { now = Date.now() } = {}) {
  const { repo, grant, device, secret } = parseInviteLink(inviteLink);
  const did = repo.startsWith('did:') ? repo : await resolveHandle(fetchImpl, repo);
  const pds = await resolvePds(fetchImpl, did);

  const g = await fetchGrant(fetchImpl, pds, did, grant);
  if (g.matcher.type !== 'ticket') throw new Error('grant is not a ticket');
  if (!secret) throw new Error('ticket invite missing secret');
  if (!(await verifyTicketSecret(secret, g.matcher.secretHash))) {
    throw new Error('ticket secret does not match');
  }
  if (g.policyRef) {
    const policy = await fetchPolicy(fetchImpl, pds, did, g.policyRef);
    enforceRedeemTimeRules(policy.rules, now);
  }

  const chosen = device || g.devices[0] || RKEY;
  const ep = await fetchEndpoint(fetchImpl, pds, did, chosen);
  return buildDeepLink({
    endpointId: ep.endpointId,
    relay: ep.homeRelay,
    did,
    device: chosen === RKEY ? '' : chosen,
    grant,
  });
}

// --- Rule matchers: identity-based qualification (contract §2) ---

/**
 * Social-graph primitive: is `actorDid` a mutual of `otherDid`? Reads
 * app.bsky.graph.getRelationships on the public AppView (no auth) — mutual iff
 * the actor both follows (`following`) and is followed by (`followedBy`) the other.
 */
export async function areMutuals(fetchImpl, actorDid, otherDid) {
  const r = await getJson(
    fetchImpl,
    APPVIEW + '/xrpc/app.bsky.graph.getRelationships?actor=' + encodeURIComponent(actorDid) +
      '&others=' + encodeURIComponent(otherDid),
  );
  const rel = (r.relationships || [])[0] || {};
  return Boolean(rel.following) && Boolean(rel.followedBy);
}

/**
 * Does a grant's matcher admit the caller (contract §2)? Fails closed: an
 * unknown type, a missing secret, or a rule with no proven caller identity all
 * return false. `context` = { provenDid, secret, calleeDid }:
 *   ticket            → the presented `secret` hashes to `matcher.secretHash`
 *   mutuals           → `provenDid` is a mutual of `calleeDid`
 *   registeredCallers → `provenDid` is in `matcher.dids`
 * Identity proof (obtaining `provenDid`) is the caller's job — Phase 11 (§7).
 */
export async function evaluateMatcher(fetchImpl, matcher, context = {}) {
  const { provenDid, secret, calleeDid } = context;
  switch (matcher && matcher.type) {
    case 'ticket':
      return Boolean(secret) && verifyTicketSecret(secret, matcher.secretHash);
    case 'mutuals':
      return Boolean(provenDid) && areMutuals(fetchImpl, provenDid, calleeDid);
    case 'registeredCallers':
      return Boolean(provenDid) && (matcher.dids || []).includes(provenDid);
    default:
      return false;
  }
}

// --- Call-time evaluation: composable revocation rules (contract §7) ---
// Reference implementation of the call-time interface. The relay mirrors this in
// Phase 11; the static redeem page enforces only the `expires` subset (§6).

/**
 * Do all composable revocation rules still hold? Fails closed: an unknown rule
 * type denies. `context` = { now, usesSoFar } where usesSoFar is the count of
 * prior *successful* calls under this grant (observable only at call time).
 *   expires       → now is not past `rule.at`
 *   maxUses       → usesSoFar < rule.n
 *   burnOnSuccess → usesSoFar < 1  (one-use)
 */
export function evaluateRules(rules, { now = Date.now(), usesSoFar = 0 } = {}) {
  for (const rule of rules || []) {
    switch (rule && rule.type) {
      case 'expires':
        if (now > Date.parse(rule.at)) return false;
        break;
      case 'maxUses':
        if (usesSoFar >= rule.n) return false;
        break;
      case 'burnOnSuccess':
        if (usesSoFar >= 1) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

/**
 * Should a call be admitted (contract §7)? Admit iff the grant still exists AND
 * its matcher holds AND every revocation rule holds. `context` = { grantExists,
 * provenDid, secret, calleeDid, now, usesSoFar }. Cheap checks (existence, rules)
 * run before the matcher, which may touch the network for `mutuals`.
 */
export async function evaluateGrant(fetchImpl, grant, context = {}) {
  if (context.grantExists === false) return false;
  if (!evaluateRules(grant.rules, context)) return false;
  return evaluateMatcher(fetchImpl, grant.matcher, context);
}
