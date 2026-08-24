/**
 * signage.js is the one gate between whatever an owner pastes into the
 * digital-signage playlist textarea and a URL a locked kiosk actually
 * navigates itself to with no human in the loop. No database dependency, so
 * it is exercised for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSignagePlaylist, validateSignagePlaylist, validateSignageInterval,
} from '../src/signage.js';

test('parseSignagePlaylist splits newline-separated input, trimming blank lines', () => {
  assert.deepEqual(
    parseSignagePlaylist('https://example.com/1\n  \nhttps://example.com/2\n'),
    ['https://example.com/1', 'https://example.com/2'],
  );
});

test('parseSignagePlaylist de-duplicates while preserving first-seen order', () => {
  assert.deepEqual(
    parseSignagePlaylist('https://example.com/a\nhttps://example.com/b\nhttps://example.com/a'),
    ['https://example.com/a', 'https://example.com/b'],
  );
});

test('parseSignagePlaylist rejects non-string input as an empty playlist', () => {
  for (const bad of [undefined, null, 42, {}]) {
    assert.deepEqual(parseSignagePlaylist(bad), []);
  }
});

test('validateSignagePlaylist accepts one or more absolute http(s) URLs', () => {
  const v = validateSignagePlaylist('https://example.com/promo1\nhttp://example.com/promo2');
  assert.equal(v.ok, true);
  assert.deepEqual(v.urls, ['https://example.com/promo1', 'http://example.com/promo2']);
});

test('validateSignagePlaylist rejects an empty playlist', () => {
  for (const bad of ['', '   \n  \n', undefined]) {
    const v = validateSignagePlaylist(bad);
    assert.equal(v.ok, false);
    assert.match(v.error, /לפחות קישור אחד/);
  }
});

test('validateSignagePlaylist rejects any non-URL or non-http(s) line', () => {
  assert.equal(validateSignagePlaylist('not a url').ok, false);
  assert.equal(validateSignagePlaylist('https://good.example.com\nftp://bad.example.com').ok, false);
  assert.equal(validateSignagePlaylist('javascript:alert(1)').ok, false);
});

test('validateSignageInterval accepts an integer within the retail-signage range', () => {
  const v = validateSignageInterval(15);
  assert.equal(v.ok, true);
  assert.equal(v.seconds, 15);
});

test('validateSignageInterval accepts the documented boundary values', () => {
  assert.equal(validateSignageInterval(3).ok, true);
  assert.equal(validateSignageInterval(3600).ok, true);
});

test('validateSignageInterval rejects below-minimum, above-maximum, and non-integer input', () => {
  for (const bad of [2, 3601, 0, -5, 10.5, 'ten', undefined, null, NaN]) {
    assert.equal(validateSignageInterval(bad).ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
