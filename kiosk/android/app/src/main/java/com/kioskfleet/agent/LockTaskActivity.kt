package com.kioskfleet.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Launcher entry point. Enables Lock Task Mode (kiosk lock of Home/Recents/Back)
 * when the app is a Device Owner, then hands off to the enrollment or kiosk screen.
 */
class LockTaskActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val admin = ComponentName(this, KioskDeviceAdminReceiver::class.java)
        if (dpm.isDeviceOwnerApp(packageName)) {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            KioskPolicy.apply(this)   // block disk-on-key / sideloading; keep card readers working
            startLockTask()
        }

        val next = if (Prefs.isEnrolled(this)) KioskActivity::class.java else EnrollActivity::class.java
        startActivity(Intent(this, next))
        finish()
    }
}
