package com.kioskfleet.agent

import android.content.Context
import android.provider.Settings

/** Central store for enrollment + kiosk configuration. */
object Prefs {
    private const val FILE = "kioskfleet_prefs"

    const val SERVER_URL   = "server_url"      // e.g. https://panel.kioskfleet.com
    const val DEVICE_TOKEN = "device_token"    // issued at enrollment
    const val HOME_URL     = "home_url"        // the specific event/venue link
    const val ALLOWED_HOST = "allowed_host"    // comma-separated hosts allowed (event + payment)
    const val IDLE_RETURN  = "idle_return"     // seconds of inactivity → back to HOME_URL (0 = off)
    const val DEVICE_NAME  = "device_name"
    const val ADMIN_CODE   = "admin_code"      // local maintenance code
    const val LAST_URL     = "last_url"        // resume after crash/reboot
    const val DISPLAY_ZOOM = "display_zoom"    // CSS zoom percent applied to the WebView (100 = none)
    // KIOSK_BUILD.md §5 "בחירת אוריינטציה": 'landscape'|'portrait'|'auto'. Empty
    // (a device enrolled before this key existed) is read as 'landscape' by
    // every call site — the manifest's own pre-existing static default.
    const val DISPLAY_ORIENTATION = "display_orientation"
    const val APPROVED_CLIENTS = "approved_clients"  // JSON array of {code,name,url,allowedHost}, cached for the offline §2★ה selection screen
    const val SIGNAGE_ENABLED  = "signage_enabled"   // "1"/"0" — KIOSK_BUILD.md §9 digital signage
    const val SIGNAGE_URLS     = "signage_urls"      // newline-separated playlist, same shape as the console's textarea
    const val SIGNAGE_INTERVAL = "signage_interval"  // seconds between rotations
    // KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק": a remote on/off switch pushed from
    // the console, distinct from ADMIN_CODE (the *local* corner-tap code).
    const val MAINTENANCE_ENABLED = "maintenance_enabled"  // "1"/"0"
    const val MAINTENANCE_MESSAGE = "maintenance_message"  // customer-facing text; empty = use the on-device default
    // KIOSK_BUILD.md §9 "תזמון": business-hours screen scheduling, cached so
    // the device can work out its own current on/off state offline (see
    // KioskActivity.applyScheduleState()) instead of depending solely on a
    // live screen_on/screen_off command reaching it at the exact minute the
    // window flips — the same "must survive a reboot with no network" bar
    // MAINTENANCE_ENABLED above already holds.
    const val SCHEDULE_ENABLED    = "schedule_enabled"     // "1"/"0"
    const val SCHEDULE_OPEN_TIME  = "schedule_open_time"   // "HH:MM", empty = not configured
    const val SCHEDULE_CLOSE_TIME = "schedule_close_time"  // "HH:MM", empty = not configured
    // KIOSK_BUILD.md §0/§8 watchdog: a crash/stuck-reboot report Watchdog.kt
    // could not reach the network from (the process is mid-crash, or about
    // to reboot) — persisted here so it survives to the next process start
    // and KioskApp.onCreate() can flush it then. Empty = nothing pending.
    const val PENDING_WATCHDOG_REASON = "pending_watchdog_reason"
    const val PENDING_WATCHDOG_DETAIL = "pending_watchdog_detail"
    // KIOSK_BUILD.md §4 "מחוֹת יציאה מדורגות... הכל ניתן להגדרה בלוח (כמה
    // הקשות, איזו פינה, אורך החזקה, קודים)": the corner-tap gesture itself
    // was hardcoded until now (5 taps, top-left only, no hold). Read fresh
    // from Prefs at gesture-check time in KioskActivity, the same
    // "read-at-use, not cached" shape ADMIN_CODE already uses. Empty (a
    // device enrolled before these keys existed) is read as
    // 5/"tl"/0 by every call site — exactly what every device already does.
    const val EXIT_GESTURE_TAPS = "exit_gesture_taps"
    const val EXIT_GESTURE_CORNER = "exit_gesture_corner"      // "tl"|"tr"|"bl"|"br"
    const val EXIT_GESTURE_HOLD_MS = "exit_gesture_hold_ms"

    private fun p(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun get(ctx: Context, key: String, def: String = ""): String =
        p(ctx).getString(key, def) ?: def

    fun set(ctx: Context, key: String, value: String) =
        p(ctx).edit().putString(key, value).apply()

    fun isEnrolled(ctx: Context): Boolean =
        get(ctx, DEVICE_TOKEN).isNotEmpty() && get(ctx, SERVER_URL).isNotEmpty()

    /** Stable hardware identifier used as the device serial. */
    fun serial(ctx: Context): String =
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
}
