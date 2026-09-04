package com.kioskfleet.agent

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle
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

    /**
     * KIOSK_BUILD.md §3 Route A + §10-A: fired once, right after QR/zero-touch
     * provisioning finishes setting this app as Device Owner — the moment
     * DevicePolicyManager hands back whatever [PersistableBundle] rode in the
     * QR payload's `PROVISIONING_ADMIN_EXTRAS_BUNDLE` (see qrprovision.js,
     * which puts exactly `{ server, code }` there: the same two fields
     * EnrollActivity's manual-entry screen already collects by hand). Routes
     * B/D reach Device Owner over ADB/USB, where the installer is already
     * present to type or push the config; Route A's installer only scans a
     * QR code and walks away, so this is the one hand-off point that has to
     * forward those two strings into the app without a human typing them.
     *
     * [PersistableBundle] (not a regular [android.os.Bundle]) is what
     * provisioning extras arrive as — that's the platform's own choice, not
     * ours, since these extras must survive a process that is not yet running
     * when they are minted.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        val extras = intent.getParcelableExtra<PersistableBundle>(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
        )
        val server = extras?.getString("server")
        val code = extras?.getString("code")

        val launch = Intent(context, EnrollActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            if (!server.isNullOrBlank() && !code.isNullOrBlank()) {
                putExtra(EnrollActivity.EXTRA_QR_SERVER, server)
                putExtra(EnrollActivity.EXTRA_QR_CODE, code)
            }
            // No else branch: a QR scanned with a stale/malformed payload
            // (or one built before this admin-extras wiring existed) still
            // reaches EnrollActivity — it just falls through to the normal
            // manual server/code entry screen instead of silently stalling
            // on a blank one, the same "never leave the client on a dead
            // screen" principle the offline-USB path already follows.
        }
        context.startActivity(launch)
        // Policy hardening (Lock Task Mode etc.) happens in onEnabled above,
        // fired earlier in the same provisioning flow — nothing further to
        // apply here beyond forwarding the extras.
    }
}
