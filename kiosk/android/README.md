# KioskFleet Agent — אפליקציית האנדרואיד

אפליקציית הקיוסק שרצה על הטאבלט. היא **כללית**: אינה נעולה לאתר מסוים מראש —
בזמן הרישום היא מקבלת מהשרת את הכתובת (`home_url`) ואת הדומיין המורשה
(`allowed_host`), ומאותו רגע נשלטת מרחוק ממערכת הניהול.

## מה היא עושה
- WebView נעול לדומיין שהוקצה לה מהשרת
- הפעלה אוטומטית עם אתחול המכשיר + מסך תמיד דלוק (WakeLock)
- Lock Task Mode (חסימת Home/Back/Recents) כשהאפליקציה היא **Device Owner**
- חיבור WebSocket חי לשרת + heartbeat כל דקה (כולל דיווח סוללה/גרסה/דגם)
- ביצוע פקודות מרחוק: `reload`, `set_url`, `screen_on`, `screen_off`,
  `clear_cache`, `lock`, `unlock`, `message`, `reboot`, `update_config`
- כניסת תחזוקה מקומית: 5 נגיעות בפינה שמאל-עליונה + קוד תחזוקה

## בנייה

דורש **Android Studio** (Hedgehog ואילך) או Gradle 8.5+ עם JDK 17.

```bash
# מתוך android/ — ב-Android Studio: File → Open → בחר תיקייה זו.
# Android Studio ייצר אוטומטית את ה-gradle wrapper בעת הסנכרון.

# לבנייה מהטרמינל (אם מותקן gradle):
gradle wrapper            # פעם אחת, ליצירת ./gradlew
./gradlew assembleRelease # → app/build/outputs/apk/release/app-release.apk
```

לגרסת הפצה חתומה: **Build → Generate Signed Bundle / APK → APK → release**.

## התקנה על מכשיר

```bash
adb install -r app-release.apk
```

בהפעלה הראשונה האפליקציה מבקשת **כתובת שרת** (למשל `https://panel.kioskfleet.com`)
ו**קוד רישום** בן 6 תווים שנוצר במערכת הניהול. לאחר הרישום המכשיר ננעל ומתחיל לדווח.

## הפעלת Lock Task (Device Owner) — נעילה הרמטית

מבצעים **פעם אחת** על מכשיר נקי (ללא חשבון Google):

```bash
adb shell dpm set-device-owner com.kioskfleet.agent/.KioskDeviceAdminReceiver
```

ראו את המדריך המלא בעברית: [`../docs/user-guide-he.md`](../docs/user-guide-he.md).

> הערה: ללא Device Owner האפליקציה עדיין נועלת את התצוגה (immersive + WebView
> filter + הפעלה אוטומטית), אך כפתורי המערכת אינם חסומים לחלוטין. Device Owner
> הוא מה שהופך אותה לקיוסק שלא ניתן לצאת ממנו ללא הרשאה.

## התקנה אופליין מוחלטת (Route D — USB, בלי אינטרנט כלל)

במקום התהליך הרגיל למעלה (שדורש שהמכשיר יפנה לשרת ברשת כדי לממש את קוד
הרישום), הלקוח יכול ליצור **חבילת התקנה אופליין** מהקונסולה: הקצאת קוד רישום
כרגיל, ואז "📦 חבילת USB אופליין" עם מספר סידורי המכשיר (`adb devices`).
המערכת מנפיקה מיד טוקן למכשיר ומייצרת סקריפט `.sh` שמריצים עם המכשיר מחובר
ב-USB — **גם המחשב וגם המכשיר יכולים להיות ללא אינטרנט לגמרי** לאורך כל
התהליך. הסקריפט מתקין את ה-APK, דוחף את התצורה (כולל הטוקן) ישירות לתיקיית
האחסון הפרטית של האפליקציה (`adb push`), מגדיר Device Owner ומפעיל את
הקיוסק — `EnrollActivity` קולט את הקובץ הזה בהפעלה הראשונה במקום לפנות
לרשת. פרטים: `server/src/usbpackage.js`.
