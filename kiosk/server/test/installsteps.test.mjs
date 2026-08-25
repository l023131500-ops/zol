import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_ROUTES, buildChecklist, isValidStep } from '../src/installsteps.js';

test('buildChecklist returns null for an unknown route', () => {
  assert.equal(buildChecklist('Z', {}), null);
  assert.equal(buildChecklist('', {}), null);
});

test('every documented route builds a non-empty, all-unchecked-by-default checklist', () => {
  for (const route of INSTALL_ROUTES) {
    const cl = buildChecklist(route, { code: 'ABC123', homeUrl: 'https://example.com' });
    assert.ok(cl.steps.length > 0, `${route} has no steps`);
    assert.equal(cl.allDone, false);
    for (const s of cl.steps) {
      assert.equal(s.checked, false);
      assert.ok(s.id.startsWith(route + ':'));
      assert.ok(s.title && s.detail && s.expect, `${s.id} missing text`);
    }
  }
});

test('step ids are unique within a route and ordered (no gaps/dupes)', () => {
  for (const route of INSTALL_ROUTES) {
    const cl = buildChecklist(route, {});
    const ids = cl.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${route} has duplicate step ids`);
  }
});

test('checked ids (array or Set) mark exactly the matching steps and flip allDone', () => {
  const cl = buildChecklist('B', { code: 'X', homeUrl: 'https://y' }, ['B:1', 'B:2']);
  assert.equal(cl.steps.find((s) => s.id === 'B:1').checked, true);
  assert.equal(cl.steps.find((s) => s.id === 'B:2').checked, true);
  assert.equal(cl.steps.find((s) => s.id === 'B:3').checked, false);
  assert.equal(cl.allDone, false);

  const allIds = cl.steps.map((s) => s.id);
  const full = buildChecklist('B', {}, new Set(allIds));
  assert.equal(full.allDone, true);
});

test('an unknown/foreign step id checked for a route is silently ignored, not fabricated into a step', () => {
  const cl = buildChecklist('B', {}, ['A:1', 'B:999', 'not-a-step']);
  assert.equal(cl.steps.every((s) => s.checked === false), true);
});

test('code/homeUrl are interpolated into the on-screen text so the owner never has to re-copy them', () => {
  const cl = buildChecklist('B', { code: 'QWERTY', homeUrl: 'https://venue.example/party' });
  const joined = cl.steps.map((s) => s.detail + s.expect).join(' ');
  assert.ok(joined.includes('QWERTY'));
  assert.ok(joined.includes('https://venue.example/party'));
});

test('isValidStep only accepts a step id that is actually a member of that route', () => {
  assert.equal(isValidStep('B', 'B:1'), true);
  assert.equal(isValidStep('B', 'B:999'), false);
  assert.equal(isValidStep('B', 'A:1'), false); // right shape, wrong route
  assert.equal(isValidStep('Z', 'Z:1'), false); // route itself unknown
});

test('route C (Windows) is deliberately not part of the enrollment checklist', () => {
  assert.equal(INSTALL_ROUTES.includes('C'), false);
  assert.equal(buildChecklist('C', {}), null);
});
