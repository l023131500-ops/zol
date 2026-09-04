# Deployment — הפעלת שרת KioskFleet

השרת הוא Node.js עצמאי (Express + WebSocket + SQLite). אין שלב build — מריצים
אותו כמו שהוא.

## הרצה מקומית

```bash
cd server
cp .env.example .env      # ערכו את הערכים
npm install
npm start
```

- קונסולת ניהול: `http://localhost:8080/console`
- אתר תדמית:     `http://localhost:8080/`

בהפעלה הראשונה נוצר מנהל‑על לפי `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD`
שב‑`.env`. **החליפו את הסיסמה מיד לאחר ההתחברות.**

## משתני סביבה

| משתנה | תיאור |
|-------|-------|
| `PORT` | פורט ההאזנה (ברירת מחדל 8080) |
| `PUBLIC_URL` | הכתובת הציבורית המלאה. בפרודקשן **חייבת** להיות `https://…` |
| `JWT_SECRET` | מפתח חתימת טוקנים. ייצרו אקראי: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | מנהל‑העל הראשוני |
| `DB_PATH` | נתיב קובץ מסד הנתונים |
| `OFFLINE_AFTER_MINUTES` | אחרי כמה דקות ללא heartbeat מכשיר נחשב מנותק |

## פרודקשן עם HTTPS

הריצו את השרת מאחורי reverse proxy (Nginx / Caddy) עם TLS. דוגמת Caddy:

```
panel.example.com {
    reverse_proxy localhost:8080
}
```

Caddy מנפיק תעודת TLS אוטומטית. ה‑WebSocket עובר דרך אותו proxy ללא הגדרה נוספת.
הגדירו `PUBLIC_URL=https://panel.example.com` והאפליקציה תשתמש ב‑`wss://` אוטומטית.

## Docker

```bash
cd server
docker build -t kioskfleet .
docker run -d --name kioskfleet -p 8080:8080 \
  -e JWT_SECRET=... -e PUBLIC_URL=https://panel.example.com \
  -v $PWD/data:/app/data kioskfleet
```

הנתונים נשמרים ב‑volume בתיקיית `data/`.

## Railway / VPS

- **Railway:** צרו שירות מ‑repo זה, שורש `kiosk/server`, פקודת הפעלה `npm start`,
  והגדירו את משתני הסביבה בלוח הבקרה. הוסיפו volume ל‑`/app/data`.
- **VPS:** התקינו Node 20+, הריצו עם `pm2 start src/index.js --name kioskfleet`,
  והעמידו Caddy/Nginx לפנים.

## גיבוי
גבו את `data/kioskfleet.db` (וקבצי `-wal`/`-shm` הנלווים) באופן קבוע.
