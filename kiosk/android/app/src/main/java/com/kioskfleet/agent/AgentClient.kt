package com.kioskfleet.agent

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import okhttp3.*
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/** Actions the kiosk UI must perform in response to a remote command. */
interface CommandHandler {
    fun onReload()
    fun onSetUrl(url: String)
    fun onScreenOn()
    fun onScreenOff()
    fun onClearCache()
    fun onLock()
    fun onUnlock(minutes: Int)
    fun onMessage(text: String)
    fun onConfigUpdated(homeUrl: String, displayUrl: String, allowedHost: String, idleReturnSeconds: Int, displayZoomPercent: Int, displayOrientation: String)
    fun onScreenshot(commandId: Long)
}

/**
 * Keeps a live link to the management server:
 *  - a WebSocket for instant commands (with auto-reconnect)
 *  - a periodic heartbeat that also carries status and pulls commands as a fallback
 */
class AgentClient(
    private val ctx: Context,
    private val handler: CommandHandler
) {
    private val server = Prefs.get(ctx, Prefs.SERVER_URL).trimEnd('/')
    private val token = Prefs.get(ctx, Prefs.DEVICE_TOKEN)
    private val http = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val ui = Handler(Looper.getMainLooper())
    private var ws: WebSocket? = null
    private var running = false

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            Thread { heartbeat() }.start()
            ui.postDelayed(this, 60_000)
        }
    }

    fun start() {
        if (running) return
        running = true
        connectSocket()
        ui.post(heartbeatRunnable)
    }

    fun stop() {
        running = false
        ui.removeCallbacks(heartbeatRunnable)
        ws?.close(1000, "bye"); ws = null
    }

    // ── WebSocket ───────────────────────────────────────────────
    private fun connectSocket() {
        if (!running) return
        val wsUrl = server.replaceFirst("http", "ws") + "/ws/agent?token=" + token
        val req = Request.Builder().url(wsUrl).build()
        ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                sendStatus(webSocket)
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg = JSONObject(text)
                    if (msg.optString("type") == "command") {
                        execute(msg.getJSONObject("command"))
                    }
                } catch (_: Exception) {}
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { scheduleReconnect() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { scheduleReconnect() }
        })
    }

    private fun scheduleReconnect() {
        if (!running) return
        ui.postDelayed({ connectSocket() }, 5_000)
    }

    private fun sendStatus(webSocket: WebSocket) {
        val status = JSONObject()
            .put("type", "status")
            .put("status", JSONObject()
                .put("status", "running")
                .put("battery", batteryLevel())
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                .put("androidVersion", Build.VERSION.RELEASE))
        webSocket.send(status.toString())
    }

    // ── Heartbeat (fallback path) ───────────────────────────────
    private fun heartbeat() {
        try {
            val body = JSONObject()
                .put("status", "running")
                .put("battery", batteryLevel())
                .put("appVersion", BuildConfig.VERSION_NAME)
                .toString()
            val conn = (URL("$server/api/agent/heartbeat").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("X-Device-Token", token)
                connectTimeout = 10000; readTimeout = 10000
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            if (conn.responseCode !in 200..299) return
            val json = JSONObject(conn.inputStream.bufferedReader().readText())
            json.optJSONObject("config")?.let { cfg ->
                val home = cfg.optString("homeUrl"); val host = cfg.optString("allowedHost")
                val idle = cfg.optInt("idleReturnSeconds", 0)
                // KIOSK_BUILD.md §2★א: same "must land on its own" shape as
                // zoom/orientation below — an owner setting only the per-device
                // display-url override must not need an unrelated home-link
                // edit to ride along before it reaches the screen.
                val display = cfg.optString("displayUrl", Prefs.get(ctx, Prefs.DISPLAY_URL))
                val displayChanged = display != Prefs.get(ctx, Prefs.DISPLAY_URL)
                // Independent of the homeUrl gate below: the maintenance code
                // has to keep landing even on a heartbeat that carries no new
                // home link, or a code set after enrollment never reaches a
                // device whose home link never changes again. Zoom is the
                // same shape — an owner adjusting only the zoom slider must
                // not need a home-link change to ride along before it takes
                // effect on screen.
                val adminCode = cfg.optString("adminCode", Prefs.get(ctx, Prefs.ADMIN_CODE))
                if (adminCode != Prefs.get(ctx, Prefs.ADMIN_CODE)) Prefs.set(ctx, Prefs.ADMIN_CODE, adminCode)
                // Same "must land on its own, not only piggybacked on a homeUrl
                // change" reasoning as adminCode above: an owner approving or
                // revoking a client (routes/devices.js's pushConfigUpdate) does
                // not touch home_url, so the §2★ה selection screen's cache would
                // otherwise only ever refresh on an unrelated home-link edit.
                val approvedClientsJson = cfg.optJSONArray("approvedClients")?.toString() ?: "[]"
                if (approvedClientsJson != Prefs.get(ctx, Prefs.APPROVED_CLIENTS, "[]"))
                    Prefs.set(ctx, Prefs.APPROVED_CLIENTS, approvedClientsJson)
                val zoom = cfg.optInt("displayZoomPercent", Prefs.get(ctx, Prefs.DISPLAY_ZOOM).toIntOrNull() ?: 100)
                val zoomChanged = zoom.toString() != Prefs.get(ctx, Prefs.DISPLAY_ZOOM)
                if (zoomChanged) Prefs.set(ctx, Prefs.DISPLAY_ZOOM, zoom.toString())
                // KIOSK_BUILD.md §5 "בחירת אוריינטציה": same "must land on its own"
                // shape as zoom above — an owner locking a device to portrait does
                // not necessarily touch home_url either.
                val orientation = cfg.optString("displayOrientation", Prefs.get(ctx, Prefs.DISPLAY_ORIENTATION).ifEmpty { "landscape" })
                val orientationChanged = orientation != Prefs.get(ctx, Prefs.DISPLAY_ORIENTATION).ifEmpty { "landscape" }
                if (orientationChanged) Prefs.set(ctx, Prefs.DISPLAY_ORIENTATION, orientation)
                // KIOSK_BUILD.md §9 "מצב תצוגה": same "must land on its own" shape
                // as adminCode/approvedClients above — an owner toggling signage
                // does not necessarily touch home_url, so it must not wait for an
                // unrelated home-link edit to reach the device.
                val signageEnabled = if (cfg.optBoolean("signageEnabled", Prefs.get(ctx, Prefs.SIGNAGE_ENABLED, "0") == "1")) "1" else "0"
                if (signageEnabled != Prefs.get(ctx, Prefs.SIGNAGE_ENABLED, "0")) Prefs.set(ctx, Prefs.SIGNAGE_ENABLED, signageEnabled)
                val signageUrls = cfg.optString("signageUrls", Prefs.get(ctx, Prefs.SIGNAGE_URLS, ""))
                if (signageUrls != Prefs.get(ctx, Prefs.SIGNAGE_URLS, "")) Prefs.set(ctx, Prefs.SIGNAGE_URLS, signageUrls)
                val signageInterval = cfg.optInt("signageIntervalSeconds", Prefs.get(ctx, Prefs.SIGNAGE_INTERVAL).toIntOrNull() ?: 15)
                if (signageInterval.toString() != Prefs.get(ctx, Prefs.SIGNAGE_INTERVAL)) Prefs.set(ctx, Prefs.SIGNAGE_INTERVAL, signageInterval.toString())
                // KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק": unlike signage above
                // (idle-only content, read lazily whenever the idle timer next
                // fires), a maintenance toggle has to block the screen the
                // moment it changes — so, unlike signageEnabled, this one
                // *does* have to feed into the changed/zoomChanged gate below
                // that decides whether onConfigUpdated actually fires this
                // heartbeat, the same reason zoomChanged itself is in that gate.
                val maintenanceEnabled = if (cfg.optBoolean("maintenanceEnabled",
                        Prefs.get(ctx, Prefs.MAINTENANCE_ENABLED, "0") == "1")) "1" else "0"
                val maintenanceMessage = cfg.optString("maintenanceMessage", Prefs.get(ctx, Prefs.MAINTENANCE_MESSAGE, ""))
                val maintenanceChanged = maintenanceEnabled != Prefs.get(ctx, Prefs.MAINTENANCE_ENABLED, "0") ||
                    maintenanceMessage != Prefs.get(ctx, Prefs.MAINTENANCE_MESSAGE, "")
                if (maintenanceChanged) {
                    Prefs.set(ctx, Prefs.MAINTENANCE_ENABLED, maintenanceEnabled)
                    Prefs.set(ctx, Prefs.MAINTENANCE_MESSAGE, maintenanceMessage)
                }
                // KIOSK_BUILD.md §9 "תזמון": same "must land on its own" shape as
                // maintenance above — persisted every heartbeat regardless of
                // whether homeUrl changed, so a device that reconnects (or
                // reboots) between heartbeats can work out its own current
                // screen state from Prefs alone (KioskActivity.applyScheduleState())
                // rather than waiting for index.js's next 60s sweep to notice and
                // issue a fresh screen_on/screen_off.
                val scheduleEnabled = if (cfg.optBoolean("scheduleEnabled",
                        Prefs.get(ctx, Prefs.SCHEDULE_ENABLED, "0") == "1")) "1" else "0"
                val scheduleOpen = cfg.optString("scheduleOpenTime", Prefs.get(ctx, Prefs.SCHEDULE_OPEN_TIME, ""))
                val scheduleClose = cfg.optString("scheduleCloseTime", Prefs.get(ctx, Prefs.SCHEDULE_CLOSE_TIME, ""))
                val scheduleChanged = scheduleEnabled != Prefs.get(ctx, Prefs.SCHEDULE_ENABLED, "0") ||
                    scheduleOpen != Prefs.get(ctx, Prefs.SCHEDULE_OPEN_TIME, "") ||
                    scheduleClose != Prefs.get(ctx, Prefs.SCHEDULE_CLOSE_TIME, "")
                if (scheduleChanged) {
                    Prefs.set(ctx, Prefs.SCHEDULE_ENABLED, scheduleEnabled)
                    Prefs.set(ctx, Prefs.SCHEDULE_OPEN_TIME, scheduleOpen)
                    Prefs.set(ctx, Prefs.SCHEDULE_CLOSE_TIME, scheduleClose)
                }
                // KIOSK_BUILD.md §4: persisted the same silent way as
                // adminCode/approvedClients above — KioskActivity reads
                // these three straight from Prefs at gesture-check time (no
                // reactive re-render needed, unlike zoom/orientation/
                // maintenance), so no "changed" tracking or onConfigUpdated
                // involvement is needed for this group either.
                val gestureTaps = cfg.optInt("exitGestureTaps", Prefs.get(ctx, Prefs.EXIT_GESTURE_TAPS).toIntOrNull() ?: 5)
                if (gestureTaps.toString() != Prefs.get(ctx, Prefs.EXIT_GESTURE_TAPS)) Prefs.set(ctx, Prefs.EXIT_GESTURE_TAPS, gestureTaps.toString())
                val gestureCorner = cfg.optString("exitGestureCorner", Prefs.get(ctx, Prefs.EXIT_GESTURE_CORNER).ifEmpty { "tl" })
                if (gestureCorner != Prefs.get(ctx, Prefs.EXIT_GESTURE_CORNER).ifEmpty { "tl" }) Prefs.set(ctx, Prefs.EXIT_GESTURE_CORNER, gestureCorner)
                val gestureHoldMs = cfg.optInt("exitGestureHoldMs", Prefs.get(ctx, Prefs.EXIT_GESTURE_HOLD_MS).toIntOrNull() ?: 0)
                if (gestureHoldMs.toString() != Prefs.get(ctx, Prefs.EXIT_GESTURE_HOLD_MS)) Prefs.set(ctx, Prefs.EXIT_GESTURE_HOLD_MS, gestureHoldMs.toString())
                if (home.isNotEmpty()) {
                    val changed = home != Prefs.get(ctx, Prefs.HOME_URL) ||
                        displayChanged ||
                        host != Prefs.get(ctx, Prefs.ALLOWED_HOST) ||
                        idle.toString() != Prefs.get(ctx, Prefs.IDLE_RETURN) ||
                        zoomChanged || orientationChanged || maintenanceChanged || scheduleChanged
                    Prefs.set(ctx, Prefs.HOME_URL, home)
                    Prefs.set(ctx, Prefs.DISPLAY_URL, display)
                    Prefs.set(ctx, Prefs.ALLOWED_HOST, host)
                    Prefs.set(ctx, Prefs.IDLE_RETURN, idle.toString())
                    if (changed) ui.post { handler.onConfigUpdated(home, display, host, idle, zoom, orientation) }
                } else if (zoomChanged || orientationChanged || maintenanceChanged || scheduleChanged || displayChanged) {
                    // No home-link change to carry the update, but the zoom/
                    // orientation/maintenance/schedule/display state still has to
                    // reach the on-screen WebView/Activity.
                    Prefs.set(ctx, Prefs.DISPLAY_URL, display)
                    ui.post { handler.onConfigUpdated(Prefs.get(ctx, Prefs.HOME_URL), display, Prefs.get(ctx, Prefs.ALLOWED_HOST), idle, zoom, orientation) }
                }
            }
            val cmds = json.optJSONArray("commands") ?: return
            for (i in 0 until cmds.length()) execute(cmds.getJSONObject(i))
        } catch (_: Exception) {}
    }

    // ── Command execution ───────────────────────────────────────
    private fun execute(cmd: JSONObject) {
        val id = cmd.optLong("id", -1)
        val type = cmd.optString("type")
        val payload = cmd.optJSONObject("payload") ?: JSONObject()

        // Async, unlike every other case below: capture happens on the UI
        // thread and the upload happens on a background one, both inside
        // onScreenshot()/uploadScreenshot(). Falling through to the
        // synchronous `ack(id, ok, result)` at the bottom of this function
        // would report "done" before either has run.
        if (type == "screenshot") {
            if (id >= 0) ui.post { handler.onScreenshot(id) }
            return
        }

        // KIOSK_BUILD.md §8 "עדכון מרחוק (OTA) ... של האפליקציה" — also async
        // like screenshot above, and for the same reason: downloading a whole
        // APK cannot run on the calling thread (WebSocket callback or the
        // heartbeat's own background thread), so it gets its own Thread and
        // reports through the normal ack() path once it knows an outcome,
        // rather than falling into the synchronous block below.
        if (type == "update_app") {
            downloadAndInstallUpdate(id, payload)
            return
        }

        var ok = true
        var result = "ok"
        try {
            when (type) {
                "reload" -> ui.post { handler.onReload() }
                "set_url" -> ui.post { handler.onSetUrl(payload.optString("url")) }
                "screen_on" -> ui.post { handler.onScreenOn() }
                "screen_off" -> ui.post { handler.onScreenOff() }
                "clear_cache" -> ui.post { handler.onClearCache() }
                "lock" -> ui.post { handler.onLock() }
                "unlock" -> ui.post { handler.onUnlock(payload.optInt("minutes", 5)) }
                "message" -> ui.post { handler.onMessage(payload.optString("text")) }
                "update_config" -> {
                    val home = payload.optString("homeUrl", Prefs.get(ctx, Prefs.HOME_URL))
                    // KIOSK_BUILD.md §2★א's per-device override — same "unconditional
                    // persist, always passed to onConfigUpdated" shape as home above,
                    // since this branch (an operator's own console push) is always an
                    // active management action rather than a "did anything change" poll.
                    val display = payload.optString("displayUrl", Prefs.get(ctx, Prefs.DISPLAY_URL))
                    val host = payload.optString("allowedHost", Prefs.get(ctx, Prefs.ALLOWED_HOST))
                    val idle = payload.optInt("idleReturnSeconds",
                        Prefs.get(ctx, Prefs.IDLE_RETURN).toIntOrNull() ?: 0)
                    val adminCode = payload.optString("adminCode", Prefs.get(ctx, Prefs.ADMIN_CODE))
                    val zoom = payload.optInt("displayZoomPercent",
                        Prefs.get(ctx, Prefs.DISPLAY_ZOOM).toIntOrNull() ?: 100)
                    val orientation = payload.optString("displayOrientation",
                        Prefs.get(ctx, Prefs.DISPLAY_ORIENTATION).ifEmpty { "landscape" })
                    val approvedClientsJson = payload.optJSONArray("approvedClients")?.toString()
                        ?: Prefs.get(ctx, Prefs.APPROVED_CLIENTS, "[]")
                    // KIOSK_BUILD.md §9 "מצב תצוגה": persisted the same silent way
                    // as adminCode/approvedClients above — KioskActivity reads it
                    // straight from Prefs when the idle timer fires, no new
                    // CommandHandler parameter needed.
                    val signageEnabled = if (payload.optBoolean("signageEnabled",
                            Prefs.get(ctx, Prefs.SIGNAGE_ENABLED, "0") == "1")) "1" else "0"
                    val signageUrls = payload.optString("signageUrls", Prefs.get(ctx, Prefs.SIGNAGE_URLS, ""))
                    val signageInterval = payload.optInt("signageIntervalSeconds",
                        Prefs.get(ctx, Prefs.SIGNAGE_INTERVAL).toIntOrNull() ?: 15)
                    // KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק": same silent-persist
                    // shape as signage above — this handler already calls
                    // onConfigUpdated() unconditionally below (an operator push
                    // is always an active management action, not a "did
                    // anything change" poll), so KioskActivity's own read of
                    // these two Prefs keys from there is enough; no new
                    // CommandHandler parameter needed.
                    val maintenanceEnabled = if (payload.optBoolean("maintenanceEnabled",
                            Prefs.get(ctx, Prefs.MAINTENANCE_ENABLED, "0") == "1")) "1" else "0"
                    val maintenanceMessage = payload.optString("maintenanceMessage", Prefs.get(ctx, Prefs.MAINTENANCE_MESSAGE, ""))
                    // KIOSK_BUILD.md §9 "תזמון": same silent-persist shape as
                    // maintenance above — applyScheduleState() (KioskActivity) is
                    // read from Prefs directly inside onConfigUpdated() below, no
                    // new CommandHandler parameter needed.
                    val scheduleEnabled = if (payload.optBoolean("scheduleEnabled",
                            Prefs.get(ctx, Prefs.SCHEDULE_ENABLED, "0") == "1")) "1" else "0"
                    val scheduleOpen = payload.optString("scheduleOpenTime", Prefs.get(ctx, Prefs.SCHEDULE_OPEN_TIME, ""))
                    val scheduleClose = payload.optString("scheduleCloseTime", Prefs.get(ctx, Prefs.SCHEDULE_CLOSE_TIME, ""))
                    // KIOSK_BUILD.md §4: same silent-persist shape as
                    // signage/maintenance above — KioskActivity reads these
                    // three straight from Prefs at gesture-check time, no
                    // new CommandHandler parameter needed.
                    val gestureTaps = payload.optInt("exitGestureTaps",
                        Prefs.get(ctx, Prefs.EXIT_GESTURE_TAPS).toIntOrNull() ?: 5)
                    val gestureCorner = payload.optString("exitGestureCorner",
                        Prefs.get(ctx, Prefs.EXIT_GESTURE_CORNER).ifEmpty { "tl" })
                    val gestureHoldMs = payload.optInt("exitGestureHoldMs",
                        Prefs.get(ctx, Prefs.EXIT_GESTURE_HOLD_MS).toIntOrNull() ?: 0)
                    Prefs.set(ctx, Prefs.HOME_URL, home)
                    Prefs.set(ctx, Prefs.DISPLAY_URL, display)
                    Prefs.set(ctx, Prefs.ALLOWED_HOST, host)
                    Prefs.set(ctx, Prefs.IDLE_RETURN, idle.toString())
                    Prefs.set(ctx, Prefs.ADMIN_CODE, adminCode)
                    Prefs.set(ctx, Prefs.DISPLAY_ZOOM, zoom.toString())
                    Prefs.set(ctx, Prefs.DISPLAY_ORIENTATION, orientation)
                    Prefs.set(ctx, Prefs.APPROVED_CLIENTS, approvedClientsJson)
                    Prefs.set(ctx, Prefs.SIGNAGE_ENABLED, signageEnabled)
                    Prefs.set(ctx, Prefs.SIGNAGE_URLS, signageUrls)
                    Prefs.set(ctx, Prefs.SIGNAGE_INTERVAL, signageInterval.toString())
                    Prefs.set(ctx, Prefs.MAINTENANCE_ENABLED, maintenanceEnabled)
                    Prefs.set(ctx, Prefs.MAINTENANCE_MESSAGE, maintenanceMessage)
                    Prefs.set(ctx, Prefs.SCHEDULE_ENABLED, scheduleEnabled)
                    Prefs.set(ctx, Prefs.SCHEDULE_OPEN_TIME, scheduleOpen)
                    Prefs.set(ctx, Prefs.SCHEDULE_CLOSE_TIME, scheduleClose)
                    Prefs.set(ctx, Prefs.EXIT_GESTURE_TAPS, gestureTaps.toString())
                    Prefs.set(ctx, Prefs.EXIT_GESTURE_CORNER, gestureCorner)
                    Prefs.set(ctx, Prefs.EXIT_GESTURE_HOLD_MS, gestureHoldMs.toString())
                    ui.post { handler.onConfigUpdated(home, display, host, idle, zoom, orientation) }
                }
                "reboot" -> { result = reboot() ; ok = result == "ok" }
                else -> { ok = false; result = "unknown command" }
            }
        } catch (e: Exception) { ok = false; result = e.message ?: "error" }
        if (id >= 0) ack(id, ok, result)
    }

    /** Reboot works only when the app is a Device Owner. */
    private fun reboot(): String {
        return try {
            val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(ctx, KioskDeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(ctx.packageName)) {
                dpm.reboot(admin); "ok"
            } else "not device owner"
        } catch (e: Exception) { e.message ?: "reboot failed" }
    }

    /**
     * Downloads the APK the server pointed at, verifies its signing
     * certificate against the payload's checksum (the same
     * KIOSK_AGENT_APK_SIGNATURE_CHECKSUM Route A's QR provisioning already
     * verifies before trusting a DPC — reused here rather than a raw file
     * hash so one config value serves both: a legitimate rebuild with
     * identical source still passes as long as it is signed with the same
     * key, which is the property that actually matters), then silently
     * installs it via PackageInstaller — a Device Owner app may
     * install/update packages with no user prompt, the same elevated trust
     * reboot() above already relies on.
     *
     * The checksum check is not optional: skipping it would make this a
     * remote-code-execution path onto every enrolled device from whatever
     * URL config.kioskAgentApkUrl happens to point at.
     *
     * Acks immediately after a successful commit() rather than waiting for
     * the install to actually finish — self-updating its own running
     * package means the process can be killed by the OS at any point once
     * the install completes, so there is no reliable way for *this* process
     * to observe final success. The server's own next heartbeat (which
     * carries BuildConfig.VERSION_NAME) is the real confirmation an owner
     * should trust, the same "can't confirm from here, the next heartbeat
     * will" honesty reboot()'s own ack already implies.
     */
    private fun downloadAndInstallUpdate(commandId: Long, payload: JSONObject) {
        Thread {
            val apkUrl = payload.optString("apkUrl")
            val checksum = payload.optString("checksum")
            if (apkUrl.isEmpty() || checksum.isEmpty()) {
                if (commandId >= 0) ack(commandId, false, "missing apkUrl/checksum")
                return@Thread
            }
            val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isDeviceOwnerApp(ctx.packageName)) {
                if (commandId >= 0) ack(commandId, false, "not device owner")
                return@Thread
            }
            val apkFile = File(ctx.cacheDir, "agent-update.apk")
            try {
                (URL(apkUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000; readTimeout = 60000
                }.let { conn ->
                    conn.inputStream.use { input ->
                        FileOutputStream(apkFile).use { out -> input.copyTo(out) }
                    }
                    if (conn.responseCode !in 200..299) throw Exception("download failed (${conn.responseCode})")
                }

                val actualChecksum = apkSigningCertChecksum(apkFile.absolutePath)
                    ?: throw Exception("could not read APK signature")
                if (actualChecksum != checksum) {
                    throw Exception("checksum mismatch")
                }

                val installer = ctx.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
                val sessionId = installer.createSession(params)
                val session = installer.openSession(sessionId)
                session.use { s ->
                    s.openWrite("agent-update", 0, apkFile.length()).use { sessionOut ->
                        apkFile.inputStream().use { it.copyTo(sessionOut) }
                        s.fsync(sessionOut)
                    }
                    // commit() requires a non-null IntentSender, but nothing here
                    // can act on its async result anyway (see the doc comment
                    // above) — an explicit-to-our-own-package action with no
                    // manifest receiver behind it, same as any broadcast nobody
                    // subscribes to: the system fires it into the void, harmlessly.
                    val statusIntent = Intent("${ctx.packageName}.UPDATE_STATUS").setPackage(ctx.packageName)
                    val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                        PendingIntent.FLAG_MUTABLE else 0
                    val statusPi = PendingIntent.getBroadcast(ctx, sessionId, statusIntent, piFlags)
                    s.commit(statusPi.intentSender)
                }
                ack(commandId, true, "update committed; confirm via next heartbeat's appVersion")
            } catch (e: Exception) {
                ack(commandId, false, e.message ?: "update failed")
            } finally {
                apkFile.delete()
            }
        }.start()
    }

    /**
     * SHA-256 of the APK's first signing certificate, base64url-unpadded —
     * identical format to qrprovision.js's own CHECKSUM_RE so
     * KIOSK_AGENT_APK_SIGNATURE_CHECKSUM covers both Route A provisioning
     * and this. `GET_SIGNING_CERTIFICATES` needs API 28+; minSdk here is 26
     * (Lock Task Mode's own floor), so API 26/27 falls back to the
     * deprecated `GET_SIGNATURES` — still correct on those releases, just
     * without APK Signature Scheme v3 key-rotation awareness, which does
     * not matter for a checksum pinned to one known signing key.
     */
    private fun apkSigningCertChecksum(apkPath: String): String? {
        val pm = ctx.packageManager
        val certBytes: ByteArray? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            @Suppress("DEPRECATION")
            val info = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNING_CERTIFICATES) ?: return null
            val signers = info.signingInfo?.apkContentsSigners
            if (signers.isNullOrEmpty()) null else signers[0].toByteArray()
        } else {
            @Suppress("DEPRECATION")
            val info = pm.getPackageArchiveInfo(apkPath, PackageManager.GET_SIGNATURES) ?: return null
            @Suppress("DEPRECATION")
            val signatures = info.signatures
            if (signatures.isNullOrEmpty()) null else signatures[0].toByteArray()
        }
        if (certBytes == null) return null
        val digest = MessageDigest.getInstance("SHA-256").digest(certBytes)
        return Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)
    }

    private fun ack(commandId: Long, ok: Boolean, result: String) {
        // Prefer the socket; fall back to HTTP.
        val payload = JSONObject().put("type", "ack").put("commandId", commandId)
            .put("ok", ok).put("result", result)
        if (ws?.send(payload.toString()) == true) return
        Thread {
            try {
                val conn = (URL("$server/api/agent/ack").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("X-Device-Token", token)
                    connectTimeout = 8000; readTimeout = 8000
                }
                OutputStreamWriter(conn.outputStream).use {
                    it.write(JSONObject().put("commandId", commandId).put("ok", ok).put("result", result).toString())
                }
                conn.responseCode
            } catch (_: Exception) {}
        }.start()
    }

    /**
     * Encode and upload a captured frame. Runs off the UI thread (bitmap
     * compression is not cheap) and reports failure through the normal ack
     * path — server-side POST /api/agent/screenshot marks the command done
     * itself on success, so this only acks on the failure branches.
     */
    fun uploadScreenshot(commandId: Long, bitmap: Bitmap?) {
        Thread {
            if (bitmap == null) { ack(commandId, false, "capture failed"); return@Thread }
            try {
                val stream = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 60, stream)
                val b64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                val body = JSONObject().put("commandId", commandId)
                    .put("image", "data:image/jpeg;base64,$b64").toString()
                val conn = (URL("$server/api/agent/screenshot").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("X-Device-Token", token)
                    connectTimeout = 15000; readTimeout = 15000
                }
                OutputStreamWriter(conn.outputStream).use { it.write(body) }
                if (conn.responseCode !in 200..299) ack(commandId, false, "upload failed (${conn.responseCode})")
            } catch (e: Exception) {
                ack(commandId, false, e.message ?: "upload failed")
            } finally {
                bitmap.recycle()
            }
        }.start()
    }

    /**
     * KIOSK_BUILD.md §9 "ניסיון יציאה מהקיוסק": showAdminDialog() compares the
     * typed maintenance code entirely on-device (Prefs.ADMIN_CODE, no network
     * call at all) — nothing about that dialog ever reached the server before
     * this. Fire-and-forget, same shape as ack()'s HTTP fallback: a report
     * that fails to reach the server is a missed alert, not a broken kiosk,
     * so it must never block or retry into the corner-tap gesture the
     * customer is standing in front of.
     */
    fun reportExitAttempt(ok: Boolean) {
        Thread {
            try {
                val conn = (URL("$server/api/agent/exit-attempt").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("X-Device-Token", token)
                    connectTimeout = 8000; readTimeout = 8000
                }
                OutputStreamWriter(conn.outputStream).use { it.write(JSONObject().put("ok", ok).toString()) }
                conn.responseCode
            } catch (_: Exception) {}
        }.start()
    }

    private fun batteryLevel(): Int {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return -1
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    companion object {
        /**
         * KIOSK_BUILD.md §0/§8 "watchdog": reports a crash/frozen-screen
         * recovery (Watchdog.kt) to the server. Static, unlike
         * reportExitAttempt(), because it has to run from
         * KioskApp.onCreate() — before any activity (and therefore any
         * CommandHandler an instance of this class would need) exists — so
         * it reads Prefs directly instead of an instance's cached
         * server/token fields. Fire-and-forget, same shape as
         * reportExitAttempt(): a report that fails to reach the server is a
         * missed alert, not a broken kiosk.
         */
        fun reportWatchdog(ctx: Context, reason: String, detail: String?) {
            val server = Prefs.get(ctx, Prefs.SERVER_URL).trimEnd('/')
            val token = Prefs.get(ctx, Prefs.DEVICE_TOKEN)
            if (server.isEmpty() || token.isEmpty()) return
            Thread {
                try {
                    val body = JSONObject().put("reason", reason)
                    if (!detail.isNullOrEmpty()) body.put("detail", detail)
                    val conn = (URL("$server/api/agent/watchdog-report").openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"; doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("X-Device-Token", token)
                        connectTimeout = 8000; readTimeout = 8000
                    }
                    OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
                    conn.responseCode
                } catch (_: Exception) {}
            }.start()
        }
    }
}
