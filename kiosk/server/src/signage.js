// Digital signage — idle content rotation (KIOSK_BUILD.md §9 "מצב תצוגה
// (Digital Signage): רוטציית תוכן/מדיה כשאין אינטראקציה").
//
// Kept free of every other module's import (db/commands/express) so it can be
// exercised here without better-sqlite3, which this checkout does not have
// installed — the same shape schedule.js/display.js/hosts.js/exitcode.js
// already use for their own validated-input modules.

const MIN_INTERVAL_SECONDS = 3;
const MAX_INTERVAL_SECONDS = 3600;

/** Newline-separated textarea input -> trimmed, non-empty, de-duplicated lines, in order. */
export function parseSignagePlaylist(raw) {
  if (typeof raw !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const line of raw.split('\n')) {
    const url = line.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Validates a signage playlist before it is stored. Every line must parse as
 * an absolute http(s) URL — the same shape a device's own home link already
 * requires — and at least one must survive, or an "enabled" signage config
 * would silently have nothing to rotate through.
 */
export function validateSignagePlaylist(raw) {
  const urls = parseSignagePlaylist(raw);
  if (urls.length === 0) {
    return { ok: false, error: 'נדרש לפחות קישור אחד לתצוגה (שורה אחת לכל קישור)' };
  }
  for (const url of urls) {
    let parsed;
    try { parsed = new URL(url); } catch { return { ok: false, error: `קישור לא תקין ברשימת התצוגה: ${url}` }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `קישור לא תקין ברשימת התצוגה: ${url}` };
    }
  }
  return { ok: true, urls };
}

/** Seconds between rotations, clamped to a sane retail-signage range. */
export function validateSignageInterval(raw) {
  const seconds = Number(raw);
  if (!Number.isInteger(seconds)) {
    return { ok: false, error: 'זמן החלפה חייב להיות מספר שלם של שניות' };
  }
  if (seconds < MIN_INTERVAL_SECONDS || seconds > MAX_INTERVAL_SECONDS) {
    return { ok: false, error: `זמן החלפה חייב להיות בין ${MIN_INTERVAL_SECONDS} ל-${MAX_INTERVAL_SECONDS} שניות` };
  }
  return { ok: true, seconds };
}
