/**
 * The allow-list is the product's security boundary: it decides what a locked
 * device may open. Everything here is imported for real — hosts.js has no
 * database dependency.
 *
 * The direction of failure matters. hostAllowed() treats an EMPTY list as "no
 * lock configured" and allows everything, so an entry that silently normalises
 * to nothing is not a cosmetic bug — it is the lock coming off.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHosts, hostAllowed, hostsForUrl, normalizeHostInput, normalizeHostList, normalizeHostCsv, normalizeHomeUrl } from '../src/hosts.js';

test('a pasted URL becomes the host it contains', () => {
  // This is what people actually paste out of the address bar.
  assert.equal(normalizeHostInput('https://pay.example.com/checkout?x=1'), 'pay.example.com');
  assert.equal(normalizeHostInput('http://example.com'), 'example.com');
  assert.equal(normalizeHostInput('example.com/path#frag'), 'example.com');
  assert.equal(normalizeHostInput('  EXAMPLE.com  '), 'example.com');
  assert.equal(normalizeHostInput('example.com:8443'), 'example.com');
  assert.equal(normalizeHostInput('user:pw@example.com'), 'example.com');
  assert.equal(normalizeHostInput('*.example.com'), 'example.com');
  assert.equal(normalizeHostInput('.example.com.'), 'example.com');
});

test('input that cannot be a host is rejected, not stored as junk', () => {
  // A junk row looks configured while protecting nothing, which is worse than
  // an obvious error at the moment of typing.
  for (const bad of ['', '   ', 'localhost', 'not a host', 'example', 'a..b.com', 'סטרינג', '///']) {
    assert.equal(normalizeHostInput(bad), '', `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('the list de-duplicates and keeps order', () => {
  assert.deepEqual(
    normalizeHostList(['https://a.com/x', 'A.com', 'b.com:443', '', 'nonsense']),
    ['a.com', 'b.com'],
  );
  assert.equal(normalizeHostCsv('https://a.com/x, A.com , b.com'), 'a.com,b.com');
  assert.equal(normalizeHostCsv(''), '');
});

test('normalising actually changes whether a host is allowed', () => {
  // The point of all of the above, stated as behaviour: the raw pasted string
  // matches nothing, and with an otherwise-empty list that means allow-all.
  const raw = 'https://pay.example.com/checkout';
  assert.equal(hostAllowed('pay.example.com', raw), false);
  assert.equal(hostAllowed('pay.example.com', normalizeHostCsv(raw)), true);

  // ...and the fail-open case the UI has to warn about.
  assert.equal(hostAllowed('anything-at-all.com', ''), true);
});

test('subdomains are covered, lookalikes are not', () => {
  const list = 'example.com';
  assert.equal(hostAllowed('example.com', list), true);
  assert.equal(hostAllowed('pay.example.com', list), true);
  assert.equal(hostAllowed('deep.pay.example.com', list), true);
  // The classic near-miss: a domain that merely ends with the same letters.
  assert.equal(hostAllowed('notexample.com', list), false);
  assert.equal(hostAllowed('example.com.evil.net', list), false);
});

test('the device home URL is always part of its own allow-list', () => {
  // Otherwise the device is locked out of the one page it exists to display.
  assert.equal(hostsForUrl('https://venue.example.com/e/1', 'pay.gw.com'), 'pay.gw.com,venue.example.com');
  assert.ok(parseHosts(hostsForUrl('https://venue.example.com/e/1', '')).includes('venue.example.com'));
});

test('an explicit allow-list that omits the new home host does not survive the merge', () => {
  // routes/devices.js PATCH /devices/:id used to skip this merge whenever the
  // caller supplied allowedHost explicitly, even alongside a new homeUrl —
  // so a request moving the home URL to a new domain while also passing an
  // unrelated (or stale) allow-list stored the two as a mismatched pair, and
  // the device's own agent loads homeUrl unconditionally on update_config.
  // hostsForUrl(homeUrl, allowedHost) is the merge the route now always runs
  // in that case: the new home host must come out the other side no matter
  // how disjoint the caller's list was.
  const merged = hostsForUrl('https://newvenue.example.com/e/9', 'totally-unrelated-domain.com');
  assert.ok(parseHosts(merged).includes('newvenue.example.com'));
  assert.ok(parseHosts(merged).includes('totally-unrelated-domain.com'));
  assert.equal(hostAllowed('newvenue.example.com', merged), true);
});

test('normalizeHomeUrl refuses anything that is not http(s)', () => {
  // `new URL('javascript:alert(1)')` does not throw, and
  // `new URL('javascript://x').host` is non-empty — a bare "does it parse" or
  // "is there a host" check both pass a script URL straight through to the
  // one field a device's WebView actually loads.
  assert.equal(normalizeHomeUrl('javascript:alert(document.cookie)').ok, false);
  assert.equal(normalizeHomeUrl('javascript:alert(document.cookie)').reason, 'scheme');
  assert.equal(normalizeHomeUrl('javascript://x').ok, false);
  assert.equal(normalizeHomeUrl('data:text/html,<script>1</script>').ok, false);
  assert.equal(normalizeHomeUrl('ftp://example.com/x').ok, false);
  assert.equal(normalizeHomeUrl('ftp://example.com/x').reason, 'scheme');
});

test('normalizeHomeUrl rejects unparseable input distinctly from a bad scheme', () => {
  assert.equal(normalizeHomeUrl('not a url').ok, false);
  assert.equal(normalizeHomeUrl('not a url').reason, 'invalid');
  assert.equal(normalizeHomeUrl('example.com').ok, false); // no scheme at all — bare host, not a URL
  assert.equal(normalizeHomeUrl('example.com').reason, 'invalid');
});

test('normalizeHomeUrl passes a clean http(s) URL through trimmed', () => {
  const r = normalizeHomeUrl('  https://hall.example.com/lobby \n');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'https://hall.example.com/lobby');
});

test('normalizeHomeUrl treats "not sent" and "explicitly cleared" as distinct from "invalid"', () => {
  assert.deepEqual(normalizeHomeUrl(undefined), { ok: true, value: undefined });
  assert.deepEqual(normalizeHomeUrl(''), { ok: true, value: '' });
  assert.deepEqual(normalizeHomeUrl('   '), { ok: true, value: '' });
});

test('every write path normalises, not just the device one', () => {
  // hostsForUrl is the funnel the link library writes through. It used to pass
  // extras straight to storage, so a pasted URL was saved verbatim in the
  // library and then handed to whichever device adopted that link.
  assert.equal(
    hostsForUrl('https://venue.example.com/event/9',
                'https://pay.example.com/checkout?x=1, PAY.example.com , nonsense, secure.cardcom.co.il:443'),
    'pay.example.com,secure.cardcom.co.il,venue.example.com',
  );
});
