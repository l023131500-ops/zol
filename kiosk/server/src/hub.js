import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';
import { db, logEvent } from './db.js';
import { config } from './config.js';

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
  for (const ws of targets) send(ws, { type: 'device_update', device: { ...device, ...payload } });
}

function markOnline(deviceId, online) {
  db.prepare('UPDATE devices SET online = ?, last_seen = datetime(\'now\') WHERE id = ?')
    .run(online ? 1 : 0, deviceId);
}

export function attachHub(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, config.publicUrl);
    if (url.pathname === '/ws/agent' || url.pathname === '/ws/console') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, url);
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
      if (!decoded) { send(ws, { type: 'error', error: 'invalid token' }); return ws.close(); }
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
    db.prepare("UPDATE commands SET status = ?, result = ?, done_at = datetime('now') WHERE id = ?")
      .run(msg.ok ? 'done' : 'failed', msg.result ? String(msg.result).slice(0, 2000) : null, msg.commandId);
    logEvent(deviceId, null, 'command_ack', `#${msg.commandId} ${msg.ok ? 'done' : 'failed'}`);
  }
}
