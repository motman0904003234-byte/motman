#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$ROOT/frontend"
npm run build
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
OUT="$ROOT/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
cp -f "$OUT" /opt/cursor/artifacts/motman-debug.apk
echo "APK=$OUT"
ls -lah "$OUT" /opt/cursor/artifacts/motman-debug.apk