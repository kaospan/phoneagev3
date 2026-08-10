# Phoneage Android (Capacitor)

This folder contains the Android wrapper for the Phoneage web app, built with Capacitor.

Capacitor is not a backend stack. It is a native container + plugin bridge that runs your existing web app inside an Android WebView. Your backend (if any) is whatever your web app already uses (REST, WebSocket, Firebase, etc.).

## Prereqs

- Node.js 20+
- Android Studio
- Android SDK + platform tools
- JDK 17 (required for Gradle + Android Gradle Plugin 8.x)

## Fix: "class file version 61.0 ... up to 55.0" (Java 11 vs 17)

If Android Studio / Gradle shows:

> `LintModelSeverity ... class file version 61.0 ... only recognizes up to 55.0`

That means Gradle is running on **Java 11** (55) but the Android Gradle Plugin needs **Java 17** (61).

Do this:

1. Install JDK 17 (Temurin / Adoptium recommended).
2. In Android Studio: `Settings` -> `Build, Execution, Deployment` -> `Build Tools` -> `Gradle`
   - Set **Gradle JDK** to **JDK 17**
3. Re-sync and rebuild.

Quick verify in PowerShell:

```powershell
java -version
```

It should show `17.x`.

## One-time setup

From repo root:

```powershell
cd apps/android
npm install
npm run cap:add
```

## Sync latest web build into Android

From repo root:

```powershell
npm run build
npm run android:sync
```

Or, if you prefer running Capacitor commands directly:

```powershell
cd apps/android
npm run sync:web
npm run cap:sync
```

## Open in Android Studio

```powershell
npm run android:open
```
