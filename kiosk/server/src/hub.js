import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import { db, logEvent } from './db.js';
import { config } from './config.js';
import { wsRoute, isWsRoute } from './wspath.js';
import { consoleDevice } from './devicepayload.js';

/**
 * Realtime hub.
 *  - Device agents connect to  /ws/agent?token=<device_token>
 *  - Dashboards connect to      /ws/console?token=<jwt>
 *
 * Commands are pushed to a connected agent instantly; if the agent is offline
 * they stay queued in the DB and are delivered on next poll / reconnect.
 * Device status changes are fanned out to the owner's (and admins') dashboards.
 */

const agents = new Map();   // deviceId -> ws
const consoles = new Map(); // userId  -> Set<ws>

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

export function pushCommandToAgent(deviceId, command) {
  const ws = agents.get(deviceId);
  if (ws) {
    send(ws, { type: 'command', command });
    return true;
  }
  return false;
}

// Force-close every open console socket for a user whose account was just
// deactivated or deleted. The connect-time active check below stops a *new*
// socket from opening on a still-valid token, but does nothing about one that
// was already open before the change landed — it would otherwise keep
// streaming that user's own device_update frames for the rest of the JWT's
// 12h life. Called from admin.js right after the same UPDATE/DELETE that
// flips `active`.
export function disconnectConsole(userId) {
  const set = consoles.get(userId);
  if (!set) return;
  for (const ws of set) {
    send(ws, { type: 'error', error: 'session ended' });
    ws.close();
  }
  consoles.delete(userId);
}

// Notify all dashboards that may care about this device (owner + every admin).
export function notifyConsolesOfDevice(device, payload) {
  const targets = new Set();
  const owners = consoles.get(device.owner_id);
  if (owners) owners.forEach((ws) => targets.add(ws));
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all();
  for (const a of admins) {
    const set = consoles.get(a.id);
    if (set) set.forEach((ws) => targets.add(ws));
  }
  const device_update = consoleDevice(device, payload);
  for (const ws of targets) send(ws, { type: 'device_update', device: device_update });
}

function markOnline(deviceId, online) {
  db.prepare('UPDATE devices SET online = ?, last_seen = datetime(\'now\') WHERE id = ?')
    .run(online ? 1 : 0, deviceId);
}

export function attachHub(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, config.publicUrl);
    const route = wsRoute(url.pathname, config.basePath);
    if (isWsRoute(route)) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, new URL(route + url.search, config.publicUrl));
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req, url) => {
    const token = url.searchParams.get('token');

    if (url.pathname === '/ws/agent') {
      const device = token
        ? db.prepare('SELECT * FROM devices WHERE device_token = ?').get(token)
        : null;
      if (!device) { send(ws, { type: 'error', error: 'invalid device token' }); return ws.close(); }

      agents.set(device.id, ws);
      markOnline(device.id, true);
      logEvent(device.id, null, 'connected', 'agent websocket');
      notifyConsolesOfDevice(device, { online: 1, last_seen: new Date().toISOString() });

      // Deliver any queued commands immediately.
      const pending = db.prepare("SELECT * FROM commands WHERE device_id = ? AND status = 'pending' ORDER BY id").all(device.id);
      for (const c of pending) {
        send(ws, { type: 'command', command: { ...c, payload: c.payload ? JSON.parse(c.payload) : null } });
        db.prepare("UPDATE commands SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(c.id);
      }

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        handleAgentMessage(device.id, msg);
      });

      ws.on('close', () => {
        if (agents.get(device.id) === ws) agents.delete(device.id);
        markOnline(device.id, false);
        const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
        if (fresh) notifyConsolesOfDevice(fresh, { online: 0 });
      });

      // keepalive
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      return;
    }

    if (url.pathname === '/ws/console') {
      const decoded = token ? verifyToken(token) : null;
      // requireAuth (every REST route) re-checks `active = 1` against the DB on
      // every request, so deactivating a user cuts off the dashboard within one
      // request. This handler used to stop at the JWT's own signature/expiry —
      // a token issued before deactivation (valid up to 12h, per signToken)
      // could still open a *new* console socket. Same live check requireAuth
      // uses. disconnectConsole() below (called from admin.js) closes the
      // matching gap for a socket that was already open when the change landed.
      const user = decoded ? db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(decoded.uid) : null;
      if (!user) { send(ws, { type: 'error', error: 'invalid token' }); return ws.close(); }
      const set = consoles.get(decoded.uid) || new Set();
      set.add(ws);
      consoles.set(decoded.uid, set);
      send(ws, { type: 'hello', role: decoded.role });
      ws.on('close', () => { set.delete(ws); });
      return;
    }
  });

  // Ping agents periodically; drop dead sockets.
  const interval = setInterval(() => {
    for (const [deviceId, ws] of agents) {
      if (ws.isAlive === false) { ws.terminate(); agents.delete(deviceId); markOnline(deviceId, false); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 30_000);
  wss.on('close', () => clearInterval(interval));

  return wss;
}

function handleAgentMessage(deviceId, msg) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
  if (!device) return;

  if (msg.type === 'status') {
    const s = msg.status || {};
    db.prepare(`UPDATE devices SET status = ?, online = 1, last_seen = datetime('now'),
       app_version = COALESCE(?, app_version), battery = COALESCE(?, battery),
       model = COALESCE(?, model), android_ver = COALESCE(?, android_ver), ip = COALESCE(?, ip)
       WHERE id = ?`)
      .run(s.status ?? device.status, s.appVersion ?? null, s.battery ?? null,
           s.model ?? null, s.androidVersion ?? null, s.ip ?? null, deviceId);
    const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId);
    notifyConsolesOfDevice(fresh, {});
  }

  if (msg.type === 'ack' && msg.commandId) {
    // Scoped by device_id, matching routes/agent.js's REST /ack fallback.
    // commands.id is a global AUTOINCREMENT across every device on the
    // service, and this handler's only proof of identity is the device_token
    // that authenticated the socket at connection time (`deviceId` above) —
    // without this clause any enrolled device could ack *any* other owner's
    // command by guessing/incrementing an id: marking a pending `unlock` or
    // `reboot` on a device it does not own as "done" while it never ran, or
    // "failed" with attacker-controlled `result` text shown in that owner's
    // console, neither of which the device sending the message could
    // otherwise touch.
    db.prepare("UPDATE commands SET status = ?, result = ?, done_at = datetime('now') WHERE id = ? AND device_id = ?")
      .run(msg.ok ? 'done' : 'failed', msg.result ? String(msg.result).slice(0, 2000) : null, msg.commandId, deviceId);
    logEvent(deviceId, null, 'command_ack', `#${msg.commandId} ${msg.ok ? 'done' : 'failed'}`);
  }
}
