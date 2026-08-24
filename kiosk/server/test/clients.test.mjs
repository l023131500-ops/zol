/**
 * KIOSK_BUILD.md §2★ד: a client code is typed on a locked device by whoever
 * is standing in front of it, so the same "sloppy input, refuse rather than
 * guess" bar hosts.js/exitcode.js already hold applies here too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClientCode } from '../src/clients.js';

test('trims, uppercases, and strips internal spaces/dashes', () => {
  assert.equal(normalizeClientCode('  ab 12  '), 'AB12');
  assert.equal(normalizeClientCode('ab-12'), 'AB12');
  assert.equal(normalizeClientCode('Hall-7'), 'HALL7');
});

test('too short or too long is rejected', () => {
  assert.equal(normalizeClientCode('a'), '');
  assert.equal(normalizeClientCode(''), '');
  assert.equal(normalizeClientCode('a'.repeat(25)), '');
  assert.equal(normalizeClientCode('a'.repeat(24)), 'A'.repeat(24));
});

test('non-alphanumeric characters are rejected, not silently dropped', () => {
  for (const bad of ['hall#7', 'a/b', '<script>', 'a.b', 'קוד1']) {
    assert.equal(normalizeClientCode(bad), '', `expected ${bad} to be rejected`);
  }
});

test('null/undefined is rejected the same as empty', () => {
  assert.equal(normalizeClientCode(null), '');
  assert.equal(normalizeClientCode(undefined), '');
});

test('two owners may each register their own code independently (pure normaliser has no notion of owner scope)', () => {
  // Documents the boundary: uniqueness is enforced at the DB layer
  // (UNIQUE(owner_id, code) in db.js), not here.
  assert.equal(normalizeClientCode('1'), ''); // still too short regardless of scope
  assert.equal(normalizeClientCode('01'), '01');
});
