# releases/

Drop the signed Android agent build here as `kioskfleet-agent.apk` after
running `./gradlew assembleRelease` (or Generate Signed Bundle/APK) in
`android/` — see `android/README.md`.

The server serves this directory at `/downloads` whenever it exists
(`src/index.js`), so the file becomes reachable at
`/downloads/kioskfleet-agent.apk` — exactly what the console's install
wizard (`viewEnroll`/`openInstallWizard` in `public/js/app.js`) links to —
with no code change or redeploy needed. Until the file is placed here, that
link 404s like any other missing static asset.
