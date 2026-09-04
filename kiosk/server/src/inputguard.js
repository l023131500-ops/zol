// One shared guard for every JSON write path.
//
// PATCH /devices/:id, POST /enrollments, POST /agent/enroll, POST
// /agent/heartbeat, POST /agent/ack and POST /agent/screenshot all bind a
// request-body field straight into a better-sqlite3 query (an UPDATE/INSERT
// COALESCE column, or an `.get(id)`/`.run(..., id)` id parameter) with
// nothing checking it is the scalar the column expects first. better-sqlite3
// throws for anything else ("SQLite3 can only bind numbers, strings,
// bigints, buffers, and null"), and a plain JS boolean is included in "anything
// else" — so is an array/object, which additionally crashes earlier still
// (`Number({})`/`String([])` do not throw, but a raw object bind does). Live
// reproduction against this exact deployed tip (2026-09-02): `PATCH
// /devices/:id {"name":{"evil":true}}` and `{"linkId":true}` both return an
// unhandled 500 with a full stack trace in the response body — an unhandled
// exception AND an information leak, from an endpoint every one of this
// system's customers can reach with their own JWT, and (`/agent/*`) partly
// reachable with nothing but a still-unused enrollment code.
//
// Applied once, globally, right after express.json() and before any route
// file (see index.js), so a field nobody has special-cased yet gets the same
// protection today, and so does every field added after this file was
// written — closing the whole class in one place instead of one field at a
// time, per KIOSK_BUILD.md's HARD STEERING to add exactly one shared
// middleware here and then stop.
//
// Two fields in this codebase are legitimately non-scalar:
//  - `payload` on POST /devices/:id/command — commands.js stores it via
//    JSON.stringify, never a raw bind, so an object there is correct.
//  - `deviceIds` on POST /templates/:id/apply — an array of device row ids.
//    Exempting the array itself does not exempt what is inside it: that
//    route validates each element with isValidRowId below before it ever
//    reaches `db.prepare(...).get(id)`.
const NON_SCALAR_FIELDS_ALLOWED = new Set(['payload', 'deviceIds']);

// better-sqlite3 rejects a raw JS boolean bind exactly like it rejects an
// object/array, so a generic scalar check is not enough for a field that is
// bound straight into a query behind nothing but a truthy/falsy gate.
// `linkId` (routes/devices.js: PATCH /devices/:id, POST /enrollments) and
// `commandId` (routes/agent.js: /ack, /screenshot) are exactly that today —
// each guards with nothing but `if (linkId)` / `if (!commandId) return 400`,
// so `{"linkId": true}` or `{"commandId": true}` reaches
// `db.prepare(...).get(linkId, ...)` / `.run(..., commandId, ...)`
// un-coerced. Listed by name rather than inferred, the same way
// NON_SCALAR_FIELDS_ALLOWED is: a field not in this set keeps whatever
// behaviour its own route already gives it (e.g. `scheduleEnabled`/
// `signageEnabled`/`maintenanceEnabled`/`ok` are real booleans, coerced with
// `? 1 : 0` before their own bind, and must stay allowed to be boolean).
const ROW_ID_FIELDS = new Set(['linkId', 'commandId']);

export function isScalar(value) {
  return value === null || value === undefined
    || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function isValidRowId(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0;
  if (typeof value === 'string') return /^[1-9]\d*$/.test(value.trim());
  return false;
}

/**
 * Runs the per-field scalar/row-id checks below as a pure function returning
 * {ok, error?} — used both by guardWriteBody itself (on the top-level
 * request body) and directly by routes/templates.js's bulk-apply endpoint
 * (on each element of the `deviceIds` array, which is exempt from the
 * top-level check only because the array itself is not a scalar).
 */
export function checkFlatFields(obj) {
  if (!obj || typeof obj !== 'object') return { ok: true };
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (ROW_ID_FIELDS.has(key)) {
      // Every current call site gates with a plain `if (linkId)` /
      // `if (!commandId)` truthy check before this guard's caller ever runs
      // — 0/''/false already mean "not provided" to the route itself, so
      // only a *truthy* malformed value (object, array, `true`, a
      // non-numeric string) is this guard's job to catch.
      if (!value || isValidRowId(value)) continue;
      return { ok: false, error: `שדה "${key}" אינו תקין` };
    }
    if (isScalar(value) || NON_SCALAR_FIELDS_ALLOWED.has(key)) continue;
    return { ok: false, error: `שדה "${key}" אינו תקין` };
  }
  return { ok: true };
}

/** Express middleware: reject a JSON body carrying a non-scalar or malformed-id field before any route handler runs. */
export function guardWriteBody(req, res, next) {
  const result = checkFlatFields(req.body);
  if (!result.ok) return res.status(400).json({ error: result.error });
  next();
}
