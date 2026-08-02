package com.kioskfleet.agent

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

/** Required for Device Owner / Lock Task Mode. */
class KioskDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Toast.makeText(context, "KioskFleet: הרשאות ניהול הופעלו", Toast.LENGTH_SHORT).show()
        KioskPolicy.apply(context)  // apply kiosk hardening as soon as we become Device Owner
    }
    override fun onDisabled(context: Context, intent: Intent) {
        Toast.makeText(context, "KioskFleet: הרשאות ניהול בוטלו", Toast.LENGTH_SHORT).show()
    }
}
