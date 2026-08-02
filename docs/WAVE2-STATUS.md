# גל 2 — סטטוס ומה חסם

## מה בוצע בפועל מול מסד הנתונים החי (Supabase)

פרויקט: `uhnrgujbdxhhmoxcjria` · הרצה דרך מחבר Supabase MCP.

- **הוחלה הסכימה הקנונית המלאה** (`0001_init.sql`) — 30+ טבלאות kesef, בתוספת בלבד, **בלי לגעת** ב-~30 הטבלאות הקיימות של פרויקטים אחרים באותו מסד (אומת אפס התנגשויות שמות מראש).
- **אומת הטריגר** `trg_alert_publication` — ניסיון להכניס דגל `high` פומבי בלי `notified_at` נדחה כצפוי (משימה 4 ✓).
- **הוחל חיזוק אבטחה** (`0002_public_read_rls.sql`) — RLS עם קריאה-ציבורית-בלבד על טבלאות הנתונים; anon **קורא** אך **לא כותב** (אומת חי: משימה 5 ✓). כתיבה נשארת ל-service-role (jobs) בלבד.
- **נרשמו 7 מקורות נתונים** ב-`data_source` (מטא-דאטה מאומתת מחלק ח').

## מה נבנה בקוד (מוכן לריצה)

- `packages/ingest/datagov.ts` — מחבר data.gov.il: `package_show`, `datastore_search` עם עימוד, rate-limit של בקשה לשנייה, User-Agent מזוהה, hook לארכוב גולמי. **אינו משתמש ב-`datastore_search_sql`** (403). נבדק ביחידה.
- `packages/normalize/schema-drift.ts` — מיפוי סחיפת הסכימה בין שנים (מלכודת 1). כולל את **הבדיקה השלילית** שהמסמך דורש: join נאיבי מייצר תוצאה שגויה, המפה מתקנת (משימה 16 ✓ ברמת הלוגיקה).
- `packages/normalize/validation.ts` — 7 כללי הוולידציה, עם בדיקות יחידה (משימה 18 ✓ ברמת הלוגיקה).

## מה חוסם טעינת נתוני אמת מהסביבה הזו

מדיניות הרשת של הסביבה **חוסמת גישה יוצאת** לכל מקורות הממשלה וגם ל-Supabase מזמן-ריצה:

```
data.gov.il:443      → connect_rejected (403 policy denial)
next.obudget.org:443 → connect_rejected
www.btl.gov.il:443   → connect_rejected
www.cbs.gov.il:443   → connect_rejected
*.supabase.co:443    → connect_rejected (מזמן-ריצה; מחבר ה-MCP עובד בנתיב נפרד)
```

מותר יוצא רק: npm, pypi, Anthropic, מחבר Supabase (MCP), GitHub.

**כדי לטעון נתוני אמת ולהריץ את האפליקציה מול ה-DB**, יש להגדיר לסביבה מדיניות רשת שמתירה לפחות:
`*.supabase.co`, `data.gov.il`, `next.obudget.org`, `www.btl.gov.il`, `www.cbs.gov.il`
(ראו https://code.claude.com/docs/en/claude-code-on-the-web — מדיניות הרשת נקבעת ביצירת הסביבה).

## מה נדרש עוד להרצה מלאה של הטעינה

- `SUPABASE_SERVICE_ROLE_KEY` ב-`.env.local` — כדי שסקריפטי הטעינה יכתבו ל-DB (הכתיבה חסומה ל-anon בכוונה).
- `ANTHROPIC_API_KEY` — לגל 4 (סוכן).
