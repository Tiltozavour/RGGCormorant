# RGG Game / Cormorant Society

Браузерное React-приложение для синхронной party-игры с Firebase Auth, Firestore, игровой картой, карточками, дуэлями и колесом выбора мини-игры.

Подробная документация проекта лежит в [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md).

## Стек

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Firebase Auth
- Cloud Firestore

## Установка

```bash
npm install
```

## Настройка Firebase

Скопируйте пример env-файла:

```bash
cp .env.example .env.local
```

На Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Заполните `.env.local` значениями из Firebase Console:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Клиентский код читает эти переменные через `import.meta.env`. Скрипт `scripts/resetFirebaseState.mjs` использует те же переменные и умеет читать `.env` и `.env.local`.

## Запуск

```bash
npm run dev
```

## Проверки

```bash
npm run lint
npm run build
```

## Firestore Security Rules

Правила Firestore лежат в `firestore.rules`, а `firebase.json` подключает их к проекту.

Деплой правил:

```bash
firebase deploy --only firestore:rules
```

Если Firebase CLI не установлен:

```bash
npm install -g firebase-tools
firebase login
firebase use <your-firebase-project-id>
firebase deploy --only firestore:rules
```

Текущие правила закрывают произвольную запись в `gameState`, защищают админские коллекции и не дают игроку менять служебные поля своего документа вроде `role`. При этом часть runtime-полей `players` и `gameState` остается доступной игрокам, потому что карточные эффекты сейчас выполняются на клиенте. Для более строгой модели эти операции лучше постепенно переносить в Cloud Functions или другой доверенный backend.

## Локализация

Русские UI-тексты постепенно выносятся в `src/i18n/ru.ts`. Новые сообщения, заголовки, подписи кнопок и alert/notification-тексты лучше добавлять туда, а в компонентах использовать `ru.<section>.<key>`. Так проще контролировать UTF-8-кодировку и править тексты без охоты по JSX.

## Preview production-сборки

```bash
npm run preview
```

## Seed И Reset

Для загрузки стартовых `cards` и `prizes` используйте отдельный seed:

```bash
npm run seed:cards
```

Если нужно предварительно очистить `cards` и `prizes`, используйте:

```bash
npm run seed:cards:reset
```

Эта команда тоже считается reset-операцией и требует те же dev-предохранители, что и `reset:dev`.

Для локального/dev-сброса состояния есть отдельная команда:

```bash
npm run reset:dev
```

Она сбрасывает `gameState/current`, игроков, `gameEvents`, `cards` и `prizes`, затем заново загружает карты из `src/components/starterCards.json`.

Dev reset защищен от случайного запуска. В `.env.local` должны быть явно выставлены оба значения:

```env
VITE_FIREBASE_ENV=development
FIREBASE_ALLOW_DEV_RESET=true
FIREBASE_RESET_CONFIRM_PROJECT_ID=your-dev-project-id
```

Если `VITE_FIREBASE_ENV=production` или project id выглядит как production, reset откажется запускаться. Старый вход `node scripts/resetFirebaseState.mjs` оставлен только для совместимости и использует тот же защищенный dev reset.
