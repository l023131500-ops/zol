'use strict';

// KIOSK_BUILD.md §2★ז — public, unauthenticated picker for GET /k/:code.
// Deliberately independent of app.js's api()/TOKEN machinery: this page is
// reached with no login and no device_token, by design (see routes/launcher.js's
// header comment), so it has nothing to authenticate with in the first place.

const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Same "derive the mount prefix from where the page actually is" reasoning
// as app.js's own BASE: this page is served both at the root (Railway URL,
// local dev) and under more30.com/kiosk.
const BASE = location.pathname.replace(/\/k\/[^/]+\/?$/, '');
const CODE = decodeURIComponent((location.pathname.match(/\/k\/([^/]+)\/?$/) || [, ''])[1]);

function renderError(message) {
  $('#launcher-items').innerHTML = '';
  $('#launcher-items').appendChild(el(`<p class="launcher-status error">${esc(message)}</p>`));
}

function renderItems(deviceName, items) {
  if (deviceName) $('#launcher-title').textContent = `בחרו יעד — ${deviceName}`;
  const box = $('#launcher-items');
  box.innerHTML = '';
  if (!items.length) {
    box.appendChild(el('<p class="launcher-status">אין עדיין יעדים מאושרים למכשיר זה. פנו למנהל המערכת.</p>'));
    return;
  }
  const list = el('<div class="launcher-list"></div>');
  for (const item of items) {
    const btn = el(`<button type="button" class="launch-item">
      ${item.logoUrl ? `<img src="${esc(item.logoUrl)}" alt="" />` : ''}
      <span>${esc(item.name)}</span></button>`);
    if (item.brandColor) btn.style.borderColor = item.brandColor;
    btn.addEventListener('click', () => { location.href = item.url; });
    list.appendChild(btn);
  }
  box.appendChild(list);
}

async function load() {
  if (!CODE) { renderError('קוד גישה חסר בכתובת.'); return; }
  try {
    const res = await fetch(BASE + '/api/public/launcher/' + encodeURIComponent(CODE));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'שגיאה בטעינה');
    renderItems(data.deviceName, Array.isArray(data.items) ? data.items : []);
  } catch (e) {
    renderError(e.message || 'קוד לא תקין או לא נמצא');
  }
}

load();
