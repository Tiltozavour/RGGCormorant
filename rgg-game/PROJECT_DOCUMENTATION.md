# RGG Game / Cormorant Society: документация проекта

## 1. Назначение проекта

`rgg-game` - браузерное React-приложение для синхронной настольной/party-игры Cormorant Society. Приложение совмещает:

- авторизацию игроков по приглашениям;
- общую игровую карту с фишками игроков;
- раунды, фазы и очередь ходов;
- броски кубика и анимированное движение по карте;
- колесо выбора мини-игры;
- карточную систему с инвентарем, моментальными эффектами, магазином, защитами, дуэлями и легендарными призами;
- админ-панель для управления фазами, очками, картами и сбросом состояния;
- синхронизацию между участниками через Firebase Authentication и Firestore.

Проект написан как клиентское SPA-приложение. Серверной части в репозитории нет: роль backend выполняет Firebase.

## 2. Технологический стек

- React `19.2.4`
- TypeScript `~5.9.3`
- Vite `8.0.1`
- Tailwind CSS `4.2.2` через `@tailwindcss/vite`
- Firebase `12.11.0`
  - Firebase Auth
  - Cloud Firestore
- ESLint `9.39.4`

Конфигурация Vite находится в `vite.config.ts`. В проекте используется Tailwind-плагин Vite без отдельного `tailwind.config`.

## 3. Скрипты

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

Назначение:

- `dev` - запуск локального dev-сервера Vite.
- `build` - TypeScript build check через `tsc -b`, затем production-сборка Vite.
- `lint` - запуск ESLint по проекту.
- `preview` - локальный preview production-сборки.

Есть отдельный служебный скрипт:

```bash
node scripts/resetFirebaseState.mjs
```

Он сбрасывает игроков, пересоздает `gameState/current`, очищает `cards` и `prizes`, затем заново загружает стартовые карты из `src/components/starterCards.json`.

## 4. Точка входа

Основной вход:

- `src/main.tsx`

Он подключает `src/index.css`, создает React root и рендерит `App` из `src/AppClean.tsx`.

`src/AppClean.tsx` - тонкий re-export:

```ts
export { default } from "./components/AppClean";
```

Фактический корневой компонент находится в:

- `src/components/AppClean.tsx`

## 5. Общая структура проекта

```text
src/
  main.tsx
  firebase.ts
  index.css
  AppClean.tsx
  components/
    AppClean.tsx
    Auth.tsx
    BottomPanel.tsx
    GameBoard.tsx
    GameCard.tsx
    GameWheel.tsx
    PlayersSidebar.tsx
    ScoresDetailsPage.tsx
    DiceVisual.tsx
    DuelDiceVisual.tsx
    useGameData.ts
    useModalStates.ts
    gameMap.ts
    gameList.ts
    gameConstants.ts
    scoreUtils.ts
    starterCards.json
  services/
    gameStateService.ts
  types/
    game.ts
    card.ts
    cardService.ts
public/
  map.jpg
  icons.svg
  favicon.svg
  cards/
  video/
scripts/
  resetFirebaseState.mjs
```

## 6. Firebase

Firebase инициализируется в `src/firebase.ts`.

Используемые сервисы:

- `auth` - Firebase Authentication.
- `db` - Firestore.

Текущий Firebase project:

- `projectId`: `rggcormarant`
- `authDomain`: `rggcormarant.firebaseapp.com`

Важно: конфигурация Firebase сейчас захардкожена в репозитории. Для публичного frontend-приложения сам Firebase config не является секретом, но правила Firestore/Auth становятся критичными для безопасности.

## 7. Основные коллекции Firestore

### `players`

Документ игрока имеет id, равный `user.uid`.

Основные поля описаны в `src/types/game.ts`:

- `login` - отображаемое имя.
- `avatar` - URL аватара.
- `role` - `"admin"` или `"player"`.
- `position` - текущая клетка на карте.
- `prevCell` - предыдущая клетка, нужна для движения без возврата назад.
- `inGame` - выбрал ли игрок стартовую позицию и участвует ли на поле.
- `tiltCoins` - общий счет/монеты.
- `lastTiltoCoins` - результат последней игры.
- `bonusPoints` - бонусы, например за голосование.
- `inventory` - массив id карт.
- `hasProtection` - активная базовая защита.
- `customStatus` - специальные временные статусы: отражение, промокод, fish shield и т.п.
- `statusDuration` - длительность временного статуса.
- `discardNextDrawn`, `redirectNextDrawnToPlayerId`, `giveNextDrawnToPlayerId` - модификаторы следующей вытянутой карты.
- `borderColor` - цвет обводки фишки.
- `lastNotification` - персональное уведомление игроку.

### `gameState/current`

Центральное состояние партии. Тип описан в `GameState`.

Ключевые поля:

- `phase` - текущая фаза.
- `round` - номер раунда.
- `currentGame` - текущая выбранная мини-игра.
- `nextGame` - результат колеса до подтверждения.
- `turnOrder` - очередь ходов.
- `currentTurnIndex` - индекс текущего игрока в очереди.
- `votes` - голоса игроков.
- `scores` - суммарные очки.
- `currentResults` - результаты текущего раунда.
- `gameHistory` - история игр и очков.
- `goldenCardHolderIds` - игроки с золотой картой на текущий ход.
- `showWheel` - видимость колеса.
- `currentRoll`, `lastBaseRoll`, `rollBonus`, `rollConfirmed` - состояние броска кубика.
- `currentRollPlayerId` - кто бросил кубик.
- `forcedMovePlayerId` - чьей фишкой управляют удаленно.
- `cardMove` - движение чужой фишки, инициированное картой.
- `cardDiceRoll` - результат кубика, брошенного картой.
- `pendingTaxPayout` - ожидающая выплата по налоговой механике.
- `revealedCards` - раскрытые карты.
- `activeInteraction` - активное карточное/клеточное взаимодействие.
- `activeDuels` - активные дуэли.
- `notifications` - уведомления по игрокам.

### `cards`

Обычные карты из `starterCards.json`, кроме легендарных.

### `prizes`

Легендарные карты. Они уникальны в рамках партии:

- `isUnique`
- `isWon`
- `winnerId`

### `gameEvents`

Событийный лог игры. Последние 100 событий подписываются в `useGameData`.

Тип события:

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

Список игр для колеса. `fetchAvailableGames` читает активные документы:

- `name`
- `image`
- `active`

Если активных игр нет, функция пытается вернуть все документы из `wheel`. Если коллекция недоступна или пуста, используется fallback из трех игр.

### `game_settings/wheel`

Синхронное состояние колеса:

- `isSpinning`
- `targetRotation`
- `winnerIndex`
- `previousWinnerIndex`
- `previousTargetRotation`
- `lastSpinSource`
- `rerollBy`
- `wheelCardStack`
- `updatedAt`

### `invites`

Используется при регистрации. `Auth.tsx` ищет документ, где `code == inviteCode`, проверяет `used`, затем помечает приглашение как использованное.

## 8. Авторизация

Компонент:

- `src/components/Auth.tsx`

Приложение использует логин как псевдо-email:

```ts
`${login.trim().toLowerCase()}@cormorant.dev`
```

Флоу регистрации:

1. Игрок вводит логин, пароль и invite code.
2. Приложение ищет invite в `invites`.
3. Если код существует и не использован, создается Firebase Auth пользователь.
4. В `players/{uid}` создается документ игрока.
5. Invite помечается как `used: true`, `usedBy: uid`.

Флоу входа:

1. Игрок вводит логин и пароль.
2. Логин преобразуется в псевдо-email.
3. Firebase Auth выполняет sign in.

## 9. Игровые фазы

Фазы описаны в `GamePhase` и `PHASE_ORDER`:

```ts
waiting_game -> playing -> results -> voting -> turn -> next_game
```

Назначение фаз:

- `waiting_game` - ожидание/подготовка текущей мини-игры.
- `playing` - мини-игра идет.
- `results` - админ вводит результаты раунда.
- `voting` - игроки голосуют за бонус.
- `turn` - ходовая часть на карте.
- `next_game` - завершение раунда и выбор следующей игры через колесо.

Админ переключает фазы через `BottomPanel`. При переходе в `turn` строится очередь ходов на основе результатов раунда: участвуют активные не-админы с положительным результатом. Игроки с нулевым результатом могут быть добавлены админом вручную.

## 10. Карта

Карта задана в:

- `src/components/gameMap.ts`

`gameMap` - массив из 51 клетки. Каждая клетка:

```ts
{
  id: number;
  x: number;
  y: number;
  next: number[];
  type: "neutral" | "b-shop" | "gambling";
}
```

`x` и `y` - координаты в процентах для отрисовки поверх `public/map.jpg`.

Типы клеток:

- `neutral` - обычная клетка.
- `b-shop` - магазин карт.
- `gambling` - вытягивание/срабатывание случайной карты или специальное взаимодействие.

Стартовые клетки:

- `6`
- `15`

Если игрок еще не в игре (`inGame: false`), `GameBoard` показывает выбор стартовой позиции.

## 11. Движение по карте

Компонент:

- `src/components/GameBoard.tsx`

Движение завязано на:

- `currentRoll`
- `currentRollPlayerId`
- `rollConfirmed`
- `forcedMovePlayerId`
- `cardMove`

Логика:

1. Игрок бросает кубик.
2. Результат пишется в `gameState/current`.
3. Игрок подтверждает начало движения.
4. `GameBoard` анимирует фишку по графу `gameMap`.
5. На развилке игрок выбирает следующую клетку.
6. Позиция периодически синхронизируется в Firestore.
7. После окончания движения вызывается `handleMoveComplete`.
8. Если конечная клетка `b-shop` или `gambling`, открывается `activeInteraction`.

Для карточных эффектов, когда игрок управляет чужой фишкой, используется `cardMove`. Тогда позиция временно синхронизируется в `gameState.cardMove`, а затем применяется к целевому игроку.

## 12. Очередь ходов и броски кубика

Главная логика находится в:

- `src/components/useGameData.ts`

Бросок:

- `handleRoll` генерирует D6 и применяет `rollBonus`.
- `handleConfirmRoll` выставляет `rollConfirmed: true`.
- `GameBoard` начинает анимацию только после подтверждения.

Очередь:

- `turnOrder` хранит id игроков.
- `currentTurnIndex` указывает текущего игрока.
- `currentTurnPlayerId` вычисляется из этих полей.
- `canRoll` разрешает бросок текущему игроку, если фаза `turn`, нет текущего броска и нет блокирующего взаимодействия.

## 13. Колесо выбора игры

Компонент:

- `src/components/GameWheel.tsx`

Данные игр:

- `src/components/gameList.ts`
- Firestore collection `wheel`

Состояние вращения:

- Firestore document `game_settings/wheel`

Открытие/закрытие:

- `syncWheelVisibility(gameId, isOpen)` меняет `gameState/{gameId}.showWheel`.

Результат:

- `syncWheelResult(gameId, selectedGame)` пишет `nextGame` и скрывает колесо.
- В самом `GameWheel` подтверждение результата делает выбранную игру неактивной в `wheel/{game.id}`, сбрасывает `game_settings/wheel`, переводит фазу в `waiting_game` и записывает `currentGame`.

Карты могут влиять на колесо:

- `inv_017` - повторный запуск колеса.
- `inv_006` - может отменять последнюю активную карту на колесе.

## 14. Карточная система

Типы описаны в:

- `src/types/card.ts`

Исходный список карт:

- `src/components/starterCards.json`

Загрузка карт:

- `uploadStarterCards` - загружает стартовые карты в Firestore.
- `resetStarterCards` - очищает `cards` и `prizes`, затем загружает заново.

Колоды:

- `inventory` - карты, которые попадают в инвентарь игрока.
- `momental` - моментальные карты, обычно срабатывают сразу.

Редкости:

- `common`
- `rare`
- `epic`
- `legendary`

Визуальные настройки редкости хранятся в `RARITY_CONFIG`.

### Поддерживаемые действия карт

`CardAction` включает:

- `discard_next_drawn` - сбросить следующую вытянутую карту.
- `take_next_card` - забрать следующую карту.
- `give_next_card` - передать следующую карту.
- `promo_code_benefit` - смягчить следующий негативный денежный эффект.
- `add_coins` - изменить баланс.
- `move_steps` - сдвинуть фишку.
- `extra_roll` - переброс кубика.
- `protection` - защита от негативного эффекта.
- `teleport` - телепорт на конкретную клетку.
- `teleport_to_type` - телепорт к ближайшей клетке нужного типа.
- `skip_turn` - пропуск хода.
- `steal_coins` - украсть монеты.
- `steal_card` - украсть карту.
- `discard_card` - сбросить карту цели.
- `spin_wheel` - повторный запуск колеса.
- `duel` - PvP-дуэль.
- `prize` - легендарная призовая карта.
- `judge_coins` - бросок кубика за изменение монет цели.
- `deal_with_mage` - бросок кубика за смешанный эффект.
- `reflect_debuff` - отражение эффекта.
- `move_target_for_coins` - двигать цель за монеты.
- `move_target_and_self` - двигать цель и себя.
- `pay_or_move_back` - налоговая дилемма.
- `passive_benefit` - пассивный бонус.
- `fish_protection` - универсальная защита/отмена.
- `communism` - забрать часть свежеполученных монет другого игрока.

### Легендарные карты

Легендарные карты хранятся в `prizes`, а не в `cards`. Их нельзя получить повторно, если `isWon: true`. При получении пишется `winnerId`, карта добавляется в `revealedCards`, а игроку отправляется уведомление.

### Золотая карта

Карта `inv_018` работает как пассивный бонус. Она не лежит физически в инвентаре, а отображается, если id игрока есть в `gameState.goldenCardHolderIds`.

Эффект:

- скидка 50% в B-Shop;
- округление цены вверх;
- карту нельзя украсть или сбросить обычными карточными эффектами.

Получатели золотой карты определяются при подготовке хода: игроки с 0 очков и игроки из нижней части таблицы положительных результатов.

## 15. Активные взаимодействия

Многие действия не завершаются одним кликом и используют `gameState.activeInteraction`.

Типы:

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

`AppClean` читает `activeInteraction` и показывает нужный overlay/modal. Обработчики находятся в `useGameData`.

Примеры:

- B-Shop показывает 3 карты на выбор и покупку.
- Gambling показывает 3 случайные карты, включая шанс моментальной.
- `discard_selection` дает выбрать карту у противника.
- `reflect_response` предлагает отразить направленный эффект.
- `tax_response` обрабатывает налоговую карту.
- Дуэль проходит через несколько статусов.

## 16. Дуэли

Типы:

- `DuelState`
- `DuelWeapon`

Состояния дуэли:

- `pending` - вызов отправлен, цель отвечает.
- `accepted` - вызов принят.
- `betting` - игроки делают ставки.
- `ready_to_roll` - готовность к броску.
- `rolling` - идет бросок.
- `admin_wait` - результат мини-игры должен решить админ.
- `finished` - дуэль завершена.

Оружие дуэли:

- `dice` - победитель определяется броском кубиков.
- `game` - победителя выбирает админ после мини-игры.

Визуализация броска:

- `src/components/DuelDiceVisual.tsx`

Админский выбор победителя отображается в `AppClean`, когда есть дуэль со статусом `admin_wait`.

## 17. Очки, результаты и голосование

Утилиты:

- `src/components/scoreUtils.ts`

`buildPlayerScoreRows` собирает строки таблицы:

- игрок;
- последняя игра;
- очки за игру;
- очки за голосование;
- общий счет.

Фаза `results`:

- админ вводит результаты игроков;
- результаты пишутся в `currentResults`;
- `tiltCoins`, `lastTiltoCoins`, `bonusPoints` обновляются у игроков.

Фаза `voting`:

- игроки с положительным `lastTiltoCoins` голосуют за игрока;
- админ завершает голосование;
- победители получают бонус:
  - 1 победитель: +3;
  - 2 победителя: +2;
  - 3 и более: +1.

Экран подробных результатов:

- `src/components/ScoresDetailsPage.tsx`

## 18. Главные UI-компоненты

### `AppClean.tsx`

Корневой экран игры. Отвечает за:

- подключение `useGameData`;
- хранение локальных modal/toast состояний через `useModalStates`;
- рендер карты, нижней панели, сайдбара игроков, коллекции/руки, alert/toast, лога событий;
- визуализацию бросков;
- экраны активных взаимодействий;
- очистку событийного лога админом.

Файл очень большой и содержит значительную часть UI-логики.

### `useGameData.ts`

Главный data/controller hook. Отвечает за:

- подписки на Auth и Firestore;
- вычисление прав и текущего хода;
- обработчики игры;
- карточные эффекты;
- дуэли;
- сброс партии;
- админские операции;
- логирование событий.

Это фактический доменный слой приложения.

### `GameBoard.tsx`

Отрисовывает карту, клетки, линии, фишки, статусы игроков и выбор направления. Также запускает `GameWheel`, если `showWheel` активен.

### `BottomPanel.tsx`

Нижняя панель управления:

- текущая фаза и раунд;
- кнопки админа;
- бросок кубика;
- подтверждение броска;
- инвентарь игрока;
- голосование;
- ввод результатов;
- тестовые кнопки `Init`, `Give All`, `Reset`.

### `PlayersSidebar.tsx`

Сайдбар с таблицей игроков:

- последний счет;
- бонусы;
- общий счет;
- выделение лидера;
- админское редактирование монет;
- админское добавление/удаление карт;
- список активных дуэлей.

### `GameCard.tsx`

Визуальная карточка. Использует:

- редкость;
- градиенты;
- арт;
- цену;
- описание;
- номер;
- состояние легендарности.

### `GameWheel.tsx`

Синхронизированное колесо выбора игр с анимацией и подтверждением результата.

### `Auth.tsx`

Вход и регистрация по invite code.

### `DiceVisual.tsx` и `DuelDiceVisual.tsx`

Оверлеи для броска обычного кубика и дуэльных кубиков.

## 19. Стили и ассеты

Глобальные стили:

- `src/index.css`
- `src/App.css`
- `src/components/GameWheel.css`
- `src/components/DiceVisual.css`

Шрифт:

- `src/assets/fonts/citricacyrillic.ttf`

Публичные ассеты:

- `public/map.jpg` - карта.
- `public/video/bg.mp4`, `public/video/bg_low.mp4` - видеофон авторизации/интерфейса.
- `public/cards/...` - рубашки, лица и легендарные GIF.

Многие карты используют внешние GIF URL. Это удобно для прототипа, но создает зависимость от доступности сторонних ресурсов.

## 20. Админские возможности

Админ определяется по `playerData.role === "admin"`.

Доступные действия:

- переключать фазы вперед/назад;
- вводить результаты раунда;
- завершать голосование;
- открывать колесо;
- инициализировать карты;
- выдать все карты всем игрокам;
- сбросить игру;
- добавлять/удалять карты у игроков;
- менять монеты игроков;
- очищать лог событий;
- решать дуэли с оружием `game`.

## 21. Сброс и инициализация данных

В UI:

- кнопка `Init` вызывает `uploadStarterCards`.
- кнопка `Reset` вызывает `handleResetGameForTesting`.

Через Node:

- `scripts/resetFirebaseState.mjs`

Что сбрасывается:

- позиции игроков;
- участие в игре;
- инвентарь;
- монеты;
- результаты;
- бонусы;
- защиты и временные статусы;
- `lastNotification`;
- `gameState/current`;
- коллекции `cards` и `prizes`.

Что не сбрасывается:

- Firebase Auth users;
- login/avatar/role игроков;
- invites;
- wheel;
- gameEvents в скрипте `resetFirebaseState.mjs` не удаляются.

## 22. Особенности кодировки

В проекте заметен mojibake: русские строки в коде и JSON отображаются как `Р...`, `С...`, `вЂ”` и похожие последовательности. В `AppClean.tsx` есть функция `fixMojibake`, которая пытается исправлять такие строки во время выполнения.

Последствия:

- сложнее читать и поддерживать тексты;
- часть сообщений уже заменена на заглушки вида `????????`;
- поиск по русскому тексту почти бесполезен;
- возможны проблемы при дальнейших правках локализации.

Это один из самых важных технических долгов проекта.

## 23. Риски и ограничения текущей архитектуры

- Большая часть бизнес-логики живет в одном файле `useGameData.ts`.
- Большая часть UI-сценариев живет в одном файле `AppClean.tsx`.
- Нет тестов для карточных эффектов, фаз, дуэлей и транзакций.
- Firestore-структура не описана отдельной схемой или миграциями.
- Firebase config захардкожен, env-файлы не используются.
- Админские возможности зависят от client-side проверки `role`.
- Много текстов зашито прямо в JSX/TS.
- Есть дублирование типов дуэли в `types/game.ts` и `types/card.ts`, причем статусы немного различаются (`ready_to_roll` vs `ready`).
- В коде есть `eslint-disable` для важных правил React hooks.
- Карточные эффекты частично используют последовательные `updateDoc`, частично транзакции; это повышает риск гонок.
- Внешние GIF могут ломаться или замедлять загрузку.
- Нет явных Firestore security rules в репозитории.

## 24. Как добавить новую карту

1. Добавить объект в `src/components/starterCards.json`.
2. Выбрать `id`, например `inv_021`, `mom_008` или `leg_005`.
3. Указать:
   - `name`
   - `description`
   - `deck`
   - `rarity`
   - `action`
   - `value`
   - `faceCard`
   - `artCard`
   - `price`
   - `howtowork`
   - `number`
   - `requiresTarget`, если нужен выбор игрока.
4. Если `action` уже поддерживается, загрузить карты через `Init` или `resetStarterCards`.
5. Если `action` новый, добавить тип в `CardAction` и обработку в `handleUseCard`, `applyMomentalCardEffect` или связанных обработчиках.
6. Проверить отображение в `GameCard`.
7. Проверить сценарии:
   - использование не в свой ход;
   - использование до/после броска;
   - наличие цели;
   - защита/отражение;
   - возврат карты при ошибке.

## 25. Как добавить новую игру в колесо

Добавить документ в коллекцию `wheel`:

```json
{
  "name": "Название игры",
  "image": "https://...",
  "active": true
}
```

`id` документа используется для сортировки и обновления активности. После подтверждения выбранная игра становится `active: false`.

## 26. Как добавить новую клетку или изменить карту

1. Изменить `gameMap` в `src/components/gameMap.ts`.
2. Указать уникальный `id`.
3. Задать координаты `x`, `y` в процентах.
4. Обновить связи `next` у соседних клеток в обе стороны, если движение должно быть двусторонним.
5. Выбрать тип клетки.
6. Проверить:
   - отрисовку линий;
   - движение через развилки;
   - отсутствие тупика, если он не задуман;
   - попадание на `b-shop`/`gambling`.

## 27. Рекомендуемые улучшения

### Высокий приоритет

1. Восстановить нормальную UTF-8 кодировку русских строк.
   - Исправить `.tsx`, `.ts`, `.json`.
   - Убрать `fixMojibake` после миграции.
   - Проверить все UI-сообщения и логи.

2. Вынести Firebase config в env.
   - Использовать `import.meta.env.VITE_FIREBASE_*`.
   - Добавить `.env.example`.
   - Описать настройку в README.

3. Добавить Firestore security rules в репозиторий.
   - Игрок может менять только безопасные поля своего документа.
   - Админские операции доступны только админам.
   - Клиент не должен иметь возможность произвольно менять `gameState`.

4. Разделить `useGameData.ts`.
   - `useFirestoreSubscriptions`
   - `turnHandlers`
   - `cardHandlers`
   - `duelHandlers`
   - `adminHandlers`
   - `eventLogger`

5. Разделить `AppClean.tsx`.
   - Отдельные overlay-компоненты для B-Shop, Gambling, Reflect, Tax, Duel.
   - Отдельная коллекция/рука.
   - Отдельный event log.

6. Добавить тесты бизнес-логики.
   - `scoreUtils` уже легко покрыть unit-тестами.
   - Карточные эффекты лучше вынести в pure functions и покрыть отдельно.
   - Дуэли и фазы покрыть сценарными тестами.

### Средний приоритет

7. Унифицировать типы дуэлей.
   - Сейчас `DuelState` есть и в `types/game.ts`, и в `types/card.ts`.
   - Статусы отличаются, что может привести к ошибкам.

8. Описать Firestore schema отдельным документом или TypeScript-константами.
   - Коллекции.
   - Документы.
   - Индексы.
   - Требуемые поля.

9. Сделать слой репозиториев для Firestore.
   - `playersRepository`
   - `gameStateRepository`
   - `cardsRepository`
   - `wheelRepository`

10. Уменьшить количество последовательных `updateDoc`.
    - Где данные связаны, использовать `runTransaction` или `writeBatch`.
    - Особенно для карт, монет, дуэлей и активных взаимодействий.

11. Добавить нормальный механизм миграций/seed.
    - Отдельный seed для cards/prizes.
    - Отдельный reset для dev.
    - Защита от запуска production reset случайно.

12. Перенести тексты в словарь локализации.
    - `src/i18n/ru.ts`
    - Это упростит исправление кодировки и дальнейшие правки.

13. Убрать `alert`, `confirm`, `prompt`.
    - Заменить на собственные модалки.
    - Это особенно важно для админских действий.

14. Кэшировать или локализовать внешние GIF.
    - Внешние ссылки могут умереть.
    - Можно хранить важные ассеты в `public/cards`.

### Низкий приоритет

15. Обновить README.
    - Сейчас это стандартный Vite README.
    - Добавить запуск, Firebase, роли, reset, структуру проекта.

16. Добавить prettier/format script.
    - Сейчас есть ESLint, но нет явного форматирования.

17. Добавить loading/error states для Firestore.
    - Сейчас многие ошибки уходят только в console.

18. Улучшить адаптивность.
    - Некоторые панели имеют фиксированные высоты/ширины.
    - Колесо и карта лучше проверить на небольших экранах.

19. Добавить dev tooling для моков.
    - Локальная игра без Firebase или с emulator suite.
    - Быстрый сценарий создания игроков и партии.

20. Добавить аудит доступности.
    - Кнопки-иконки, alt-тексты, фокус, клавиатурная навигация.

## 28. Краткая карта ключевых файлов

- `src/components/AppClean.tsx` - главный UI и модалки.
- `src/components/useGameData.ts` - подписки и вся игровая бизнес-логика.
- `src/components/GameBoard.tsx` - карта и движение.
- `src/components/GameWheel.tsx` - колесо выбора игры.
- `src/components/BottomPanel.tsx` - нижняя панель управления.
- `src/components/PlayersSidebar.tsx` - таблица игроков и админские действия.
- `src/components/starterCards.json` - стартовая база карт.
- `src/components/gameMap.ts` - граф игрового поля.
- `src/types/game.ts` - типы состояния игры и игроков.
- `src/types/card.ts` - типы карточной системы.
- `src/types/cardService.ts` - загрузка/сброс карт.
- `src/firebase.ts` - подключение Firebase.
- `scripts/resetFirebaseState.mjs` - полный reset Firebase-состояния для разработки.
