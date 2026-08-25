/**
 * windowspackage.js turns a device's homeUrl/allowedHost into the .ps1 an
 * owner runs on a Windows kiosk PC. No database/express dependency, so it is
 * exercised for real — same shape schedule.js/hosts.js's own tests already
 * use for logic this sandbox cannot execute end-to-end (no real device, no
 * real Windows host here either).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  psQuote, clampIdleTimeoutMinutes, sanitizeKioskUsername, buildWindowsKioskScript,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
} from '../src/windowspackage.js';

test('psQuote wraps in single quotes and doubles an embedded single quote', () => {
  assert.equal(psQuote('plain'), "'plain'");
  assert.equal(psQuote("it's"), "'it''s'");
  assert.equal(psQuote(null), "''");
  assert.equal(psQuote(undefined), "''");
});

test('psQuote neutralises PowerShell subexpression/variable syntax', () => {
  const malicious = '$(Remove-Item C:\\ -Recurse -Force)';
  // Still just data inside single quotes: no unescaped `'` to break out with.
  assert.equal(psQuote(malicious), "'" + malicious + "'");
});

test('clampIdleTimeoutMinutes defaults on non-numeric input', () => {
  assert.equal(clampIdleTimeoutMinutes(undefined), DEFAULT_IDLE_TIMEOUT_MINUTES);
  assert.equal(clampIdleTimeoutMinutes('not a number'), DEFAULT_IDLE_TIMEOUT_MINUTES);
  assert.equal(clampIdleTimeoutMinutes(NaN), DEFAULT_IDLE_TIMEOUT_MINUTES);
});

test('clampIdleTimeoutMinutes clamps into [0, 1440] and rounds', () => {
  assert.equal(clampIdleTimeoutMinutes(-5), 0);
  assert.equal(clampIdleTimeoutMinutes(99999), 1440);
  assert.equal(clampIdleTimeoutMinutes(2.6), 3);
});

test('sanitizeKioskUsername strips everything but letters/digits/-/_ and caps length', () => {
  assert.equal(sanitizeKioskUsername('Kiosk 1!'), 'Kiosk1');
  assert.equal(sanitizeKioskUsername('a'.repeat(40)), 'a'.repeat(20));
  assert.equal(sanitizeKioskUsername(''), 'KioskFleetUser');
  assert.equal(sanitizeKioskUsername(undefined), 'KioskFleetUser');
});

test('buildWindowsKioskScript rejects a missing or invalid homeUrl', () => {
  assert.throws(() => buildWindowsKioskScript({}), /homeUrl is required/);
  assert.throws(() => buildWindowsKioskScript({ homeUrl: 'not a url' }), /valid URL/);
});

test('buildWindowsKioskScript rejects a javascript:/data: homeUrl the same way every other door does', () => {
  assert.throws(
    () => buildWindowsKioskScript({ homeUrl: 'javascript:alert(document.cookie)' }),
    /valid URL/
  );
  assert.throws(
    () => buildWindowsKioskScript({ homeUrl: 'data:text/html,<script>alert(1)</script>' }),
    /valid URL/
  );
});

test('buildWindowsKioskScript always includes the home URL\'s own host in the allow-list', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com/kiosk', allowedHost: '' });
  assert.match(script, /\$edgeAllowlistPath -Name '1' -Value 'venue\.example\.com'/);
});

test('buildWindowsKioskScript lists every allowed host as a numbered Edge policy entry', () => {
  const script = buildWindowsKioskScript({
    homeUrl: 'https://venue.example.com/kiosk',
    allowedHost: 'pay.example.com,cdn.example.com',
  });
  assert.match(script, /\$edgeAllowlistPath -Name '1' -Value 'venue\.example\.com'/);
  assert.match(script, /\$edgeAllowlistPath -Name '2' -Value 'pay\.example\.com'/);
  assert.match(script, /\$edgeAllowlistPath -Name '3' -Value 'cdn\.example\.com'/);
});

test('buildWindowsKioskScript blocks everything else with URLBlocklist "*"', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com' });
  assert.match(script, /\$edgeBlocklistPath -Name '1' -Value '\*'/);
});

test('buildWindowsKioskScript embeds the home URL as a safely quoted PowerShell literal', () => {
  const script = buildWindowsKioskScript({ homeUrl: "https://venue.example.com/it's-here" });
  assert.match(script, /\$homeUrl\s+= 'https:\/\/venue\.example\.com\/it''s-here'/);
});

test('buildWindowsKioskScript strips CR/LF from the device name before it reaches the header comment', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com', deviceName: 'evil\r\nInvoke-Evil' });
  assert.ok(!script.includes('evil\r\nInvoke-Evil'));
  assert.match(script, /evil\s+Invoke-Evil/);
});

test('buildWindowsKioskScript falls back to the home host as the label when no device name is given', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com/kiosk' });
  assert.match(script, /setup for "venue\.example\.com"/);
});

test('buildWindowsKioskScript applies the default idle timeout when none is given', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com' });
  assert.match(script, new RegExp(`\\$idleMinutes = ${DEFAULT_IDLE_TIMEOUT_MINUTES}\\n`));
});

test('buildWindowsKioskScript sanitizes a custom kiosk username', () => {
  const script = buildWindowsKioskScript({ homeUrl: 'https://venue.example.com', kioskUsername: 'Front Desk PC!' });
  assert.match(script, /\$kioskUser\s+= 'FrontDeskPC'/);
});
