import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

/**
 * The register is a claim about every type this repo mints. Until this file
 * existed it was prose, and its own "Owed" section said so — an ungated
 * register is exactly the thing that drifts into fiction, which is the failure
 * the workspace rule (CroftC/.claude/LEXICONS.md) exists to prevent.
 *
 * The pin is within-repo on purpose: `contract.md` DEFINES the collections, so
 * it is the authority, and the register must cover exactly what it defines.
 * A type added to the contract without a register entry fails here.
 */
describe('the ing.croft.* register covers exactly what the contract defines', () => {
  const contract = read('docs/contract.md');
  const register = read('docs/LEXICON-REGISTER.md');

  // Contract: "- Collection: `ing.croft.foo.bar`"
  const defined = [...contract.matchAll(/^- Collection: `([^`]+)`/gm)].map((m) => m[1]);
  // Register: "### `ing.croft.foo.bar`"
  const registered = [...register.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1]);

  it('the contract defines at least one collection (the parse is not vacuous)', () => {
    // Without this, a regex that silently stopped matching would make every
    // assertion below pass against two empty sets.
    expect(defined.length).toBeGreaterThan(0);
    expect(registered.length).toBeGreaterThan(0);
  });

  it('every collection the contract defines has a register entry', () => {
    const missing = defined.filter((c) => !registered.includes(c));
    expect(missing, `defined in contract.md, absent from the register: ${missing}`).toEqual([]);
  });

  it('the register invents nothing the contract does not define', () => {
    const extra = registered.filter((c) => !defined.includes(c));
    expect(extra, `in the register, not defined in contract.md: ${extra}`).toEqual([]);
  });

  it('every entry carries all three fields', () => {
    // Split on the entry headings so each block is checked in isolation.
    const blocks = register.split(/^### `/m).slice(1);
    expect(blocks.length).toBe(registered.length);
    for (const [i, block] of blocks.entries()) {
      const name = registered[i];
      expect(block, `${name}: no "Holds"`).toMatch(/\*\*Holds\*\*/);
      expect(block, `${name}: no "Why ours"`).toMatch(/\*\*Why ours\*\*/);
      expect(block, `${name}: no "Ecosystem check"`).toMatch(/\*\*Ecosystem check/);
    }
  });

  it('no entry still says NOT DONE — the exemption list can only shrink', () => {
    // The register opened on 2026-09-08 with all three marked NOT DONE and
    // closed them the same day. Forage's list reached zero the same way. This
    // asserts zero rather than a shrinking allowlist because zero is where it
    // already is: a new pre-checked type would have to add itself here
    // deliberately, which is the conversation worth forcing.
    const blocks = register.split(/^### `/m).slice(1);
    const unchecked = blocks
      .map((b, i) => [registered[i], b])
      .filter(([, b]) => /\*\*Ecosystem check[^\n]*NOT DONE/.test(b))
      .map(([n]) => n);
    expect(unchecked, `entries with an unclosed ecosystem check: ${unchecked}`).toEqual([]);
  });
});
