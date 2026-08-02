package com.kioskfleet.agent

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
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

/**
 * The kiosk surface: a locked WebView bound to the server-assigned host, plus a
 * hidden maintenance entry (5 corner taps + local code). All fleet control comes
 * from the server through AgentClient — this class only executes UI actions.
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
    private var allowedHosts = ""       // comma-separated
    private var idleReturnSeconds = 0
    private val mainHandler = Handler(Looper.getMainLooper())
    private var tapResetRunnable: Runnable? = null
    private var relockRunnable: Runnable? = null
    private val idleRunnable = Runnable { returnToVenue() }

    /** True if a host is inside the device's allow-list (event domain + payment gateway). */
    private fun hostAllowed(host: String?): Boolean {
        if (host.isNullOrEmpty()) return false
        val h = host.lowercase()
        val list = allowedHosts.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        if (list.isEmpty()) return true
        return list.any { h == it || h.endsWith(".$it") }
    }

    private fun resetIdleTimer() {
        mainHandler.removeCallbacks(idleRunnable)
        if (idleReturnSeconds > 0 && !isAdminUnlocked) {
            mainHandler.postDelayed(idleRunnable, idleReturnSeconds * 1000L)
        }
    }

    /** After inactivity, return to the exact event/venue link — never a generic home. */
    private fun returnToVenue() {
        val venue = Prefs.get(this, Prefs.HOME_URL)
        if (venue.isNotEmpty()) webView.loadUrl(venue)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!Prefs.isEnrolled(this)) {
            startActivity(Intent(this, EnrollActivity::class.java)); finish(); return
        }
        allowedHosts = Prefs.get(this, Prefs.ALLOWED_HOST)
        idleReturnSeconds = Prefs.get(this, Prefs.IDLE_RETURN).toIntOrNull() ?: 0

        acquireWakeLock(); lockScreenOn(); hideSystemUI()
        setupWebView()
        setupTouchInterceptor()

        val start = Prefs.get(this, Prefs.LAST_URL).ifEmpty { Prefs.get(this, Prefs.HOME_URL) }
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

    private fun toast(m: String) = runOnUiThread { Toast.makeText(this, m, Toast.LENGTH_SHORT).show() }

    // ── CommandHandler (remote commands) ────────────────────────
    override fun onReload() { webView.reload() }
    override fun onSetUrl(url: String) {
        val host = android.net.Uri.parse(url).host ?: ""
        if (hostAllowed(host)) {
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
    override fun onConfigUpdated(homeUrl: String, host: String, idleSeconds: Int) {
        allowedHosts = host
        idleReturnSeconds = idleSeconds
        if (homeUrl.isNotEmpty()) webView.loadUrl(homeUrl)
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

    // ── Hidden maintenance entry ────────────────────────────────
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
        if (cornerTapCount >= CORNER_TAPS_REQUIRED) { cornerTapCount = 0; showAdminDialog() }
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
