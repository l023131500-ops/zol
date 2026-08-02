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
  const merged = new Set(parseHosts(extraCsv));
  if (base) merged.add(base);
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
