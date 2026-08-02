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
