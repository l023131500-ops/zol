# כסף — פלטפורמת שקיפות תקציבית לרשויות מקומיות

> פלטפורמה שמתרגמת את כל הכסף הציבורי שזורם אל רשות מקומית ומתוכה לשפה של תושב יחיד:
> כמה מגיע, כמה הגיע בפועל, ומה נתקע בדרך. **המערכת מציגה מה פורסם, לא מה קרה.**
> פיילוט: חצור הגלילית.

מסמך זה הוא ה-monorepo שנבנה לפי מסמך האפיון היחיד והמלא (`SPEC`). המימוש מתקדם
לפי תוכנית הבנייה של 42 המשימות, גל אחר גל.

## מבנה הריפו

```
kesef-platform/
├── apps/web/            # Next.js 15 (App Router) — אתר תדמית + אפליקציה + /admin
├── packages/
│   ├── ui/              # מערכת העיצוב ורכיבי הליבה (RTL, נגישות)
│   ├── db/              # סכימת Postgres מלאה (migrations) + client מוטפס + בדיקות RLS
│   ├── ingest/          # מחברים למקורות נתונים        (גל 2)
│   ├── normalize/       # נרמול, מיפוי קידודים, הצלבה    (גל 2)
│   ├── metrics/         # מדדים, קבוצות שווים, דגלים     (גל 3)
│   └── agent/           # סוכן AI מעוגן, RAG, MCP         (גל 4)
├── .github/workflows/   # CI: typecheck · lint · test · build · axe-core
└── IDEAS.md             # רעיונות שנדחו לגל הבא
```

## הסטאק

Next.js 15 · React 19 · TypeScript strict · Tailwind CSS · Supabase (Postgres + Auth + RLS) ·
Recharts / D3 · MapLibre · Cloudflare R2 · Anthropic API · Vitest · Playwright · axe-core.

## פיתוח

```bash
pnpm install
cp .env.example .env.local     # מלא את המשתנים
pnpm dev                       # מרים את apps/web על http://localhost:3000
```

בדיקות ואיכות:

```bash
pnpm typecheck    # TypeScript strict, ללא any
pnpm lint         # ESLint (next/core-web-vitals)
pnpm test         # Vitest (כולל בדיקות מדיניות RLS ותפקידים)
pnpm build        # בניית production
pnpm --filter @kesef/web test:e2e   # Playwright: נגישות + מעקות בטיחות
```

## מסד הנתונים

הסכימה הקנונית נמצאת ב-`packages/db/migrations/0001_init.sql` (כל שינוי בה טעון אישור).
להחלה מול Supabase/Postgres:

```bash
DATABASE_URL=postgres://... pnpm --filter @kesef/db migrate
```

## מעקות בטיחות (תמצית)

- **אין מספר בלי מקור** — `source_document_id` הוא `NOT NULL` בסכימה, וכל מספר בממשק לחיץ למקורו.
- **אין המצאת נתונים** — היעדר פרסום מוצג כ-`<NoData>` באותו משקל ויזואלי, לא מוסתר ולא מומצא.
- **ניסוח עובדתי בלבד** — רשימת מילים אסורות נאכפת על כל `statement_he` (גל 3).
- **נגישות היא תנאי שחרור** — תקן ישראלי 5568 (WCAG 2.0 AA), נאכף ב-CI דרך axe-core.
- **פרטיות** — פרופיל משק הבית נשמר ב-localStorage בלבד ואינו נשלח לשרת.

## מצב הבנייה

**גל 1 — יסודות (הושלם):** monorepo, RTL ותשתית עברית, מערכת עיצוב מלאה, סכימת מסד הנתונים,
תשתית אימות והרשאות (8 תפקידים), שכבת ציות משפטי, אתר תדמית, שלד פורטל ניהול, עמודי איכות
ומתודולוגיה, ו-CI. גלים 2–4 (נתוני אמת, מסכים, סוכן) דורשים חיבור למקורות חיצוניים ומפתחות API.
