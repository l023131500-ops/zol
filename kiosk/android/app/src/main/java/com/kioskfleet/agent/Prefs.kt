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
