package com.kioskfleet.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts the kiosk automatically after the device boots. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
            context.startActivity(Intent(context, LockTaskActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
