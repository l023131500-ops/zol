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
import adminRoutes from './routes/admin.js';
import agentRoutes from './routes/agent.js';

ensureSeed();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
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

server.listen(config.port, () => {
  console.log(`\n  KioskFleet server running (${config.env})`);
  console.log(`  → console : ${config.publicUrl}${base}/console`);
  console.log(`  → landing : ${config.publicUrl}${base}/`);
  console.log(`  → api     : ${config.publicUrl}${base}/api\n`);
});
