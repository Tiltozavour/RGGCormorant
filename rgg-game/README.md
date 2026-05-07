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

## Preview production-сборки

```bash
npm run preview
```

## Сброс состояния Firebase

Осторожно: команда меняет данные в Firestore.

```bash
node scripts/resetFirebaseState.mjs
```

Скрипт сбрасывает `gameState/current`, игроков, коллекции `cards` и `prizes`, затем заново загружает карты из `src/components/starterCards.json`.
