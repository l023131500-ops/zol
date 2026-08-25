// KIOSK_BUILD.md §2★ב "כפתור 'הפעל' → אשף התקנה עם צ'קליסט חי" — explicitly
// marked "מחייב, גובר על כל השאר" (mandatory, overrides everything else) in
// the spec, and was entirely unbuilt: viewGuide() in app.js is a single
// static page with no relationship to any specific enrollment code, no
// checkboxes, and no per-step "what to click / what should appear" text. An
// owner generating a code today sees only the bare code in a chip — every
// install step after that is memory or a second read of a separate guide.
//
// Route-aware, ordered install steps for the three routes an *enrollment
// code* actually carries a device through — B (ADB, the original/primary
// route), A (QR/zero-touch), D (USB-offline). Route C (Windows) is
// deliberately excluded: windows-package.js's own route already establishes
// that Windows never goes through an enrollment code at all (it provisions
// straight from an existing device row's fields), so there is no enrollment
// checklist for it to attach to.
//
// Pure/dependency-free, like accesscode.js/exitcode.js/payment.js — no
// db.js/express import, exercised directly in a checkout with no
// better-sqlite3 installed.

export const INSTALL_ROUTES = ['B', 'A', 'D'];

const ROUTE_LABELS = {
  B: 'אנדרואיד גנרי/סיני — ADB (מסלול B, העיקרי)',
  A: 'אנדרואיד עם Google — QR / Zero-touch (מסלול A)',
  D: 'USB אופליין מוחלט (מסלול D)',
};

// `ctx.code`/`ctx.homeUrl` are interpolated straight into the step text the
// owner reads on-screen — this module never touches the DB itself, so it
// trusts its caller (routes/devices.js) to have already loaded the real
// enrollment row before calling in, the same trust boundary
// qrprovision.js/usbpackage.js's own builders rely on for the same fields.
function stepsForRoute(route, { code = '', homeUrl = '' } = {}) {
  switch (route) {
    case 'B':
      return [
        { id: 'B:1', title: 'התקינו את אפליקציית KioskFleet במכשיר',
          detail: 'העבירו את kioskfleet-agent.apk למכשיר (הורדה/USB/מייל) והתקינו. אם מופיעה אזהרה — אשרו "התקנה ממקור לא ידוע" בהגדרות.',
          expect: 'האפליקציה מופיעה במגירת האפליקציות בשם KioskFleet.' },
        { id: 'B:2', title: 'הזינו את קוד הרישום',
          detail: `פתחו את האפליקציה. במסך הראשון הקלידו את הקוד: ${code || '(צרו קוד רישום קודם)'}`,
          expect: `המכשיר מציג "מחובר" ועובר לכתובת: ${homeUrl || '(הכתובת שהוגדרה)'}` },
        { id: 'B:3', title: 'נעלו כ-Device Owner (מומלץ, לנעילה מלאה ולא ניתנת-לעקיפה)',
          detail: 'חברו למחשב בכבל, ודאו שניפוי USB פעיל (הגדרות → אפשרויות מפתח), והריצו בטרמינל: adb shell dpm set-device-owner com.kioskfleet.agent/.KioskDeviceAdminReceiver',
          expect: 'הטרמינל מציג "Success: Device owner set to package com.kioskfleet.agent".' },
        { id: 'B:4', title: 'ודאו שהמכשיר מופיע בצי',
          detail: 'נתקו את הכבל וחזרו לדשבורד הזה.',
          expect: 'המכשיר מופיע ברשימת המכשירים כ"מחובר", עם השם שבחרתם.' },
      ];
    case 'A':
      return [
        { id: 'A:1', title: 'הפיקו את חבילת ה-QR',
          detail: 'לחצו "📱 QR (מסלול A)" ליד קוד הרישום, והדביקו את ה-JSON שיוצג במחולל QR מקומי/אופליין בלבד — לא מקוון (הוא נושא את קוד הרישום שלכם).',
          expect: 'קוד QR מוכן על המסך/בהדפסה.' },
        { id: 'A:2', title: 'אפסו את המכשיר להגדרות יצרן',
          detail: 'מכשיר חדש-באריזה, או: הגדרות → מערכת → איפוס → איפוס לנתוני יצרן.',
          expect: 'המכשיר מופעל מחדש ומגיע למסך "ברוכים הבאים" הראשוני.' },
        { id: 'A:3', title: 'הקישו 6 פעמים על מסך הפתיחה',
          detail: 'במסך "ברוכים הבאים" הראשון, הקישו 6 הקשות רצופות באותה נקודה על המסך.',
          expect: 'נפתח סורק QR מובנה של אנדרואיד.' },
        { id: 'A:4', title: 'סרקו את קוד ה-QR',
          detail: 'כוונו את מצלמת המכשיר לקוד ה-QR שהכנתם בשלב 1.',
          expect: 'המכשיר מוריד את אפליקציית KioskFleet ומגדיר אותה אוטומטית כ-Device Owner — בלי מגע נוסף.' },
        { id: 'A:5', title: 'המתינו לחיבור הראשוני',
          detail: 'המכשיר יתחבר לרשת (Wi-Fi מהחבילה אם הוגדר) וירשם מול קוד הרישום באופן אוטומטי.',
          expect: 'המכשיר מופיע בדשבורד הזה כ"מחובר".' },
      ];
    case 'D':
      return [
        { id: 'D:1', title: 'אתרו את המספר הסידורי של המכשיר',
          detail: 'חברו את המכשיר למחשב בכבל USB (עם ניפוי USB פעיל) והריצו בטרמינל: adb devices',
          expect: 'מוצגת שורה עם מספר סידורי (Serial) של המכשיר.' },
        { id: 'D:2', title: 'הורידו את חבילת ההתקנה האופליין',
          detail: 'לחצו "📦 USB אופליין" ליד קוד הרישום, הזינו את המספר הסידורי מהשלב הקודם, ולחצו הורדה.',
          expect: 'קובץ kioskfleet-offline-<מספר-סידורי>.sh נשמר במחשב.' },
        { id: 'D:3', title: 'הריצו את חבילת ההתקנה',
          detail: 'בטרמינל: bash kioskfleet-offline-<מספר-סידורי>.sh — המחשב יכול להיות מנותק מהאינטרנט לגמרי.',
          expect: 'הטרמינל מדווח שהאפליקציה הותקנה והוגדרה כ-Device Owner בהצלחה.' },
        { id: 'D:4', title: 'נתקו והפעילו באופן עצמאי',
          detail: 'נתקו את כבל ה-USB.',
          expect: 'המכשיר עולה ישר למצב קיוסק נעול על הכתובת שהוגדרה — בלי שום חיבור לאינטרנט.' },
      ];
    default:
      return null;
  }
}

/**
 * Build the ordered, route-specific checklist for one enrollment.
 * `checkedIds` is a Set (or array) of step ids already marked done — the
 * caller (routes/devices.js) owns persistence, this stays a pure function.
 * Returns null for an unknown route rather than throwing — same
 * "caller decides how to surface a bad route" shape validateExitCode/
 * validatePaymentMode use for a bad value, since this is reachable straight
 * from a query-string param.
 */
export function buildChecklist(route, ctx, checkedIds = []) {
  const steps = stepsForRoute(route, ctx);
  if (!steps) return null;
  const checked = checkedIds instanceof Set ? checkedIds : new Set(checkedIds);
  const withState = steps.map((s) => ({ ...s, checked: checked.has(s.id) }));
  return {
    route,
    label: ROUTE_LABELS[route],
    steps: withState,
    allDone: withState.every((s) => s.checked),
  };
}

// Whether `stepId` is a real step of `route` — the one thing routes/devices.js
// needs before trusting a client-supplied step id enough to write it to the
// DB (a bare `route_id.startsWith(route + ':')` check would accept
// "B:99999", which is never a real step).
export function isValidStep(route, stepId) {
  const steps = stepsForRoute(route, {});
  return !!steps && steps.some((s) => s.id === stepId);
}
