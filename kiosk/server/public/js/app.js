'use strict';

// ── tiny helpers ───────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let TOKEN = localStorage.getItem('kf_token') || '';
let ME = null;
let SOCK = null;
let DEVICES = [];

// The server can be mounted under a prefix (more30.com/kiosk) or at the root
// (the Railway URL, local dev). Derive it from where this page actually is
// instead of baking it in, so one build serves both.
const BASE = location.pathname.replace(/\/console(?:\.html)?\/?$/, '').replace(/\/$/, '');

// Filled from GET /api/config before the socket is opened. When the console is
// served through more30.com/kiosk the socket must NOT go to the page's own
// host — that path is a rewrite and answers an upgrade with 404.
let WS_HOST = null;

async function api(path, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שגיאה בשרת');
  return data;
}

// api() always parses JSON — wrong for a generated file the browser should
// save rather than the console reading as data (KIOSK_BUILD.md §3 Route C's
// Windows package, and Route D's offline USB package below, which needs a
// POST body — hence the optional `opts`, merged rather than a second
// near-identical function). Same auth header, but the response becomes a
// Blob handed to a throwaway <a download> instead.
async function downloadFile(path, filename, opts = {}) {
  const res = await fetch(BASE + '/api' + path, {
    ...opts,
    headers: {
      ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'שגיאה בשרת');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = el(`<a href="${url}" download="${esc(filename)}"></a>`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(msg, ok = true) {
  const t = el(`<div class="toast" style="background:${ok ? '#0b1220' : '#b91c1c'}">${esc(msg)}</div>`);
  $('#toast-root').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ── allowed-domain list editor ──────────────────────────────────
//
// The allow-list is the product: it is the line between a locked device and
// the open internet. It used to be one text input holding comma-separated
// hosts, which put the burden of getting the format right on whoever was
// standing at a venue with a tablet — and a malformed entry does not fail
// loudly, it just silently matches nothing.
//
// Same storage (comma-separated, unchanged on the wire and in the database),
// different surface: one row per domain, added and removed individually.

/** Mirror of normalizeHostInput on the server, so the UI rejects the same things. */
function normalizeHost(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^[^/@]*@/, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].replace(/:\d+$/, '');
  s = s.replace(/^\.+|\.+$/g, '').replace(/^\*\./, '');
  if (!/^[a-z0-9.-]+$/.test(s) || !s.includes('.') || s.includes('..')) return '';
  return s;
}

/**
 * Renders into `mountEl` and returns { value() } giving the comma-separated list.
 * `locked` is the device's own home-URL host: it is shown but cannot be removed,
 * because removing it would lock the device out of the page it exists to display.
 */
function hostListEditor(mountEl, initialCsv, locked) {
  const lockedHost = normalizeHost(locked || '');
  let hosts = String(initialCsv || '').split(',').map(normalizeHost).filter(Boolean)
    .filter((h, i, a) => a.indexOf(h) === i);
  if (lockedHost && !hosts.includes(lockedHost)) hosts.unshift(lockedHost);

  mountEl.innerHTML = `
    <div class="hostlist" role="group" aria-label="דומיינים מותרים"></div>
    <div class="row" style="gap:8px;margin-top:8px">
      <input class="hl-new" placeholder="example.com" dir="ltr" style="flex:1" aria-label="דומיין חדש" />
      <button type="button" class="btn btn-light btn-sm hl-add">הוספה</button>
    </div>
    <p class="hl-err" style="color:#b91c1c;font-size:12px;margin:6px 0 0;display:none"></p>
    <p style="color:var(--muted);font-size:12px;margin:6px 0 0">
      תת-דומיינים נכללים אוטומטית — <code dir="ltr">example.com</code> מתיר גם
      <code dir="ltr">pay.example.com</code>. הוסיפו כאן גם את שער התשלום.
    </p>`;

  const listEl = $('.hostlist', mountEl);
  const input = $('.hl-new', mountEl);
  const err = $('.hl-err', mountEl);

  const fail = (m) => { err.textContent = m; err.style.display = 'block'; };
  const clearFail = () => { err.style.display = 'none'; };

  function draw() {
    if (!hosts.length) {
      // Empty means "no lock configured", which the device treats as allow-all.
      // Saying so is the difference between a mistake and a decision.
      listEl.innerHTML = `<p class="hl-empty" style="color:#b45309;font-size:13px;margin:0">
        אין דומיינים ברשימה — המכשיר יוכל לפתוח <b>כל</b> כתובת. הוסיפו לפחות אחד כדי לנעול.</p>`;
      return;
    }
    listEl.innerHTML = '';
    hosts.forEach((h, i) => {
      const isLocked = h === lockedHost;
      const row = el(`<div class="hl-row">
        <span class="hl-host" dir="ltr">${esc(h)}</span>
        ${isLocked ? '<span class="hl-tag">כתובת המכשיר</span>' : ''}
        <span style="flex:1"></span>
        ${isLocked ? '' : `<button type="button" class="btn btn-light btn-sm" data-edit="${i}">עריכה</button>
        <button type="button" class="btn btn-danger btn-sm" data-del="${i}" aria-label="הסרת ${esc(h)}">הסרה</button>`}
      </div>`);
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      hosts.splice(Number(b.dataset.del), 1); clearFail(); draw();
    });
    listEl.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.edit);
      input.value = hosts[i]; hosts.splice(i, 1); clearFail(); draw(); input.focus();
    });
  }

  function add() {
    const h = normalizeHost(input.value);
    if (!h) return fail('דומיין לא תקין. הזינו כתובת כמו example.com (בלי https:// ובלי נתיב).');
    if (hosts.includes(h)) return fail(`${h} כבר ברשימה.`);
    hosts.push(h); input.value = ''; clearFail(); draw();
  }
  $('.hl-add', mountEl).onclick = add;
  // Enter adds a domain; it must not submit the surrounding dialog.
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  draw();
  return {
    value: () => hosts.join(','),
    /**
     * Take in anything typed but not yet added, and report whether the list is
     * safe to save.
     *
     * A domain sitting in the input is meant to be in the list — the person
     * typed it. Dropping it silently loses a domain the device then cannot
     * open; asking about it with confirm() is worse still, because a dismissed
     * dialog cancels the entire save and nothing at all is written. So: adopt
     * it if it is valid, and refuse to save with an inline error if it is not.
     */
    commitPending() {
      const raw = input.value.trim();
      if (!raw) return true;
      const h = normalizeHost(raw);
      if (!h) { fail('דומיין לא תקין. הזינו כתובת כמו example.com, או נקו את השדה כדי לשמור בלעדיו.'); return false; }
      if (!hosts.includes(h)) hosts.push(h);
      input.value = ''; clearFail(); draw();
      return true;
    },
  };
}

function modal(html) {
  const bg = el(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  $('#modal-root').appendChild(bg);
  return bg;
}
function closeModals() { $('#modal-root').innerHTML = ''; }

// ── auth ────────────────────────────────────────────────────────
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').classList.add('hidden');
  // Every other form in this console guards its submit button against a
  // second click firing a second in-flight request; this is the one every
  // user hits first, on a touchscreen kiosk console where a double-tap is
  // the normal way a tap misfires. A second request here does not create a
  // duplicate row, but it can still race the first: both calls hit the
  // login rate limiter, and boot() (which replaces this whole view) can run
  // twice concurrently.
  const btn = $('#login-submit');
  btn.disabled = true;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-user').value, password: $('#login-pass').value }) });
    TOKEN = data.token; localStorage.setItem('kf_token', TOKEN);
    await boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  TOKEN = ''; localStorage.removeItem('kf_token');
  stopPolling();
  if (SOCK) SOCK.close();
  location.reload();
});

async function boot() {
  try {
    const { user } = await api('/auth/me');
    ME = user;
  } catch {
    TOKEN = ''; localStorage.removeItem('kf_token');
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
    return;
  }
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#user-name').textContent = ME.fullName || ME.username;
  $('#user-quota').textContent = ME.role === 'admin' ? 'מנהל-על' : `${ME.devicesUsed}/${ME.deviceLimit} מכשירים`;
  if (ME.role === 'admin') $('#menu-admin').classList.remove('hidden');
  // Ask where the socket lives before opening it. A failure here is not fatal:
  // WS_HOST stays null, connectSocket falls back to this host, and if that
  // cannot upgrade the polling fallback covers it.
  try { WS_HOST = (await api('/config')).wsHost || null; } catch { WS_HOST = null; }
  connectSocket();
  route('devices');
  // Alerts (KIOSK_BUILD.md §9) have no realtime push of their own — unlike
  // devices, nothing today calls notifyConsolesOfDevice() when an alert
  // condition starts or clears — so the badge is refreshed on its own timer,
  // independent of the device socket/poll fallback above.
  refreshAlertsBadge();
  setInterval(refreshAlertsBadge, 60000);
}

// ── realtime ────────────────────────────────────────────────────
//
// The socket is the fast path, not the only path. When the console is reached
// through more30.com/kiosk the request goes via a path proxy, and a proxy that
// forwards HTTP does not necessarily forward the WebSocket upgrade — the
// handshake just fails. A dashboard that silently stops updating is worse than
// a slower one, so a failed socket falls back to polling instead of retrying
// into an empty screen.
let POLL = null;
let SOCK_EVER_OPEN = false;

function startPolling() {
  if (POLL) return;
  POLL = setInterval(() => {
    if (!TOKEN) return stopPolling();
    if (CURRENT === 'devices') loadDevices().catch(() => {});
  }, 15000);
}
function stopPolling() { if (POLL) { clearInterval(POLL); POLL = null; } }

/**
 * Where to dial. With a dedicated WS host the path is the bare one, because
 * that host points straight at this service rather than through the prefix.
 * Without one, fall back to the page's own host and prefix — right for local
 * dev and for reaching the service directly.
 */
function socketUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = `?token=${encodeURIComponent(TOKEN)}`;
  return WS_HOST
    ? `${proto}://${WS_HOST}/ws/console${q}`
    : `${proto}://${location.host}${BASE}/ws/console${q}`;
}

function connectSocket() {
  let sock;
  try {
    sock = new WebSocket(socketUrl());
  } catch {
    return startPolling();
  }
  SOCK = sock;
  sock.onopen = () => { SOCK_EVER_OPEN = true; stopPolling(); };
  sock.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'device_update' && m.device) {
      const i = DEVICES.findIndex((d) => d.id === m.device.id);
      const mapped = mapDevice(m.device);
      if (i >= 0) DEVICES[i] = { ...DEVICES[i], ...mapped }; else DEVICES.push(mapped);
      if (CURRENT === 'devices') renderDevices();
    }
  };
  sock.onclose = () => {
    if (!TOKEN) return stopPolling();
    // Never opened → this route cannot carry a socket at all. Keep polling and
    // retry rarely; reconnecting every 3s against a proxy that will never
    // upgrade is just noise in the console and in the server log.
    startPolling();
    setTimeout(() => { if (TOKEN) connectSocket(); }, SOCK_EVER_OPEN ? 3000 : 60000);
  };
}
function mapDevice(d) {
  return { id: d.id, name: d.name, serial: d.serial, ownerName: d.owner_name || d.ownerName,
    online: d.online === 1 || d.online === true, status: d.status, homeUrl: d.home_url || d.homeUrl,
    allowedHost: d.allowed_host || d.allowedHost, idleReturnSeconds: d.idle_return_seconds ?? d.idleReturnSeconds ?? 0,
    lastSeen: d.last_seen || d.lastSeen,
    battery: d.battery, model: d.model, appVersion: d.app_version || d.appVersion, ip: d.ip,
    exitCode: d.exit_code || d.exitCode || '',
    lastScreenshotAt: d.last_screenshot_at || d.lastScreenshotAt || null,
    displayZoomPercent: d.display_zoom_percent ?? d.displayZoomPercent ?? 100,
    scheduleEnabled: d.schedule_enabled === 1 || d.schedule_enabled === true || d.scheduleEnabled === true,
    scheduleOpenTime: d.schedule_open_time || d.scheduleOpenTime || '',
    scheduleCloseTime: d.schedule_close_time || d.scheduleCloseTime || '',
    signageEnabled: d.signage_enabled === 1 || d.signage_enabled === true || d.signageEnabled === true,
    signageUrls: d.signage_urls || d.signageUrls || '',
    signageIntervalSeconds: d.signage_interval_seconds ?? d.signageIntervalSeconds ?? 15,
    maintenanceEnabled: d.maintenance_enabled === 1 || d.maintenance_enabled === true || d.maintenanceEnabled === true,
    maintenanceMessage: d.maintenance_message || d.maintenanceMessage || '' };
}

// ── routing ─────────────────────────────────────────────────────
let CURRENT = 'devices';
$('#menu').addEventListener('click', (e) => {
  // Tag-agnostic on purpose: the menu items are <button> so they sit on the
  // Tab path (WCAG 2.1.1). This also still matches the old <a data-view>,
  // so it is safe to ship ahead of the markup change.
  const a = e.target.closest('[data-view]'); if (!a) return;
  route(a.dataset.view);
});
function route(view) {
  CURRENT = view;
  [...$('#menu').children].forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  ({ devices: viewDevices, links: viewLinks, clients: viewClients, templates: viewTemplates, alerts: viewAlerts, analytics: viewAnalytics, enroll: viewEnroll, guide: viewGuide, admin: viewAdmin, settings: viewSettings }[view] || viewDevices)();
}

// Cache of the customer's link library (used by enroll + edit selectors).
let LINKS = [];
async function loadLinksCache() { try { LINKS = (await api('/links')).links; } catch { LINKS = []; } return LINKS; }

// ── DEVICES ─────────────────────────────────────────────────────
async function viewDevices() {
  $('#content').innerHTML = `<div class="topbar"><h1>המכשירים שלי</h1>
    <div><button class="btn btn-light btn-sm" id="refresh">רענון</button>
    <button class="btn btn-primary btn-sm" id="add">➕ הוספת מכשיר</button></div></div>
    <div id="dev-list" class="device-grid"><p style="color:var(--muted)">טוען…</p></div>`;
  $('#add').onclick = () => route('enroll');
  $('#refresh').onclick = loadDevices;
  await loadDevices();
}
async function loadDevices() {
  const admin = ME.role === 'admin';
  const { devices } = await api('/devices' + (admin ? '?all=1' : ''));
  DEVICES = devices.map(mapDevice);
  renderDevices();
}
function renderDevices() {
  const list = $('#dev-list'); if (!list) return;
  if (!DEVICES.length) { list.innerHTML = `<div class="card"><p style="color:var(--muted);margin:0">אין עדיין מכשירים. לחצו על "הוספת מכשיר" כדי ליצור קוד רישום.</p></div>`; return; }
  list.innerHTML = '';
  for (const d of DEVICES) list.appendChild(deviceCard(d));
}
function deviceCard(d) {
  const owner = ME.role === 'admin' && d.ownerName ? `<div class="serial">לקוח: ${esc(d.ownerName)}</div>` : '';
  const c = el(`<div class="device">
    <div class="head">
      <div><div class="name"><span class="dot ${d.online ? 'on' : 'off'}"></span>${esc(d.name)}</div>
        <div class="serial">S/N: ${esc(d.serial)}</div>${owner}</div>
      <span class="pill ${d.online ? 'on' : 'off'}">${d.online ? 'מחובר' : 'מנותק'}</span>
    </div>
    ${d.maintenanceEnabled ? `<div class="pill off" style="margin-top:4px">🛠 בתחזוקה מרחוק${d.maintenanceMessage ? ' — ' + esc(d.maintenanceMessage) : ''}</div>` : ''}
    <div class="meta">🌐 ${esc(d.homeUrl || '—')}<br/>
      🔋 ${d.battery != null ? d.battery + '%' : '—'} · 📱 ${esc(d.model || '—')} · v${esc(d.appVersion || '?')}${d.displayZoomPercent && d.displayZoomPercent !== 100 ? ` · 🔍 ${d.displayZoomPercent}%` : ''}<br/>
      🕑 ${d.lastSeen ? new Date(d.lastSeen + 'Z').toLocaleString('he-IL') : 'טרם דיווח'}${d.scheduleEnabled ? `<br/>⏰ שעות פעילות: ${esc(d.scheduleOpenTime)}–${esc(d.scheduleCloseTime)}` : ''}${d.signageEnabled ? `<br/>📺 תצוגה: ${d.signageUrls.split('\n').filter(Boolean).length} קישורים / ${d.signageIntervalSeconds}ש׳` : ''}</div>
    <div class="actions"></div></div>`);
  const acts = $('.actions', c);
  const mk = (label, fn, cls = 'btn-light') => { const b = el(`<button class="btn ${cls} btn-sm">${label}</button>`); b.onclick = fn; acts.appendChild(b); };
  mk('🔄 רענן', () => cmd(d, 'reload'));
  mk('🔗 החלף אתר', () => promptUrl(d));
  mk('♻️ אתחל', () => confirmCmd(d, 'reboot', 'לאתחל את המכשיר?'));
  mk('🌙 כבה מסך', () => cmd(d, 'screen_off'));
  mk('☀️ הדלק מסך', () => cmd(d, 'screen_on'));
  mk('🧹 נקה מטמון', () => cmd(d, 'clear_cache'));
  mk('📸 צילום מסך', () => cmd(d, 'screenshot'));
  if (d.lastScreenshotAt) mk('🖼️ צילום אחרון', () => viewScreenshot(d));
  mk('📋 יומן', () => viewDeviceLog(d));
  mk('🪟 חבילת Windows', () => downloadFile(`/devices/${d.id}/windows-package`, `kioskfleet-${d.serial}.ps1`).catch((e) => toast(e.message, false)));
  mk('✏️ עריכה', () => editDevice(d));
  mk('🗑️', () => confirmDelete(d), 'btn-danger');
  return c;
}

// ── DEVICE ACTIVITY LOG (KIOSK_BUILD.md §9 "יומן אירועים לכל מכשיר") ────
//
// GET /devices/:id already returns `events` (last 30) and `commands` (last
// 20) — the fleet-management audit trail the spec asks for — but nothing in
// the console ever called that endpoint or rendered them; the only way to see
// them was a raw HTTP request. This is the surface for that data, read-only.
const EVENT_LABELS = {
  command: 'פקודה נשלחה', command_ack: 'תגובת מכשיר לפקודה', connected: 'המכשיר התחבר',
  enrolled: 'המכשיר נרשם', config_update: 'הגדרות עודכנו', screenshot: 'צילום מסך נלכד',
  client_identified: 'זוהה לקוח במכשיר', client_approved: 'לקוח אושר למכשיר', client_revoked: 'אישור לקוח בוטל',
  template_applied: 'תבנית הוחלה על המכשיר',
  snapshot_saved: 'גיבוי מדיניות נשמר', snapshot_restored: 'שוחזר גיבוי מדיניות',
};
const COMMAND_LABELS = {
  reboot: 'אתחול', reload: 'רענון', set_url: 'החלפת כתובת', screen_on: 'הדלקת מסך', screen_off: 'כיבוי מסך',
  clear_cache: 'ניקוי מטמון', lock: 'נעילה', unlock: 'שחרור זמני', screenshot: 'צילום מסך',
  message: 'הודעה על המסך', update_config: 'עדכון הגדרות',
};
const COMMAND_STATUS_LABELS = { pending: 'ממתין', delivered: 'נשלח', done: 'בוצע', failed: 'נכשל' };
const fmtTime = (t) => (t ? new Date(t + 'Z').toLocaleString('he-IL') : '—');

async function viewDeviceLog(d) {
  const m = modal(`<h3>יומן פעילות — ${esc(d.name)}</h3><p style="color:var(--muted)">טוען…</p>`);
  let detail;
  try { ({ device: detail } = await api(`/devices/${d.id}`)); }
  catch (e) { m.querySelector('.modal').innerHTML = `<h3>יומן פעילות — ${esc(d.name)}</h3>
    <p style="color:#b91c1c">${esc(e.message)}</p><div class="row" style="margin-top:12px"><button class="btn btn-light" id="c">סגירה</button></div>`;
    $('#c', m).onclick = () => m.remove(); return; }

  const events = detail.events || [];
  const commands = detail.commands || [];
  const eventsHtml = events.length
    ? '<table><tr><th>אירוע</th><th>פרטים</th><th>מתי</th></tr>' + events.map((ev) =>
        `<tr><td>${esc(EVENT_LABELS[ev.type] || ev.type)}</td><td dir="ltr" style="font-size:12px;color:var(--muted)">${esc(ev.detail || '')}</td><td style="font-size:12px">${fmtTime(ev.created_at)}</td></tr>`).join('') + '</table>'
    : '<p style="color:var(--muted);margin:0">אין עדיין אירועים.</p>';
  const commandsHtml = commands.length
    ? '<table><tr><th>פקודה</th><th>סטטוס</th><th>מתי</th></tr>' + commands.map((c) =>
        `<tr><td>${esc(COMMAND_LABELS[c.type] || c.type)}</td><td>${esc(COMMAND_STATUS_LABELS[c.status] || c.status)}</td><td style="font-size:12px">${fmtTime(c.created_at)}</td></tr>`).join('') + '</table>'
    : '<p style="color:var(--muted);margin:0">אין עדיין פקודות.</p>';

  m.querySelector('.modal').innerHTML = `<h3>יומן פעילות — ${esc(d.name)}</h3>
    <h4 style="margin-bottom:6px">פקודות אחרונות</h4>${commandsHtml}
    <h4 style="margin:16px 0 6px">אירועים (30 אחרונים)</h4>${eventsHtml}
    <div class="row" style="margin-top:12px"><button class="btn btn-light" id="c">סגירה</button></div>`;
  $('#c', m).onclick = () => m.remove();
}
async function viewScreenshot(d) {
  const m = modal(`<h3>צילום מסך — ${esc(d.name)}</h3><p style="color:var(--muted)">טוען…</p>`);
  try {
    const { image, takenAt } = await api(`/devices/${d.id}/screenshot`);
    m.querySelector('.modal').innerHTML = `<h3>צילום מסך — ${esc(d.name)}</h3>
      <p style="color:var(--muted);font-size:12px">${takenAt ? new Date(takenAt + 'Z').toLocaleString('he-IL') : ''}</p>
      <img src="${esc(image)}" alt="צילום מסך של ${esc(d.name)}" style="max-width:100%;border-radius:8px;border:1px solid var(--line)" />
      <div class="row" style="margin-top:12px"><button class="btn btn-light" id="c">סגירה</button></div>`;
    $('#c', m).onclick = () => m.remove();
  } catch (e) { m.remove(); toast(e.message, false); }
}
async function cmd(d, type, payload) {
  try { await api(`/devices/${d.id}/command`, { method: 'POST', body: JSON.stringify({ type, payload }) }); toast('הפקודה נשלחה למכשיר'); }
  catch (e) { toast(e.message, false); }
}
function confirmCmd(d, type, q) {
  const m = modal(`<h3>${esc(q)}</h3><p style="color:var(--muted)">מכשיר: ${esc(d.name)}</p>
    <div class="row"><button class="btn btn-danger" id="y">כן, בצע</button><button class="btn btn-light" id="n">ביטול</button></div>`);
  $('#y', m).onclick = () => { cmd(d, type); m.remove(); };
  $('#n', m).onclick = () => m.remove();
}
function promptUrl(d) {
  const m = modal(`<h3>החלפת אתר</h3><div class="field"><label>כתובת (חייבת להיות תחת ${esc(d.allowedHost || 'הדומיין המורשה')})</label>
    <input id="u" value="${esc(d.homeUrl || '')}" /></div>
    <div class="row"><button class="btn btn-primary" id="go">שלח</button><button class="btn btn-light" id="c">ביטול</button></div>`);
  $('#go', m).onclick = () => { const url = $('#u', m).value.trim(); if (url) cmd(d, 'set_url', { url }); m.remove(); };
  $('#c', m).onclick = () => m.remove();
}
async function editDevice(d) {
  await loadLinksCache();
  const linkOpts = LINKS.length
    ? `<div class="field"><label>החלף קישור נעילה מהספרייה (יעדכן כתובת ודומיינים)</label>
        <select id="lk"><option value="">— ללא שינוי —</option>${LINKS.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div>` : '';
  const m = modal(`<h3>עריכת מכשיר</h3>
    <div class="field"><label>שם ידידותי</label><input id="n" value="${esc(d.name)}" /></div>
    ${linkOpts}
    <div class="field"><label>קישור האירוע/אולם (Home URL)</label><input id="h" value="${esc(d.homeUrl || '')}" dir="ltr" /></div>
    <div class="field"><label>דומיינים מותרים לפתיחה במכשיר</label><div id="hl"></div></div>
    <div class="field"><label>חזרה אוטומטית לקישור לאחר חוסר פעילות (שניות; 0 = כבוי)</label><input id="idle" type="number" min="0" value="${d.idleReturnSeconds || 0}" dir="ltr" /></div>
    <div class="field"><label>הגדלת תצוגה (זום): <span id="zoom-val">${d.displayZoomPercent || 100}%</span></label>
      <input id="zoom" type="range" min="50" max="300" step="10" value="${d.displayZoomPercent || 100}" dir="ltr" /></div>
    <div class="field"><label><input id="sched-on" type="checkbox" ${d.scheduleEnabled ? 'checked' : ''} /> תזמון שעות פעילות (הדלקת/כיבוי מסך אוטומטי)</label>
      <div id="sched-fields" style="display:${d.scheduleEnabled ? 'flex' : 'none'};gap:8px;margin-top:6px">
        <div style="flex:1"><label style="font-size:12px">שעת פתיחה</label><input id="sched-open" type="time" value="${esc(d.scheduleOpenTime || '09:00')}" dir="ltr" /></div>
        <div style="flex:1"><label style="font-size:12px">שעת סגירה</label><input id="sched-close" type="time" value="${esc(d.scheduleCloseTime || '21:00')}" dir="ltr" /></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">מחוץ לשעות אלה המסך יכבה אוטומטית; בתוך השעות — יידלק. תומך בחלון לילי (למשל 22:00–06:00).</div></div>
    <div class="field"><label><input id="sig-on" type="checkbox" ${d.signageEnabled ? 'checked' : ''} /> מצב תצוגה (סבב תוכן אוטומטי בזמן חוסר פעילות)</label>
      <div id="sig-fields" style="display:${d.signageEnabled ? 'block' : 'none'};margin-top:6px">
        <div style="margin-bottom:8px"><label style="font-size:12px">קישורי תצוגה (אחד בכל שורה)</label>
          <textarea id="sig-urls" style="width:100%;height:80px;font-family:monospace;font-size:12px" dir="ltr" placeholder="https://example.com/promo1&#10;https://example.com/promo2">${esc(d.signageUrls)}</textarea></div>
        <div style="max-width:200px"><label style="font-size:12px">זמן החלפה (שניות)</label>
          <input id="sig-interval" type="number" min="3" max="3600" value="${d.signageIntervalSeconds || 15}" dir="ltr" /></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">רק כאשר אין אינטראקציה מעבר לזמן החזרה האוטומטית שהוגדר למעלה; כל נגיעה במסך חוזרת מיד לקישור הראשי. הקישורים חייבים להיות בתוך הדומיינים המורשים של המכשיר.</div></div>
    <div class="field"><label><input id="maint-on" type="checkbox" ${d.maintenanceEnabled ? 'checked' : ''} /> מצב תחזוקה מרחוק (הוצא את המכשיר משירות מיידית)</label>
      <div id="maint-fields" style="display:${d.maintenanceEnabled ? 'block' : 'none'};margin-top:6px">
        <textarea id="maint-msg" style="width:100%;height:50px;font-size:13px" placeholder="הודעה ללקוח (אופציונלי) — למשל: המכשיר בתחזוקה זמנית, נחזור בקרוב">${esc(d.maintenanceMessage)}</textarea>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">חוסם את המסך הנעול מיד ומציג הודעה במקומו, בלי לנתק את המכשיר או לאבד את הגדרותיו. כבו כדי להחזיר לשירות.</div></div>
    <div class="field"><label>קוד תחזוקה מקומי (5 הקשות בפינת המסך)</label>
      <input id="ex" value="${esc(d.exitCode || '')}" dir="ltr" placeholder="${d.exitCode ? '' : 'לא הוגדר — מכשיר ללא אינטרנט ננעל לצמיתות'}" /></div>
      <div style="font-size:12px;color:var(--muted);margin-top:-8px">
        לפחות 4 תווים, לא רצף ולא תו חוזר (למשל 1234 או 1111). השאירו ריק כדי לבטל.</div>
    <div class="field"><label>לקוחות מאושרים למכשיר זה (§2★ה — הזנת המזהה במכשיר תפתח רק את אלה)</label>
      <div id="cl-approve">טוען…</div></div>
    <div class="field"><label>גיבוי/שחזור מדיניות (כל שמירה מגבה אוטומטית את המצב הקודם)</label>
      <div class="row" style="margin-bottom:8px">
        <input id="snap-label" placeholder="תווית לגיבוי ידני (אופציונלי)" style="flex:1" />
        <button class="btn btn-light" id="snap-save" type="button">שמור מצב נוכחי</button>
      </div>
      <div id="snap-list">טוען…</div></div>
    <div class="row"><button class="btn btn-primary" id="s">שמירה</button><button class="btn btn-light" id="c">ביטול</button></div>`);

  let homeHost = '';
  try { homeHost = new URL(d.homeUrl).host; } catch { /* no home URL yet */ }
  const hl = hostListEditor($('#hl', m), d.allowedHost, homeHost);
  $('#zoom', m).oninput = (e) => { $('#zoom-val', m).textContent = `${e.target.value}%`; };
  $('#sched-on', m).onchange = (e) => { $('#sched-fields', m).style.display = e.target.checked ? 'flex' : 'none'; };
  $('#sig-on', m).onchange = (e) => { $('#sig-fields', m).style.display = e.target.checked ? 'block' : 'none'; };
  $('#maint-on', m).onchange = (e) => { $('#maint-fields', m).style.display = e.target.checked ? 'block' : 'none'; };
  loadDeviceClients(d, m);
  loadDeviceSnapshots(d, m);
  $('#snap-save', m).onclick = async () => {
    const label = $('#snap-label', m).value.trim();
    try { await api(`/devices/${d.id}/snapshots`, { method: 'POST', body: JSON.stringify({ label }) });
      $('#snap-label', m).value = ''; toast('הגיבוי נשמר'); loadDeviceSnapshots(d, m); }
    catch (e) { toast(e.message, false); }
  };

  $('#s', m).onclick = async () => {
    // Adopt a domain that was typed but not added, rather than dropping it.
    if (!hl.commitPending()) return;
    const scheduleEnabled = $('#sched-on', m).checked;
    const signageEnabled = $('#sig-on', m).checked;
    const maintenanceEnabled = $('#maint-on', m).checked;
    const body = { name: $('#n', m).value, homeUrl: $('#h', m).value, allowedHost: hl.value(), idleReturnSeconds: Number($('#idle', m).value), exitCode: $('#ex', m).value, displayZoomPercent: Number($('#zoom', m).value),
      scheduleEnabled, scheduleOpenTime: $('#sched-open', m).value, scheduleCloseTime: $('#sched-close', m).value,
      signageEnabled, signageUrls: $('#sig-urls', m).value, signageIntervalSeconds: Number($('#sig-interval', m).value),
      maintenanceEnabled, maintenanceMessage: $('#maint-msg', m).value };
    const lk = $('#lk', m); if (lk && lk.value) body.linkId = Number(lk.value);
    try { await api(`/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('נשמר. המכשיר יתעדכן מיד.'); m.remove(); loadDevices(); }
    catch (e) { toast(e.message, false); }
  };
  $('#c', m).onclick = () => m.remove();
}
// Toggled immediately on click (POST/DELETE per checkbox), not batched into
// the modal's "שמירה" — the same "act now, don't wait for a separate save"
// shape the screenshot/command buttons on the device card already use, and
// it means closing the modal with "ביטול" can never discard an approval
// change that already reached the server.
async function loadDeviceClients(d, m) {
  const box = $('#cl-approve', m); if (!box) return;
  let clients;
  try { ({ clients } = await api(`/devices/${d.id}/clients`)); }
  catch (e) { box.innerHTML = `<p style="color:#b91c1c;font-size:13px;margin:0">${esc(e.message)}</p>`; return; }
  if (!clients.length) {
    box.innerHTML = '<p style="color:var(--muted);font-size:13px;margin:0">אין עדיין לקוחות רשומים. הוסיפו ב"לקוחות" בתפריט.</p>';
    return;
  }
  box.innerHTML = clients.map((c) => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0">
    <input type="checkbox" data-client="${c.id}" ${c.approved ? 'checked' : ''} />
    <span class="code-chip" dir="ltr" style="font-size:12px">${esc(c.code)}</span> ${esc(c.name)}</label>`).join('');
  box.querySelectorAll('[data-client]').forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      try {
        await api(`/devices/${d.id}/clients/${cb.dataset.client}`, { method: cb.checked ? 'POST' : 'DELETE' });
      } catch (e) { cb.checked = !cb.checked; toast(e.message, false); }
      finally { cb.disabled = false; }
    };
  });
}
// KIOSK_BUILD.md §9 "גיבוי/שחזור מדיניות". Rendered the same "load into a
// placeholder div inside the still-open edit modal" shape as
// loadDeviceClients above; restoring closes the modal and reloads the device
// list rather than trying to patch every open field in place, the same
// "act now, don't try to keep the open form in sync" choice editDevice's own
// save handler already makes.
async function loadDeviceSnapshots(d, m) {
  const box = $('#snap-list', m); if (!box) return;
  let snapshots;
  try { ({ snapshots } = await api(`/devices/${d.id}/snapshots`)); }
  catch (e) { box.innerHTML = `<p style="color:#b91c1c;font-size:13px;margin:0">${esc(e.message)}</p>`; return; }
  if (!snapshots.length) {
    box.innerHTML = '<p style="color:var(--muted);font-size:13px;margin:0">אין עדיין גיבויים — כל שמירה תיצור אחד אוטומטית.</p>';
    return;
  }
  box.innerHTML = snapshots.map((s) => `<div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">
    <span style="font-size:13px">${esc(s.reason || 'גיבוי')} <span style="color:var(--muted)">— ${fmtTime(s.createdAt)}</span></span>
    <button class="btn btn-light" data-restore="${s.id}" type="button" style="font-size:12px">שחזר</button>
  </div>`).join('');
  box.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.restore;
      const c = modal(`<h3>שחזור גיבוי מדיניות</h3><p style="color:var(--muted)">מכשיר "${esc(d.name)}" יחזור להגדרות השמורות בגיבוי זה (המצב הנוכחי יגובה אוטומטית לפני כן).</p>
        <div class="row"><button class="btn btn-danger" id="y">שחזר</button><button class="btn btn-light" id="n">ביטול</button></div>`);
      $('#y', c).onclick = async () => {
        try { await api(`/devices/${d.id}/snapshots/${id}/restore`, { method: 'POST' });
          toast('הגיבוי שוחזר. המכשיר יתעדכן מיד.'); c.remove(); m.remove(); loadDevices(); }
        catch (e) { toast(e.message, false); c.remove(); }
      };
      $('#n', c).onclick = () => c.remove();
    };
  });
}
function confirmDelete(d) {
  const m = modal(`<h3>מחיקת מכשיר</h3><p style="color:var(--muted)">"${esc(d.name)}" יוסר מהמערכת. פעולה זו אינה הפיכה.</p>
    <div class="row"><button class="btn btn-danger" id="y">מחק</button><button class="btn btn-light" id="n">ביטול</button></div>`);
  $('#y', m).onclick = async () => { try { await api(`/devices/${d.id}`, { method: 'DELETE' }); toast('נמחק'); m.remove(); loadDevices(); } catch (e) { toast(e.message, false); } };
  $('#n', m).onclick = () => m.remove();
}

// ── ENROLL ──────────────────────────────────────────────────────
async function viewEnroll() {
  await loadLinksCache();
  const linkOptions = LINKS.length
    ? `<option value="">— בחרו קישור מהספרייה —</option>` + LINKS.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')
    : '';
  $('#content').innerHTML = `<div class="topbar"><h1>הוספת מכשיר</h1></div>
    <div class="card" style="max-width:640px">
      <h3>יצירת קוד רישום</h3>
      <p style="color:var(--muted)">בחרו איזה קישור ינעל את המכשיר — מהספרייה, או הזנה ידנית. תקבלו קוד בן 6 תווים להזנה באפליקציה.</p>
      <div class="field"><label>שם המכשיר (לזיהוי בדשבורד)</label><input id="e-name" placeholder="למשל: כניסה ראשית" /></div>
      ${LINKS.length ? `<div class="field"><label>קישור מהספרייה</label><select id="e-link">${linkOptions}</select></div>` : `<p style="color:var(--muted);font-size:13px">אין עדיין קישורים בספרייה. הוסיפו ב"ספריית קישורים" או הזינו ידנית למטה.</p>`}
      <div class="field"><label>או כתובת אתר ידנית (הקישור הספציפי של האירוע/אולם)</label><input id="e-url" placeholder="https://example.com/event/123" dir="ltr" /></div>
      <div class="field"><label>חזרה אוטומטית לקישור האירוע לאחר חוסר פעילות (שניות; 0 = כבוי)</label><input id="e-idle" type="number" min="0" value="60" dir="ltr" /></div>
      <button class="btn btn-primary" id="e-create">צור קוד רישום</button>
      <div id="e-result"></div>
    </div>
    <div class="card" style="max-width:640px"><h3>קודי רישום פתוחים</h3><div id="e-list">טוען…</div></div>`;
  $('#e-create').onclick = createEnrollment;
  loadEnrollments();
}
async function createEnrollment() {
  const homeUrl = $('#e-url').value.trim();
  const name = $('#e-name').value.trim();
  const linkId = $('#e-link') ? ($('#e-link').value || null) : null;
  const idleReturnSeconds = Math.max(0, Number($('#e-idle').value) || 0);
  if (!linkId && !homeUrl) return toast('בחרו קישור מהספרייה או הזינו כתובת אתר', false);
  // The fields are only cleared on success, below — without a guard here a
  // second click while the first /enrollments call is still in flight reads
  // the same still-filled form and mints a second, independent code (each
  // enrollment's `code` is unique, but that does not stop two rows for one
  // intended device).
  const btn = $('#e-create');
  btn.disabled = true;
  try {
    const body = linkId ? { linkId: Number(linkId), name, idleReturnSeconds } : { homeUrl, name, idleReturnSeconds };
    const { enrollment } = await api('/enrollments', { method: 'POST', body: JSON.stringify(body) });
    $('#e-result').innerHTML = `<div class="alert alert-ok" style="margin-top:16px">
      נוצר קוד רישום! הזינו אותו באפליקציה במכשיר:<br/><br/>
      <span class="code-chip">${esc(enrollment.code)}</span></div>`;
    $('#e-url').value = ''; $('#e-name').value = '';
    loadEnrollments();
  } catch (e) { toast(e.message, false); }
  finally { btn.disabled = false; }
}
async function loadEnrollments() {
  const { enrollments } = await api('/enrollments');
  const open = enrollments.filter((e) => !e.used);
  const box = $('#e-list'); if (!box) return;
  if (!open.length) { box.innerHTML = '<p style="color:var(--muted);margin:0">אין קודים פתוחים.</p>'; return; }
  box.innerHTML = '<table><tr><th>קוד</th><th>אתר</th><th>שם</th><th></th></tr>' +
    open.map((e) => `<tr><td><span class="code-chip" style="font-size:15px">${esc(e.code)}</span></td><td dir="ltr">${esc(e.home_url)}</td><td>${esc(e.name || '')}</td>
      <td class="e-actions"><button class="btn btn-sm" data-usb="${e.id}">📦 USB אופליין</button> <button class="btn btn-danger btn-sm" data-del="${e.id}">מחק</button></td></tr>`).join('') + '</table>';
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api('/enrollments/' + b.dataset.del, { method: 'DELETE' }); loadEnrollments(); });
  box.querySelectorAll('[data-usb]').forEach((b) => b.onclick = () => openUsbPackageForm(b));
}

// KIOSK_BUILD.md §3 Route D: unlike every other per-row action here, this
// one needs an input (the serial `adb devices` prints) before it can do
// anything — inline in the row rather than a second modal, the same "inline
// rather than in a second modal" shape this console already uses elsewhere,
// since a modal-over-a-table loses the row it is acting on from view.
function openUsbPackageForm(btn) {
  const enrollmentId = btn.dataset.usb;
  const td = btn.closest('td');
  td.innerHTML = `<input class="usb-serial" placeholder="מספר סידורי — adb devices" dir="ltr" style="width:150px" />
    <button class="btn btn-primary btn-sm" data-usb-go>צור והורד</button>
    <button class="btn btn-sm" data-usb-cancel>ביטול</button>
    <div style="color:var(--muted);font-size:11px;margin-top:4px">חבילה זו מנפיקה טוקן למכשיר מיד ומייצרת סקריפט התקנה שרץ בלי אינטרנט כלל.</div>`;
  const input = td.querySelector('.usb-serial');
  input.focus();
  td.querySelector('[data-usb-cancel]').onclick = () => loadEnrollments();
  const go = td.querySelector('[data-usb-go]');
  const submit = async () => {
    const serial = input.value.trim();
    if (!serial) return toast('נא להזין מספר סידורי', false);
    go.disabled = true;
    try {
      await downloadFile(`/enrollments/${enrollmentId}/usb-package`, `kioskfleet-offline-${serial}.sh`, {
        method: 'POST', body: JSON.stringify({ serial }),
      });
      toast('חבילת ה-USB האופליין הורדה. הריצו אותה עם המכשיר מחובר.');
      loadEnrollments();
    } catch (e) { toast(e.message, false); go.disabled = false; }
  };
  go.onclick = submit;
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
}

// ── LINK LIBRARY ────────────────────────────────────────────────
async function viewLinks() {
  $('#content').innerHTML = `<div class="topbar"><h1>ספריית קישורים</h1></div>
    <div class="card" style="max-width:680px">
      <h3>קישור חדש</h3>
      <p style="color:var(--muted)">שמרו כאן את הקישורים הספציפיים של האירועים/אולמות. בעת הוספת מכשיר תבחרו מתוך הרשימה איזה קישור ינעל אותו.</p>
      <div class="field"><label>שם הקישור</label><input id="l-name" placeholder="למשל: אולם הדר — חתונה 12/8" /></div>
      <div class="field"><label>כתובת הקישור (הדף הספציפי של האירוע)</label><input id="l-url" placeholder="https://example.com/event/123" dir="ltr" /></div>
      <div class="field"><label>דומיינים נוספים מותרים — למשל שער התשלום</label><div id="l-hl"></div></div>
      <button class="btn btn-primary" id="l-create">שמור קישור</button>
    </div>
    <div class="card" style="max-width:680px"><h3>הקישורים שלי</h3><div id="l-list">טוען…</div></div>`;
  const linkHl = hostListEditor($('#l-hl'), '', '');
  $('#l-create').onclick = async () => {
    const name = $('#l-name').value.trim(), url = $('#l-url').value.trim(), allowedHost = linkHl.value();
    if (!name || !url) return toast('נא למלא שם וכתובת', false);
    // Unlike enrollments, a link has no unique constraint at all — a second
    // click while the first POST /links is in flight creates a duplicate row
    // with nothing anywhere to reject it.
    const btn = $('#l-create');
    btn.disabled = true;
    try { await api('/links', { method: 'POST', body: JSON.stringify({ name, url, allowedHost }) });
      toast('הקישור נשמר'); $('#l-name').value = ''; $('#l-url').value = ''; loadLinks(); }
    catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
  loadLinks();
}
async function loadLinks() {
  const { links } = await api('/links'); LINKS = links;
  const box = $('#l-list'); if (!box) return;
  if (!links.length) { box.innerHTML = '<p style="color:var(--muted);margin:0">אין עדיין קישורים.</p>'; return; }
  box.innerHTML = '<table><tr><th>שם</th><th>כתובת</th><th>דומיינים מותרים</th><th></th></tr>' +
    links.map((l) => `<tr><td><b>${esc(l.name)}</b></td><td dir="ltr" style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(l.url)}</td>
      <td dir="ltr" style="font-size:12px;color:var(--muted)">${esc(l.allowed_host || '')}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${l.id}">מחק</button></td></tr>`).join('') + '</table>';
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api('/links/' + b.dataset.del, { method: 'DELETE' }); loadLinks(); });
}

// ── CLIENT DIRECTORY (KIOSK_BUILD.md §2★ד) ─────────────────────────
// The owner's own registered customers: a short id typed on a locked
// device, resolving to that customer's branded site. Separate from the
// "ספריית קישורים" library above — a link is an event/venue picked in this
// console; a client is entered by code on the device itself, and only opens
// on a device this console has explicitly approved it for (§2★ה, below in
// editDevice()).
async function viewClients() {
  $('#content').innerHTML = `<div class="topbar"><h1>לקוחות</h1></div>
    <p style="color:var(--muted);max-width:680px">כאן רושמים את הלקוחות של העסק: לכל לקוח מזהה קצר + אתר משלו.
      במכשיר, הזנת המזהה פותחת את האתר של אותו לקוח — רק במכשירים שאישרתם לו למטה בעריכת המכשיר.</p>
    <div class="card" style="max-width:680px">
      <h3>לקוח חדש</h3>
      <div class="field"><label>מזהה לקוח (יוקלד במכשיר)</label><input id="cl-code" placeholder="למשל: 7 או HALL7" dir="ltr" /></div>
      <div class="field"><label>שם הלקוח</label><input id="cl-name" placeholder="למשל: משפחת כהן" /></div>
      <div class="field"><label>כתובת אתר התדמית של הלקוח</label><input id="cl-url" placeholder="https://example.com/client/7" dir="ltr" /></div>
      <div class="field"><label>דומיינים נוספים מותרים</label><div id="cl-hl"></div></div>
      <div class="field"><label>לוגו למסך הפתיחה (אופציונלי)</label><input id="cl-logo" placeholder="https://example.com/logo.png" dir="ltr" /></div>
      <div class="field"><label>צבע מותג למסך הפתיחה (אופציונלי)</label>
        <div class="row" style="gap:8px;align-items:center">
          <input id="cl-color" type="color" value="#2563eb" style="width:48px;height:36px;padding:2px" />
          <button type="button" class="btn btn-light btn-sm" id="cl-color-clear">ללא צבע</button>
        </div>
      </div>
      <button class="btn btn-primary" id="cl-create">שמור לקוח</button>
    </div>
    <div class="card" style="max-width:680px"><h3>הלקוחות שלי</h3><div id="cl-list">טוען…</div></div>`;
  const clientHl = hostListEditor($('#cl-hl'), '', '');
  let clColorSet = false;
  $('#cl-color').addEventListener('input', () => { clColorSet = true; });
  $('#cl-color-clear').onclick = () => { clColorSet = false; $('#cl-color').value = '#2563eb'; };
  $('#cl-create').onclick = async () => {
    const code = $('#cl-code').value.trim(), name = $('#cl-name').value.trim(), url = $('#cl-url').value.trim(), allowedHost = clientHl.value();
    const logoUrl = $('#cl-logo').value.trim(), brandColor = clColorSet ? $('#cl-color').value : '';
    if (!code || !name || !url) return toast('נא למלא מזהה, שם וכתובת', false);
    const btn = $('#cl-create');
    btn.disabled = true;
    try { await api('/clients', { method: 'POST', body: JSON.stringify({ code, name, url, allowedHost, logoUrl, brandColor }) });
      toast('הלקוח נשמר'); $('#cl-code').value = ''; $('#cl-name').value = ''; $('#cl-url').value = ''; $('#cl-logo').value = '';
      clColorSet = false; $('#cl-color').value = '#2563eb'; loadClients(); }
    catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
  loadClients();
}
async function loadClients() {
  const { clients } = await api('/clients');
  const box = $('#cl-list'); if (!box) return;
  if (!clients.length) { box.innerHTML = '<p style="color:var(--muted);margin:0">אין עדיין לקוחות.</p>'; return; }
  box.innerHTML = '<table><tr><th>מזהה</th><th>שם</th><th>כתובת</th><th>מיתוג</th><th></th></tr>' +
    clients.map((c) => `<tr><td><span class="code-chip" dir="ltr">${esc(c.code)}</span></td><td>${esc(c.name)}</td>
      <td dir="ltr" style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(c.url)}</td>
      <td>${c.brandColor ? `<span class="brand-swatch" style="background:${esc(c.brandColor)}" title="${esc(c.brandColor)}"></span>` : ''}${c.logoUrl ? ' 🖼️' : ''}</td>
      <td><button class="btn btn-light btn-sm" data-edit="${c.id}">עריכה</button>
      <button class="btn btn-danger btn-sm" data-del="${c.id}">מחק</button></td></tr>`).join('') + '</table>';
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => { const c = clients.find((x) => x.id == b.dataset.edit); clientModal(c); });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api('/clients/' + b.dataset.del, { method: 'DELETE' }); loadClients(); });
}

/**
 * Edit dialog for an existing client — the create form above only ever
 * POSTs; PATCH /clients/:id already accepted every one of these fields, but
 * nothing in the console called it, so branding (or a mistyped URL) could
 * never be changed once saved except by deleting and re-registering, which
 * would also hand out a new device-approval requirement (§2★ה is keyed by
 * client id) for something that never needed one.
 */
function clientModal(c) {
  const m = modal(`<h3>עריכת לקוח</h3>
    <div class="field"><label>מזהה לקוח</label><input id="ce-code" value="${esc(c.code)}" dir="ltr" /></div>
    <div class="field"><label>שם הלקוח</label><input id="ce-name" value="${esc(c.name)}" /></div>
    <div class="field"><label>כתובת אתר התדמית</label><input id="ce-url" value="${esc(c.url)}" dir="ltr" /></div>
    <div class="field"><label>דומיינים נוספים מותרים</label><div id="ce-hl"></div></div>
    <div class="field"><label>לוגו למסך הפתיחה (אופציונלי)</label><input id="ce-logo" value="${esc(c.logoUrl || '')}" placeholder="https://example.com/logo.png" dir="ltr" /></div>
    <div class="field"><label>צבע מותג למסך הפתיחה (אופציונלי)</label>
      <div class="row" style="gap:8px;align-items:center">
        <input id="ce-color" type="color" value="${esc(c.brandColor || '#2563eb')}" style="width:48px;height:36px;padding:2px" />
        <button type="button" class="btn btn-light btn-sm" id="ce-color-clear">ללא צבע</button>
      </div>
    </div>
    <div class="row"><button class="btn btn-primary" id="ce-save">שמירה</button><button class="btn btn-light" id="ce-cancel">ביטול</button></div>`);
  const editHl = hostListEditor($('#ce-hl', m), c.allowedHost || '', '');
  let ceColorSet = !!c.brandColor;
  $('#ce-color', m).addEventListener('input', () => { ceColorSet = true; });
  $('#ce-color-clear', m).onclick = () => { ceColorSet = false; $('#ce-color', m).value = '#2563eb'; };
  $('#ce-cancel', m).onclick = () => m.remove();
  $('#ce-save', m).onclick = async () => {
    const btn = $('#ce-save', m);
    btn.disabled = true;
    try {
      await api('/clients/' + c.id, {
        method: 'PATCH',
        body: JSON.stringify({
          code: $('#ce-code', m).value.trim(), name: $('#ce-name', m).value.trim(), url: $('#ce-url', m).value.trim(),
          allowedHost: editHl.value(), logoUrl: $('#ce-logo', m).value.trim(), brandColor: ceColorSet ? $('#ce-color', m).value : '',
        }),
      });
      toast('הלקוח עודכן'); m.remove(); loadClients();
    } catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
}

// ── TEMPLATES (KIOSK_BUILD.md §8 "קבוצות/תבניות: להחיל מדיניות על קבוצת
// מכשירים בבת אחת") ────────────────────────────────────────────────
//
// A saved policy, applied to any number of devices in one action, instead of
// opening editDevice() for each one to repeat the same allow-list/schedule/
// signage/zoom change. Each field group is opt-in via its own checkbox —
// unchecked means "not part of this template", matching the server's own
// "NULL = not part of this template" convention (routes/templates.js /
// templatepolicy.js), so a template can add a business-hours schedule to a
// fleet without also silently overwriting every device's own home URL.
async function viewTemplates() {
  $('#content').innerHTML = `<div class="topbar"><h1>תבניות</h1></div>
    <p style="color:var(--muted);max-width:680px">שמרו כאן מדיניות (דומיינים מותרים, שעות פעילות, תצוגה, זום, מצב תחזוקה, קוד תחזוקה) והחילו אותה על כמה מכשירים בבת אחת. כל שדה מוחל רק אם סימנתם אותו — שדה לא-מסומן נשאר כפי שהיה בכל מכשיר.</p>
    <div class="card" style="max-width:680px">
      <h3>תבנית חדשה</h3>
      <div class="field"><label>שם התבנית</label><input id="tpl-name" placeholder="למשל: שעות פעילות אולם" /></div>
      <div class="field"><label>קישור ראשי (אופציונלי)</label><input id="tpl-url" placeholder="https://example.com" dir="ltr" /></div>
      <div class="field"><label>דומיינים נוספים מותרים (אופציונלי)</label><div id="tpl-hl"></div></div>
      <div class="field"><label>חזרה אוטומטית לקישור (שניות; ריק = לא לכלול)</label><input id="tpl-idle" type="number" min="0" placeholder="לא לכלול" dir="ltr" /></div>
      <div class="field"><label><input id="tpl-zoom-on" type="checkbox" /> כלול הגדלת תצוגה (זום): <span id="tpl-zoom-val">100%</span></label>
        <input id="tpl-zoom" type="range" min="50" max="300" step="10" value="100" disabled dir="ltr" /></div>
      <div class="field"><label><input id="tpl-sched-on" type="checkbox" /> כלול תזמון שעות פעילות בתבנית</label>
        <div id="tpl-sched-fields" style="display:none;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px"><input id="tpl-sched-enabled" type="checkbox" checked /> מופעל (לא מסומן = כיבוי התזמון בכל מכשיר שהתבנית תוחל עליו)</label>
          <div style="display:flex;gap:8px;margin-top:6px">
            <div style="flex:1"><label style="font-size:12px">שעת פתיחה</label><input id="tpl-sched-open" type="time" value="09:00" dir="ltr" /></div>
            <div style="flex:1"><label style="font-size:12px">שעת סגירה</label><input id="tpl-sched-close" type="time" value="21:00" dir="ltr" /></div>
          </div>
        </div></div>
      <div class="field"><label><input id="tpl-sig-on" type="checkbox" /> כלול מצב תצוגה בתבנית</label>
        <div id="tpl-sig-fields" style="display:none;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px"><input id="tpl-sig-enabled" type="checkbox" checked /> מופעל (לא מסומן = כיבוי מצב התצוגה בכל מכשיר שהתבנית תוחל עליו)</label>
          <div style="margin-top:8px"><label style="font-size:12px">קישורי תצוגה (אחד בכל שורה)</label>
            <textarea id="tpl-sig-urls" style="width:100%;height:70px;font-family:monospace;font-size:12px" dir="ltr" placeholder="https://example.com/promo1&#10;https://example.com/promo2"></textarea></div>
          <div style="max-width:200px;margin-top:6px"><label style="font-size:12px">זמן החלפה (שניות)</label>
            <input id="tpl-sig-interval" type="number" min="3" max="3600" value="15" dir="ltr" /></div>
        </div></div>
      <div class="field"><label><input id="tpl-maint-on" type="checkbox" /> כלול מצב תחזוקה מרחוק בתבנית</label>
        <div id="tpl-maint-fields" style="display:none;margin-top:6px">
          <label style="display:flex;align-items:center;gap:6px"><input id="tpl-maint-enabled" type="checkbox" /> מופעל (לא מסומן = החזרת המכשירים לשירות בכל מכשיר שהתבנית תוחל עליו)</label>
          <textarea id="tpl-maint-msg" style="width:100%;height:50px;font-size:13px;margin-top:6px" placeholder="הודעה ללקוח (אופציונלי)"></textarea>
        </div></div>
      <div class="field"><label>קוד תחזוקה מקומי (אופציונלי; ריק = לא לכלול)</label><input id="tpl-exit" placeholder="לא לכלול" dir="ltr" /></div>
      <button class="btn btn-primary" id="tpl-create">שמור תבנית</button>
    </div>
    <div class="card" style="max-width:680px"><h3>התבניות שלי</h3><div id="tpl-list">טוען…</div></div>`;
  const tplHl = hostListEditor($('#tpl-hl'), '', '');
  $('#tpl-zoom-on').onchange = (e) => { $('#tpl-zoom').disabled = !e.target.checked; };
  $('#tpl-zoom').oninput = (e) => { $('#tpl-zoom-val').textContent = `${e.target.value}%`; };
  $('#tpl-sched-on').onchange = (e) => { $('#tpl-sched-fields').style.display = e.target.checked ? 'block' : 'none'; };
  $('#tpl-sig-on').onchange = (e) => { $('#tpl-sig-fields').style.display = e.target.checked ? 'block' : 'none'; };
  $('#tpl-maint-on').onchange = (e) => { $('#tpl-maint-fields').style.display = e.target.checked ? 'block' : 'none'; };

  $('#tpl-create').onclick = async () => {
    const name = $('#tpl-name').value.trim();
    if (!name) return toast('נא למלא שם לתבנית', false);
    const body = { name };
    const url = $('#tpl-url').value.trim(); if (url) body.homeUrl = url;
    const allowedHost = tplHl.value(); if (allowedHost) body.allowedHost = allowedHost;
    const idle = $('#tpl-idle').value; if (idle !== '') body.idleReturnSeconds = Number(idle);
    const exitCode = $('#tpl-exit').value.trim(); if (exitCode) body.exitCode = exitCode;
    if ($('#tpl-zoom-on').checked) body.displayZoomPercent = Number($('#tpl-zoom').value);
    if ($('#tpl-sched-on').checked) {
      body.scheduleEnabled = $('#tpl-sched-enabled').checked;
      body.scheduleOpenTime = $('#tpl-sched-open').value;
      body.scheduleCloseTime = $('#tpl-sched-close').value;
    }
    if ($('#tpl-sig-on').checked) {
      body.signageEnabled = $('#tpl-sig-enabled').checked;
      body.signageUrls = $('#tpl-sig-urls').value;
      body.signageIntervalSeconds = Number($('#tpl-sig-interval').value);
    }
    if ($('#tpl-maint-on').checked) {
      body.maintenanceEnabled = $('#tpl-maint-enabled').checked;
      body.maintenanceMessage = $('#tpl-maint-msg').value;
    }
    const btn = $('#tpl-create');
    btn.disabled = true;
    try { await api('/templates', { method: 'POST', body: JSON.stringify(body) }); toast('התבנית נשמרה'); viewTemplates(); }
    catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
  loadTemplates();
}

/** A short, human-readable summary of what a template actually sets, for the list table. */
function templateSummary(t) {
  const parts = [];
  if (t.homeUrl) parts.push('קישור ראשי');
  if (t.allowedHost) parts.push('דומיינים מותרים');
  if (t.idleReturnSeconds != null) parts.push('חזרה אוטומטית');
  if (t.exitCode != null) parts.push('קוד תחזוקה');
  if (t.displayZoomPercent != null) parts.push(`זום ${t.displayZoomPercent}%`);
  if (t.scheduleEnabled != null) parts.push(t.scheduleEnabled ? `שעות ${t.scheduleOpenTime}–${t.scheduleCloseTime}` : 'כיבוי תזמון');
  if (t.signageEnabled != null) parts.push(t.signageEnabled ? 'מצב תצוגה' : 'כיבוי תצוגה');
  if (t.maintenanceEnabled != null) parts.push(t.maintenanceEnabled ? 'מצב תחזוקה' : 'החזרה לשירות');
  return parts.length ? parts.join(' · ') : 'תבנית ריקה';
}

async function loadTemplates() {
  let templates;
  try { ({ templates } = await api('/templates')); } catch (e) { toast(e.message, false); templates = []; }
  const box = $('#tpl-list'); if (!box) return;
  if (!templates.length) { box.innerHTML = '<p style="color:var(--muted);margin:0">אין עדיין תבניות.</p>'; return; }
  box.innerHTML = '<table><tr><th>שם</th><th>כולל</th><th></th></tr>' +
    templates.map((t) => `<tr><td><b>${esc(t.name)}</b></td>
      <td style="font-size:12px;color:var(--muted)">${esc(templateSummary(t))}</td>
      <td><button class="btn btn-primary btn-sm" data-apply="${t.id}">החלה על מכשירים</button>
      <button class="btn btn-danger btn-sm" data-del="${t.id}">מחק</button></td></tr>`).join('') + '</table>';
  box.querySelectorAll('[data-apply]').forEach((b) => b.onclick = () => {
    const t = templates.find((x) => x.id == b.dataset.apply); applyTemplateModal(t);
  });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    try { await api('/templates/' + b.dataset.del, { method: 'DELETE' }); loadTemplates(); }
    catch (e) { toast(e.message, false); }
  });
}

/** Device-picker modal for POST /templates/:id/apply — a fresh device list, not the (possibly stale) devices-view cache. */
async function applyTemplateModal(t) {
  const m = modal(`<h3>החלת "${esc(t.name)}" על מכשירים</h3>
    <p style="color:var(--muted);font-size:13px">${esc(templateSummary(t))}</p>
    <div id="apply-dev-list" style="max-height:320px;overflow:auto">טוען…</div>
    <div class="row" style="margin-top:10px"><button class="btn btn-primary" id="apply-go">החל על הנבחרים</button><button class="btn btn-light" id="apply-cancel">ביטול</button></div>`);
  $('#apply-cancel', m).onclick = () => m.remove();
  let devices = [];
  try { ({ devices } = await api('/devices' + (ME.role === 'admin' ? '?all=1' : ''))); } catch (e) { toast(e.message, false); }
  const list = $('#apply-dev-list', m);
  if (!devices.length) { list.innerHTML = '<p style="color:var(--muted);margin:0">אין מכשירים.</p>'; return; }
  list.innerHTML = devices.map((d) => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0">
    <input type="checkbox" data-dev="${d.id}" />
    <span class="dot ${d.online ? 'on' : 'off'}"></span> ${esc(d.name)} <span style="color:var(--muted);font-size:12px">S/N ${esc(d.serial)}</span></label>`).join('');
  $('#apply-go', m).onclick = async () => {
    const deviceIds = [...list.querySelectorAll('[data-dev]:checked')].map((cb) => Number(cb.dataset.dev));
    if (!deviceIds.length) return toast('בחרו לפחות מכשיר אחד', false);
    const btn = $('#apply-go', m);
    btn.disabled = true;
    try {
      const { applied, skipped } = await api(`/templates/${t.id}/apply`, { method: 'POST', body: JSON.stringify({ deviceIds }) });
      toast(skipped.length ? `הוחל על ${applied.length} מכשירים, ${skipped.length} דולגו` : `הוחל על ${applied.length} מכשירים`);
      m.remove(); if (CURRENT === 'devices') loadDevices();
    } catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
}

// ── ALERTS (KIOSK_BUILD.md §9 "התראות: מכשיר אופליין מעל X, סוללה נמוכה,
// ניסיון יציאה מהקיוסק") ────────────────────────────────────────
async function refreshAlertsBadge() {
  const badge = $('#alerts-badge'); if (!badge || !TOKEN) return;
  try {
    const { summary } = await api('/alerts' + (ME && ME.role === 'admin' ? '?all=1' : ''));
    badge.textContent = summary.total > 99 ? '99+' : String(summary.total);
    badge.classList.toggle('hidden', summary.total === 0);
  } catch { /* a failed refresh leaves the last-known badge on screen */ }
}

function formatAlertTime(iso) {
  // SQLite's datetime('now') has no timezone suffix and is UTC — without the
  // 'Z' the browser would parse it as *local* time, misreading it by the
  // viewer's own UTC offset (e.g. an event minutes old showing hours in the
  // future). devicepayload.js's own timestamps carry a real 'Z'/offset (they
  // pass straight through from column values written elsewhere); events'
  // created_at is the one raw `datetime('now')` string reaching the client.
  const withZone = /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(withZone).toLocaleString('he-IL');
}

async function viewAlerts() {
  $('#content').innerHTML = `<div class="topbar"><h1>התראות</h1>
    <button class="btn btn-light btn-sm" id="alerts-refresh">רענון</button></div>
    <div id="alerts-body"><p style="color:var(--muted)">טוען…</p></div>`;
  $('#alerts-refresh').onclick = loadAlerts;
  await loadAlerts();
}

async function loadAlerts() {
  let data;
  try { data = await api('/alerts' + (ME.role === 'admin' ? '?all=1' : '')); }
  catch (e) { toast(e.message, false); return; }
  refreshAlertsBadge();
  const { offlineDevices, lowBatteryDevices, exitAttempts, crashLoopDevices, thresholds } = data;
  const box = $('#alerts-body'); if (!box) return;

  const offlineHtml = !offlineDevices.length
    ? `<p style="color:var(--muted);margin:0">אין מכשירים אופליין מעל ${thresholds.offlineMinutes} דקות.</p>`
    : `<table><tr><th>מכשיר</th><th>מספר סידורי</th><th>נראה לאחרונה</th></tr>${offlineDevices.map((d) =>
        `<tr><td><b>${esc(d.name)}</b></td><td dir="ltr">${esc(d.serial)}</td><td>${d.last_seen ? formatAlertTime(d.last_seen) : 'מעולם לא'}</td></tr>`
      ).join('')}</table>`;

  const batteryHtml = !lowBatteryDevices.length
    ? `<p style="color:var(--muted);margin:0">אין מכשירים עם סוללה מתחת ל-${thresholds.lowBatteryPercent}%.</p>`
    : `<table><tr><th>מכשיר</th><th>מספר סידורי</th><th>סוללה</th></tr>${lowBatteryDevices.map((d) =>
        `<tr><td><b>${esc(d.name)}</b></td><td dir="ltr">${esc(d.serial)}</td><td>🔋 ${d.battery}%</td></tr>`
      ).join('')}</table>`;

  const exitHtml = !exitAttempts.length
    ? `<p style="color:var(--muted);margin:0">אין ניסיונות יציאה ב-${thresholds.exitAttemptWindowHours} השעות האחרונות.</p>`
    : `<table><tr><th>מכשיר</th><th>תוצאה</th><th>זמן</th></tr>${exitAttempts.map((e) =>
        `<tr><td><b>${esc(e.device_name)}</b> <span style="color:var(--muted);font-size:12px" dir="ltr">${esc(e.device_serial)}</span></td>
         <td>${e.detail === 'wrong_code' ? '⚠️ קוד שגוי' : '✅ קוד נכון'}</td>
         <td>${formatAlertTime(e.created_at)}</td></tr>`
      ).join('')}</table>`;

  // KIOSK_BUILD.md §0/§8 "watchdog": crashLoopDevices is already the
  // deduped, threshold-filtered output of summarizeCrashLoop() — nothing
  // left to compute here, only render.
  const crashHtml = !crashLoopDevices.length
    ? `<p style="color:var(--muted);margin:0">אין מכשירים עם קריסות/אתחולי-watchdog חוזרים ב-${thresholds.crashLoopWindowHours} השעות האחרונות.</p>`
    : `<table><tr><th>מכשיר</th><th>מספר סידורי</th><th>כמות</th><th>אחרון</th></tr>${crashLoopDevices.map((d) =>
        `<tr><td><b>${esc(d.device_name)}</b></td><td dir="ltr">${esc(d.device_serial)}</td>
         <td>🔁 ${d.count}</td><td>${formatAlertTime(d.lastAt)}</td></tr>`
      ).join('')}</table>`;

  box.innerHTML = `
    <div class="card"><h3>📡 מכשירים אופליין (מעל ${thresholds.offlineMinutes} דקות)</h3>${offlineHtml}</div>
    <div class="card"><h3>🔋 סוללה נמוכה (מתחת ל-${thresholds.lowBatteryPercent}%)</h3>${batteryHtml}</div>
    <div class="card"><h3>🚪 ניסיונות יציאה מהקיוסק (${thresholds.exitAttemptWindowHours} שעות אחרונות)</h3>${exitHtml}</div>
    <div class="card"><h3>🔁 יציבות — קריסות/אתחולים חוזרים (מעל ${thresholds.crashLoopThreshold} ב-${thresholds.crashLoopWindowHours} שעות)</h3>${crashHtml}</div>`;
}

// ── ANALYTICS (KIOSK_BUILD.md §9 "אנליטיקה: כמה שימושים, זמן ממוצע,
// קישורים פופולריים") ──────────────────────────────────────────
// "Usage" here is specifically client switches (see routes/analytics.js's own
// header comment) — the number is honest about what is tracked, not a general
// screen-on-time figure this system has no event source for.
function formatDurationSeconds(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} שנ׳`;
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return s ? `${m} דק׳ ${s} שנ׳` : `${m} דק׳`;
}

async function viewAnalytics() {
  $('#content').innerHTML = `<div class="topbar"><h1>אנליטיקה</h1>
    <button class="btn btn-light btn-sm" id="analytics-refresh">רענון</button></div>
    <div id="analytics-body"><p style="color:var(--muted)">טוען…</p></div>`;
  $('#analytics-refresh').onclick = loadAnalytics;
  await loadAnalytics();
}

async function loadAnalytics() {
  let data;
  try { data = await api('/analytics' + (ME.role === 'admin' ? '?all=1' : '')); }
  catch (e) { toast(e.message, false); return; }
  const box = $('#analytics-body'); if (!box) return;
  const { totalSwitches, overallAvgSeconds, byClient } = data.summary;

  const tableHtml = !byClient.length
    ? '<p style="color:var(--muted);margin:0">עדיין אין מעברי לקוח מדווחים מהמכשירים.</p>'
    : `<table><tr><th>לקוח</th><th>שימושים</th><th>זמן ממוצע במסך</th><th>שימוש אחרון</th></tr>${byClient.map((c) =>
        `<tr><td><b>${esc(c.name)}</b> <span style="color:var(--muted);font-size:12px" dir="ltr">${esc(c.code)}</span></td>
         <td>${c.count}</td>
         <td>${formatDurationSeconds(c.avgSeconds)}</td>
         <td>${c.lastUsedAt ? formatAlertTime(c.lastUsedAt) : '—'}</td></tr>`
      ).join('')}</table>`;

  box.innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="v">${totalSwitches}</div><div class="l">סה״כ מעברי לקוח</div></div>
      <div class="stat"><div class="v">${formatDurationSeconds(overallAvgSeconds)}</div><div class="l">זמן ממוצע במסך</div></div>
      <div class="stat"><div class="v">${byClient.length}</div><div class="l">לקוחות פעילים</div></div>
    </div>
    <div class="card"><h3>🔗 לקוחות פופולריים</h3>${tableHtml}</div>`;
}

// ── SETTINGS ────────────────────────────────────────────────────
function viewSettings() {
  $('#content').innerHTML = `<div class="topbar"><h1>הגדרות</h1></div>
    <div class="card" style="max-width:520px"><h3>שינוי סיסמה</h3>
      <div class="field"><label>סיסמה נוכחית</label><input id="cp" type="password" /></div>
      <div class="field"><label>סיסמה חדשה (8 תווים לפחות)</label><input id="np" type="password" /></div>
      <button class="btn btn-primary" id="chp">עדכן סיסמה</button></div>`;
  $('#chp').onclick = async () => {
    try { await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: $('#cp').value, newPassword: $('#np').value }) });
      toast('הסיסמה עודכנה'); $('#cp').value = ''; $('#np').value = ''; }
    catch (e) { toast(e.message, false); }
  };
}

// ── ADMIN ───────────────────────────────────────────────────────
async function viewAdmin() {
  if (ME.role !== 'admin') return route('devices');
  $('#content').innerHTML = `<div class="topbar"><h1>ניהול-על</h1><button class="btn btn-primary btn-sm" id="new-user">➕ לקוח חדש</button></div>
    <div class="stat-row" id="stats"></div>
    <div class="card"><h3>לקוחות</h3><div id="users">טוען…</div></div>`;
  $('#new-user').onclick = () => userModal();
  const { stats } = await api('/admin/stats');
  $('#stats').innerHTML = `
    <div class="stat"><div class="v">${stats.users}</div><div class="l">לקוחות</div></div>
    <div class="stat"><div class="v">${stats.devices}</div><div class="l">מכשירים</div></div>
    <div class="stat"><div class="v" style="color:var(--accent-2)">${stats.online}</div><div class="l">מחוברים כעת</div></div>
    <div class="stat"><div class="v" style="color:var(--muted)">${stats.offline}</div><div class="l">מנותקים</div></div>`;
  loadUsers();
}
async function loadUsers() {
  const { users } = await api('/admin/users');
  $('#users').innerHTML = '<table><tr><th>משתמש</th><th>שם</th><th>תפקיד</th><th>מכשירים</th><th>מכסה</th><th>פעיל</th><th></th></tr>' +
    users.map((u) => `<tr>
      <td><b>${esc(u.username)}</b></td><td>${esc(u.full_name || '')}</td>
      <td>${u.role === 'admin' ? '👑 מנהל-על' : 'לקוח'}</td>
      <td>${u.devices_used}</td><td>${u.device_limit}</td>
      <td>${u.active ? '✅' : '⛔'}</td>
      <td>
        <button class="btn btn-light btn-sm" data-edit="${u.id}">ערוך</button>
        <button class="btn btn-light btn-sm" data-pw="${u.id}">סיסמה</button>
        ${u.role === 'admin' ? '' : `<button class="btn btn-danger btn-sm" data-del="${u.id}">מחק</button>`}
      </td></tr>`).join('') + '</table>';
  const box = $('#users');
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => { const u = users.find((x) => x.id == b.dataset.edit); userModal(u); });
  box.querySelectorAll('[data-pw]').forEach((b) => b.onclick = () => resetPw(b.dataset.pw));
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => delUser(b.dataset.del));
}
function userModal(u) {
  const isEdit = !!u;
  const m = modal(`<h3>${isEdit ? 'עריכת לקוח' : 'לקוח חדש'}</h3>
    ${isEdit ? '' : '<div class="field"><label>שם משתמש</label><input id="u-user" dir="ltr" /></div>'}
    <div class="field"><label>שם מלא</label><input id="u-name" value="${esc(u?.full_name || '')}" /></div>
    ${isEdit ? '' : '<div class="field"><label>סיסמה (8+ תווים)</label><input id="u-pass" type="text" dir="ltr" /></div>'}
    <div class="field"><label>מכסת מכשירים</label><input id="u-limit" type="number" min="1" value="${u?.device_limit || 1}" /></div>
    ${isEdit ? `<div class="field"><label>סטטוס</label><select id="u-active"><option value="1" ${u.active ? 'selected' : ''}>פעיל</option><option value="0" ${!u.active ? 'selected' : ''}>מושבת</option></select></div>` : ''}
    <div class="row"><button class="btn btn-primary" id="u-save">שמירה</button><button class="btn btn-light" id="u-cancel">ביטול</button></div>`);
  $('#u-cancel', m).onclick = () => m.remove();
  $('#u-save', m).onclick = async () => {
    // `username` is UNIQUE, so a double-submit on create cannot silently
    // duplicate the account — but it does fire a second POST that fails on
    // the constraint and surfaces as a confusing error toast. Guarded the
    // same way as the two creates above, on both branches since the button
    // is shared and the edit branch is a harmless repeat either way.
    const btn = $('#u-save', m);
    btn.disabled = true;
    try {
      if (isEdit) {
        await api('/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ fullName: $('#u-name', m).value, deviceLimit: Number($('#u-limit', m).value), active: Number($('#u-active', m).value) }) });
      } else {
        await api('/admin/users', { method: 'POST', body: JSON.stringify({ username: $('#u-user', m).value, password: $('#u-pass', m).value, fullName: $('#u-name', m).value, deviceLimit: Number($('#u-limit', m).value) }) });
      }
      toast('נשמר'); m.remove(); loadUsers();
    } catch (e) { toast(e.message, false); }
    finally { btn.disabled = false; }
  };
}
function resetPw(id) {
  const m = modal(`<h3>איפוס סיסמה</h3><div class="field"><label>סיסמה חדשה (8+ תווים)</label><input id="pw" type="text" dir="ltr" /></div>
    <div class="row"><button class="btn btn-primary" id="ok">אפס</button><button class="btn btn-light" id="c">ביטול</button></div>`);
  $('#ok', m).onclick = async () => { try { await api(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: $('#pw', m).value }) }); toast('הסיסמה אופסה'); m.remove(); } catch (e) { toast(e.message, false); } };
  $('#c', m).onclick = () => m.remove();
}
function delUser(id) {
  const m = modal(`<h3>מחיקת לקוח</h3><p style="color:var(--muted)">כל המכשירים של הלקוח יימחקו. להמשיך?</p>
    <div class="row"><button class="btn btn-danger" id="y">מחק</button><button class="btn btn-light" id="n">ביטול</button></div>`);
  $('#y', m).onclick = async () => { try { await api('/admin/users/' + id, { method: 'DELETE' }); toast('נמחק'); m.remove(); loadUsers(); } catch (e) { toast(e.message, false); } };
  $('#n', m).onclick = () => m.remove();
}

// ── GUIDE (in-app Hebrew instructions) ──────────────────────────
function viewGuide() {
  $('#content').innerHTML = `<div class="topbar"><h1>הוראות הפעלת מכשיר</h1></div>
  <div class="card" style="max-width:820px">
    <h3>הפעלת קיוסק על טאבלט חדש — שלב אחר שלב</h3>
    <div class="steps" style="margin:20px 0">
      <div class="step"><div class="n"></div><div><h4>הורידו והתקינו את האפליקציה</h4><p>העבירו את הקובץ <code>kioskfleet-agent.apk</code> למכשיר והתקינו אותו. אם מופיעה אזהרה — אשרו "התקנה ממקור לא ידוע" בהגדרות.</p></div></div>
      <div class="step"><div class="n"></div><div><h4>הזינו קוד רישום</h4><p>פתחו את האפליקציה. במסך הראשון הזינו את קוד הרישום בן 6 התווים שיצרתם במסך "הוספת מכשיר".</p></div></div>
      <div class="step"><div class="n"></div><div><h4>נעילת מצב קיוסק (מומלץ)</h4><p>לחסימה מלאה של כפתורי Home/Back, הפעילו Device Owner פעם אחת (דרך מחשב, ראו מדריך למטה). ללא זה — הנעילה עדיין פעילה אך פחות הרמטית.</p></div></div>
      <div class="step"><div class="n"></div><div><h4>זהו! שליטה מרחוק</h4><p>המכשיר יופיע כאן כ"מחובר". מעכשיו אפשר לאתחל, לרענן ולהחליף אתר מרחוק — לפי המספר הסידורי.</p></div></div>
    </div>
    <h3>יציאה זמנית ממצב קיוסק (לתחזוקה)</h3>
    <p style="color:var(--muted)">במכשיר עצמו: 5 נגיעות רצופות בפינה השמאלית-העליונה של המסך, ואז הזנת קוד הניהול המקומי. או פשוט שלחו פקודת "פתיחה" מרחוק מהדשבורד.</p>
    <h3>הגדרות מומלצות במכשיר</h3>
    <ul>
      <li>הגדרות → תצוגה → מצב שינה → <b>לעולם לא</b> (המסך תמיד דלוק).</li>
      <li>הגדרות → מערכת → עדכוני מערכת → <b>כבו עדכונים אוטומטיים</b>.</li>
      <li>הגדרות → אפליקציות → KioskFleet → סוללה → <b>ללא הגבלה</b> (כדי שירוץ ברקע תמיד).</li>
    </ul>
    <p><a href="${BASE}/docs/user-guide-he.md" target="_blank">📄 מדריך המשתמש המלא (כולל הגדרת Device Owner)</a></p>
  </div>`;
}

// ── start ───────────────────────────────────────────────────────
if (TOKEN) boot(); else { $('#login-view').classList.remove('hidden'); }
