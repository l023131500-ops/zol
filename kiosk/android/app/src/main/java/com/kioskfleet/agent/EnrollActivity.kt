package com.kioskfleet.agent

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * First-run screen. Normally the installer enters the server address (once)
 * and the 6-character enrollment code from the management console, and the
 * device registers by its serial and receives a device token + its kiosk
 * config over the network (`enroll()` below).
 *
 * KIOSK_BUILD.md §3 Route D (fully offline USB install) cannot use that path
 * — §10-D requires zero internet at the venue, and this device's token is
 * already minted server-side before the technician ever leaves the desk
 * (see usbpackage.js). Instead, its generated script `adb push`es the exact
 * same response envelope `enroll()` would have received onto the device's
 * own app-specific storage, and [applyOfflineConfigIfPresent] picks it up
 * here — same parsing as the network path (`applyEnrollResult`), so the two
 * can never drift apart on which fields get applied.
 */
class EnrollActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Already enrolled → go straight to kiosk.
        if (Prefs.isEnrolled(this)) { goKiosk(); return }

        // A Route D script may have pushed our config before this ever ran.
        if (applyOfflineConfigIfPresent()) { goKiosk(); return }

        val pad = (24 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#071a33"))
        }

        fun label(t: String) = TextView(this).apply {
            text = t; setTextColor(Color.WHITE); textSize = 15f
            setPadding(0, pad / 2, 0, 4)
        }
        fun input(hint: String) = EditText(this).apply {
            this.hint = hint; setHintTextColor(Color.parseColor("#88a"))
            setTextColor(Color.WHITE); setBackgroundColor(Color.parseColor("#0d284a"))
            setPadding(pad / 2, pad / 2, pad / 2, pad / 2)
        }

        root.addView(TextView(this).apply {
            text = "רישום מכשיר לקיוסק"; setTextColor(Color.WHITE); textSize = 26f
            gravity = Gravity.CENTER; setPadding(0, 0, 0, pad)
        })

        root.addView(label("כתובת שרת הניהול"))
        val serverInput = input("https://panel.kioskfleet.com").apply {
            setText(Prefs.get(this@EnrollActivity, Prefs.SERVER_URL))
        }
        root.addView(serverInput)

        root.addView(label("קוד רישום (6 תווים)"))
        val codeInput = input("ABC123").apply {
            filters = arrayOf(android.text.InputFilter.LengthFilter(6),
                android.text.InputFilter.AllCaps())
        }
        root.addView(codeInput)

        val status = TextView(this).apply {
            setTextColor(Color.parseColor("#ffd27f")); setPadding(0, pad / 2, 0, 0)
        }

        val btn = Button(this).apply {
            text = "רישום והפעלה"; textSize = 17f
            setBackgroundColor(Color.parseColor("#2f6bff")); setTextColor(Color.WHITE)
            setPadding(0, pad / 2, 0, pad / 2)
        }
        root.addView(btn)
        root.addView(status)
        setContentView(root)

        btn.setOnClickListener {
            val server = serverInput.text.toString().trim().trimEnd('/')
            val code = codeInput.text.toString().trim().uppercase()
            if (server.isEmpty() || code.length != 6) {
                status.text = "נא למלא כתובת שרת וקוד תקין"; return@setOnClickListener
            }
            btn.isEnabled = false; status.text = "מבצע רישום…"
            Thread {
                val result = enroll(server, code)
                runOnUiThread {
                    if (result == null) {
                        Prefs.set(this, Prefs.SERVER_URL, server)
                        goKiosk()
                    } else { status.text = result; btn.isEnabled = true }
                }
            }.start()
        }
    }

    /** Returns null on success, or an error message. */
    private fun enroll(server: String, code: String): String? {
        return try {
            val body = JSONObject()
                .put("code", code)
                .put("serial", Prefs.serial(this))
                .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                .put("androidVersion", Build.VERSION.RELEASE)
                .put("appVersion", BuildConfig.VERSION_NAME)
                .toString()
            val conn = (URL("$server/api/agent/enroll").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 12000; readTimeout = 12000
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val ok = conn.responseCode in 200..299
            val text = (if (ok) conn.inputStream else conn.errorStream).bufferedReader().readText()
            val json = JSONObject(text)
            if (!ok) return json.optString("error", "רישום נכשל (${conn.responseCode})")
            applyEnrollResult(json)
            null
        } catch (e: Exception) {
            "שגיאת רשת: ${e.message}"
        }
    }

    /**
     * Persists the `{ deviceToken, device: {...} }` envelope both the
     * network `/api/agent/enroll` response and the Route D offline file
     * share. Kept as the one place that decides which fields survive to
     * Prefs, so the two entry points cannot silently diverge.
     */
    private fun applyEnrollResult(json: JSONObject) {
        Prefs.set(this, Prefs.DEVICE_TOKEN, json.getString("deviceToken"))
        val dev = json.getJSONObject("device")
        Prefs.set(this, Prefs.HOME_URL, dev.optString("homeUrl"))
        Prefs.set(this, Prefs.ALLOWED_HOST, dev.optString("allowedHost"))
        Prefs.set(this, Prefs.IDLE_RETURN, dev.optInt("idleReturnSeconds", 0).toString())
        Prefs.set(this, Prefs.DEVICE_NAME, dev.optString("name"))
        Prefs.set(this, Prefs.LAST_URL, dev.optString("homeUrl"))
        Prefs.set(this, Prefs.ADMIN_CODE, dev.optString("adminCode"))
        Prefs.set(this, Prefs.DISPLAY_ZOOM, dev.optInt("displayZoomPercent", 100).toString())
        Prefs.set(this, Prefs.DISPLAY_ORIENTATION, dev.optString("displayOrientation", "landscape"))
        Prefs.set(this, Prefs.APPROVED_CLIENTS, dev.optJSONArray("approvedClients")?.toString() ?: "[]")
    }

    /**
     * KIOSK_BUILD.md §3 Route D: looks for the file the generated `adb
     * push` install script writes into this app's own app-specific external
     * storage — `getExternalFilesDir(null)`, the one directory Android lets
     * an app read/write with no storage permission on any API level, and
     * that `adb push` can already reach because it is the app's own,
     * without the app ever needing to have requested anything. Reachable
     * only pre-enrollment, from [onCreate] — a real device_token already in
     * Prefs always wins, so a stray leftover file can never re-enroll a
     * device that has since been reset onto a different account.
     *
     * The file is deleted only after it parses and applies cleanly, not on
     * a bad read — a null return here just falls through to the normal
     * manual-code screen, and the file stays in place for the installer to
     * inspect (`adb pull`) rather than silently vanishing.
     */
    private fun applyOfflineConfigIfPresent(): Boolean {
        val dir = getExternalFilesDir(null) ?: return false
        val file = File(dir, OFFLINE_CONFIG_FILENAME)
        if (!file.exists()) return false
        return try {
            val json = JSONObject(file.readText())
            applyEnrollResult(json)
            file.delete()
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun goKiosk() {
        startActivity(Intent(this, LockTaskActivity::class.java))
        finish()
    }

    companion object {
        // Must match usbpackage.js's OFFLINE_CONFIG_PATH basename exactly —
        // that generator and this reader are the two ends of the same file.
        private const val OFFLINE_CONFIG_FILENAME = "offline_enroll.json"
    }
}
