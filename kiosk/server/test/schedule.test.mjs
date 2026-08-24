/**
 * schedule.js is the one gate between whatever an owner types into the
 * business-hours fields and an automatic screen_on/screen_off issued to a
 * live kiosk with no human in the loop. No database dependency, so it is
 * exercised for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes, validateScheduleWindow, isWithinOpenWindow,
  desiredScreenState, minutesSinceMidnight,
} from '../src/schedule.js';

test('parseTimeToMinutes accepts zero-padded 24h HH:MM', () => {
  assert.equal(parseTimeToMinutes('00:00'), 0);
  assert.equal(parseTimeToMinutes('09:05'), 545);
  assert.equal(parseTimeToMinutes('23:59'), 1439);
});

test('parseTimeToMinutes rejects anything not exactly HH:MM 24h', () => {
  for (const bad of [undefined, null, '', '9:05', '24:00', '12:60', '12:5', 'noon', '  ', 12 * 60, {}]) {
    assert.equal(parseTimeToMinutes(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('parseTimeToMinutes trims surrounding whitespace', () => {
  assert.equal(parseTimeToMinutes(' 09:00 '), 540);
});

test('validateScheduleWindow accepts a same-day window', () => {
  const v = validateScheduleWindow('09:00', '21:00');
  assert.equal(v.ok, true);
  assert.equal(v.openMinutes, 540);
  assert.equal(v.closeMinutes, 1260);
});

test('validateScheduleWindow accepts an overnight window (close < open)', () => {
  const v = validateScheduleWindow('22:00', '06:00');
  assert.equal(v.ok, true);
  assert.equal(v.openMinutes, 1320);
  assert.equal(v.closeMinutes, 360);
});

test('validateScheduleWindow rejects an equal open/close pair', () => {
  const v = validateScheduleWindow('09:00', '09:00');
  assert.equal(v.ok, false);
  assert.match(v.error, /זהות/);
});

test('validateScheduleWindow rejects unparseable input on either side', () => {
  assert.equal(validateScheduleWindow('bad', '21:00').ok, false);
  assert.equal(validateScheduleWindow('09:00', 'bad').ok, false);
  assert.equal(validateScheduleWindow('', '').ok, false);
});

test('isWithinOpenWindow: same-day window covers the middle, excludes both ends symmetrically', () => {
  // [09:00, 21:00) — open-inclusive, close-exclusive, matching the boundary
  // convention below for the overnight case.
  assert.equal(isWithinOpenWindow(540, 540, 1260), true);   // exactly open time
  assert.equal(isWithinOpenWindow(900, 540, 1260), true);   // midday
  assert.equal(isWithinOpenWindow(1259, 540, 1260), true);  // one minute before close
  assert.equal(isWithinOpenWindow(1260, 540, 1260), false); // exactly close time
  assert.equal(isWithinOpenWindow(0, 540, 1260), false);    // before open
});

test('isWithinOpenWindow: overnight window wraps across midnight', () => {
  // 22:00–06:00
  assert.equal(isWithinOpenWindow(1320, 1320, 360), true);  // exactly open (22:00)
  assert.equal(isWithinOpenWindow(0, 1320, 360), true);     // midnight
  assert.equal(isWithinOpenWindow(359, 1320, 360), true);   // one minute before close
  assert.equal(isWithinOpenWindow(360, 1320, 360), false);  // exactly close (06:00)
  assert.equal(isWithinOpenWindow(720, 1320, 360), false);  // noon, well outside
});

test('desiredScreenState mirrors isWithinOpenWindow as on/off', () => {
  assert.equal(desiredScreenState(900, 540, 1260), 'on');
  assert.equal(desiredScreenState(0, 540, 1260), 'off');
  assert.equal(desiredScreenState(0, 1320, 360), 'on');
  assert.equal(desiredScreenState(720, 1320, 360), 'off');
});

test('minutesSinceMidnight reads a Date\'s local hours/minutes', () => {
  const d = new Date(2026, 7, 24, 14, 37, 52);
  assert.equal(minutesSinceMidnight(d), 14 * 60 + 37);
});

test('minutesSinceMidnight at exact midnight is 0', () => {
  const d = new Date(2026, 7, 24, 0, 0, 0);
  assert.equal(minutesSinceMidnight(d), 0);
});
