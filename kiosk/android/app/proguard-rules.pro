# Keep OkHttp / Okio (uses reflection for platform features)
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Keep our receivers / activities referenced from the manifest
-keep class com.kioskfleet.agent.** { *; }
