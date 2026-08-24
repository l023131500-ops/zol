import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildSessions, summarizeAnalytics } from '../analytics.js';

// KIOSK_BUILD.md §9 "אנליטיקה: כמה שימושים, זמן ממוצע, קישורים פופולריים" —
// was entirely unbuilt. Owner-scoped the same way GET /alerts already is
// (admins may pass ?all=1 for the whole fleet).
const router = express.Router();

// Parse SQLite's timezone-less `datetime('now')` string as UTC — the same fix
// public/js/app.js's formatAlertTime() applies on the client. Duration math
// alone would not need this (the missing offset cancels out when two such
// strings are subtracted from each other), but each client's "last used"
// timestamp is also returned as an honest absolute time here, not silently
// off by the server's own UTC offset.
function toMs(sqliteDatetime) {
  const withZone = /[zZ]|[+-]\d\d:\d\d$/.test(sqliteDatetime) ? sqliteDatetime : sqliteDatetime.replace(' ', 'T') + 'Z';
  return new Date(withZone).getTime();
}

router.get('/analytics', requireAuth, (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';

  // A client's own current name is joined in for display; a client that has
  // since been deleted (or a code that never matched one) leaves `name` NULL
  // and the client falls back to showing its bare code, same as elsewhere.
  const rows = db.prepare(
    `SELECT e.device_id, e.detail code, e.created_at, c.name
     FROM events e
     JOIN devices d ON d.id = e.device_id
     LEFT JOIN clients c ON c.owner_id = d.owner_id AND c.code = e.detail
     WHERE e.type = 'client_identified' ${all ? '' : 'AND d.owner_id = ?'}
     ORDER BY e.device_id ASC, e.created_at ASC`
  ).all(...(all ? [] : [req.user.id]));

  const events = rows.map((r) => ({ deviceId: r.device_id, code: r.code, name: r.name || r.code, atMs: toMs(r.created_at) }));
  const sessions = buildSessions(events);
  const summary = summarizeAnalytics(sessions);

  // Last-used timestamp per client code, for the console table — the most
  // recent matching row per code out of the same already chronologically
  // sorted `rows` (a later row for the same code always overwrites an
  // earlier one here).
  const lastUsedByCode = {};
  for (const r of rows) lastUsedByCode[r.code] = r.created_at;

  res.json({
    summary: {
      ...summary,
      byClient: summary.byClient.map((c) => ({ ...c, lastUsedAt: lastUsedByCode[c.code] || null })),
    },
  });
});

export default router;
