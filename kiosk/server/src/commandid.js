// Validation for the `commandId` field on the two device-facing routes that
// bind it straight into a SQL UPDATE ... WHERE id = ? (routes/agent.js's
// POST /ack and POST /screenshot). Both used to pass `commandId` through
// unchecked — the same "expected a primitive, got whatever JSON allows" gap
// already fixed for other device-authored fields in this app (batterylevel.js's
// battery, deviceinfo.js's serial/model). better-sqlite3 only binds numbers,
// strings, bigints, buffers, and null; an object or array crashes with a raw
// RangeError/TypeError 500 (there is no global Express error handler in this
// app — see users.js's own header comment for the same class of crash on
// routes/admin.js).
//
// Dependency-free like exitcode.js/batterylevel.js, so it can be unit-tested
// in this checkout without better-sqlite3.

/**
 * Whether `raw` is shaped like a real autoincrement rowid (a positive
 * integer, or a numeric string of one) — the same bindable-primitive shape
 * validateCommandId requires below, but as a plain boolean with no
 * "falsy = not provided" carve-out, for callers iterating a *list* of ids
 * (routes/templates.js's POST /templates/:id/apply `deviceIds`) where every
 * element is required, not optional, and a non-primitive element must never
 * reach a SQL bind (`db.prepare('...WHERE id = ?').get(id)` throws a raw
 * RangeError/TypeError on an object/array/boolean — reproduced live).
 */
export function isValidRowId(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return false;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0;
}

/**
 * Validates an optional command id. `commandId` is a `commands.id` autoincrement
 * rowid — always a positive integer once real. A falsy value (`undefined`,
 * `null`, `''`, `0`) is treated as "not provided", the same truthy gate both
 * call sites already used before this fix (`if (commandId) { ... }`), so that
 * behaviour is preserved exactly. Anything else that is not a positive integer
 * (or a numeric string of one) is rejected with a clean 400 instead of
 * reaching the SQL bind.
 */
export function validateCommandId(raw) {
  if (!raw) return { ok: true, value: undefined };
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { ok: false, error: 'מזהה פקודה לא תקין' };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: 'מזהה פקודה לא תקין' };
  }
  return { ok: true, value: n };
}
