import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

/**
 * The calling record types are DEFINED in `docs/contract.md` (prose tables and
 * tagged-union examples). `lexicons/*.json` is a transcription of that prose
 * into lexicon form, so the contract stays the authority and the JSON must say
 * exactly what the prose says: the same fields, the same required set, the
 * same types, the same meanings — and nothing the prose does not state.
 *
 * "Nothing it does not state" is enforced, not hoped for: a transcription that
 * quietly adds `format: "datetime"` or a `maxLength` has made a decision the
 * contract did not make. Those are open questions (listed in the PR that added
 * these files), and the day one is answered in the contract, this test is where
 * the answer is allowed in.
 *
 * Same within-repo pinning as lexicon-register.test.js: the parse is of this
 * repo's contract, and it asserts the parse is not vacuous before trusting it.
 */

const contract = read('docs/contract.md');

// Split the contract into its numbered sections ("## 1. Endpoint records …").
const sections = contract.split(/^## \d+\. /m).slice(1);

/** Every section that defines a collection, with its field table parsed. */
const collections = sections
  .map((body) => {
    const nsid = body.match(/^- Collection: `([^`]+)`/m)?.[1];
    if (!nsid) return null;
    // "| `endpointId` | string | yes      | the iroh EndpointId to dial |"
    const fields = [...body.matchAll(/^\| `(\w+)`\s*\|\s*([^|]+?)\s*\|\s*(yes|no)\s*\|\s*(.+?)\s*\|$/gm)].map(
      ([, name, type, required, meaning]) => ({ name, type, required: required === 'yes', meaning }),
    );
    // Tagged-union examples in fenced blocks: { "type": "ticket", "secretHash": "<…>" }
    const variants = [...body.matchAll(/^\{\s*"type":\s*"(\w+)"\s*(.*?)\s*\}/gm)].map(([, tag, rest]) => ({
      tag,
      fields: [...rest.matchAll(/"(\w+)":\s*("[^"]*"|\[[^\]]*\]|-?\d+)/g)].map(([, name, example]) => ({
        name,
        type: example.startsWith('"') ? 'string' : example.startsWith('[') ? 'array' : 'integer',
      })),
    }));
    return { nsid, fields, variants };
  })
  .filter(Boolean);

const CALLING_TYPES = ['ing.croft.iroh.endpoint', 'ing.croft.call.grant', 'ing.croft.call.policy'];

// Constraints the contract never states for any field. Their presence in a
// transcription is an invented decision.
const UNSTATED = ['format', 'maxLength', 'minLength', 'maxGraphemes', 'minGraphemes', 'minimum', 'maximum', 'enum', 'const', 'default', 'maxItems', 'minItems'];

const loadLexicon = (nsid) => {
  const path = `lexicons/${nsid}.json`;
  expect(existsSync(join(here, '..', path)), `${path} does not exist`).toBe(true);
  return JSON.parse(read(path));
};

/** Resolve a local `#def` ref inside one lexicon document. */
const resolve = (doc, schema) => (schema.type === 'ref' && schema.ref.startsWith('#') ? doc.defs[schema.ref.slice(1)] : schema);

/** The lexicon shape a contract table type transcribes to. */
const matchesContractType = (doc, schema, contractType) => {
  switch (contractType) {
    case 'string':
      return schema.type === 'string';
    case 'string[]':
      return schema.type === 'array' && schema.items?.type === 'string';
    case 'object':
      return resolve(doc, schema)?.type === 'object';
    case 'object[]':
      return schema.type === 'array' && resolve(doc, schema.items)?.type === 'object';
    default:
      return false;
  }
};

describe('the calling lexicons transcribe contract.md exactly', () => {
  it('the contract parse is not vacuous — three collections, every table and union read', () => {
    expect(collections.map((c) => c.nsid)).toEqual(CALLING_TYPES);
    for (const c of collections) expect(c.fields.length, `${c.nsid}: no fields parsed`).toBeGreaterThan(0);
    const grant = collections.find((c) => c.nsid === 'ing.croft.call.grant');
    const policy = collections.find((c) => c.nsid === 'ing.croft.call.policy');
    expect(grant.variants.map((v) => v.tag)).toEqual(['ticket', 'mutuals', 'registeredCallers']);
    expect(policy.variants.map((v) => v.tag)).toEqual(['expires', 'maxUses', 'burnOnSuccess']);
  });

  describe.each(CALLING_TYPES)('%s', (nsid) => {
    const spec = () => collections.find((c) => c.nsid === nsid);

    it('is a lexicon v1 record document named for its NSID', () => {
      const doc = loadLexicon(nsid);
      expect(doc.lexicon).toBe(1);
      expect(doc.id).toBe(nsid);
      expect(doc.defs.main.type).toBe('record');
      expect(doc.defs.main.record.type).toBe('object');
    });

    it('declares exactly the contract’s fields — none missing, none invented', () => {
      const props = Object.keys(loadLexicon(nsid).defs.main.record.properties).sort();
      expect(props).toEqual(spec().fields.map((f) => f.name).sort());
    });

    it('requires exactly the fields the contract marks required', () => {
      const required = [...(loadLexicon(nsid).defs.main.record.required ?? [])].sort();
      expect(required).toEqual(spec().fields.filter((f) => f.required).map((f) => f.name).sort());
    });

    it('gives every field the contract’s type and the contract’s meaning', () => {
      const doc = loadLexicon(nsid);
      for (const f of spec().fields) {
        const schema = doc.defs.main.record.properties[f.name];
        expect(matchesContractType(doc, schema, f.type), `${nsid}.${f.name}: contract says ${f.type}, schema says ${JSON.stringify(schema)}`).toBe(true);
        expect(schema.description, `${nsid}.${f.name}: description is not the contract's meaning`).toBe(f.meaning);
      }
    });

    it('adds no constraint the contract does not state', () => {
      const doc = loadLexicon(nsid);
      const found = [];
      const walk = (node, path) => {
        if (node === null || typeof node !== 'object') return;
        for (const key of UNSTATED) if (key in node) found.push(`${path}.${key}`);
        for (const [k, v] of Object.entries(node)) if (k !== 'knownValues') walk(v, `${path}.${k}`);
      };
      walk(doc.defs, 'defs');
      expect(found, `constraints not in contract.md: ${found}`).toEqual([]);
    });
  });

  describe.each([
    ['ing.croft.call.grant', 'matcher', (doc) => doc.defs.main.record.properties.matcher],
    ['ing.croft.call.policy', 'rules', (doc) => doc.defs.main.record.properties.rules.items],
  ])('%s — the %s tagged union', (nsid, _field, pick) => {
    const spec = () => collections.find((c) => c.nsid === nsid);

    it('discriminates on a required `type` whose known values are exactly the contract’s tags', () => {
      const doc = loadLexicon(nsid);
      const def = resolve(doc, pick(doc));
      expect(def.required).toEqual(['type']);
      expect(def.properties.type.type).toBe('string');
      expect(def.properties.type.knownValues).toEqual(spec().variants.map((v) => v.tag));
    });

    it('carries every variant field, typed as the contract’s example shows, and nothing else', () => {
      const doc = loadLexicon(nsid);
      const def = resolve(doc, pick(doc));
      const variantFields = spec().variants.flatMap((v) => v.fields);
      expect(Object.keys(def.properties).sort()).toEqual(['type', ...variantFields.map((f) => f.name)].sort());
      for (const f of variantFields) {
        expect(def.properties[f.name].type, `${nsid} ${f.name}`).toBe(f.type);
      }
    });
  });
});
