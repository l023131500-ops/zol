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

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api', deviceRoutes);
app.use('/api', linkRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);

// Serve the marketing site + console (static, no build step).
app.use(express.static(config.publicDir, { extensions: ['html'] }));

// Serve the Hebrew docs (linked from the in-console guide), if present.
const docsDir = path.resolve(config.root, '../docs');
if (fs.existsSync(docsDir)) app.use('/docs', express.static(docsDir));

// SPA-ish fallback for the console.
app.get('/console', (req, res) => res.sendFile('console.html', { root: config.publicDir }));

const server = http.createServer(app);
attachHub(server);

// Mark devices offline if they miss heartbeats for too long.
setInterval(() => {
  db.prepare(`UPDATE devices SET online = 0
     WHERE online = 1 AND (last_seen IS NULL OR last_seen < datetime('now', ?))`)
    .run(`-${config.offlineAfterMinutes} minutes`);
}, 60_000);

server.listen(config.port, () => {
  console.log(`\n  KioskFleet server running`);
  console.log(`  → console : ${config.publicUrl}/console`);
  console.log(`  → landing : ${config.publicUrl}/`);
  console.log(`  → api     : ${config.publicUrl}/api\n`);
});
