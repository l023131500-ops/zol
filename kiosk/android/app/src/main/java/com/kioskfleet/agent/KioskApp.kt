package com.kioskfleet.agent

import android.app.Application

/**
 * KIOSK_BUILD.md §0/§8 "watchdog" needs to install its crash handler and
 * stuck-main-thread monitor before any activity exists (a crash in the very
 * first activity's onCreate() must still be caught) — the process-wide
 * Application, not any one Activity, is the only place that runs early
 * enough. AndroidManifest.xml's `<application android:name=".KioskApp">`
 * wires this in.
 */
class KioskApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Watchdog.install(this)
        Watchdog.flushPendingReport(this)
    }
}
