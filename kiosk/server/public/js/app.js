'use strict';

// ── tiny helpers ───────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let TOKEN = localStorage.getItem('kf_token') || '';
let ME = null;
let SOCK = null;
let DEVICES = [];

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'שגיאה בשרת');
  return data;
}

function toast(msg, ok = true) {
  const t = el(`<div class="toast" style="background:${ok ? '#0b1220' : '#b91c1c'}">${esc(msg)}</div>`);
  $('#toast-root').appendChild(t);
  setTimeout(() => t.remove(), 2600);
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
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#login-user').value, password: $('#login-pass').value }) });
    TOKEN = data.token; localStorage.setItem('kf_token', TOKEN);
    await boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  TOKEN = ''; localStorage.removeItem('kf_token');
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
  connectSocket();
  route('devices');
}

// ── realtime ────────────────────────────────────────────────────
function connectSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  SOCK = new WebSocket(`${proto}://${location.host}/ws/console?token=${encodeURIComponent(TOKEN)}`);
  SOCK.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'device_update' && m.device) {
      const i = DEVICES.findIndex((d) => d.id === m.device.id);
      const mapped = mapDevice(m.device);
      if (i >= 0) DEVICES[i] = { ...DEVICES[i], ...mapped }; else DEVICES.push(mapped);
      if (CURRENT === 'devices') renderDevices();
    }
  };
  SOCK.onclose = () => { setTimeout(() => { if (TOKEN) connectSocket(); }, 3000); };
}
function mapDevice(d) {
  return { id: d.id, name: d.name, serial: d.serial, ownerName: d.owner_name || d.ownerName,
    online: d.online === 1 || d.online === true, status: d.status, homeUrl: d.home_url || d.homeUrl,
    allowedHost: d.allowed_host || d.allowedHost, idleReturnSeconds: d.idle_return_seconds ?? d.idleReturnSeconds ?? 0,
    lastSeen: d.last_seen || d.lastSeen,
    battery: d.battery, model: d.model, appVersion: d.app_version || d.appVersion, ip: d.ip };
}

// ── routing ─────────────────────────────────────────────────────
let CURRENT = 'devices';
$('#menu').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-view]'); if (!a) return;
  route(a.dataset.view);
});
function route(view) {
  CURRENT = view;
  [...$('#menu').children].forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  ({ devices: viewDevices, links: viewLinks, enroll: viewEnroll, guide: viewGuide, admin: viewAdmin, settings: viewSettings }[view] || viewDevices)();
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
    <div class="meta">🌐 ${esc(d.homeUrl || '—')}<br/>
      🔋 ${d.battery != null ? d.battery + '%' : '—'} · 📱 ${esc(d.model || '—')} · v${esc(d.appVersion || '?')}<br/>
      🕑 ${d.lastSeen ? new Date(d.lastSeen + 'Z').toLocaleString('he-IL') : 'טרם דיווח'}</div>
    <div class="actions"></div></div>`);
  const acts = $('.actions', c);
  const mk = (label, fn, cls = 'btn-light') => { const b = el(`<button class="btn ${cls} btn-sm">${label}</button>`); b.onclick = fn; acts.appendChild(b); };
  mk('🔄 רענן', () => cmd(d, 'reload'));
  mk('🔗 החלף אתר', () => promptUrl(d));
  mk('♻️ אתחל', () => confirmCmd(d, 'reboot', 'לאתחל את המכשיר?'));
  mk('🌙 כבה מסך', () => cmd(d, 'screen_off'));
  mk('☀️ הדלק מסך', () => cmd(d, 'screen_on'));
  mk('🧹 נקה מטמון', () => cmd(d, 'clear_cache'));
  mk('✏️ עריכה', () => editDevice(d));
  mk('🗑️', () => confirmDelete(d), 'btn-danger');
  return c;
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
    <div class="field"><label>דומיינים מותרים (מופרדים בפסיק — כולל שער תשלום)</label><input id="a" value="${esc(d.allowedHost || '')}" dir="ltr" /></div>
    <div class="field"><label>חזרה אוטומטית לקישור לאחר חוסר פעילות (שניות; 0 = כבוי)</label><input id="idle" type="number" min="0" value="${d.idleReturnSeconds || 0}" dir="ltr" /></div>
    <div class="row"><button class="btn btn-primary" id="s">שמירה</button><button class="btn btn-light" id="c">ביטול</button></div>`);
  $('#s', m).onclick = async () => {
    const body = { name: $('#n', m).value, homeUrl: $('#h', m).value, allowedHost: $('#a', m).value, idleReturnSeconds: Number($('#idle', m).value) };
    const lk = $('#lk', m); if (lk && lk.value) body.linkId = Number(lk.value);
    try { await api(`/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('נשמר. המכשיר יתעדכן מיד.'); m.remove(); loadDevices(); }
    catch (e) { toast(e.message, false); }
  };
  $('#c', m).onclick = () => m.remove();
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
  try {
    const body = linkId ? { linkId: Number(linkId), name, idleReturnSeconds } : { homeUrl, name, idleReturnSeconds };
    const { enrollment } = await api('/enrollments', { method: 'POST', body: JSON.stringify(body) });
    $('#e-result').innerHTML = `<div class="alert alert-ok" style="margin-top:16px">
      נוצר קוד רישום! הזינו אותו באפליקציה במכשיר:<br/><br/>
      <span class="code-chip">${esc(enrollment.code)}</span></div>`;
    $('#e-url').value = ''; $('#e-name').value = '';
    loadEnrollments();
  } catch (e) { toast(e.message, false); }
}
async function loadEnrollments() {
  const { enrollments } = await api('/enrollments');
  const open = enrollments.filter((e) => !e.used);
  const box = $('#e-list'); if (!box) return;
  if (!open.length) { box.innerHTML = '<p style="color:var(--muted);margin:0">אין קודים פתוחים.</p>'; return; }
  box.innerHTML = '<table><tr><th>קוד</th><th>אתר</th><th>שם</th><th></th></tr>' +
    open.map((e) => `<tr><td><span class="code-chip" style="font-size:15px">${esc(e.code)}</span></td><td dir="ltr">${esc(e.home_url)}</td><td>${esc(e.name || '')}</td><td><button class="btn btn-danger btn-sm" data-del="${e.id}">מחק</button></td></tr>`).join('') + '</table>';
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api('/enrollments/' + b.dataset.del, { method: 'DELETE' }); loadEnrollments(); });
}

// ── LINK LIBRARY ────────────────────────────────────────────────
async function viewLinks() {
  $('#content').innerHTML = `<div class="topbar"><h1>ספריית קישורים</h1></div>
    <div class="card" style="max-width:680px">
      <h3>קישור חדש</h3>
      <p style="color:var(--muted)">שמרו כאן את הקישורים הספציפיים של האירועים/אולמות. בעת הוספת מכשיר תבחרו מתוך הרשימה איזה קישור ינעל אותו.</p>
      <div class="field"><label>שם הקישור</label><input id="l-name" placeholder="למשל: אולם הדר — חתונה 12/8" /></div>
      <div class="field"><label>כתובת הקישור (הדף הספציפי של האירוע)</label><input id="l-url" placeholder="https://example.com/event/123" dir="ltr" /></div>
      <div class="field"><label>דומיינים נוספים מותרים — למשל שער התשלום (מופרדים בפסיק, לא חובה)</label><input id="l-hosts" placeholder="pay.example.com, secure.cardcom.co.il" dir="ltr" /></div>
      <button class="btn btn-primary" id="l-create">שמור קישור</button>
    </div>
    <div class="card" style="max-width:680px"><h3>הקישורים שלי</h3><div id="l-list">טוען…</div></div>`;
  $('#l-create').onclick = async () => {
    const name = $('#l-name').value.trim(), url = $('#l-url').value.trim(), allowedHost = $('#l-hosts').value.trim();
    if (!name || !url) return toast('נא למלא שם וכתובת', false);
    try { await api('/links', { method: 'POST', body: JSON.stringify({ name, url, allowedHost }) });
      toast('הקישור נשמר'); $('#l-name').value = ''; $('#l-url').value = ''; $('#l-hosts').value = ''; loadLinks(); }
    catch (e) { toast(e.message, false); }
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
    try {
      if (isEdit) {
        await api('/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ fullName: $('#u-name', m).value, deviceLimit: Number($('#u-limit', m).value), active: Number($('#u-active', m).value) }) });
      } else {
        await api('/admin/users', { method: 'POST', body: JSON.stringify({ username: $('#u-user', m).value, password: $('#u-pass', m).value, fullName: $('#u-name', m).value, deviceLimit: Number($('#u-limit', m).value) }) });
      }
      toast('נשמר'); m.remove(); loadUsers();
    } catch (e) { toast(e.message, false); }
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
    <p><a href="/docs/user-guide-he.md" target="_blank">📄 מדריך המשתמש המלא (כולל הגדרת Device Owner)</a></p>
  </div>`;
}

// ── start ───────────────────────────────────────────────────────
if (TOKEN) boot(); else { $('#login-view').classList.remove('hidden'); }
