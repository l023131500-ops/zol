package com.kioskfleet.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager

/**
 * Hardening applied when the app is a Device Owner.
 *
 * Blocks the common escape hatches — removable USB storage (disk-on-key),
 * sideloading of unknown apps/drivers, safe-boot, factory reset — WITHOUT
 * blocking USB peripherals such as card readers / EMV terminals. Card readers
 * enumerate as HID or vendor device classes, which are NOT covered by the
 * mass-storage / file-transfer restrictions below, so they keep working.
 */
object KioskPolicy {

    fun apply(ctx: Context) {
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(ctx.packageName)) return
        val admin = ComponentName(ctx, KioskDeviceAdminReceiver::class.java)

        val restrictions = listOf(
            UserManager.DISALLOW_USB_FILE_TRANSFER,       // no MTP/file transfer over USB
            UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,    // no USB drives / SD cards (disk-on-key)
            UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES, // no sideloaded apps or drivers
            UserManager.DISALLOW_SAFE_BOOT,               // can't reboot to safe mode to bypass
            UserManager.DISALLOW_ADD_USER,                // no extra user profiles
            UserManager.DISALLOW_FACTORY_RESET            // no factory reset from Settings
        )
        for (r in restrictions) {
            try { dpm.addUserRestriction(admin, r) } catch (_: Exception) {}
        }

        // Lock down the shell where supported (best-effort; ignored if unavailable).
        try { dpm.setKeyguardDisabled(admin, true) } catch (_: Exception) {}
        try { dpm.setStatusBarDisabled(admin, true) } catch (_: Exception) {}
    }

    /** Release restrictions (used if the device is ever decommissioned). */
    fun clear(ctx: Context) {
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(ctx.packageName)) return
        val admin = ComponentName(ctx, KioskDeviceAdminReceiver::class.java)
        for (r in listOf(
            UserManager.DISALLOW_USB_FILE_TRANSFER,
            UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
            UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
            UserManager.DISALLOW_SAFE_BOOT,
            UserManager.DISALLOW_ADD_USER,
            UserManager.DISALLOW_FACTORY_RESET
        )) {
            try { dpm.clearUserRestriction(admin, r) } catch (_: Exception) {}
        }
    }
}
