import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH, generateAccessCode, normalizeAccessCode,
} from '../src/accesscode.js';

test('generateAccessCode produces the documented shape', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateAccessCode();
    assert.equal(code.length, ACCESS_CODE_LENGTH);
    for (const ch of code) assert.ok(ACCESS_CODE_ALPHABET.includes(ch), `unexpected char ${ch}`);
  }
});

test('generateAccessCode is not a constant / degenerate generator', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateAccessCode());
  // 33^6 possibilities — 500 draws colliding down to a handful would mean
  // the generator is broken (e.g. always returning the same seed slice).
  assert.ok(seen.size > 480, `expected near-500 distinct codes, got ${seen.size}`);
});

test('normalizeAccessCode accepts a well-formed code case-insensitively', () => {
  const code = generateAccessCode();
  assert.equal(normalizeAccessCode(code), code);
  assert.equal(normalizeAccessCode(code.toLowerCase()), code);
});

test('normalizeAccessCode tolerates stray spacing/hyphens a human might type', () => {
  assert.equal(normalizeAccessCode(' AB-CD 34 '), 'ABCD34');
  assert.equal(normalizeAccessCode('ab-cd-34'), 'ABCD34');
});

test('normalizeAccessCode rejects the wrong length outright, not truncated/padded', () => {
  assert.equal(normalizeAccessCode('ABCD3'), null);   // 5 chars
  assert.equal(normalizeAccessCode('ABCD345'), null); // 7 chars
  assert.equal(normalizeAccessCode(''), null);
  assert.equal(normalizeAccessCode(null), null);
  assert.equal(normalizeAccessCode(undefined), null);
});

test('normalizeAccessCode rejects characters outside the alphabet (0/1/I/O excluded)', () => {
  assert.equal(normalizeAccessCode('ABCD01'), null); // 0 and 1 are not in the alphabet
  assert.equal(normalizeAccessCode('ABCDIO'), null); // I and O are not in the alphabet
  assert.equal(normalizeAccessCode('AB!D34'), null);
});

test('every generated code round-trips through normalizeAccessCode unchanged', () => {
  for (let i = 0; i < 100; i++) {
    const code = generateAccessCode();
    assert.equal(normalizeAccessCode(code), code);
  }
});
