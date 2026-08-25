package com.kioskfleet.agent

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
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
        // KIOSK_BUILD.md §9 "מיתוג לקוח: מסך פתיחה, לוגו, צבעים לכל לקוח".
        const val CLIENT_SPLASH_MS     = 1400L
        // Defense in depth: routes/clients.js already only ever stores a
        // value that matches this before it reaches a device, but a device
        // caches the last config it received (Prefs.APPROVED_CLIENTS) and
        // renders it long after that validation ran — this is what stands
        // between a corrupted/stale cache value and an invalid CSS colour
        // silently doing nothing (or, worse, being used unescaped).
        val BRAND_COLOR_RE = Regex("^#[0-9a-fA-F]{6}$")
        // KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק" default screen text, used
        // whenever an owner turns maintenance on without typing a custom
        // message (server-side: maintenance.js's validateMaintenanceMessage
        // treats blank as "no custom message", not an error).
        const val DEFAULT_MAINTENANCE_MESSAGE = "המכשיר בתחזוקה זמנית — נחזור בקרוב"
        // KIOSK_BUILD.md §4: server-side clamp range (gesturesettings.js),
        // mirrored here as a defensive clamp on whatever a device's own
        // cached Prefs value holds — the same "clamp again on-device"
        // reasoning applyZoom()'s own comment gives for a config that could
        // predate a server-side clamp landing.
        const val MIN_GESTURE_TAPS = 3
        const val MAX_GESTURE_TAPS = 10
        const val MAX_GESTURE_HOLD_MS = 5000L
    }

    private lateinit var webView: WebView
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var agent: AgentClient
    private var overlay: TextView? = null
    // Deliberately a *separate* view from `overlay` above, not a reuse of it:
    // onScreenOn()/onScreenOff() unconditionally show/hide `overlay` as a
    // software blackout, and onMessage() reuses it for an operator note —
    // either one firing while a device is in remote maintenance would clear
    // (screen_on) or repurpose (message) the maintenance block if they shared
    // a view. A second, independent view means the two features cannot step
    // on each other's state.
    private var maintenanceOverlay: TextView? = null
    private var cornerTapCount = 0
    // KIOSK_BUILD.md §4: the final required tap's hold-to-confirm timer —
    // scheduled once cornerTapCount reaches the configured threshold (only
    // when a hold is configured at all), cancelled on ACTION_UP/CANCEL if
    // the customer lifts before it fires. Separate from tapResetRunnable
    // (which resets the *count* after inactivity, not a specific pending
    // hold), since the two must not cancel each other.
    private var holdConfirmRunnable: Runnable? = null
    private var isAdminUnlocked = false
    private var allowedHosts = ""       // comma-separated — the *currently active* scope (device baseline, or a selected client's)
    private var deviceAllowedHosts = "" // comma-separated — the device's own baseline scope (home_url + extras), independent of any client selection
    private var activeClientCode: String? = null  // non-null while showing an approved client's site (§2★ה); null = on the device's own home
    private var idleReturnSeconds = 0
    private var displayZoomPercent = 100
    private var displayOrientation = "landscape"
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tapResetRunnable: Runnable? = null
    private var relockRunnable: Runnable? = null
    private val idleRunnable = Runnable { returnToVenue() }
    private var signageRunnable: Runnable? = null
    private var signageIndex = 0
    private var isSignageActive = false

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
            clearBrowsingSession()
            webView.loadUrl(venue)
            webView.clearHistory()
            startSignageIfEnabled()
        }
    }

    /**
     * KIOSK_BUILD.md §9 "מצב תצוגה (Digital Signage): רוטציית תוכן/מדיה כשאין
     * אינטראקציה" — was entirely unbuilt; the only existing idle behaviour
     * was a single, one-time `returnToVenue()`. Only ever entered from there,
     * i.e. genuinely "no interaction", never from a server-pushed config
     * change or an operator's own "עמוד הבית" tap (`switchToHome()`), which
     * both mean an active management/operator action, not idle content.
     *
     * Playlist URLs are gated through `hostAllowed(..., deviceAllowedHosts)` —
     * the same scope `returnToVenue()`'s own HOME_URL is checked against —
     * deliberately not a wider scope: signage content lives in the business
     * owner's own already-approved domains, the same trust boundary as the
     * rest of the locked device, rather than opening a second, unvetted way
     * off the allow-list. A URL outside that scope is skipped, not treated as
     * a reason to stop rotating — one misconfigured line must not blank the
     * whole playlist.
     */
    private fun startSignageIfEnabled() {
        if (Prefs.get(this, Prefs.SIGNAGE_ENABLED, "0") != "1") return
        val urls = Prefs.get(this, Prefs.SIGNAGE_URLS, "").split("\n").map { it.trim() }.filter { it.isNotEmpty() }
        if (urls.isEmpty()) return
        val intervalMs = (Prefs.get(this, Prefs.SIGNAGE_INTERVAL, "15").toIntOrNull() ?: 15)
            .coerceIn(3, 3600) * 1000L
        isSignageActive = true
        signageIndex = 0
        advanceSignage(urls, intervalMs)
    }

    private fun advanceSignage(urls: List<String>, intervalMs: Long) {
        if (!isSignageActive) return
        val url = urls[signageIndex % urls.size]
        signageIndex++
        val host = try { android.net.Uri.parse(url).host } catch (e: Exception) { null }
        if (hostAllowed(host, deviceAllowedHosts)) webView.loadUrl(url)
        signageRunnable = Runnable { advanceSignage(urls, intervalMs) }
        mainHandler.postDelayed(signageRunnable!!, intervalMs)
    }

    /** Any real interaction ends signage immediately — it is idle-only content, never something a customer browses. */
    private fun stopSignage() {
        signageRunnable?.let { mainHandler.removeCallbacks(it) }
        signageRunnable = null
        isSignageActive = false
    }

    /**
     * KIOSK_BUILD.md §9: "ניקוי סשן: מחיקת היסטוריה/עוגיות בין משתמשים (קריטי
     * לקיוסק ציבורי)" — a public kiosk must not carry one customer's cookies,
     * localStorage, form autofill or back-stack into the next. Cookies are
     * cleared here (`onClearCache()` above never touched `CookieManager` —
     * only cache + DOM storage, and only on an explicit remote command).
     *
     * Called only at an actual "a different person is now at the device"
     * boundary — idle-return, and an operator's own tap away from the
     * current home/client — never mid-session, or a customer mid-form would
     * lose their own input. Deliberately *not* called from `onCreate()`'s
     * boot/restart path: that path's `LAST_URL` restore is an intentional
     * "resume where the device left off" feature (crash/OTA/`reboot`
     * command, not necessarily a new customer), and wiping cookies there
     * would fight that restore rather than serve §9's "between users" goal.
     */
    private fun clearBrowsingSession() {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
        webView.clearFormData()
        WebStorage.getInstance().deleteAllData()
        webView.clearCache(true)
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
        displayOrientation = Prefs.get(this, Prefs.DISPLAY_ORIENTATION).ifEmpty { "landscape" }
        applyOrientation()

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
        // Resume into whatever maintenance state the last config left behind
        // — a crash/reboot must not silently put a maintained-off device
        // back in front of customers before the next heartbeat/WS message.
        applyMaintenanceState()

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
                // KIOSK_BUILD.md §9 "חסימת הורדות/קבצים": a public kiosk must
                // not let a page reach the device's local filesystem or any
                // content:// provider — both are ways off the locked site,
                // and neither is ever needed by a legitimate client page.
                allowFileAccess = false
                allowContentAccess = false
            }
            setBackgroundColor(Color.WHITE)
            // Any actual download attempt (a page linking a file instead of
            // rendering it) is refused with feedback instead of failing
            // silently with no listener registered at all.
            setDownloadListener { _, _, _, _, _ -> toast("הורדות חסומות בקיוסק") }
            // WebView's built-in long-press context menu ("שמור תמונה"/"פתח
            // בכרטיסייה חדשה"/"העתק קישור") is a second, native escape hatch
            // independent of shouldOverrideUrlLoading — it never asks the
            // WebViewClient before acting. Consuming the long-click here is
            // the standard way to suppress it, since WebView only falls back
            // to its own context menu when the view's own listener leaves
            // the event unconsumed.
            setOnLongClickListener { true }
            isHapticFeedbackEnabled = false
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return true
                return if (hostAllowed(host)) false else { toast("קישור חסום"); true }
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // A signage slide is idle content, not "where the customer left
                // off" — recording it here would make a crash/OTA/reboot resume
                // on a rotating ad instead of the device's real home/last page.
                if (!isSignageActive) Prefs.set(this@KioskActivity, Prefs.LAST_URL, url)
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

    /**
     * KIOSK_BUILD.md §5 "בחירת אוריינטציה: אורך / רוחב — נכפה על המכשיר".
     * AndroidManifest.xml's static `android:screenOrientation="landscape"` on
     * this activity is only the pre-config-load default (the brief window
     * before Prefs/AgentClient can supply the real, server-chosen value —
     * e.g. this device's very first cold start before enrollment even runs).
     * `setRequestedOrientation()` overrides it at runtime and takes effect
     * immediately, the same "manifest is only the fallback, the live Prefs
     * value always wins" shape zoom/idle-return/every other per-device policy
     * field on this activity already has. Unknown/invalid values (should
     * never reach here — orientation.js validates server-side, and Prefs is
     * only ever written from that validated payload) fall back to landscape,
     * matching every device's behavior before this field existed.
     */
    private fun applyOrientation() {
        requestedOrientation = when (displayOrientation) {
            "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            "auto" -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            else -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        }
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
    override fun onConfigUpdated(homeUrl: String, host: String, idleSeconds: Int, zoomPercent: Int, orientation: String) {
        deviceAllowedHosts = host
        idleReturnSeconds = idleSeconds
        val zoomChanged = zoomPercent != displayZoomPercent
        displayZoomPercent = zoomPercent
        // Independent of navigation, same reasoning as applyMaintenanceState()
        // below: an operator locking/unlocking a device's orientation must
        // take effect immediately, not wait for an unrelated homeUrl push.
        if (orientation != displayOrientation) {
            displayOrientation = orientation
            applyOrientation()
        }
        // AgentClient.kt already persisted the fresh Prefs.MAINTENANCE_*
        // values (both the heartbeat and update_config paths) before this
        // callback fires; applying it here, independent of the homeUrl/zoom
        // branches below, means an operator toggling *only* maintenance still
        // takes effect immediately rather than waiting on an unrelated field.
        applyMaintenanceState()
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
            // navigations back to the baseline. Also ends any signage rotation
            // in progress: an operator's own config push is an active
            // management action, not idle content, and would otherwise race
            // the next scheduled `advanceSignage()` against this navigation.
            stopSignage()
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

    /**
     * KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק" — was entirely unbuilt; there was
     * no way to take one device out of customer-facing service without either
     * disenrolling it or wiping its allow-list/home-URL by hand. Reads
     * Prefs.MAINTENANCE_ENABLED/_MESSAGE directly (same "no new
     * CommandHandler parameter" shape signage/schedule already use) rather
     * than taking them as arguments, so it can be called from both onCreate()
     * (resume into the same blocked state after a crash/reboot, the same
     * reasoning LAST_URL's own restart handling already documents) and
     * onConfigUpdated() (live toggle from the console) with one code path.
     *
     * Deliberately *not* built on the shared `overlay`/showOverlay() above —
     * see the maintenanceOverlay property comment for why a second view is
     * required. Also deliberately non-interactive (no click listener,
     * `isClickable` left false): touches still fall through to `webView`
     * underneath, the same as `overlay`'s own screen_off blackout already
     * does, so the hidden corner-tap admin-unlock gesture (§4's "מחוות יציאה
     * מדורגות") keeps working while the customer-facing screen shows the
     * maintenance message — a technician must still be able to reach it
     * without needing the console to turn maintenance off first.
     */
    private fun applyMaintenanceState() = runOnUiThread {
        val enabled = Prefs.get(this, Prefs.MAINTENANCE_ENABLED, "0") == "1"
        if (!enabled) { maintenanceOverlay?.visibility = View.GONE; return@runOnUiThread }
        val message = Prefs.get(this, Prefs.MAINTENANCE_MESSAGE, "").ifBlank { DEFAULT_MAINTENANCE_MESSAGE }
        if (maintenanceOverlay == null) {
            maintenanceOverlay = TextView(this).apply {
                setBackgroundColor(Color.BLACK); setTextColor(Color.WHITE)
                gravity = android.view.Gravity.CENTER; textSize = 22f
                setPadding(48, 48, 48, 48)
            }
            addContentView(maintenanceOverlay, WindowManager.LayoutParams(-1, -1))
        }
        maintenanceOverlay?.text = message
        maintenanceOverlay?.visibility = View.VISIBLE
    }

    // ── Hidden maintenance entry / customer selection (KIOSK_BUILD.md §4, §2★ה) ──

    /**
     * KIOSK_BUILD.md §4 "כמה הקשות": read fresh from Prefs at gesture-check
     * time rather than cached — same "read-at-use" shape ADMIN_CODE already
     * uses (showAdminDialog reads it fresh on every open), so a config
     * pushed mid-session (which never fires onConfigUpdated for this group —
     * see AgentClient.kt's own comment) is picked up on the very next tap,
     * not only after some unrelated field also happens to change. Clamped
     * again on-device — same reasoning applyZoom()'s own comment gives —
     * since this could be a value cached before a server-side clamp landed.
     */
    private fun gestureTapsRequired(): Int =
        (Prefs.get(this, Prefs.EXIT_GESTURE_TAPS).toIntOrNull() ?: CORNER_TAPS_REQUIRED)
            .coerceIn(MIN_GESTURE_TAPS, MAX_GESTURE_TAPS)

    private fun gestureHoldMs(): Long =
        (Prefs.get(this, Prefs.EXIT_GESTURE_HOLD_MS).toLongOrNull() ?: 0L).coerceIn(0L, MAX_GESTURE_HOLD_MS)

    /** One of "tl"/"tr"/"bl"/"br"; an unrecognised/empty cached value falls back to "tl", matching every device's pre-existing behavior. */
    private fun gestureCorner(): String {
        val v = Prefs.get(this, Prefs.EXIT_GESTURE_CORNER)
        return if (v == "tr" || v == "bl" || v == "br") v else "tl"
    }

    /**
     * Whether (x, y) falls inside the configured corner's CORNER_SIZE_PX
     * square, generalised from the original top-left-only check to all four
     * screen corners. viewWidth/viewHeight come from the touched view itself
     * (not a cached display size), so this stays correct across a runtime
     * orientation change without any extra bookkeeping.
     */
    private fun isInGestureCorner(x: Float, y: Float, viewWidth: Int, viewHeight: Int): Boolean {
        return when (gestureCorner()) {
            "tr" -> x >= viewWidth - CORNER_SIZE_PX && y <= CORNER_SIZE_PX
            "bl" -> x <= CORNER_SIZE_PX && y >= viewHeight - CORNER_SIZE_PX
            "br" -> x >= viewWidth - CORNER_SIZE_PX && y >= viewHeight - CORNER_SIZE_PX
            else -> x <= CORNER_SIZE_PX && y <= CORNER_SIZE_PX // "tl", the pre-existing default
        }
    }

    private fun setupTouchInterceptor() {
        webView.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (isSignageActive) {
                        // The first touch on rotating signage only ever exits back
                        // to the interactive kiosk — it does not count toward the
                        // corner-tap gesture below, the same "no rights beyond what
                        // was already granted" default §2★ה's own selection dialog
                        // documents for switchToHome()/switchToClient().
                        stopSignage()
                        switchToHome()
                    } else {
                        resetIdleTimer()  // any interaction keeps the customer's session alive
                        if (isInGestureCorner(event.x, event.y, view.width, view.height)) handleCornerTap()
                    }
                }
                // Lifting (or the system cancelling) a touch fails an in-progress
                // hold — the final tap must stay pressed for the configured
                // duration, not be released and re-pressed. A no-op when no hold
                // is currently scheduled (every ordinary tap's own release).
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> cancelPendingHold()
            }
            false
        }
    }

    private fun cancelPendingHold() {
        holdConfirmRunnable?.let { mainHandler.removeCallbacks(it) }
        holdConfirmRunnable = null
    }

    /**
     * KIOSK_BUILD.md §4 "הקשה מורכבת (למשל 5 הקשות בפינה + החזקה)". With
     * holdMs == 0 (the pre-existing default for every device) this behaves
     * exactly as before: the required tap count alone opens the selection
     * dialog immediately, no hold needed. With holdMs > 0, reaching the
     * required count only *starts* the hold — the dialog opens after that
     * same touch stays pressed for holdMs; releasing early
     * (cancelPendingHold(), above) fails it and the customer must redo the
     * full tap sequence, the same "reset on any anomaly" philosophy
     * tapResetRunnable's own 3s window already applies to the count itself.
     */
    private fun handleCornerTap() {
        cornerTapCount++
        tapResetRunnable?.let { mainHandler.removeCallbacks(it) }
        tapResetRunnable = Runnable { cornerTapCount = 0 }
        mainHandler.postDelayed(tapResetRunnable!!, TAP_RESET_DELAY_MS)
        if (cornerTapCount >= gestureTapsRequired()) {
            cornerTapCount = 0
            val holdMs = gestureHoldMs()
            if (holdMs <= 0) {
                showSelectionDialog()
            } else {
                holdConfirmRunnable = Runnable { showSelectionDialog() }
                mainHandler.postDelayed(holdConfirmRunnable!!, holdMs)
            }
        }
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
        clearBrowsingSession()
        webView.loadUrl(venue.ifEmpty { "about:blank" })
        webView.clearHistory()
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
        clearBrowsingSession()
        showClientBrandSplash(client, url)
        resetIdleTimer()
    }

    /**
     * KIOSK_BUILD.md §9 "מיתוג לקוח: מסך פתיחה, לוגו, צבעים לכל לקוח" — a
     * brief branded splash before a client's own site loads. Built as an
     * inline HTML page loaded into the same WebView, not a native ImageView:
     * the WebView already fetches and decodes remote images for every client
     * site, so this needs no image-loading library and no extra permission.
     * Skipped entirely when a client has neither a logo nor a colour — for a
     * plain client that would just be a blank flash, worse than no splash.
     */
    private fun showClientBrandSplash(client: JSONObject, targetUrl: String) {
        val logoUrl = client.optString("logoUrl")
        val brandColorRaw = client.optString("brandColor")
        val brandColor = if (BRAND_COLOR_RE.matches(brandColorRaw)) brandColorRaw else ""
        // logoUrl already went through routes/clients.js's http(s)-only check
        // before it was stored, and is only ever loaded as an <img src>, not
        // interpreted — same trust level a client's own `url` already gets
        // from webView.loadUrl() above. Only the *attribute quoting* needs
        // escaping here, so a stray `"` in a cached value cannot break out
        // of the src attribute into the surrounding splash markup.
        if (logoUrl.isEmpty() && brandColor.isEmpty()) {
            webView.loadUrl(targetUrl)
            webView.clearHistory()
            return
        }
        val bg = brandColor.ifEmpty { "#111111" }
        val logoTag = if (logoUrl.isNotEmpty())
            "<img src=\"${logoUrl.replace("\"", "&quot;")}\" style=\"max-width:70vw;max-height:50vh;object-fit:contain\" />"
        else ""
        val html = "<html><body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:$bg\">$logoTag</body></html>"
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        webView.clearHistory()
        val expectedClientCode = client.optString("code")
        mainHandler.postDelayed({
            // A second switch (operator taps another item, or "עמוד הבית")
            // during the splash delay must win — this delayed load only
            // fires the target it was scheduled for if that is still the
            // active selection, the same "no stale navigation" guard
            // returnToVenue()/onConfigUpdated() already apply elsewhere.
            if (activeClientCode == expectedClientCode) {
                webView.loadUrl(targetUrl)
                webView.clearHistory()
            }
        }, CLIENT_SPLASH_MS)
    }

    private fun showAdminDialog() {
        val code = Prefs.get(this, Prefs.ADMIN_CODE)
        if (code.isEmpty()) { toast("קוד תחזוקה לא הוגדר. השתמשו בפקודת פתיחה מרחוק."); return }
        val input = EditText(this).apply {
            hint = "קוד תחזוקה"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        AlertDialog.Builder(this).setTitle("תחזוקה").setView(input)
            .setPositiveButton("כניסה") { _, _ ->
                // KIOSK_BUILD.md §9 "ניסיון יציאה מהקיוסק": every submission of
                // this dialog is reported, not only wrong ones — the owner-side
                // alert list (routes/alerts.js) is the one that decides which
                // reports are alert-worthy; the device just tells the truth
                // about what happened here.
                val ok = input.text.toString() == code
                if (::agent.isInitialized) agent.reportExitAttempt(ok)
                if (ok) onUnlock(10) else toast("קוד שגוי")
            }
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
