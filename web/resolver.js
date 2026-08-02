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
export const RKEY = 'self';
export const SCHEME = 'croftcall';

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

/**
 * Read the caller's `ing.croft.iroh.endpoint` record (rkey `self`) from their
 * own PDS. Returns { endpointId, homeRelay, createdAt }. Throws if the record
 * is absent (getJson rejects on 4xx) or present but missing `endpointId`.
 */
export async function fetchCallingRecord(fetchImpl, pdsUrl, did) {
  const r = await getJson(
    fetchImpl,
    pdsUrl.replace(/\/$/, '') +
      '/xrpc/com.atproto.repo.getRecord?repo=' + encodeURIComponent(did) +
      '&collection=' + COLLECTION + '&rkey=' + RKEY,
  );
  const value = r.value || {};
  if (!value.endpointId) throw new Error('record missing endpointId');
  return {
    endpointId: value.endpointId,
    homeRelay: value.homeRelay || '',
    createdAt: value.createdAt,
  };
}

/**
 * Build the croftcall deep link per docs/contract.md:
 *   croftcall://call?endpoint=<id>&relay=<url>&handle=<h>&did=<did>
 * `endpoint` is required; every value is URL-encoded; optional empty values
 * are omitted.
 */
export function buildDeepLink({ endpointId, relay, handle, did } = {}) {
  if (!endpointId) throw new Error('endpointId required');
  let uri = SCHEME + '://call?endpoint=' + encodeURIComponent(endpointId);
  if (relay) uri += '&relay=' + encodeURIComponent(relay);
  if (handle) uri += '&handle=' + encodeURIComponent(handle);
  if (did) uri += '&did=' + encodeURIComponent(did);
  return uri;
}
