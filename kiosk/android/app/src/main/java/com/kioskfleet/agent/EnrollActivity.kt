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
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * First-run screen. The installer enters the server address (once) and the
 * 6-character enrollment code from the management console. The device then
 * registers by its serial and receives a device token + its kiosk config.
 */
class EnrollActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Already enrolled → go straight to kiosk.
        if (Prefs.isEnrolled(this)) { goKiosk(); return }

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
            Prefs.set(this, Prefs.DEVICE_TOKEN, json.getString("deviceToken"))
            val dev = json.getJSONObject("device")
            Prefs.set(this, Prefs.HOME_URL, dev.optString("homeUrl"))
            Prefs.set(this, Prefs.ALLOWED_HOST, dev.optString("allowedHost"))
            Prefs.set(this, Prefs.IDLE_RETURN, dev.optInt("idleReturnSeconds", 0).toString())
            Prefs.set(this, Prefs.DEVICE_NAME, dev.optString("name"))
            Prefs.set(this, Prefs.LAST_URL, dev.optString("homeUrl"))
            null
        } catch (e: Exception) {
            "שגיאת רשת: ${e.message}"
        }
    }

    private fun goKiosk() {
        startActivity(Intent(this, LockTaskActivity::class.java))
        finish()
    }
}
