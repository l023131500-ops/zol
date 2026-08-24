package com.kioskfleet.agent

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * The kiosk surface: a locked WebView bound to the server-assigned host, plus a
 * hidden entry (5 corner taps) that opens a selection screen — switch to the
 * device's own home or any owner-approved client (KIOSK_BUILD.md §2★ה), or
 * (behind a further local code) real device maintenance. All fleet control
 * comes from the server through AgentClient — this class only executes UI
 * actions.
 */
class KioskActivity : AppCompatActivity(), CommandHandler {

    companion object {
        const val CORNER_TAPS_REQUIRED = 5
        const val CORNER_SIZE_PX       = 120
        const val TAP_RESET_DELAY_MS   = 3000L
    }

    private lateinit var webView: WebView
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var agent: AgentClient
    private var overlay: TextView? = null
    private var cornerTapCount = 0
    private var isAdminUnlocked = false
    private var allowedHosts = ""       // comma-separated — the *currently active* scope (device baseline, or a selected client's)
    private var deviceAllowedHosts = "" // comma-separated — the device's own baseline scope (home_url + extras), independent of any client selection
    private var activeClientCode: String? = null  // non-null while showing an approved client's site (§2★ה); null = on the device's own home
    private var idleReturnSeconds = 0
    private var displayZoomPercent = 100
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tapResetRunnable: Runnable? = null
    private var relockRunnable: Runnable? = null
    private val idleRunnable = Runnable { returnToVenue() }

    /**
     * True if a host is inside an allow-list (event domain + payment gateway).
     * Defaults to the currently active scope (`allowedHosts`) — the baseline
     * while on the device's own home, or the selected client's own scope
     * while `activeClientCode` is set. A caller that needs to check against
     * the device's baseline specifically, regardless of what is active right
     * now (e.g. an explicit remote `set_url`), passes `hostsCsv` explicitly.
     */
    private fun hostAllowed(host: String?, hostsCsv: String = allowedHosts): Boolean {
        if (host.isNullOrEmpty()) return false
        val h = host.lowercase()
        val list = hostsCsv.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        if (list.isEmpty()) return true
        return list.any { h == it || h.endsWith(".$it") }
    }

    private fun resetIdleTimer() {
        mainHandler.removeCallbacks(idleRunnable)
        if (idleReturnSeconds > 0 && !isAdminUnlocked) {
            mainHandler.postDelayed(idleRunnable, idleReturnSeconds * 1000L)
        }
    }

    /** A stored URL, or "" if its host is not in the given (default: current) allow-list. */
    private fun safeStoredUrl(candidate: String, hostsCsv: String = allowedHosts): String {
        if (candidate.isEmpty()) return ""
        return if (hostAllowed(android.net.Uri.parse(candidate).host, hostsCsv)) candidate else ""
    }

    /**
     * After inactivity, return to the exact event/venue link — never a generic home.
     *
     * Gated the same way onSetUrl/onConfigUpdated already gate a navigation:
     * HOME_URL on disk is normally guaranteed (server-side) to be inside
     * ALLOWED_HOST, but a device that already held a stale, mismatched pair
     * from before that guarantee existed — or any future write that skips it —
     * would otherwise have this, the one navigation nothing else in the file
     * gates, load it straight into the WebView on every idle timeout.
     */
    private fun returnToVenue() {
        // Checked against deviceAllowedHosts, not the (possibly client-scoped)
        // `allowedHosts` — idle timeout while viewing an approved client's
        // site must fall back to the device's own home, not judge HOME_URL
        // against that client's narrower scope and wrongly reject it.
        val venue = safeStoredUrl(Prefs.get(this, Prefs.HOME_URL), deviceAllowedHosts)
        if (venue.isNotEmpty()) {
            activeClientCode = null
            allowedHosts = deviceAllowedHosts
            webView.loadUrl(venue)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!Prefs.isEnrolled(this)) {
            startActivity(Intent(this, EnrollActivity::class.java)); finish(); return
        }
        allowedHosts = Prefs.get(this, Prefs.ALLOWED_HOST)
        deviceAllowedHosts = allowedHosts
        idleReturnSeconds = Prefs.get(this, Prefs.IDLE_RETURN).toIntOrNull() ?: 0
        displayZoomPercent = Prefs.get(this, Prefs.DISPLAY_ZOOM).toIntOrNull() ?: 100

        acquireWakeLock(); lockScreenOn(); hideSystemUI()
        setupWebView()
        setupTouchInterceptor()

        // Same gate as returnToVenue(): LAST_URL was allowed under whatever
        // list was live when it was recorded, which is not necessarily the
        // list just loaded above — an owner who narrows the allow-list (moves
        // the device off an old venue) between app restarts must not have
        // that revocation undone by the restart re-opening the old page.
        val start = safeStoredUrl(Prefs.get(this, Prefs.LAST_URL)).ifEmpty { safeStoredUrl(Prefs.get(this, Prefs.HOME_URL)) }
        webView.loadUrl(start.ifEmpty { "about:blank" })
        resetIdleTimer()

        agent = AgentClient(this, this)
        agent.start()
    }

    override fun onResume() {
        super.onResume()
        if (!::wakeLock.isInitialized || !wakeLock.isHeld) acquireWakeLock()
        resetIdleTimer()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::agent.isInitialized) agent.stop()
        if (::wakeLock.isInitialized && wakeLock.isHeld) wakeLock.release()
        mainHandler.removeCallbacksAndMessages(null)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && !isAdminUnlocked) hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (isAdminUnlocked) super.onBackPressed() }

    // ── Screen / window ─────────────────────────────────────────
    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "KioskFleet::Screen")
        wakeLock.acquire()
    }

    private fun lockScreenOn() {
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }

    private fun hideSystemUI() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_FULLSCREEN)
    }

    // ── WebView ─────────────────────────────────────────────────
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportZoom(false); displayZoomControls = false; builtInZoomControls = false
                setSupportMultipleWindows(false)
            }
            setBackgroundColor(Color.WHITE)
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return true
                return if (hostAllowed(host)) false else { toast("קישור חסום"); true }
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                Prefs.set(this@KioskActivity, Prefs.LAST_URL, url)
                injectLinkGuard(view)
                applyZoom(view)
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(v: WebView, d: Boolean, u: Boolean, m: android.os.Message): Boolean = false
        }
        setContentView(webView)
    }

    private fun injectLinkGuard(view: WebView) {
        view.evaluateJavascript("""
            (function(){
              document.querySelectorAll('a[target="_blank"]').forEach(a=>a.removeAttribute('target'));
              window.open=()=>null;
              new MutationObserver(()=>{document.querySelectorAll('a[target="_blank"]').forEach(a=>a.removeAttribute('target'));})
                .observe(document.body,{childList:true,subtree:true});
            })();
        """.trimIndent(), null)
    }

    /**
     * KIOSK_BUILD.md §5: many locked sites are built mobile-first and render
     * small on a 21"+ kiosk panel. CSS `zoom` (Chromium-WebView-only, which is
     * exactly what this app runs on) scales the whole rendered page — layout
     * included — unlike `-webkit-transform: scale()`, which would leave empty
     * space around a scaled-down viewport instead of reflowing to fill it.
     * `displayZoomPercent` reaches here only from the server (JSON int, never
     * user-typed text), so there is no string to sanitize — but the value is
     * clamped again anyway: this function also runs against whatever was last
     * written to Prefs, which could predate the server-side clamp in
     * `display.js` landing (an older config cached before that fix shipped).
     *
     * Always runs, even at 100% — the config-updated (no-navigation) call
     * site can go from a non-default zoom back to 100%, and skipping the
     * no-op case there would leave the *previous* zoom's already-injected
     * style sitting on the page instead of clearing it.
     */
    private fun applyZoom(view: WebView) {
        val pct = displayZoomPercent.coerceIn(50, 300)
        view.evaluateJavascript(
            "document.documentElement.style.zoom='${pct}%';", null)
    }

    private fun toast(m: String) = runOnUiThread { Toast.makeText(this, m, Toast.LENGTH_SHORT).show() }

    // ── CommandHandler (remote commands) ────────────────────────
    override fun onReload() { webView.reload() }
    override fun onSetUrl(url: String) {
        val host = android.net.Uri.parse(url).host ?: ""
        // Checked against deviceAllowedHosts: a remote set_url always targets
        // the device's own home, never a client's scope, even if a client's
        // site happens to be on screen (and thus `allowedHosts`) right now.
        if (hostAllowed(host, deviceAllowedHosts)) {
            activeClientCode = null
            allowedHosts = deviceAllowedHosts
            Prefs.set(this, Prefs.HOME_URL, url); webView.loadUrl(url); resetIdleTimer()
        } else toast("כתובת חסומה: מחוץ לדומיינים המורשים")
    }
    override fun onScreenOn() {
        if (!wakeLock.isHeld) acquireWakeLock()
        window.attributes = window.attributes.apply { screenBrightness = -1f }
        removeOverlay()
    }
    override fun onScreenOff() {
        // Software blackout (true power-off needs Device Owner policies).
        window.attributes = window.attributes.apply { screenBrightness = 0.01f }
        showOverlay(" ")
    }
    override fun onClearCache() { webView.clearCache(true); WebStorage.getInstance().deleteAllData() }
    override fun onLock() { relockKiosk() }
    override fun onUnlock(minutes: Int) {
        isAdminUnlocked = true
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        relockRunnable?.let { mainHandler.removeCallbacks(it) }
        relockRunnable = Runnable { relockKiosk() }
        mainHandler.postDelayed(relockRunnable!!, minutes.toLong().coerceIn(1, 120) * 60_000)
        toast("מצב תחזוקה פעיל ל-$minutes דקות")
    }
    override fun onMessage(text: String) { if (text.isBlank()) removeOverlay() else showOverlay(text) }
    override fun onScreenshot(commandId: Long) {
        val bitmap = try {
            val w = webView.width; val h = webView.height
            if (w <= 0 || h <= 0) null else {
                val full = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                webView.draw(android.graphics.Canvas(full))
                // A full-resolution capture can push the JPEG well past the
                // server's 1mb JSON body limit; console viewing needs "what's
                // on screen right now", not print resolution.
                val maxDim = 720
                val scale = maxDim.toFloat() / maxOf(w, h)
                if (scale < 1f) {
                    val scaled = Bitmap.createScaledBitmap(
                        full, (w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1), true)
                    full.recycle(); scaled
                } else full
            }
        } catch (e: Exception) { null }
        agent.uploadScreenshot(commandId, bitmap)
    }
    override fun onConfigUpdated(homeUrl: String, host: String, idleSeconds: Int, zoomPercent: Int) {
        deviceAllowedHosts = host
        idleReturnSeconds = idleSeconds
        val zoomChanged = zoomPercent != displayZoomPercent
        displayZoomPercent = zoomPercent
        // The same gate onSetUrl already applies to a command-driven
        // navigation. A pushed config is server data like any other, and the
        // server-side half of this fix (routes/devices.js) only stops a
        // *new* mismatch from being stored — it does nothing for a device
        // that already has a stale pair on disk or a heartbeat replaying
        // one. Loading homeUrl unchecked here was the one path that could
        // put the WebView's very first document load outside the allow-list
        // this same call just installed.
        if (homeUrl.isNotEmpty()) {
            // A pushed home-link change always means "go back to the device's
            // own home" — exit whatever client scope (if any) was active, the
            // same as onSetUrl/returnToVenue already do for their own
            // navigations back to the baseline.
            activeClientCode = null
            allowedHosts = host
            if (hostAllowed(android.net.Uri.parse(homeUrl).host)) webView.loadUrl(homeUrl)
            else toast("קישור חסום: מחוץ לדומיינים המורשים")
            // A navigation above already re-applies zoom via onPageFinished.
        } else {
            // No home-link change, so no navigation — a client, if one is
            // active, stays on screen and keeps its own scope; only the
            // device's baseline (used once the operator returns home) updates.
            if (activeClientCode == null) allowedHosts = host
            if (zoomChanged) {
                // No navigation to carry onPageFinished's applyZoom() call —
                // the currently-loaded page needs it applied directly instead.
                applyZoom(webView)
            }
        }
        resetIdleTimer()
    }

    private fun showOverlay(text: String) = runOnUiThread {
        if (overlay == null) {
            overlay = TextView(this).apply {
                setBackgroundColor(Color.BLACK); setTextColor(Color.WHITE)
                gravity = android.view.Gravity.CENTER; textSize = 22f
            }
            addContentView(overlay, WindowManager.LayoutParams(-1, -1))
        }
        overlay?.text = text; overlay?.visibility = View.VISIBLE
    }
    private fun removeOverlay() = runOnUiThread { overlay?.visibility = View.GONE }

    // ── Hidden maintenance entry / customer selection (KIOSK_BUILD.md §4, §2★ה) ──
    private fun setupTouchInterceptor() {
        webView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_DOWN) {
                resetIdleTimer()  // any interaction keeps the customer's session alive
                if (event.x <= CORNER_SIZE_PX && event.y <= CORNER_SIZE_PX) handleCornerTap()
            }
            false
        }
    }
    private fun handleCornerTap() {
        cornerTapCount++
        tapResetRunnable?.let { mainHandler.removeCallbacks(it) }
        tapResetRunnable = Runnable { cornerTapCount = 0 }
        mainHandler.postDelayed(tapResetRunnable!!, TAP_RESET_DELAY_MS)
        if (cornerTapCount >= CORNER_TAPS_REQUIRED) { cornerTapCount = 0; showSelectionDialog() }
    }

    /**
     * KIOSK_BUILD.md §4/§2★ה: the corner-tap gesture always opens this first —
     * switching to the device's own home, or to any owner-approved client, is
     * the "no rights beyond what was already granted" action the spec says
     * needs no password. Only "⚙️ ניהול מכשיר" hands off to the unchanged,
     * code-gated showAdminDialog() below — that stays the sole path to a real
     * exit/settings change.
     */
    private fun showSelectionDialog() {
        val clients = try {
            val arr = JSONArray(Prefs.get(this, Prefs.APPROVED_CLIENTS, "[]"))
            (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (e: Exception) { emptyList() }

        // CharSequence, not String: setItems()'s Java signature takes
        // CharSequence[] — building the list as that element type up front
        // avoids relying on Kotlin's Java-array-covariance interop for what
        // toTypedArray() would otherwise infer as Array<String>.
        val items = mutableListOf<CharSequence>("🏠 עמוד הבית")
        items.addAll(clients.map { it.optString("name") })
        items.add("⚙️ ניהול מכשיר")
        val adminIndex = items.size - 1

        AlertDialog.Builder(this).setTitle("בחירה")
            .setItems(items.toTypedArray()) { _, which ->
                when (which) {
                    0 -> switchToHome()
                    adminIndex -> showAdminDialog()
                    else -> switchToClient(clients[which - 1])
                }
            }
            .setNegativeButton("ביטול", null).show()
    }

    private fun switchToHome() {
        activeClientCode = null
        allowedHosts = deviceAllowedHosts
        val venue = safeStoredUrl(Prefs.get(this, Prefs.HOME_URL), deviceAllowedHosts)
        webView.loadUrl(venue.ifEmpty { "about:blank" })
        resetIdleTimer()
    }

    /**
     * A tap-to-select item, not a typed-code field: every candidate here
     * already came down in `approvedClients` (server-validated against this
     * exact device, cached for offline use), so there is no "code not found"
     * input to parse and no need for a second, network-dependent lookup
     * through KIOSK_BUILD.md §2★ז's `/api/agent/identify` — the device only
     * ever needs the entry it was already handed.
     */
    private fun switchToClient(client: JSONObject) {
        val url = client.optString("url")
        val hosts = client.optString("allowedHost")
        val host = try { android.net.Uri.parse(url).host } catch (e: Exception) { null }
        // Unlike hostAllowed()'s own default (fail-open when a scope is
        // unset — correct for a device baseline an owner may legitimately
        // leave wide open), an empty scope here is treated as blocked: a
        // client is a second, separate site the operator is about to be
        // locked into, and a missing scope must never silently mean "allow
        // anything" for that switch.
        if (hosts.isEmpty() || !hostAllowed(host, hosts)) { toast("קישור הלקוח חסום או לא תקין"); return }
        activeClientCode = client.optString("code")
        allowedHosts = hosts
        webView.loadUrl(url)
        resetIdleTimer()
    }

    private fun showAdminDialog() {
        val code = Prefs.get(this, Prefs.ADMIN_CODE)
        if (code.isEmpty()) { toast("קוד תחזוקה לא הוגדר. השתמשו בפקודת פתיחה מרחוק."); return }
        val input = EditText(this).apply {
            hint = "קוד תחזוקה"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this).setTitle("תחזוקה").setView(input)
            .setPositiveButton("כניסה") { _, _ -> if (input.text.toString() == code) onUnlock(10) else toast("קוד שגוי") }
            .setNegativeButton("ביטול", null).show()
    }

    private fun relockKiosk() {
        isAdminUnlocked = false
        relockRunnable?.let { mainHandler.removeCallbacks(it) }
        hideSystemUI()
        removeOverlay()
        onScreenOn()
        resetIdleTimer()
    }
}
