# Актуальный статус проекта

Дата актуализации: 2026-05-15.

## Главный фокус

Сейчас основной фокус - стабилизировать действия игроков, особенно карточные эффекты, чтобы не было сценариев вида "карта списалась, а эффект не применился" или "старый клик перезаписал новое состояние".

Проект все еще клиентский: критичная игровая логика выполняется в React/Firebase-клиенте. Поэтому до переноса на backend главный практический способ снизить баги - переводить связанные Firestore writes на `runTransaction` и маленькие общие helpers.

## Что уже сделано

Добавлены helper-слои:

- `src/components/cardUseGuards.ts` - единая проверка, можно ли использовать карту в текущей фазе.
- `src/components/cardTargetRules.ts` - правила выбора целей для карт.
- `src/components/cardPlayPatches.ts` - pure helper для списания карты и добавления в `revealedCards`.
- `src/components/cardPlayTransactions.ts` - `commitPlayedCardAndGameState`.
- `src/shared/playCardContract.ts` - контракт для будущего callable/backend `playCard`.

Добавлены тесты:

- `tests/cardUseGuards.test.ts`
- `tests/cardTargetRules.test.ts`
- `tests/cardPlayPatches.test.ts`
- `tests/playCardContract.test.ts`

## Стабилизированные карточные flow

Уже переведены на атомарные или проверенные транзакционные записи:

- базовое списание карты из руки и запись в `revealedCards`;
- `add_coins`;
- `steal_coins`;
- `move_steps`, включая прямые перемещения и шаг назад;
- `teleport`;
- `teleport_to_type`;
- `extra_roll`;
- `protection`;
- `fish_protection`;
- `promo_code_benefit`;
- `spin_wheel` / `inv_017`;
- Fish-ответ на колесо;
- `inv_007` hostile card move, включая Fish-блок;
- `discard_card`;
- `steal_card`;
- `move_target_for_coins`;
- `discard_next_drawn`;
- `take_next_card`;
- `give_next_card`;
- старт дуэли (`duel`);
- `judge_coins`;
- старт визуального броска `deal_with_mage`;
- `move_target_and_self`;
- старт налоговой очереди `pay_or_move_back`;
- `communism`.

## Reflect-response

В `handleReflectResponse` уже стабилизированы:

- списание `inv_012` и запись в `revealedCards`;
- закрытие interaction при reflect-на-reflect;
- переходы в `discard_selection` для `inv_010` / `inv_011`;
- переход в `move_for_coins_selection` для `inv_013`;
- `applyJudge`;
- визуальный старт `applyMage`;
- `applyKatjit`;
- `applyTaxToOne`.

## Что осталось следующим

Ближайшие кандидаты:

1. `handleReflectResponse`: ветка `inv_007`, где открытие `cardMove` еще обычный `updateDoc`.
2. `handleReflectResponse`: fallback/default закрытия `activeInteraction`, чтобы они тоже проверяли актуальный interaction.
3. `handleTaxResponse`: пройти отдельным аудитом налоговые ответы.
4. `handleConfirmMoveForCoins`: проверить, что все записи защищены от устаревшего interaction.
5. Gambling/B-Shop подтверждения: проверить, что выбор карты не может примениться после смены interaction.
6. Дуэльные ответы: отдельный аудит всех статусов дуэли после уже сделанного атомарного старта.

Отдельный cleanup:

- старый `targetHasReflect = false` в `handleUseCard` выглядит мертвым кодом, потому что Reflect теперь идет через `reflect_response`;
- старые неактивные ветки `applyMage` после `resolveMageAfterVisualRoll = false` можно удалить или оставить только после транзакционного приведения;
- продолжать перенос текстов из `useGameData.ts` в `src/i18n/ru.ts`.

## Проверки

Последний прогон после стабилизации карточных flow:

```bash
npm test
npm run build
npm run lint
```

Статус:

- `npm test` - проходит, 31 тест.
- `npm run build` - проходит.
- `npm run lint` - ошибок нет.
- Остаются старые 7 warning по React hook dependencies / unused eslint-disable.

## Backend / security

Долгосрочное направление не изменилось: переносить критичные операции в callable/backend handlers.

Первый кандидат backend-миграции:

- `playCard`
- затем `respondToCard`
- затем `resolveInteraction`

После переноса конкретного slice на backend можно будет сужать Firestore rules для соответствующих полей `players` и `gameState`.
