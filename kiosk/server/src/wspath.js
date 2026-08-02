/**
 * Resolving a WebSocket upgrade path against the server's base path.
 *
 * Kept in its own module with no database or `ws` import so it can be unit
 * tested directly — `hub.js` cannot be imported in a test environment because
 * it pulls in better-sqlite3, whose native addon needs a toolchain.
 */

/**
 * Strip the base path off an upgrade request path.
 *
 * Both forms must keep working: agents enrolled before BASE_PATH existed dial
 * `/ws/agent` straight at the origin, while browsers coming through
 * more30.com/kiosk dial `/kiosk/ws/console`. Refusing the bare form would take
 * an entire fleet offline on the next reconnect.
 *
 * @param {string} pathname  e.g. "/kiosk/ws/agent"
 * @param {string} basePath  e.g. "/kiosk" or ""
 * @returns {string} the route relative to the mount, e.g. "/ws/agent"
 */
export function wsRoute(pathname, basePath) {
  if (basePath && pathname.startsWith(basePath + '/')) {
    return pathname.slice(basePath.length);
  }
  return pathname;
}

/** The only two upgrade endpoints the hub serves. */
export function isWsRoute(route) {
  return route === '/ws/agent' || route === '/ws/console';
}
