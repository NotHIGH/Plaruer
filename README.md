# Plaruer

2D survival-прототип у сірому туманному світі. Ландшафт із річкою, притокою та мертвими деревами створюється процедурно; зомбі з `Canboil.zip` патрулюють околиці та переслідують гравця поблизу. У браузері відкрийте `index.html`; для Android використовується Capacitor.

## Керування

- Рух: джойстик на екрані або клавіші `W`, `A`, `S`, `D` чи стрілки.
- Атака: кнопка «Удар», клік по світу або `Space`; меч убиває зомбі за три влучання на відстані до 1,7 блока.
- Хотбар: три слоти, перемикання клавішами `1`–`3`; інвентар відкривається кнопкою або клавішею `I`.
- Персонаж і зомбі використовують спрайти з `assets/` та `assets/zombie/`.

## Android

Потрібні Node.js 22+, Android Studio з Android SDK Platform 36 і JDK 21. У налаштуваннях Android Studio виберіть JDK 21 у `Settings > Build Tools > Gradle > Gradle JDK`. Згенерований застосунок підтримує Android 7.0 (API 24) і новіші версії.

1. Виконайте `npm install`.
2. Синхронізуйте гру з Android-проєктом: `npm run android:sync`.
3. Відкрийте проєкт в Android Studio: `npm run android:open`.
4. Зберіть APK в Android Studio або виконайте `npm run android:debug`.

Debug APK буде створено в `android/app/build/outputs/apk/debug/app-debug.apk`.

## GitHub Actions

Workflow збирає debug APK при push у `main`, для pull request у `main` або вручну через вкладку **Actions** → **Android debug APK** → **Run workflow**. Після завершення завантажте `plaruer-debug-apk` у секції **Artifacts** запуску workflow.
