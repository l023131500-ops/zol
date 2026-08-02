package com.kioskfleet.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import okhttp3.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
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
    fun onConfigUpdated(homeUrl: String, allowedHost: String, idleReturnSeconds: Int)
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
                if (home.isNotEmpty()) {
                    val changed = home != Prefs.get(ctx, Prefs.HOME_URL) ||
                        host != Prefs.get(ctx, Prefs.ALLOWED_HOST) ||
                        idle.toString() != Prefs.get(ctx, Prefs.IDLE_RETURN)
                    Prefs.set(ctx, Prefs.HOME_URL, home)
                    Prefs.set(ctx, Prefs.ALLOWED_HOST, host)
                    Prefs.set(ctx, Prefs.IDLE_RETURN, idle.toString())
                    if (changed) ui.post { handler.onConfigUpdated(home, host, idle) }
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
                    val host = payload.optString("allowedHost", Prefs.get(ctx, Prefs.ALLOWED_HOST))
                    val idle = payload.optInt("idleReturnSeconds",
                        Prefs.get(ctx, Prefs.IDLE_RETURN).toIntOrNull() ?: 0)
                    Prefs.set(ctx, Prefs.HOME_URL, home)
                    Prefs.set(ctx, Prefs.ALLOWED_HOST, host)
                    Prefs.set(ctx, Prefs.IDLE_RETURN, idle.toString())
                    ui.post { handler.onConfigUpdated(home, host, idle) }
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

    private fun batteryLevel(): Int {
        val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return -1
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }
}
