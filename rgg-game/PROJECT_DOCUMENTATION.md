# RGG Game / Cormorant Society: документация проекта

## 1. Назначение

`rgg-game` - браузерное React SPA для синхронной party-игры Cormorant Society.

Приложение покрывает:

- регистрацию и вход игроков через Firebase Auth;
- приглашения через Firestore collection `invites`;
- общую карту с фишками игроков;
- фазы партии, результаты, голосование и очередь ходов;
- броски кубика и анимированное движение;
- колесо выбора мини-игры;
- карточную систему с инвентарем, B-Shop, gambling, защитами, налогами, отражением, дуэлями и легендарными призами;
- админские действия: фазы, результаты, карты, монеты, reset, лог событий, кастомные дуэли;
- синхронизацию между участниками через Cloud Firestore.

Серверной части в репозитории нет. Firebase выступает как backend, поэтому Firestore rules и аккуратные клиентские write-сценарии критичны.

## 2. Стек

- React `19.2.4`
- TypeScript `~5.9.3`
- Vite `8.0.1`
- Tailwind CSS `4.2.2` через `@tailwindcss/vite`
- Firebase `12.11.0`
- ESLint `9.39.4`

Основные конфиги:

- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `eslint.config.js`
- `firebase.json`
- `firestore.rules`

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

Запуск dev-сервера:

```bash
npm run dev
```

Проверки:

```bash
npm run lint
npm run build
```

Preview production-сборки:

```bash
npm run preview
```

## 4. NPM-Скрипты

- `npm run dev` - Vite dev server.
- `npm run build` - `tsc -b`, затем production build Vite.
- `npm run lint` - ESLint.
- `npm run preview` - preview production build.
- `npm run seed:cards` - upsert стартовых `cards` и `prizes`.
- `npm run seed:cards:reset` - очистить `cards`/`prizes`, затем seed. Требует dev-предохранители.
- `npm run reset:dev` - полный dev reset состояния Firestore. Требует dev-предохранители.

Старый вход `node scripts/resetFirebaseState.mjs` оставлен для совместимости и вызывает защищенный `reset:dev`.

## 5. Firebase Env

Firebase config вынесен в env и читается в `src/firebase.ts` через `import.meta.env.VITE_FIREBASE_*`.

Node-скрипты читают те же значения из `.env` и `.env.local` через `scripts/firebaseScriptUtils.mjs`.

Файлы:

- `.env.example` - шаблон без реальных ключей.
- `.env.local` - локальные значения, не коммитить.

Firebase client config не является полноценным секретом для frontend-приложения, но нельзя полагаться на скрытие ключей. Безопасность обеспечивается Auth, ролями и Firestore rules.

## 6. Firestore Rules

Правила лежат в:

- `firestore.rules`

Подключение:

- `firebase.json`

Деплой:

```bash
firebase deploy --only firestore:rules
```

Текущая модель:

- читать игровые данные могут авторизованные пользователи;
- `cards`, `wheel`, destructive operations доступны админам;
- игрок не может сам менять `role`, `id`, `createdAt`;
- `gameState/current` больше не открыт через полный `allow write`;
- для текущей клиентской архитектуры оставлены разрешенные runtime-поля `gameState`, которые нужны картам, броскам, дуэлям, уведомлениям и active interactions.

Ограничение: карточная бизнес-логика все еще исполняется на клиенте. Для более строгой безопасности часть операций нужно переносить в Cloud Functions или другой доверенный backend.

## 7. Seed И Reset

### Seed cards/prizes

```bash
npm run seed:cards
```

Команда upsert-ит карты из `src/components/starterCards.json`:

- обычные карты в `cards`;
- легендарные карты в `prizes`.

### Reset cards/prizes

```bash
npm run seed:cards:reset
```

Команда удаляет `cards` и `prizes`, затем заново seed-ит карты. Это reset-операция, поэтому требует предохранители.

### Dev reset

```bash
npm run reset:dev
```

Сбрасывает:

- `gameState/current`;
- игроковые runtime-поля;
- `gameEvents`;
- `cards`;
- `prizes`.

Не сбрасывает:

- Firebase Auth users;
- `login`, `avatar`, `role` игроков;
- `invites`;
- `wheel`;
- `game_settings/wheel`.

### Защита Reset

В `.env.local` нужно явно выставить:

```env
VITE_FIREBASE_ENV=development
FIREBASE_ALLOW_DEV_RESET=true
FIREBASE_RESET_CONFIRM_PROJECT_ID=your-dev-project-id
```

Reset откажется запускаться, если:

- нет `FIREBASE_ALLOW_DEV_RESET=true`;
- `FIREBASE_RESET_CONFIRM_PROJECT_ID` не совпадает с текущим project id;
- `VITE_FIREBASE_ENV=production`;
- project id выглядит как production.

## 8. Структура Проекта

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
    duelHandlers.ts
    turnHandlers.ts
    gameConstants.ts
    gameList.ts
    gameMap.ts
    scoreUtils.ts
    starterCards.json
  services/
    gameStateService.ts
  types/
    card.ts
    cardService.ts
    duel.ts
    game.ts
scripts/
  firebaseScriptUtils.mjs
  seedCards.mjs
  resetDevState.mjs
  resetFirebaseState.mjs
public/
  map.jpg
  icons.svg
  favicon.svg
  cards/
  video/
```

## 9. Точка Входа

- `src/main.tsx` подключает `src/index.css`, создает React root и рендерит `App`.
- `src/AppClean.tsx` - re-export корневого компонента из `src/components/AppClean.tsx`.
- `src/components/AppClean.tsx` - основной экран приложения.

## 10. Основные Firestore Коллекции

### `players/{uid}`

Документ игрока. ID равен Firebase Auth `user.uid`.

Основные поля:

- `id`
- `login`
- `avatar`
- `role`
- `position`
- `prevCell`
- `inGame`
- `tiltCoins`
- `lastTiltoCoins`
- `bonusPoints`
- `inventory`
- `hasProtection`
- `customStatus`
- `statusDuration`
- `discardNextDrawn`
- `redirectNextDrawnToPlayerId`
- `giveNextDrawnToPlayerId`
- `borderColor`
- `lastNotification`
- `createdAt`

### `gameState/current`

Центральное состояние партии.

Ключевые поля:

- `phase`
- `round`
- `currentGame`
- `nextGame`
- `turnOrder`
- `currentTurnIndex`
- `votes`
- `scores`
- `currentResults`
- `gameHistory`
- `goldenCardHolderIds`
- `hotCoinGain`
- `showWheel`
- `currentRoll`
- `currentRollPlayerId`
- `lastBaseRoll`
- `forcedMovePlayerId`
- `cardMove`
- `cardDiceRoll`
- `pendingTaxPayout`
- `rollBonus`
- `rollConfirmed`
- `revealedCards`
- `activeInteraction`
- `activeDuels`
- `notifications`

### `cards`

Обычные карты из `starterCards.json`.

### `prizes`

Легендарные карты. Имеют дополнительные поля:

- `isUnique`
- `isWon`
- `winnerId`

### `gameEvents`

Лог событий. Последние события показываются в `EventLog`.

Типы:

- `card_play`
- `coin_change`
- `movement`
- `status_effect`
- `duel`
- `info`
- `success`
- `warning`
- `error`

### `wheel`

Список игр для колеса:

- `name`
- `image`
- `active`

### `game_settings/wheel`

Синхронное состояние колеса:

- `isSpinning`
- `targetRotation`
- `winnerIndex`
- `previousWinnerIndex`
- `previousTargetRotation`
- `wheelCardStack`
- `lastSpinSource`
- `rerollBy`
- `updatedAt`

### `invites`

Invite-коды для регистрации:

- `code`
- `used`
- `usedBy`

## 11. Авторизация

Компонент:

- `src/components/Auth.tsx`

Логин преобразуется в псевдо-email:

```ts
`${login.trim().toLowerCase()}@cormorant.dev`
```

Регистрация:

1. Игрок вводит логин, пароль, invite code.
2. Клиент ищет invite в `invites`.
3. Если invite существует и не использован, создается Firebase Auth user.
4. Создается `players/{uid}`.
5. Invite помечается как использованный.

Вход:

1. Игрок вводит логин и пароль.
2. Логин превращается в псевдо-email.
3. Firebase Auth выполняет sign in.

## 12. Игровые Фазы

Тип:

- `GamePhase` в `src/types/game.ts`

Порядок:

```text
waiting_game -> playing -> results -> voting -> turn -> next_game
```

Назначение:

- `waiting_game` - подготовка мини-игры.
- `playing` - мини-игра идет.
- `results` - админ вводит результаты.
- `voting` - игроки голосуют за бонус.
- `turn` - движение по карте и карты.
- `next_game` - переход к следующей игре и колесо.

Логика фаз находится в `useGameData.ts` и частично в `BottomPanel.tsx`.

## 13. Карта И Движение

Карта:

- `src/components/gameMap.ts`

Каждая клетка:

```ts
{
  id: number;
  x: number;
  y: number;
  next: number[];
  type: "neutral" | "b-shop" | "gambling";
}
```

Компонент карты:

- `src/components/GameBoard.tsx`

Движение использует:

- `currentRoll`
- `currentRollPlayerId`
- `rollConfirmed`
- `forcedMovePlayerId`
- `cardMove`

После окончания движения `handleMoveComplete` может открыть:

- `activeInteraction.type = "bshop"`;
- `activeInteraction.type = "gambling"`.

## 14. Колесо

Компонент:

- `src/components/GameWheel.tsx`

Данные:

- Firestore `wheel`
- fallback из `src/components/gameList.ts`

Синхронное состояние:

- `game_settings/wheel`

Открытие:

- `gameState/current.showWheel`

Подтверждение результата колеса сейчас выполняется через `writeBatch`:

- выбранная игра становится `active: false`;
- сбрасывается `game_settings/wheel`;
- `gameState/current` переводится в `waiting_game`;
- `currentGame` получает название выбранной игры.

Карточные эффекты колеса:

- `inv_017` - reroll.
- `inv_006` - отмена последней активной карты на колесе.

## 15. Карточная Система

Типы:

- `src/types/card.ts`

Исходные данные:

- `src/components/starterCards.json`

Колоды:

- `inventory`
- `momental`

Редкости:

- `common`
- `rare`
- `epic`
- `legendary`

Действия карт описаны в `CardAction`.

Ключевые группы действий:

- изменение монет;
- движение;
- телепорт;
- защита;
- отражение;
- кража монет;
- кража/сброс карты;
- B-Shop/Gambling;
- дуэли;
- налоги;
- призовые легендарные карты;
- пассивные бонусы.

Основная логика применения карт остается в `useGameData.ts`, но часть helper-логики вынесена в:

- `cardHandlers.ts`
- `turnHandlers.ts`
- `duelHandlers.ts`
- `adminHandlers.ts`

## 16. Active Interactions

Тип:

- `ActiveInteraction` в `src/types/game.ts`

Варианты:

- `gambling`
- `bshop`
- `discard_selection`
- `reflect_response`
- `tax_response`
- `move_for_coins_selection`
- `duel_challenge_response`
- `duel_weapon_selection`
- `duel_betting`
- `duel_ready_to_roll`

UI вынесен частично:

- `ShopAndGamblingOverlays.tsx`
- `TaxResponseOverlay.tsx`
- `InteractionPendingOverlay.tsx`
- часть дуэльных overlay пока остается в `AppClean.tsx`.

## 17. Дуэли

Единый источник типов:

- `src/types/duel.ts`

Реэкспорт для совместимости:

- `src/types/game.ts`
- `src/types/card.ts`

Типы:

- `DuelWeapon = "dice" | "game"`
- `DuelStatus`
- `DuelState`

Статусы:

- `pending`
- `accepted`
- `betting`
- `ready_to_roll`
- `rolling`
- `admin_wait`
- `finished`

`ready_to_roll` - единый актуальный статус. Старый конфликтующий `ready` удален из карточного типа.

## 18. UI И Модалки

Основные компоненты:

- `AppClean.tsx` - главный экран.
- `BottomPanel.tsx` - нижняя панель.
- `PlayersSidebar.tsx` - таблица игроков и админские действия.
- `EventLog.tsx` - лог событий.
- `ToastContainer.tsx` - toast-уведомления.
- `GameAlertOverlay.tsx` - игровое alert-окно.
- `AdminDialog.tsx` - собственная модалка вместо browser `alert`, `confirm`, `prompt`.
- `ShopAndGamblingOverlays.tsx` - B-Shop и Gambling.
- `TaxResponseOverlay.tsx` - налоговый ответ.
- `InteractionPendingOverlay.tsx` - глобальный индикатор ожидания.

Browser dialogs удалены из `src`: `alert`, `confirm`, `prompt` больше не используются.

## 19. Локализация

Русские UI-тексты постепенно переносятся в:

- `src/i18n/ru.ts`

Уже вынесены:

- базовые loading-сообщения;
- event log;
- pending overlay;
- BottomPanel;
- B-Shop/Gambling;
- Tax overlay;
- часть `AppClean` alert/notification;
- тексты `AdminDialog`.

Осталось вынести:

- большую часть игровых логов и notifications из `useGameData.ts`;
- часть текстов `AppClean.tsx`;
- часть текстов `PlayersSidebar.tsx`;
- некоторые подписи в `GameBoard`, `GameWheel`, `GameCard`.

Правило для новых текстов: добавлять в `ru.ts`, в компонентах использовать `ru.<section>.<key>`.

## 20. Событийный Лог

Логирование:

- `src/components/useEventLogger.ts`

UI:

- `src/components/EventLog.tsx`

Админ может очищать лог через `AppClean.tsx`, используется batch delete по чанкам.

## 21. Записи В Firestore

Часть связанных операций переведена на `writeBatch` или `runTransaction`.

Уже улучшено:

- результат колеса;
- сохранение результатов раунда;
- завершение голосования;
- списание карты и добавление в `revealedCards`;
- reflect-offer;
- часть карточных эффектов по монетам и `gameState`;
- часть `deal_with_mage`;
- `judge_coins`.

Дуэли в основном уже используют `runTransaction`.

Остаточный риск: `useGameData.ts` все еще содержит много отдельных `updateDoc` в сложных карточных сценариях. Это лучше продолжать чистить постепенно, сценарий за сценарием.

## 22. Admin Возможности

Админ определяется по:

```ts
playerData?.role === "admin"
```

Основные действия:

- переключение фаз;
- ввод результатов;
- завершение голосования;
- открытие колеса;
- seed/init карт из UI;
- выдача всех карт;
- reset состояния;
- добавление/удаление карт игрокам;
- изменение монет;
- очистка event log;
- решение кастомных дуэлей.

UI админских prompt/confirm заменен на `AdminDialog`.

## 23. Ассеты И Стили

Стили:

- `src/index.css`
- `src/App.css`
- `src/components/GameWheel.css`
- `src/components/DiceVisual.css`

Шрифт:

- `src/assets/fonts/citricacyrillic.ttf`

Публичные ассеты:

- `public/map.jpg`
- `public/icons.svg`
- `public/favicon.svg`
- `public/cards`
- `public/avatars`
- `public/video/bg.mp4`
- `public/video/bg_low.mp4`

Карточные GIF хранятся локально:

- обычные карты: `public/cards/faces`
- легендарные карты: `public/cards/legend`
- fallback-аватар: `public/avatars/fallback.jpg`

В `src/components/starterCards.json` поле `artCard` должно ссылаться на локальный путь вида `/cards/faces/inv_001.gif`, а не на `giphy.com`, `tenor.com` или другой внешний CDN. Для проверки:

```bash
npm run assets:check-external
```

## 24. Как Добавить Карту

1. Добавить запись в `src/components/starterCards.json`.
2. Выбрать уникальный `id`.
3. Заполнить:
   - `name`
   - `description`
   - `deck`
   - `rarity`
   - `action`
   - `value`
   - `faceCard`
   - `artCard`
   - `price`
   - `number`
   - `howtowork`
   - `requiresTarget`
4. Если `action` новый, добавить его в `CardAction`.
5. Добавить обработку в карточную логику.
6. Запустить:

```bash
npm run seed:cards
```

Если нужно полностью пересоздать карты в dev:

```bash
npm run seed:cards:reset
```

## 25. Как Добавить Игру В Колесо

Добавить документ в Firestore collection `wheel`:

```json
{
  "name": "Название игры",
  "image": "https://...",
  "active": true
}
```

`id` документа используется для сортировки/обновления. После подтверждения результата выбранная игра становится `active: false`.

## 26. Как Изменить Карту Поля

Файл:

- `src/components/gameMap.ts`

Шаги:

1. Добавить или изменить клетку.
2. Проверить уникальность `id`.
3. Обновить координаты `x`, `y`.
4. Обновить `next` у связанных клеток.
5. Выбрать `type`.
6. Проверить движение, линии, развилки и попадание на `b-shop`/`gambling`.

## 27. Выполненный Техдолг

Уже сделано:

1. Восстановлена UTF-8 кодировка русских строк.
2. Убран runtime `fixMojibake`.
3. Firebase config вынесен в env.
4. Добавлен `.env.example`.
5. Добавлены Firestore rules и `firebase.json`.
6. README обновлен под запуск, Firebase, rules, seed/reset.
7. `useGameData.ts` частично разделен:
   - `useFirestoreSubscriptions`
   - `useEventLogger`
   - `cardHandlers`
   - `turnHandlers`
   - `duelHandlers`
   - `adminHandlers`
8. `AppClean.tsx` частично разделен:
   - event log
   - toast container
   - game alert overlay
   - interaction pending overlay
   - B-Shop/Gambling overlay
   - Tax overlay
9. Типы дуэлей унифицированы в `src/types/duel.ts`.
10. Часть последовательных Firestore writes заменена на `writeBatch`/`runTransaction`.
11. Добавлены отдельные seed/reset скрипты с защитой от production reset.
12. Добавлен `src/i18n/ru.ts`.
13. Browser `alert`, `confirm`, `prompt` заменены на собственные модалки/notify.
14. Внешние GIF карточек и fallback-аватар сохранены локально в `public/cards` и `public/avatars`.
15. Добавлена проверка `npm run assets:check-external`.

## 28. Остаточный Техдолг

### До Первого Деплоя/Публичного Теста

Минимальный набор перед тем, как давать ссылку другим игрокам:

1. Запустить `npm run lint`.
2. Запустить `npm run build`.
3. Запустить `npm run assets:check-external`.
4. Деплойнуть Firestore rules:

```bash
firebase deploy --only firestore:rules
```

5. Проверить `.env.local`/hosting env: все `VITE_FIREBASE_*` указывают на нужный Firebase project.
6. Запустить `npm run seed:cards` для нужного проекта.
7. Создать или проверить invite-коды в `invites`.
8. Проверить руками один короткий сценарий: регистрация игрока, стартовая клетка, бросок, покупка/использование карты, действие админа.

### Высокий Приоритет После Первого Деплоя

1. Добавить тесты бизнес-логики.
2. Дальше дробить `useGameData.ts`.
3. Дальше дробить `AppClean.tsx`, особенно дуэльные overlay и коллекцию/руку.
4. Продолжить перевод текстов в `src/i18n/ru.ts`.
5. Вынести карточные эффекты в тестируемые pure functions.
6. Усилить Firestore rules после переноса критичных операций на backend.

### Средний Приоритет

1. Описать Firestore schema отдельным документом или TS-константами.
2. Сделать repository layer:
   - `playersRepository`
   - `gameStateRepository`
   - `cardsRepository`
   - `wheelRepository`
3. Продолжить замену последовательных `updateDoc`.
4. Добавить Firebase Emulator workflow.
5. Добавить prettier/format script.

### Низкий Приоритет

1. Улучшить loading/error states для Firestore.
2. Проверить адаптивность на мобильных экранах.
3. Добавить accessibility-аудит.
4. Добавить dev tooling для быстрого создания тестовой партии.

## 29. Ключевые Файлы

- `src/components/AppClean.tsx` - главный UI.
- `src/components/useGameData.ts` - главный controller hook.
- `src/components/useFirestoreSubscriptions.ts` - Auth/Firestore subscriptions.
- `src/components/useEventLogger.ts` - запись game events.
- `src/components/GameBoard.tsx` - карта и движение.
- `src/components/GameWheel.tsx` - колесо.
- `src/components/BottomPanel.tsx` - нижняя панель.
- `src/components/PlayersSidebar.tsx` - игроки и админские операции.
- `src/components/AdminDialog.tsx` - собственные модалки.
- `src/components/starterCards.json` - база карт.
- `src/components/gameMap.ts` - граф поля.
- `src/types/game.ts` - типы игроков, фазы, gameState.
- `src/types/card.ts` - типы карт.
- `src/types/duel.ts` - типы дуэлей.
- `src/i18n/ru.ts` - русские UI-тексты.
- `src/firebase.ts` - инициализация Firebase.
- `firestore.rules` - правила Firestore.
- `scripts/firebaseScriptUtils.mjs` - shared helpers для seed/reset.
- `scripts/seedCards.mjs` - seed cards/prizes.
- `scripts/resetDevState.mjs` - защищенный dev reset.
