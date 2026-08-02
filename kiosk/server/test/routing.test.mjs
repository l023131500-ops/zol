/**
 * Serving under a path prefix — the contract that makes more30.com/kiosk work.
 *
 * Run with: npm test
 *
 * Why the express app is rebuilt here instead of imported: `src/index.js` pulls
 * in `db.js` → better-sqlite3, a native addon that needs a compiler toolchain.
 * Requiring one to run the tests would mean nobody runs them. The mount order
 * below mirrors `src/index.js` exactly; if you change the order there, change
 * it here. Everything that *can* be imported for real (`wsRoute`,
 * `normalizeBasePath` via `config`) is imported for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wsRoute, isWsRoute } from '../src/wspath.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

function buildApp(base, wsHost = null) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const health = (req, res) => res.json({ ok: true, basePath: base || '/' });
  app.get('/api/health', health);

  if (base) {
    app.use((req, res, next) => {
      if (req.path !== base) return next();
      res.redirect(301, base + '/' + req.originalUrl.slice(req.path.length));
    });
    app.get('/', (req, res) => res.redirect(302, base + '/'));
  }

  const site = express.Router();
  site.get('/api/health', health);
  site.get('/api/config', (req, res) => res.json({ wsHost: wsHost || null, basePath: base || '' }));
  site.use('/api/auth', express.Router().post('/login', (req, res) => res.json({ token: 'stub' })));
  site.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  site.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  site.get('/console', (req, res) => res.sendFile('console.html', { root: PUBLIC_DIR }));
  app.use(base || '/', site);
  return app;
}

async function withServer(base, fn, wsHost = null) {
  const server = http.createServer(buildApp(base, wsHost));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await fn((url, opts) => fetch(origin + url, { redirect: 'manual', ...opts })); }
  finally { await new Promise((r) => server.close(r)); }
}

test('served under /kiosk', async () => {
  await withServer('/kiosk', async (get) => {
    // Railway's healthcheck hits the container at the root and knows nothing
    // about the prefix. Losing this fails every deploy.
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/kiosk/api/health')).status, 200);

    // The no-slash form must redirect exactly once, to the directory form.
    const bare = await get('/kiosk');
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/kiosk/');

    // ...and the directory form must NOT redirect. Express's non-strict
    // routing once made this redirect to itself forever.
    const dir = await get('/kiosk/');
    assert.equal(dir.status, 200);
    assert.match(await dir.text(), /href="css\/style\.css"/);

    const console_ = await get('/kiosk/console');
    assert.equal(console_.status, 200);
    assert.match(await console_.text(), /src="js\/app\.js"/);

    assert.equal((await get('/kiosk/css/style.css')).status, 200);
    assert.equal((await get('/kiosk/js/app.js')).status, 200);
    assert.equal((await get('/kiosk/api/auth/login', { method: 'POST' })).status, 200);

    // Assets must NOT be reachable at the root when a prefix is configured —
    // that is what proves the HTML is not emitting root-absolute URLs.
    assert.equal((await get('/css/style.css')).status, 404);
  });
});

test('the service hostname lands on the app instead of 404', async () => {
  // kiosk.more30.com exists so the realtime socket has a host that is not a
  // rewrite. Someone who types that hostname hits "/", which sits outside the
  // prefix — it must lead somewhere, not 404 on a working site.
  await withServer('/kiosk', async (get) => {
    const root = await get('/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/kiosk/');
  });
});

test('the console is told where to open its socket', async () => {
  // The page cannot infer this: it is served from more30.com/kiosk, and that
  // path is a rewrite that answers a WebSocket upgrade with 404. "Same host as
  // the page" is the one answer that is definitely wrong in production.
  await withServer('/kiosk', async (get) => {
    const cfg = await (await get('/kiosk/api/config')).json();
    assert.equal(cfg.wsHost, 'kiosk.more30.com');
    assert.equal(cfg.basePath, '/kiosk');
  }, 'kiosk.more30.com');

  // Unset must be null, not the empty string — the client tests it for
  // truthiness to decide whether to fall back to its own host.
  await withServer('/kiosk', async (get) => {
    const cfg = await (await get('/kiosk/api/config')).json();
    assert.equal(cfg.wsHost, null);
  });
});

test('served at the root (direct Railway URL, local dev)', async () => {
  await withServer('', async (get) => {
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/console')).status, 200);
    assert.equal((await get('/css/style.css')).status, 200);
  });
});

test('websocket upgrade paths resolve with and without the prefix', () => {
  // Browsers on more30.com/kiosk dial the prefixed path...
  assert.equal(wsRoute('/kiosk/ws/console', '/kiosk'), '/ws/console');
  assert.equal(wsRoute('/kiosk/ws/agent', '/kiosk'), '/ws/agent');
  // ...while agents enrolled before BASE_PATH existed dial the bare one.
  assert.equal(wsRoute('/ws/agent', '/kiosk'), '/ws/agent');
  assert.equal(wsRoute('/ws/agent', ''), '/ws/agent');

  assert.ok(isWsRoute(wsRoute('/kiosk/ws/agent', '/kiosk')));
  assert.ok(isWsRoute(wsRoute('/ws/console', '')));
  // A prefix that is a string prefix but not a path segment must not match.
  assert.equal(wsRoute('/kioskx/ws/agent', '/kiosk'), '/kioskx/ws/agent');
  assert.ok(!isWsRoute(wsRoute('/kioskx/ws/agent', '/kiosk')));
  assert.ok(!isWsRoute('/ws/other'));
});

test('BASE_PATH is normalised to a leading-slash, no-trailing-slash form', async () => {
  const load = async (v) => {
    // config.js reads process.env at import time, so re-import per case.
    if (v === null) delete process.env.BASE_PATH; else process.env.BASE_PATH = v;
    const mod = await import(`../src/config.js?case=${encodeURIComponent(String(v))}`);
    return mod.config.basePath;
  };
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  assert.equal(await load('/kiosk'), '/kiosk');
  assert.equal(await load('kiosk'), '/kiosk');
  assert.equal(await load('/kiosk/'), '/kiosk');
  assert.equal(await load('  /kiosk  '), '/kiosk');
  assert.equal(await load('/'), '');
  assert.equal(await load(''), '');
  assert.equal(await load(null), '');
});
