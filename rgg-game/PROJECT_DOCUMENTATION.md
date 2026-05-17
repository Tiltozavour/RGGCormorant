# RGG Game / Cormorant Society: документация проекта

Дата актуализации: 2026-05-17.

## 1. Назначение

`rgg-game` - браузерное React SPA для синхронной party-игры Cormorant Society.

Приложение покрывает:

- регистрацию и вход через Firebase Auth;
- инвайты через Firestore collection `invites`;
- общую карту с фишками игроков;
- фазы партии, результаты, голосование и очередь ходов;
- броски кубика и анимированное движение;
- колесо выбора мини-игры;
- карточную систему с рукой, B-Shop, Gambling, защитами, отражением, налогами, дуэлями и легендарными призами;
- галерею артефактов и коллекцию легенд;
- админские действия: фазы, результаты, карты, монеты, reset, event log, кастомные дуэли;
- синхронизацию состояния между игроками через Cloud Firestore.

Отдельное описание правил лежит в `GAME_MECHANICS.md`.

## 2. Стек

- React `19.2.4`
- TypeScript `~5.9.3`
- Vite `8.0.1`
- Tailwind CSS `4.2.2`
- Firebase `12.11.0`
- ESLint `9.39.4`
- Vitest `4.1.6`

Серверной части в репозитории пока нет. Firebase выступает как backend, поэтому Firestore rules и аккуратные клиентские транзакции критичны.

## 3. Запуск

Установка:

```bash
npm install
```

Создать локальный env:

```powershell
Copy-Item .env.example .env.local
```

Заполнить `.env.local`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_ENV=development
```

Dev server:

```bash
npm run dev
```

Проверки:

```bash
npm test
npm run lint
npm run build
```

Production preview:

```bash
npm run preview
```

## 4. Скрипты

- `npm run dev` - Vite dev server.
- `npm run build` - TypeScript build и production build Vite.
- `npm run lint` - ESLint.
- `npm test` - Vitest unit tests.
- `npm run preview` - preview production build.
- `npm run assets:check-external` - проверка внешних URL у карточных/аватарных ассетов.
- `npm run seed:cards` - upsert стартовых `cards` и `prizes`.
- `npm run seed:cards:reset` - очистить `cards`/`prizes`, затем seed.
- `npm run reset:dev` - полный dev reset Firestore с предохранителями.
- `npm run predeploy` - production build перед публикацией.
- `npm run deploy` - публикация `dist` на GitHub Pages через `gh-pages`.

## 5. Firebase

Основные коллекции:

- `players` - профили игроков и runtime-поля.
- `gameState/current` - состояние партии.
- `gameEvents` - лог событий.
- `cards` - обычные карты.
- `prizes` - легендарные карты.
- `wheel` - список игр для колеса.
- `game_settings/wheel` - runtime-состояние колеса.
- `invites` - инвайты.

Поле `wheel/{gameId}.url` опционально. Если оно задано, строка игры в списке колеса открывает ссылку в новой вкладке.

## 6. Firestore rules

Правила лежат в:

- `firestore.rules`

Подключение:

- `firebase.json`

Деплой:

```bash
firebase deploy --only firestore:rules
```

На первом живом запуске используются более мягкие правила, где `gameState` открыт для записи авторизованным пользователям. Это сделано как рабочий компромисс, потому что большая часть логики пока исполняется на клиенте.

Долгосрочная цель:

- перенести критичные операции в callable/backend handlers;
- сузить Firestore rules после переноса каждого slice.

Кандидаты на перенос:

1. `playCard`
2. `respondToCard`
3. `resolveInteraction`

## 7. Структура проекта

```text
src/
  main.tsx
  AppClean.tsx
  firebase.ts
  index.css
  i18n/
    ru.ts
  components/
    AppClean.tsx
    AdminDialog.tsx
    Auth.tsx
    BottomPanel.tsx
    EventLog.tsx
    GameAlertOverlay.tsx
    GameBoard.tsx
    GameCard.tsx
    GameWheel.tsx
    InteractionPendingOverlay.tsx
    PlayersSidebar.tsx
    ProfileSidebar.tsx
    ScoresDetailsPage.tsx
    ShopAndGamblingOverlays.tsx
    TaxResponseOverlay.tsx
    ToastContainer.tsx
    DiceVisual.tsx
    DuelDiceVisual.tsx
    useGameData.ts
    useFirestoreSubscriptions.ts
    useEventLogger.ts
    useModalStates.ts
    adminHandlers.ts
    cardHandlers.ts
    cardEffectRules.ts
    cardPlayPatches.ts
    cardPlayTransactions.ts
    cardTargetRules.ts
    cardUseGuards.ts
    duelHandlers.ts
    eventLogPolicy.ts
    interactionCardPicker.ts
    legendaryHandlers.ts
    taxHandlers.ts
    turnHandlers.ts
    wheelHandlers.ts
    gameConstants.ts
    gameList.ts
    gameMap.ts
    scoreUtils.ts
    starterCards.json
  services/
    gameStateService.ts
  shared/
    playCardContract.ts
  types/
    card.ts
    cardService.ts
    duel.ts
    game.ts
tests/
scripts/
```

## 8. Основные модули

- `useGameData.ts` - главный hook игровой логики. Все еще крупный, постепенно дробится.
- `AppClean.tsx` - основной layout и overlay. Все еще крупный, постепенно дробится.
- `GameBoard.tsx` - поле, фишки, движение, колесо.
- `GameWheel.tsx` - колесо и список игр; поддерживает read-only режим.
- `ShopAndGamblingOverlays.tsx` - B-Shop и Gambling overlay.
- `TaxResponseOverlay.tsx` - ответ на налоги.
- `cardUseGuards.ts` - проверка возможности использовать карту.
- `cardTargetRules.ts` - выбор целей для карт.
- `cardEffectRules.ts` - правила отражения и расчет отдельных эффектов.
- `interactionCardPicker.ts` - общий выбор карт для B-Shop/Gambling.
- `taxHandlers.ts` - helper-логика налогов.
- `turnHandlers.ts` - очередь ходов и золотая карта.
- `legendaryHandlers.ts` - выдача и уникальность легендарок.
- `wheelHandlers.ts` - логика прокрутки/Fish для колеса.
- `eventLogPolicy.ts` - дедупликация и политика записи событий.

## 9. UI-состояние

Правый сайдбар содержит:

- профиль игрока;
- коллекцию легенд;
- галерею артефактов;
- информационное колесо;
- админские действия, если роль `admin`.

Галереи:

- не показывают кнопку использования карты;
- админ видит актуальное состояние, а не все раскрытые карты;
- длинные описания легенд должны помещаться через внутреннюю прокрутку карточки.

Колесо:

- в игровом режиме может крутиться админом;
- у игроков могут появляться карточки `inv_017` / `inv_006` около колеса, если они доступны;
- в read-only режиме показывает только колесо и список игр.

## 10. Уведомления и логи

Уведомления показываются через:

- `player.lastNotification`;
- `gameState.notifications[userId]`;
- локальные toast-уведомления.

Повторный показ после обновления страницы предотвращается локальным `localStorage`-списком просмотренных notification keys.

`gameEvents` остаются в Firestore и могут расходовать quota. Очистка event log доступна админу.

## 11. Тесты

Покрыты pure/business helpers:

- `cardUseGuards`
- `cardTargetRules`
- `cardPlayPatches`
- `playCardContract`
- `interactionCardPicker`
- `taxHandlers`
- `turnHandlers`
- `legendaryHandlers`

Актуальный статус:

- 10 test files.
- 33 tests.

## 12. Известные технические долги

- `useGameData.ts` все еще слишком большой.
- `AppClean.tsx` все еще перегружен overlay-логикой.
- Часть UI-текстов еще hardcoded и не вынесена в `src/i18n/ru.ts`.
- Firestore rules пока компромиссные для клиентской архитектуры.
- `gameEvents` и уведомления продолжают писать в Firestore.
- Мобильная адаптация не завершена.
- Медиа еще можно оптимизировать.

## 13. Перед запуском

Минимальный checklist:

```bash
npm test
npm run build
npm run lint
npm run assets:check-external
```

Также проверить:

- в Firebase опубликованы рабочие правила;
- в `wheel` у игр есть `name`, `active`, при необходимости `image` и `url`;
- в `cards` и `prizes` загружены актуальные данные из `starterCards.json`;
- у админа роль `admin`;
- event log очищен, если нужен чистый старт.
