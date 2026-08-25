// Host allow-list helpers. `allowed` is a comma-separated list of hosts.
// A device may open its event domain AND any additional hosts (payment gateway,
// CDN, etc.) so the checkout flow is never blocked.

export function parseHosts(csv) {
  return String(csv || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function hostAllowed(host, csv) {
  if (!host) return false;
  const h = host.toLowerCase();
  const list = parseHosts(csv);
  if (list.length === 0) return true; // no lock configured → allow (fail-open only if unset)
  return list.some((a) => h === a || h.endsWith('.' + a));
}

// Derive the default allowed-host set from an event URL, optionally merging extras.
export function hostsForUrl(url, extraCsv) {
  let base = '';
  try { base = new URL(url).host.toLowerCase(); } catch { /* ignore */ }
  // Normalise the extras here rather than at each call site. This is the one
  // funnel every allow-list passes through on its way into storage, and a host
  // that keeps its scheme and path matches nothing on the device.
  const merged = new Set(normalizeHostList(extraCsv));
  if (base) merged.add(normalizeHostInput(base) || base);
  return [...merged].join(',');
}

/**
 * Turn whatever a human typed into a bare host, or '' if it cannot be one.
 *
 * The allow-list is the thing standing between a locked kiosk and the open
 * internet, so what goes into it must not depend on how carefully it was typed.
 * People paste the whole address out of the URL bar — "https://pay.example.com/checkout?x=1"
 * — and a list holding that string matches nothing, which fails *open* on the
 * device and is exactly the wrong direction to fail in.
 */
export function normalizeHostInput(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');       // scheme
  s = s.replace(/^[^/@]*@/, '');                        // user:pass@
  s = s.split('/')[0].split('?')[0].split('#')[0];      // path / query / fragment
  s = s.replace(/:\d+$/, '');                           // port
  s = s.replace(/^\.+|\.+$/g, '');                      // stray dots
  s = s.replace(/^\*\./, '');                           // "*.example.com" → example.com
  // A host has at least one dot and only host-legal characters. "localhost"
  // and anything else without a dot is rejected rather than silently stored:
  // a junk entry looks configured while protecting nothing.
  if (!/^[a-z0-9.-]+$/.test(s) || !s.includes('.')) return '';
  if (s.includes('..')) return '';
  return s;
}

/** Clean, de-duplicate and re-serialise a list of hosts. Order is preserved. */
export function normalizeHostList(input) {
  const items = Array.isArray(input) ? input : parseHosts(input);
  const out = [];
  for (const item of items) {
    const h = normalizeHostInput(item);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

/** …and back to the comma-separated form the device config already speaks. */
export function normalizeHostCsv(input) {
  return normalizeHostList(input).join(',');
}

/**
 * Validate + trim a URL meant to become a device's `home_url` — the address
 * the kiosk WebView actually loads (at enrollment, on idle-return, on every
 * reboot, and on a `set_url` command). Every one of those call sites used to
 * accept anything `new URL()` would parse without throwing, or (for
 * `set_url`) checked only that the *host* was on the allow-list — neither
 * catches a `javascript:`/`data:` URL, and `new URL('javascript://x').host`
 * is non-empty (a bare-host check alone actually passes it), so a value that
 * looks configured can still be script running in the one browser the device
 * is supposed to be fenced to.
 *
 * `undefined` means "not sent" (the caller's own COALESCE decides what that
 * means — leave the existing value alone); every other case must resolve to
 * either a clean http(s) URL or a rejection, never a silent pass-through.
 */
export function normalizeHomeUrl(raw) {
  if (raw === undefined) return { ok: true, value: undefined };
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, value: '' }; // explicit clear — unchanged from today's behaviour
  let parsed;
  try { parsed = new URL(trimmed); } catch { return { ok: false, reason: 'invalid' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  return { ok: true, value: trimmed };
}
