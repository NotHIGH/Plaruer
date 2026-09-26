# Plaruer

Невелика 2D-гра про колонію. У браузері відкрийте `index.html`; для Android використовується Capacitor.

## Керування

- Джойстик на екрані або клавіші `W`, `A`, `S`, `D` чи стрілки.
- Три PNG у `assets/` використовуються як кадри анімації ходьби.

## Android

Потрібні Node.js 22+, Android Studio з Android SDK Platform 36 і JDK 21. У налаштуваннях Android Studio виберіть JDK 21 у `Settings > Build Tools > Gradle > Gradle JDK`. Згенерований застосунок підтримує Android 7.0 (API 24) і новіші версії.

1. Виконайте `npm install`.
2. Синхронізуйте гру з Android-проєктом: `npm run android:sync`.
3. Відкрийте проєкт в Android Studio: `npm run android:open`.
4. Зберіть APK в Android Studio або виконайте `npm run android:debug`.

Debug APK буде створено в `android/app/build/outputs/apk/debug/app-debug.apk`.

## GitHub Actions

Workflow збирає debug APK при push у `main`, для pull request у `main` або вручну через вкладку **Actions** → **Android debug APK** → **Run workflow**. Після завершення завантажте `plaruer-debug-apk` у секції **Artifacts** запуску workflow.
