package com.kioskfleet.agent

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import kotlin.system.exitProcess

/**
 * KIOSK_BUILD.md §0 "התאוששות אוטומטית מכל תקלה (watchdog)" / §8 "Watchdog:
 * אם האפליקציה קורסת/נסגרת → מופעלת מחדש אוטומטית; אם המסך תקוע → אתחול" —
 * was entirely unbuilt. Two independent failure modes, two independent
 * detectors, because they cannot share one signal:
 *  - a **crash** (uncaught exception) is detected the instant it happens, by
 *    replacing the process-wide default exception handler.
 *  - a **frozen main thread** (an ANR-shaped hang — the process is alive but
 *    stops responding to input/rendering) throws nothing to catch, so a
 *    second thread has to notice the main thread stopped ticking.
 *
 * Both funnel into the same two actions: persist a pending report (Prefs
 * survives a crash/reboot; an HTTP call attempted from a process that is
 * mid-crash, or about to lose power on reboot, is the least reliable place
 * to make one succeed — the same reasoning `LAST_URL`'s "resume after
 * crash/reboot" comment already documents for on-device state) and recover.
 * Recovery differs by failure mode: a crash relaunches the launcher activity
 * in a fresh task (the crashed activity's own state is what failed, so a
 * different activity instance is enough); a frozen main thread gets a full
 * device reboot (Device Owner only) — a hang this watchdog could not clear
 * by posting to that same main thread is not going to clear by asking it to
 * start yet another activity.
 */
object Watchdog {
    private const val TICK_MS = 5_000L
    private const val CHECK_INTERVAL_MS = 15_000L
    private const val STUCK_THRESHOLD_MS = 45_000L
    private const val RELAUNCH_DELAY_MS = 700L
    private const val MAX_DETAIL_LENGTH = 500

    @Volatile private var lastTickMs = SystemClock.elapsedRealtime()
    @Volatile private var installed = false

    /** Call once from KioskApp.onCreate() — installs both detectors. */
    fun install(app: Context) {
        if (installed) return
        installed = true
        val appCtx = app.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                recordPending(appCtx, "crash", throwable.message ?: throwable.toString())
                scheduleRelaunch(appCtx)
            } catch (_: Throwable) {
                // A failure inside the crash handler must never prevent the
                // process from actually dying below — the OS's own restart
                // (or the scheduled relaunch, if it got far enough to be set)
                // is the fallback either way.
            }
            if (previous != null) {
                previous.uncaughtException(thread, throwable)
            } else {
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }

        startStuckWatch(appCtx)
    }

    /** Immediately schedules a fresh launch of the launcher activity, bypassing whatever the crashing activity was doing. */
    private fun scheduleRelaunch(ctx: Context) {
        val intent = Intent(ctx, LockTaskActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        val pending = PendingIntent.getActivity(
            ctx, 0, intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + RELAUNCH_DELAY_MS, pending)
    }

    /** Called from a steady main-thread beat; a frozen main thread simply stops calling this. */
    private fun tick() {
        lastTickMs = SystemClock.elapsedRealtime()
    }

    private fun startStuckWatch(ctx: Context) {
        val ui = Handler(Looper.getMainLooper())
        val ticker = object : Runnable {
            override fun run() {
                tick()
                ui.postDelayed(this, TICK_MS)
            }
        }
        ui.post(ticker)

        Thread {
            while (true) {
                try {
                    Thread.sleep(CHECK_INTERVAL_MS)
                    val stuckFor = SystemClock.elapsedRealtime() - lastTickMs
                    if (stuckFor > STUCK_THRESHOLD_MS) {
                        recordPending(ctx, "anr_reboot", "main thread frozen for ${stuckFor}ms")
                        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                        if (dpm.isDeviceOwnerApp(ctx.packageName)) {
                            val admin = ComponentName(ctx, KioskDeviceAdminReceiver::class.java)
                            try { dpm.reboot(admin) } catch (_: Exception) {}
                        }
                        // Reset the clock so a reboot that is slow to actually
                        // happen (or silently fails on some OEM build) does not
                        // spin calling reboot() every check interval in a loop.
                        lastTickMs = SystemClock.elapsedRealtime()
                    }
                } catch (_: InterruptedException) {
                    return@Thread
                } catch (_: Exception) {
                    // A failure in the watch loop itself must not kill the
                    // thread that is the only thing detecting the freeze.
                }
            }
        }.apply { isDaemon = true; name = "kiosk-watchdog" }.start()
    }

    private fun recordPending(ctx: Context, reason: String, detail: String?) {
        Prefs.set(ctx, Prefs.PENDING_WATCHDOG_REASON, reason)
        Prefs.set(ctx, Prefs.PENDING_WATCHDOG_DETAIL, (detail ?: "").take(MAX_DETAIL_LENGTH))
    }

    /**
     * Call once at process start (KioskApp.onCreate(), after install()) to
     * flush any report a crash/reboot left behind in Prefs. Fire-and-forget,
     * same shape as AgentClient's other device-facing reports: a report that
     * never reaches the server is a missed alert, not a broken kiosk.
     */
    fun flushPendingReport(ctx: Context) {
        val reason = Prefs.get(ctx, Prefs.PENDING_WATCHDOG_REASON)
        if (reason.isEmpty()) return
        val detail = Prefs.get(ctx, Prefs.PENDING_WATCHDOG_DETAIL)
        Prefs.set(ctx, Prefs.PENDING_WATCHDOG_REASON, "")
        Prefs.set(ctx, Prefs.PENDING_WATCHDOG_DETAIL, "")
        if (!Prefs.isEnrolled(ctx)) return
        AgentClient.reportWatchdog(ctx, reason, detail.ifEmpty { null })
    }
}
