/* eslint-disable react-hooks/purity, @typescript-eslint/no-explicit-any */
import { useCallback } from "react";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  setDoc,
  arrayUnion,
  increment,
  arrayRemove,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase"; // Assuming db is imported
import { resetStarterCards } from "../types/cardService";
import { gameMap } from "./gameMap";
import type { GameCard } from "../types/card";
import type { DuelWeapon } from "../types/duel";
import { defaultGameState } from "../types/game";
import type { DuelState, GameState, Player } from "../types/game";
import { PHASE_ORDER } from "./gameConstants";
import { useFirestoreSubscriptions } from "./useFirestoreSubscriptions";
import { getResetPlayerPatch } from "./adminHandlers";
import {
  REFLECT_CARD_ID,
  calculateJudgeCoinsOutcome,
  calculatePromoAdjustedLoss,
  canOfferReflectResponse,
} from "./cardEffectRules";
import {
  addOneCardToInventory,
  isPlayerNearby,
  makeHotCoinGain,
  pickRandom,
  removeOneCardFromInventory,
  shuffle,
} from "./cardHandlers";
import { evaluateCardUseGuard, getCardUseGuardAlert } from "./cardUseGuards";
import { commitPlayedCardAndGameState } from "./cardPlayTransactions";
import { useFinishedDuelCleanup } from "./duelHandlers";
import { getRandomInteractionCardIds } from "./interactionCardPicker";
import { grantPrizeCardToPlayer, isLegendaryPrizeCard } from "./legendaryHandlers";
import {
  buildNextTaxInteraction,
  getTaxResponseCardIds,
  usePendingTaxPayout,
} from "./taxHandlers";
import { buildTurnState, getGoldenCardHolderIds, rollD6 } from "./turnHandlers";
import {
  cancelLastWheelCardWithFish,
  rerollWheel,
  validateWheelFishCancelAvailable,
  validateWheelRerollAvailable,
} from "./wheelHandlers";

import type { GameEvent, ToastNotification } from "./useModalStates"; // Import new types

const clearTemporaryStatus = {
  customStatus: null,
  statusDuration: 0,
};

const getBacktrackPosition = (currentPosition: number, prevCell: number | null | undefined, steps: number) => {
  if (steps >= 0) return currentPosition + steps;

  let position = currentPosition;
  let previous = prevCell;

  for (let i = 0; i < Math.abs(steps); i += 1) {
    if (previous == null) {
      position = Math.max(0, position - 1);
      previous = null;
      continue;
    }

    const nextPosition = previous;
    const nextPrevious = gameMap.find((cell) => cell.id === nextPosition)?.next.find((id) => id !== position) ?? null;
    position = nextPosition;
    previous = nextPrevious;
  }

  return Math.max(0, position);
};

/*

 * Проверяет, находится ли игрок в пределах одной клетки (соседняя или та же).
 * @param player1Id ID первого игрока.
 * @param player2Id ID второго игрока.
 * @param allPlayers Список всех активных игроков.
 * @param map Текущая карта игрового поля.
 * @returns true, если игроки находятся рядом, иначе false.
*/
export function useGameData(
  notify: (message: string, type?: ToastNotification['type'], cardId?: string) => void,
  logEvent: (event: GameEvent) => void
) {
  const {
    user,
    playerData,
    loading,
    players,
    gameState,
    allCards,
    gameEvents,
  } = useFirestoreSubscriptions(notify);
  usePendingTaxPayout(gameState.pendingTaxPayout, user, notify);

  const isAdmin = playerData?.role === "admin";
  const currentTurnPlayerId = gameState.turnOrder[gameState.currentTurnIndex] ?? null;
  const isTurnPhase = gameState.phase === "turn";
  const isCurrentPlayersTurn = currentTurnPlayerId === user?.uid;

  const canRoll =
    !isAdmin &&
    !!playerData?.inGame &&
    isTurnPhase &&
    isCurrentPlayersTurn &&
    gameState.currentRoll === null;

  const canConfirmRoll =
    !isAdmin &&
    !!playerData?.inGame &&
    (isCurrentPlayersTurn || gameState.currentRollPlayerId === user?.uid) &&
    gameState.currentRoll !== null &&
    !gameState.rollConfirmed;

  const commitPlayerAndGameState = useCallback(
    async (
      playerRef: ReturnType<typeof doc>,
      playerPatch: Record<string, unknown>,
      gameStatePatch: Record<string, unknown>,
    ) => {
      const batch = writeBatch(db);
      if (Object.keys(playerPatch).length > 0) {
        batch.update(playerRef, playerPatch);
      }
      if (Object.keys(gameStatePatch).length > 0) {
        batch.update(doc(db, "gameState", "current"), gameStatePatch);
      }
      await batch.commit();
    },
    [],
  );
  useFinishedDuelCleanup(gameState.activeDuels, isAdmin);

  // Текст восстановлен после сбоя кодировки.
  const applyMomentalCardEffect = useCallback(
    async (
      player: Player,
      momentalCard: GameCard,
      transaction: any, // Firestore transaction
      fromCardMove: boolean = false,
    ): Promise<boolean> => {
      if (!momentalCard || momentalCard.deck !== "momental") {
        console.error("Ошибка действия.");
        return false;
      }

      const playerDocRef = doc(db, "players", player.id);
      const gameStateRef = doc(db, "gameState", "current");

      let actualValue = momentalCard.value;
      let promoCodeUsed = false;
      let openedSpecialInteraction = false;

      const openSpecialInteractionIfNeeded = (position: number) => {
        const finalCell = gameMap.find((cell) => cell.id === position);
        const cellType = finalCell?.type === "b-shop" ? "bshop" : finalCell?.type;
        if (cellType !== "gambling" && cellType !== "bshop") return;

        openedSpecialInteraction = true;
        transaction.update(gameStateRef, {
          activeInteraction: {
            playerId: player.id,
            type: cellType,
            cards: getRandomInteractionCardIds(cellType, allCards),
            fromCardMove,
          },
        });
      };

      // Текст восстановлен после сбоя кодировки.
      if (
        (momentalCard.action === "add_coins" && momentalCard.value < 0) ||
        (momentalCard.action === "move_steps" && momentalCard.value < 0) ||
        momentalCard.action === "skip_turn" ||
        (momentalCard.action === "teleport" && momentalCard.value === 0)
      ) {
        if (player.customStatus === "promo_code_active") {
          actualValue = Math.ceil(momentalCard.value / 2);
          promoCodeUsed = true;
          transaction.update(playerDocRef, clearTemporaryStatus);
          notify("Событие игры обновлено.", 'success');
          logEvent({
            id: `promo_code_used_momental_${momentalCard.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: player.id, cardId: momentalCard.id,
            details: { originalAmount: momentalCard.value, finalAmount: actualValue }
          });
        }
      }

      // Текст восстановлен после сбоя кодировки.
      if (momentalCard.action === "add_coins") {
        const cardName = momentalCard.id === "mom_001" ? "Налоговая инспекция" : momentalCard.name;
        const coinText = actualValue > 0 ? "получил" : "потерял";
        const amount = Math.abs(actualValue);
        const message = `${player.login} ${coinText} ${amount} монет по карте "${cardName}".`;

        transaction.update(playerDocRef, {
          tiltCoins: increment(actualValue),
          lastNotification: {
            message,
            timestamp: Date.now(),
            cardId: momentalCard.id,
          },
        });
        if (actualValue > 0) {
          transaction.update(gameStateRef, {
            hotCoinGain: makeHotCoinGain(player.id, actualValue, momentalCard.id, cardName),
          });
        }
        notify(promoCodeUsed ? `${message} Промокодик смягчил эффект.` : message, actualValue > 0 ? 'success' : 'error', momentalCard.id);
        logEvent({
          id: `momental_coin_change_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'coin_change',
          message,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { amount: actualValue, reason: 'momental_card_effect', cardName, promoCodeUsed }
        });
      } else if (momentalCard.action === "move_steps") {
        // For move_steps, actualValue is already calculated considering promo code
        const currentPos = player.position || 0;
        const finalPosition = getBacktrackPosition(currentPos, player.prevCell, actualValue);
        transaction.update(playerDocRef, {
          position: finalPosition,
          prevCell: null,
        });
        openSpecialInteractionIfNeeded(finalPosition);
        notify(`${player.login} переместился на ${actualValue} клеток по карте "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_move_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} переместился на ${actualValue} клеток по моментальной карте "${momentalCard.name}".`,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { steps: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      } else if (momentalCard.action === "teleport") {
        let targetPosition = actualValue; // actualValue is momentalCard.value by default

        if (momentalCard.id === "mom_004") {
          // For "I don't feel so good", randomly choose between 6 and 15
          targetPosition = pickRandom([6, 15]) || 6; // Default to 6 if pickRandom returns null (shouldn't happen with [6, 15])
        }

        transaction.update(playerDocRef, { position: targetPosition, prevCell: null });
        openSpecialInteractionIfNeeded(targetPosition);
        notify(`${player.login} телепортировался на клетку ${targetPosition} по карте "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_teleport_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} телепортировался на клетку ${targetPosition} по моментальной карте "${momentalCard.name}".`,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { targetPosition: targetPosition, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      }
      // Добавляем карту в список раскрытых
      transaction.update(gameStateRef, { revealedCards: arrayUnion(momentalCard.id) });
      return openedSpecialInteraction;
    },
    [allCards, notify, logEvent]
  );

  const getPlayerById = useCallback(
    (playerId?: string | null) => players.find((player) => player.id === playerId) ?? null,
    [players],
  );

  const getNextPlayerId = useCallback(
    (playerId: string) => {
      const activeTurnOrder = gameState.turnOrder.filter((id) => id !== playerId);
      if (gameState.turnOrder.length > 1) {
        const currentIndex = gameState.turnOrder.indexOf(playerId);
        if (currentIndex !== -1) {
          for (let offset = 1; offset < gameState.turnOrder.length; offset += 1) {
            const candidateId =
              gameState.turnOrder[(currentIndex + offset) % gameState.turnOrder.length];
            if (candidateId !== playerId) return candidateId;
          }
        }
      }

      if (activeTurnOrder.length > 0) return activeTurnOrder[0];

      return (
        players.find((player) => player.id !== playerId && player.inGame && player.role !== "admin")?.id ??
        null
      );
    },
    [gameState.turnOrder, players],
  );

  const handleLogout = () => signOut(auth);

  const handleUpdateLogin = async (val: string) => {
    if (!user || !playerData || val === playerData.login || val.trim().length < 3) return;
    await updateDoc(doc(db, "players", user.uid), { login: val.trim() });
  };
  const handleUpdateBorderColor = async (color: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { borderColor: color });
  };

  const chooseStart = async (cellId: number) => {
    if (!user) return;
    await setDoc(doc(db, "players", user.uid), {
      position: cellId,
      prevCell: null,
      inGame: true,
      inventory: ["inv_006", "inv_007"],
    }, { merge: true });
  };

  const updateAvatar = async (url: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { avatar: url });
  };

  const grantPrizeCard = (playerId: string, cardId: string) =>
    grantPrizeCardToPlayer({ isAdmin, playerId, cardId, notify });

  const handleRerollWheel = async (source: "participant_reroll" | "inv_017" = "participant_reroll") => {
    if (!user || !playerData) return false;
    return rerollWheel({
      userId: user.uid,
      showWheel: gameState.showWheel,
      source,
      notify,
    });
  };

  const handleUseCard = async (card: GameCard, targetPlayerId: string | null = null) => {
    if (!user || !playerData) return;

    const guard = evaluateCardUseGuard({
      isAdmin,
      card,
      phase: gameState.phase,
      currentRoll: gameState.currentRoll,
      rollConfirmed: gameState.rollConfirmed,
      showWheel: gameState.showWheel,
      currentTurnPlayerId,
      userId: user.uid,
      hasProtection: playerData.hasProtection,
    });

    if (!guard.ok) {
      const alert = getCardUseGuardAlert(guard.reason);
      notify(alert.message, alert.type, card.id);
      return;
    }

    const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;
    const targetPlayer = getPlayerById(targetPlayerId);
    const displayCardName = card.id === "inv_016" ? "Катжит не виноват!" : card.name;

    if (card.action === "communism") {
      const hotCoinGain = gameState.hotCoinGain;
      if (!targetPlayerId || !targetPlayer) {
        notify("Выберите игрока, который только что получил монеты.", 'warning', card.id);
        return;
      }
      if (!hotCoinGain || hotCoinGain.playerId !== targetPlayerId || hotCoinGain.amount <= 0) {
        notify(`${targetPlayer.login} сейчас не может быть целью для карты "Коммунизм".`, 'warning', card.id);
        return;
      }
    }

    // Текст восстановлен после сбоя кодировки.
    // Текст восстановлен после сбоя кодировки.
    if (card.id === "inv_016" && card.action === "steal_coins") {
      if (!targetPlayerId || !targetPlayer) {
        notify(`Выберите игрока рядом, у которого хотите украсть монеты картой "${displayCardName}".`, 'warning', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `${playerData.login} не выбрал цель для карты "${displayCardName}".`,
          cardId: card.id,
          playerId: user.uid
        });
        return;
      }

      const currentPlayerPosition = playerData.position;
      const targetPlayerPosition = targetPlayer.position;
      if (currentPlayerPosition === undefined || targetPlayerPosition === undefined) {
        notify(`Не удалось проверить расстояние до ${targetPlayer.login}. Попробуйте еще раз.`, 'error', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `Не удалось проверить расстояние для карты "${displayCardName}".`,
          cardId: card.id,
          playerId: user.uid
        });
        return;
      }

      if (!isPlayerNearby(user.uid, targetPlayerId, players, gameMap)) {
        notify(`Карта "${displayCardName}" работает только рядом с целью. ${targetPlayer.login} слишком далеко.`, 'warning', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'warning',
          message: `${playerData.login} не смог использовать "${displayCardName}": цель слишком далеко.`,
          cardId: card.id,
          playerId: user.uid,
          targetPlayerId
        });
        return;
      }
    }
    // Текст восстановлен после сбоя кодировки.

    const playerRef = doc(db, "players", user.uid);

    if (card.action === "spin_wheel") {
      if (!(await validateWheelRerollAvailable(gameState.showWheel, notify, card.id))) return;
    }

    if (card.action === "fish_protection" && gameState.showWheel) {
      if (!(await validateWheelFishCancelAvailable(user.uid, notify, card.id))) return;
    }

    try {
      const targetHasReflect = false;
      const targetHasFish = targetPlayer?.customStatus === "fish_shield";
      const spendCardAndClearTargetStatus = async () => {
        if (!targetRef) return false;

        return runTransaction(db, async (transaction) => {
          const actorSnap = await transaction.get(playerRef);
          const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
          const hasCard = inventory.includes(card.id);

          if (!isAdmin && !hasCard) return false;

          if (hasCard) {
            transaction.update(playerRef, {
              inventory: removeOneCardFromInventory(inventory, card.id),
            });
          }
          transaction.update(targetRef, clearTemporaryStatus);
          transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
          return true;
        });
      };
      const canOfferReflect = canOfferReflectResponse({
        cardId: card.id,
        currentPlayerId: user.uid,
        targetPlayerId,
        targetInventory: targetPlayer?.inventory,
      });

      if (canOfferReflect) {
        const timestamp = Date.now();

        logEvent({
          id: `card_play_${card.id}_${timestamp}`,
          timestamp,
          type: 'card_play',
          message: `${playerData.login} сыграл карту "${displayCardName}" против ${targetPlayer?.login}. ${targetPlayer?.login} может ответить картой "А может тебя?".`,
          cardId: card.id,
          playerId: user.uid,
          targetPlayerId: targetPlayerId ?? undefined
        });

        const cardWasSpent = await commitPlayedCardAndGameState({
          playerRef,
          cardId: card.id,
          gameStatePatch: {
            activeInteraction: {
              playerId: targetPlayerId,
              type: "reflect_response",
              targetPlayerId: user.uid,
              cards: [REFLECT_CARD_ID],
              actingCardId: card.id,
            },
            [`notifications.${targetPlayerId}`]: {
              message: `${playerData.login} сыграл против вас карту "${displayCardName}". Можно отразить эффект картой "А может тебя?".`,
              timestamp,
              cardId: card.id,
            },
          },
          requireCardInInventory: !isAdmin,
        });

        if (!cardWasSpent) {
          notify("Этой карты уже нет в руке.", "warning", card.id);
          return;
        }
        notify(`${targetPlayer?.login} может отразить карту "${displayCardName}".`, 'info', card.id);
        return;
      }

      // Log card usage before removing from inventory
      logEvent({
        id: `card_play_${card.id}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: "Событие игры.",
        cardId: card.id,
        playerId: user.uid,
        targetPlayerId: targetPlayerId ?? undefined
      });

      const shouldSpendBeforeEffect =
        card.action !== "move_steps" &&
        card.action !== "add_coins" &&
        card.action !== "steal_coins" &&
        card.action !== "discard_card" &&
        card.action !== "steal_card" &&
        card.action !== "move_target_for_coins" &&
        card.action !== "discard_next_drawn" &&
        card.action !== "deal_with_mage" &&
        card.action !== "duel" &&
        card.action !== "judge_coins" &&
        card.action !== "move_target_and_self" &&
        card.action !== "pay_or_move_back" &&
        card.action !== "take_next_card" &&
        card.action !== "give_next_card" &&
        card.action !== "communism" &&
        card.action !== "extra_roll" &&
        card.action !== "protection" &&
        card.action !== "spin_wheel" &&
        card.action !== "fish_protection" &&
        card.action !== "promo_code_benefit" &&
        card.action !== "teleport" &&
        card.action !== "teleport_to_type";

      if (shouldSpendBeforeEffect) {
        const cardWasSpent = await commitPlayedCardAndGameState({
          playerRef,
          cardId: card.id,
          requireCardInInventory: !isAdmin,
        });

        if (!cardWasSpent) {
          notify("Этой карты уже нет в руке.", "warning", card.id);
          return;
        }
      }

      switch (card.action) {
        case "extra_roll": {
          const activeBonus = (gameState.currentRoll ?? 0) - (gameState.lastBaseRoll ?? 0);
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            gameStatePatch: {
              currentRoll: null,
              rollConfirmed: false,
              lastBaseRoll: null,
              rollBonus: activeBonus,
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `extra_roll_activated_${Date.now()}`,
            timestamp: Date.now(),
            type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid,
            cardId: card.id
          });
          break;
        }

        case "add_coins":
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { tiltCoins: increment(card.value) },
            gameStatePatch: card.value > 0 ? { hotCoinGain: makeHotCoinGain(user.uid, card.value, card.id, card.name) } : {},
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'success');
          logEvent({
            id: `coin_gain_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'coin_change',
            message: "Событие игры.",
            playerId: user.uid, cardId: card.id, details: { amount: card.value, reason: 'card_effect' }
          });
          break;

        case "steal_coins":
          if (targetRef && targetPlayerId) {
            if (!targetPlayer) {
              notify("Target player not found.", 'error');
              break;
            }
            if (card.id === "inv_016") {
              const roll = rollD6();
              const timestamp = Date.now();
              const visualDiceRoll = {
                id: `${card.id}_${user.uid}_${timestamp}`,
                playerId: user.uid,
                playerName: playerData.login,
                cardId: card.id,
                value: roll,
                timestamp,
              };

              if (roll >= 4) {
                const {
                  amount: actualVictimLoss,
                  promoCodeReduced,
                } = calculatePromoAdjustedLoss({
                  amount: card.value,
                  hasPromoCode: targetPlayer.customStatus === "promo_code_active",
                });
                let cardWasSpent = false;
                await runTransaction(db, async (transaction) => {
                  const playerSnap = await transaction.get(playerRef);
                  const inventory = (playerSnap.data() as Player | undefined)?.inventory ?? [];
                  const hasCard = inventory.includes(card.id);

                  if (!isAdmin && !hasCard) return;

                  transaction.update(targetRef, {
                    tiltCoins: increment(-actualVictimLoss),
                    ...(promoCodeReduced ? clearTemporaryStatus : {}),
                    lastNotification: {
                      message: `${playerData.login} украл у вас ${actualVictimLoss} монет картой "${displayCardName}" (бросок ${roll}).`,
                      timestamp,
                      cardId: card.id,
                    },
                  });
                  transaction.update(playerRef, {
                    ...(hasCard ? { inventory: removeOneCardFromInventory(inventory, card.id) } : {}),
                    tiltCoins: increment(actualVictimLoss),
                  });
                  transaction.update(doc(db, "gameState", "current"), {
                    revealedCards: arrayUnion(card.id),
                    cardDiceRoll: visualDiceRoll,
                  });
                  cardWasSpent = true;
                });

                const resultMessage = `Катжит: бросок ${roll}. Успех! Вы украли ${actualVictimLoss} монет у ${targetPlayer.login}.`;
                if (!cardWasSpent) {
                  notify("Этой карты уже нет в руке.", "warning", card.id);
                  break;
                }

                notify(resultMessage, actualVictimLoss > 0 ? 'success' : 'info', card.id);
                logEvent({
                  id: `katjit_success_${card.id}_${timestamp}`,
                  timestamp,
                  type: 'coin_change',
                  message: `${playerData.login} успешно использовал "${displayCardName}" против ${targetPlayer.login}: бросок ${roll}, украдено ${actualVictimLoss} монет.`,
                  playerId: user.uid,
                  targetPlayerId: targetPlayer.id,
                  cardId: card.id,
                  details: { roll, success: true, amount: actualVictimLoss }
                });
              } else {
                let cardWasSpent = false;
                await runTransaction(db, async (transaction) => {
                  const playerSnap = await transaction.get(playerRef);
                  const inventory = (playerSnap.data() as Player | undefined)?.inventory ?? [];
                  const hasCard = inventory.includes(card.id);

                  if (!isAdmin && !hasCard) return;

                  transaction.update(playerRef, {
                    ...(hasCard ? { inventory: removeOneCardFromInventory(inventory, card.id) } : {}),
                    tiltCoins: increment(-card.value),
                  });
                  transaction.update(doc(db, "gameState", "current"), {
                    revealedCards: arrayUnion(card.id),
                    cardDiceRoll: visualDiceRoll,
                  });
                  cardWasSpent = true;
                });

                if (!cardWasSpent) {
                  notify("Этой карты уже нет в руке.", "warning", card.id);
                  break;
                }
                notify(`Катжит: бросок ${roll}. Провал! Вас заметили, вы теряете ${card.value} монет.`, 'error', card.id);
                logEvent({
                  id: `katjit_fail_${card.id}_${timestamp}`,
                  timestamp,
                  type: 'coin_change',
                  message: `${playerData.login} провалил "${displayCardName}" против ${targetPlayer.login}: бросок ${roll}, штраф ${card.value} монет.`,
                  playerId: user.uid,
                  targetPlayerId: targetPlayer.id,
                  cardId: card.id,
                  details: { roll, success: false, penalty: card.value }
                });
              }
            } else {
              let stealAmount = 0;
              let cardWasSpent = false;
              await runTransaction(db, async (transaction) => {
                const playerSnap = await transaction.get(playerRef);
                const targetSnap = await transaction.get(targetRef);
                const inventory = (playerSnap.data() as Player | undefined)?.inventory ?? [];
                const hasCard = inventory.includes(card.id);

                if (!isAdmin && !hasCard) return;

                const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
                stealAmount = Math.min(Math.max(0, currentTargetCoins), card.value);
                transaction.update(targetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(playerRef, {
                  ...(hasCard ? { inventory: removeOneCardFromInventory(inventory, card.id) } : {}),
                  tiltCoins: increment(stealAmount),
                });
                transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
                cardWasSpent = true;
              });
              if (!cardWasSpent) {
                notify("Этой карты уже нет в руке.", "warning", card.id);
                break;
              }

              notify("Событие игры обновлено.", 'success');
              logEvent({
                id: `steal_other_card_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'coin_change',
                message: "Событие игры.",
                playerId: user.uid, targetPlayerId: targetPlayer.id, cardId: card.id,
                details: { amount: stealAmount, cardName: card.name }
              });
            }
          }
          break;

        case "move_steps": {
          const targetId = targetPlayerId || user.uid;
          const isForward = card.value > 0;
          const isHostile = targetId !== user.uid;

          if (isForward && gameState.phase === "turn") {
            if (card.id === "inv_007" && isHostile) {
              if (targetHasFish) {
                if (!(await spendCardAndClearTargetStatus())) {
                  notify("Этой карты уже нет в руке.", "warning", card.id);
                  break;
                }
                notify(`${targetPlayer?.login} защитился картой "No, no, no Mr.Fish".`, 'warning', card.id);
                logEvent({
                  id: `move_blocked_${card.id}_${Date.now()}`,
                  timestamp: Date.now(),
                  type: 'status_effect',
                  message: `${targetPlayer?.login} заблокировал карту "${card.name}".`,
                  playerId: targetPlayer?.id,
                  targetPlayerId: user.uid,
                  cardId: card.id,
                  details: { protectionCard: 'inv_006' }
                });
                break;
              }

              const timestamp = Date.now();
              if (!(await commitPlayedCardAndGameState({
                playerRef,
                cardId: card.id,
                gameStatePatch: {
                  cardMove: {
                    id: `${card.id}_${timestamp}`,
                    controllerId: user.uid,
                    controllerName: playerData.login,
                    targetId,
                    steps: card.value,
                    cardId: card.id,
                    cardName: card.name,
                  },
                  forcedMovePlayerId: null,
                  currentRoll: null,
                  currentRollPlayerId: null,
                  rollConfirmed: false,
                },
                requireCardInInventory: !isAdmin,
              }))) {
                notify("Этой карты уже нет в руке.", "warning", card.id);
                break;
              }
              notify(`Вы управляете фишкой игрока ${targetPlayer?.login} на ${card.value} клетки.`, 'info', card.id);
              logEvent({
                id: `card_move_start_${card.id}_${timestamp}`,
                timestamp,
                type: 'movement',
                message: `${playerData.login} управляет фишкой ${targetPlayer?.login} по карте "${card.name}".`,
                playerId: user.uid,
                targetPlayerId: targetId,
                cardId: card.id,
                details: { steps: card.value }
              });
              break;
            }

            const isMyRollActive = gameState.currentRoll !== null && gameState.currentRollPlayerId === user.uid;
            if (isMyRollActive) {
              if (!(await commitPlayedCardAndGameState({
                playerRef,
                cardId: card.id,
                gameStatePatch: {
                  currentRoll: increment(card.value),
                  currentRollPlayerId: targetId,
                  rollConfirmed: false,
                },
                requireCardInInventory: !isAdmin,
              }))) {
                notify("Этой карты уже нет в руке.", "warning", card.id);
                break;
              }
              notify(`Ваш текущий ход увеличен на ${card.value} (итого: ${(gameState.currentRoll || 0) + card.value}).`, 'info', card.id);
            } else {
              if (!(await commitPlayedCardAndGameState({
                playerRef,
                cardId: card.id,
                gameStatePatch: {
                  rollBonus: increment(card.value),
                },
                requireCardInInventory: !isAdmin,
              }))) {
                notify("Этой карты уже нет в руке.", "warning", card.id);
                break;
              }
              notify(`Следующий бросок получит бонус +${card.value}.`, 'info', card.id);
            }
          } else {
            const subjectRef = targetRef || playerRef;
            const subjectPlayer = targetPlayerId ? getPlayerById(targetPlayerId) : playerData;
            const currentPos = subjectPlayer?.position || 0;
            const subjectId = targetPlayerId || user.uid;
            const nextPosition = getBacktrackPosition(currentPos, subjectPlayer?.prevCell, card.value);
            let cardWasSpent = false;

            await runTransaction(db, async (transaction) => {
              const actorSnap = await transaction.get(playerRef);
              const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
              const hasCard = inventory.includes(card.id);

              if (!isAdmin && !hasCard) return;

              if (subjectId === user.uid) {
                transaction.update(playerRef, {
                  ...(hasCard ? { inventory: removeOneCardFromInventory(inventory, card.id) } : {}),
                  position: nextPosition,
                  prevCell: null,
                });
              } else {
                if (hasCard) {
                  transaction.update(playerRef, {
                    inventory: removeOneCardFromInventory(inventory, card.id),
                  });
                }
                transaction.update(subjectRef, {
                  position: nextPosition,
                  prevCell: null,
                });
              }
              transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
              cardWasSpent = true;
            });

            if (!cardWasSpent) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify(`${subjectPlayer?.login || playerData.login} переместился на ${card.value} клеток по карте "${card.name}".`, 'info', card.id);
            logEvent({
              id: `player_moved_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'movement',
              message: `${subjectPlayer?.login || playerData.login} переместился на ${card.value} клеток по карте "${card.name}".`,
              playerId: targetPlayerId || user.uid,
              cardId: card.id,
              details: { steps: card.value, reason: 'card_effect' }
            });
          }
          break;
        }

        case "teleport":
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { position: card.value, prevCell: null },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify(`Вы телепортировались на клетку ${card.value}.`, 'info', card.id);
          logEvent({
            id: `teleport_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'movement',
            message: `${playerData.login} телепортировался на клетку ${card.value}.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetPosition: card.value, reason: 'card_effect' }
          });
          break;

        case "teleport_to_type": {
          const currentPos = playerData.position ?? 0;
          const bshops = gameMap.filter((cell) => cell.type === "b-shop").map((cell) => cell.id).sort((a, b) => a - b);
          const targetPosition = bshops.find((id) => id > currentPos) ?? bshops[0];

          if (targetPosition === undefined) {
            notify("На карте не найден B-Shop.", 'warning', card.id);
            break;
          }

          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { position: targetPosition, prevCell: null },
            gameStatePatch: {
              currentRoll: null,
              currentRollPlayerId: null,
              lastBaseRoll: null,
              rollBonus: 0,
              rollConfirmed: false,
              forcedMovePlayerId: null,
              cardMove: null,
              activeInteraction: {
                playerId: playerData.id,
                type: "bshop",
                cards: getRandomInteractionCardIds("bshop", allCards),
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify(`Вы телепортировались в B-Shop на клетку ${targetPosition}.`, 'info', card.id);
          logEvent({
            id: `teleport_to_bshop_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'movement',
            message: `${playerData.login} телепортировался в B-Shop на клетку ${targetPosition}.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetPosition, reason: 'card_effect' }
          });
          break;
        }

        case "spin_wheel":
          if (gameState.showWheel) {
            const wheelWasRerolled = await handleRerollWheel("inv_017");
            if (!wheelWasRerolled) break;

            if (!(await commitPlayedCardAndGameState({
              playerRef,
              cardId: card.id,
              requireCardInInventory: !isAdmin,
            }))) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
          } else {
            if (!(await commitPlayedCardAndGameState({
              playerRef,
              cardId: card.id,
              gameStatePatch: { showWheel: true },
              requireCardInInventory: !isAdmin,
            }))) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Колесо открыто. Дождитесь результата, чтобы использовать переброс.", "info", card.id);
          }
          break;

        case "protection":
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { hasProtection: true },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Силовое поле активно.", 'info', card.id);
          break;
        
        case "fish_protection":
          if (gameState.showWheel) {
            const wheelCardWasCancelled = await cancelLastWheelCardWithFish(user.uid, notify, card.id);
            if (!wheelCardWasCancelled) break;

            if (!(await commitPlayedCardAndGameState({
              playerRef,
              cardId: card.id,
              requireCardInInventory: !isAdmin,
            }))) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
          } else {
            if (!(await commitPlayedCardAndGameState({
              playerRef,
              cardId: card.id,
              playerPatch: {
                customStatus: "fish_shield",
                statusDuration: 1,
              },
              requireCardInInventory: !isAdmin,
            }))) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Защита No, no, no Mr.Fish активна.", 'info', card.id);
          }
          break;

        case "prize":
          notify("Легендарная карта активирована.", 'success', card.id);
          break;

        case "judge_coins": {
          if (!targetPlayerId || !targetRef) {
            notify("Выберите игрока для карты \"Судья душ\".", "warning", card.id);
            break;
          }

          const isHostile = targetPlayerId !== user.uid;
          const reflected = isHostile && targetHasReflect;

          if (isHostile && targetHasFish) {
            let cardWasSpent = false;
            await runTransaction(db, async (transaction) => {
              const actorSnap = await transaction.get(playerRef);
              const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
              const hasCard = inventory.includes(card.id);

              if (!isAdmin && !hasCard) return;

              if (hasCard) {
                transaction.update(playerRef, {
                  inventory: removeOneCardFromInventory(inventory, card.id),
                });
              }
              transaction.update(targetRef, clearTemporaryStatus);
              transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
              cardWasSpent = true;
            });

            if (!cardWasSpent) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }

            notify(`${targetPlayer?.login} защитился картой "No, no, no Mr.Fish".`, "warning", card.id);
            logEvent({
              id: `judge_blocked_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: "status_effect",
              message: `${targetPlayer?.login} заблокировал карту "Судья душ".`,
              playerId: targetPlayerId,
              targetPlayerId: user.uid,
              cardId: card.id,
            });
            break;
          }

          const affectedPlayerId = reflected ? user.uid : targetPlayerId;
          const affectedPlayerName = reflected ? playerData.login : (targetPlayer?.login || "игрок");
          const affectedPlayer = reflected ? playerData : targetPlayer;
          const affectedRef = affectedPlayerId === user.uid ? playerRef : targetRef;
          const originalTargetName = targetPlayer?.login || "игрок";
          const roll = rollD6();
          const timestamp = Date.now();
          const visualDiceRoll = {
            id: `${card.id}_${affectedPlayerId}_${timestamp}`,
            playerId: user.uid,
            playerName: affectedPlayerName,
            cardId: card.id,
            value: roll,
            timestamp,
          };
          const { baseDelta, delta, amount, promoCodeReduced } = calculateJudgeCoinsOutcome({
            roll,
            cardValue: card.value,
            hasPromoCode: affectedPlayer?.customStatus === "promo_code_active",
          });
          const promoText = promoCodeReduced ? " Промокодик смягчил потерю." : "";
          const resultText = delta >= 0 ? `получает ${amount} монет` : `теряет ${amount} монет`;
          const resultMsg = `Судья душ: бросок ${roll}. ${affectedPlayerName} ${resultText}.`;

          const judgeGameStatePatch: Record<string, unknown> = {
            revealedCards: arrayUnion(card.id),
            cardDiceRoll: visualDiceRoll,
          };
          if (delta > 0) {
            judgeGameStatePatch.hotCoinGain = makeHotCoinGain(affectedPlayerId, delta, card.id, displayCardName);
          }
          if (affectedPlayerId !== user.uid) {
            judgeGameStatePatch[`notifications.${affectedPlayerId}`] = {
              message: `${playerData.login} использовал карту "Судья душ" против вас: бросок ${roll}, вы ${delta >= 0 ? `получаете ${amount} монет` : `теряете ${amount} монет`}.`,
              type: delta >= 0 ? "success" : "warning",
              cardId: card.id,
              timestamp: Date.now(),
            };
          }

          let cardWasSpent = false;
          await runTransaction(db, async (transaction) => {
            const actorSnap = await transaction.get(playerRef);
            const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
            const hasCard = inventory.includes(card.id);

            if (!isAdmin && !hasCard) return;

            const actorPatch: Record<string, unknown> = {};
            if (hasCard) {
              actorPatch.inventory = removeOneCardFromInventory(inventory, card.id);
            }
            if (affectedPlayerId === user.uid) {
              actorPatch.tiltCoins = increment(delta);
              if (promoCodeReduced) Object.assign(actorPatch, clearTemporaryStatus);
            }
            if (Object.keys(actorPatch).length > 0) {
              transaction.update(playerRef, actorPatch);
            }

            if (affectedPlayerId !== user.uid) {
              transaction.update(affectedRef, {
                tiltCoins: increment(delta),
                ...(promoCodeReduced ? clearTemporaryStatus : {}),
              });
            }

            if (reflected) {
              transaction.update(targetRef, clearTemporaryStatus);
            }

            transaction.update(doc(db, "gameState", "current"), judgeGameStatePatch);
            cardWasSpent = true;
          });

          if (!cardWasSpent) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          if (reflected) {
            notify(`${originalTargetName} отразил карту "Судья душ". Эффект вернулся к вам.`, "warning", card.id);
          }
          notify(`${resultMsg}${promoText}`, delta >= 0 ? "success" : "warning", card.id);
          logEvent({
            id: `judge_coins_result_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: "coin_change",
            message: `${playerData.login} использовал "Судья душ": бросок ${roll}, ${affectedPlayerName} ${resultText}.`,
            playerId: user.uid,
            targetPlayerId: affectedPlayerId,
            cardId: card.id,
            details: { roll, delta, baseDelta, target: affectedPlayerName, reflected, promoCodeReduced },
          });
          break;
        }        case "deal_with_mage": {
          const roll = rollD6();
          const timestamp = Date.now();
          const mageCardName = "Сделка с магом";
          const mageDiceRoll = {
            id: `${card.id}_${user.uid}_${timestamp}`,
            playerId: user.uid,
            playerName: playerData.login,
            cardId: card.id,
            value: roll,
            timestamp,
          };

          const resolveMageAfterVisualRoll = true;
          if (resolveMageAfterVisualRoll) {
            if (!(await commitPlayedCardAndGameState({
              playerRef,
              cardId: card.id,
              gameStatePatch: {
                cardDiceRoll: mageDiceRoll,
                activeInteraction: null,
              },
              requireCardInInventory: !isAdmin,
            }))) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Сделка с магом: бросаем кубик...", 'info', card.id);
            logEvent({
              id: `mage_deal_roll_${card.id}_${timestamp}`,
              timestamp,
              type: 'card_play',
              message: `${playerData.login} использовал "${mageCardName}" и бросает кубик.`,
              playerId: user.uid,
              cardId: card.id,
            });
            break;
          }

          if (roll === 1) {
            const message = `Сделка с магом: бросок ${roll}. Монет нет, маг отправляет вас на gambling.`;
            await commitPlayerAndGameState(
              playerRef,
              { lastNotification: { message, timestamp, cardId: card.id } },
              {
                cardDiceRoll: mageDiceRoll,
                hotCoinGain: makeHotCoinGain(user.uid, card.value, card.id, mageCardName),
                activeInteraction: {
                  playerId: user.uid,
                  type: "gambling",
                  cards: getRandomInteractionCardIds("gambling", allCards),
                },
              },
            );
            notify(message, 'warning', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'card_play',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, открыт gambling без монет.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: 0, gambling: true }
            });
          } else if (roll <= 4) {
            const message = `Сделка с магом: бросок ${roll}. Вы получаете ${card.value} монет и отправляетесь на gambling.`;
            await commitPlayerAndGameState(
              playerRef,
              {
                tiltCoins: increment(card.value),
                lastNotification: { message, timestamp, cardId: card.id },
              },
              {
                cardDiceRoll: mageDiceRoll,
                activeInteraction: {
                  playerId: user.uid,
                  type: "gambling",
                  cards: getRandomInteractionCardIds("gambling", allCards),
                },
              },
            );
            notify(message, 'info', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'coin_change',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, +${card.value} монет и открыт gambling.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: card.value, gambling: true }
            });
          } else {
            const message = `Сделка с магом: бросок ${roll}. Вы получаете ${card.value} монет. Gambling не открывается.`;
            await commitPlayerAndGameState(
              playerRef,
              {
                tiltCoins: increment(card.value),
                lastNotification: { message, timestamp, cardId: card.id },
              },
              {
                cardDiceRoll: mageDiceRoll,
                hotCoinGain: makeHotCoinGain(user.uid, card.value, card.id, mageCardName),
              },
            );
            notify(message, 'success', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'coin_change',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, +${card.value} монет без gambling.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: card.value, gambling: false }
            });
          }
          break;
        }
        case "discard_card": {
          if (!targetRef || !targetPlayerId) {
            notify("Выберите игрока для этой карты.", "warning", card.id);
            break;
          }

          if (targetHasFish) {
            if (!(await spendCardAndClearTargetStatus())) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Карта заблокирована No, no, no Mr.Fish.", "warning", card.id);
            break;
          }

          const victimId = targetHasReflect ? user.uid : targetPlayerId;
          const victim = getPlayerById(victimId);
          const selectableInventory = victim?.inventory?.filter((inventoryCardId) => inventoryCardId !== "inv_018") ?? [];

          if (!victim || selectableInventory.length === 0) {
            notify("У выбранного игрока нет карт, которые можно сбросить.", "info", card.id);
            break;
          }

          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            gameStatePatch: {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                cards: shuffle(selectableInventory),
                actingCardId: card.id,
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          if (targetHasReflect) {
            await updateDoc(targetRef, clearTemporaryStatus);
            notify("Карта отражена. Вы выбираете карту у себя.", "info", card.id);
          }
          break;
        }

        case "steal_card": {
          if (!targetRef || !targetPlayerId) {
            notify("Выберите игрока для этой карты.", "warning", card.id);
            break;
          }

          if (targetHasFish) {
            if (!(await spendCardAndClearTargetStatus())) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Карта заблокирована No, no, no Mr.Fish.", "warning", card.id);
            break;
          }

          const victimId = targetHasReflect ? user.uid : targetPlayerId;
          const victim = getPlayerById(victimId);
          const recipientId = targetHasReflect ? targetPlayerId : user.uid;
          const selectableInventory = victim?.inventory?.filter((inventoryCardId) => inventoryCardId !== "inv_018") ?? [];

          if (!victim || selectableInventory.length === 0) {
            notify("У выбранного игрока нет карт, которые можно забрать.", "info", card.id);
            break;
          }

          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            gameStatePatch: {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                recipientId,
                cards: shuffle(selectableInventory),
                actingCardId: card.id,
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          if (targetHasReflect) {
            await updateDoc(targetRef, clearTemporaryStatus);
            notify("Карта отражена. Противник заберет выбранную карту у вас.", "info", card.id);
          } else {
            notify("Выберите карту вслепую.", "warning", card.id);
          }
          break;
        }

        case "move_target_for_coins": {
          if (!targetRef || !targetPlayerId) {
            notify("Выберите игрока для этой карты.", "warning", card.id);
            break;
          }

          if (targetHasFish) {
            if (!(await spendCardAndClearTargetStatus())) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }
            notify("Карта заблокирована No, no, no Mr.Fish.", "warning", card.id);
            break;
          }

          const steps = Math.min(playerData.tiltCoins ?? 0, 6);
          if (steps <= 0) {
            notify("Для этой карты нужны монеты.", "warning", card.id);
            break;
          }

          const actualTargetId = targetHasReflect ? user.uid : targetPlayerId;
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            gameStatePatch: {
              activeInteraction: {
                playerId: user.uid,
                type: "move_for_coins_selection",
                cards: [],
                targetPlayerId: actualTargetId,
                actingCardId: card.id,
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          if (targetHasReflect) {
            await updateDoc(targetRef, clearTemporaryStatus);
          }

          notify(
            targetHasReflect
              ? "Карта отражена. Выберите, сколько монет потратить, чтобы двигать свою фишку."
              : `Выберите, сколько монет потратить, чтобы двигать фишку игрока ${targetPlayer?.login}.`,
            "info",
            card.id
          );

          logEvent({
            id: `move_for_coins_start_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: "card_play",
            message: "Событие игры.",
            playerId: user.uid,
            targetPlayerId: targetPlayer?.id,
            cardId: card.id,
            details: { reflected: targetHasReflect },
          });
          break;
        }
        case "discard_next_drawn":
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { discardNextDrawn: true },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `discard_next_drawn_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, cardId: card.id,
            details: { status: 'discardNextDrawn' }
          });
          break;

        case "duel": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `duel_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'error',
              message: "Событие игры.",
              cardId: card.id, playerId: user.uid
            });
            break;
          }

          const duelChallengerId = user.uid;
          const duelTargetId = targetPlayerId;
          const duelCardId = card.id;

          const targetHasFishProtection = targetPlayer.inventory?.includes("inv_006");

          // Текст восстановлен после сбоя кодировки.
          const newDuelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const challengerWaitMessage = `Вы вызвали ${targetPlayer.login} на дуэль. Ожидаем ответа.`;

          const initialDuelState: DuelState = {
            id: newDuelId,
            challengerId: duelChallengerId,
            targetId: duelTargetId,
            status: 'pending',
            weapon: null,
            bets: {
              [duelChallengerId]: 0,
              [duelTargetId]: 0,
            },
            isReady: {
              [duelChallengerId]: false,
              [duelTargetId]: false,
            }
          };

          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: {
              lastNotification: {
                message: challengerWaitMessage,
                timestamp: Date.now(),
                cardId: duelCardId,
              },
            },
            gameStatePatch: {
              [`activeDuels.${newDuelId}`]: initialDuelState,
              activeInteraction: {
                playerId: duelTargetId,
                type: "duel_challenge_response",
                duelId: newDuelId,
                cards: targetHasFishProtection ? ["inv_006"] : [],
                actingCardId: duelCardId,
                targetPlayerId: duelChallengerId,
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          logEvent({
            id: `duel_challenge_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} вызвал ${targetPlayer.login} на дуэль.`,
            playerId: user.uid, targetPlayerId: targetPlayer.id, cardId: card.id,
            details: { status: 'pending', canUseProtection: targetHasFishProtection }
          });
          break;
        }

        case "move_target_and_self": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            notify("Выберите игрока для этой карты.", "warning", card.id);
            break;
          }

          if (targetHasFish) {
            let cardWasSpent = false;
            await runTransaction(db, async (transaction) => {
              const actorSnap = await transaction.get(playerRef);
              const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
              const hasCard = inventory.includes(card.id);

              if (!isAdmin && !hasCard) return;

              if (hasCard) {
                transaction.update(playerRef, {
                  inventory: removeOneCardFromInventory(inventory, card.id),
                });
              }
              transaction.update(targetRef, clearTemporaryStatus);
              transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
              cardWasSpent = true;
            });

            if (!cardWasSpent) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }

            notify("Карта заблокирована No, no, no Mr.Fish.", "warning", card.id);
            logEvent({
              id: `move_and_self_blocked_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: "status_effect",
              message: "Событие игры.",
              playerId: targetPlayer.id,
              targetPlayerId: user.uid,
              cardId: card.id,
              details: { protectionCard: "inv_006" },
            });
            break;
          }

          let cardWasSpent = false;
          await runTransaction(db, async (transaction) => {
            const actorSnap = await transaction.get(playerRef);
            const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
            const hasCard = inventory.includes(card.id);

            if (!isAdmin && !hasCard) return;

            transaction.update(playerRef, {
              ...(hasCard ? { inventory: removeOneCardFromInventory(inventory, card.id) } : {}),
              position: Math.max(0, (playerData.position ?? 0) - 1),
              prevCell: null,
            });
            transaction.update(targetRef, {
              position: (targetPlayer.position ?? 0) + 2,
              prevCell: null,
            });
            transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
            cardWasSpent = true;
          });

          if (!cardWasSpent) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          notify("Событие игры обновлено.", "info", card.id);
          logEvent({
            id: `move_and_self_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: "movement",
            message: "Событие игры.",
            playerId: user.uid,
            targetPlayerId: targetPlayer.id,
            cardId: card.id,
            details: { selfMove: -1, targetMove: 2 },
          });
          break;
        }
        case "pay_or_move_back": {
          const roundPlayerIds = gameState.turnOrder.length > 0
            ? gameState.turnOrder
            : players.filter(p => p.inGame && p.role !== 'admin').map(p => p.id);
          const taxTargetIds = roundPlayerIds.filter((id) => id !== user.uid && Boolean(getPlayerById(id)));
          const firstTaxTargetId = taxTargetIds[0];

          if (!firstTaxTargetId) {
            notify("Платить налоги некому: в очереди нет других активных игроков.", 'info', card.id);
            break;
          }

          const firstTaxTarget = getPlayerById(firstTaxTargetId);
          const timestamp = Date.now();
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            gameStatePatch: {
              activeInteraction: {
                playerId: firstTaxTargetId,
                type: "tax_response",
                targetPlayerId: user.uid,
                taxOwnerId: user.uid,
                taxOwnerName: playerData.login,
                taxCollectorId: user.uid,
                taxCollectorName: playerData.login,
                taxBank: 0,
                taxQueue: taxTargetIds.slice(1),
                cards: getTaxResponseCardIds(firstTaxTarget),
                actingCardId: card.id,
              },
              [`notifications.${firstTaxTargetId}`]: {
                message: `${playerData.login} собирает банк налогов. Заплатите 2 монеты, используйте Промокодик или выберите gambling.`,
                timestamp,
                cardId: card.id,
              },
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify(`Карта "Платите налоги!" запущена. Ожидаем ответ игрока ${firstTaxTarget?.login || "игрок"}.`, 'info', card.id);
          logEvent({
            id: `taxes_started_${card.id}_${timestamp}`,
            timestamp,
            type: 'card_play',
            message: `${playerData.login} сыграл "Платите налоги!" для ${taxTargetIds.length} активных игроков.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetIds: taxTargetIds },
          });
          break;
        }
        case "take_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `take_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          let cardWasSpent = false;
          await runTransaction(db, async (transaction) => {
            const actorSnap = await transaction.get(playerRef);
            const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
            const hasCard = inventory.includes(card.id);

            if (!isAdmin && !hasCard) return;

            if (hasCard) {
              transaction.update(playerRef, {
                inventory: removeOneCardFromInventory(inventory, card.id),
              });
            }
            transaction.update(doc(db, "players", nextPlayerId), {
              redirectNextDrawnToPlayerId: user.uid,
            });
            transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
            cardWasSpent = true;
          });

          if (!cardWasSpent) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `take_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'redirect_next_drawn' }
          });
          break;
        }

        case "give_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `give_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: { giveNextDrawnToPlayerId: nextPlayerId },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `give_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'give_next_drawn' }
          });
          break;
        }

        case "communism": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            notify("Выберите игрока для этой карты.", "warning", card.id);
            break;
          }

          if (targetHasFish) {
            let cardWasSpent = false;
            await runTransaction(db, async (transaction) => {
              const actorSnap = await transaction.get(playerRef);
              const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
              const hasCard = inventory.includes(card.id);

              if (!isAdmin && !hasCard) return;

              if (hasCard) {
                transaction.update(playerRef, {
                  inventory: removeOneCardFromInventory(inventory, card.id),
                });
              }
              transaction.update(targetRef, clearTemporaryStatus);
              transaction.update(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });
              cardWasSpent = true;
            });

            if (!cardWasSpent) {
              notify("Этой карты уже нет в руке.", "warning", card.id);
              break;
            }

            notify("Карта заблокирована No, no, no Mr.Fish.", "warning", card.id);
            break;
          }

          const reflected = targetHasReflect;
          const actualTargetRef = reflected ? playerRef : targetRef;
          const actualRecipientRef = reflected ? targetRef : playerRef;
          const victimData = reflected ? playerData : targetPlayer;
          const hotCoinGain = gameState.hotCoinGain;
          const hotAmount = hotCoinGain?.playerId === victimData.id ? hotCoinGain.amount : 0;
          const baseStealAmount = Math.ceil(Math.max(0, hotAmount) / 2);

          if (baseStealAmount <= 0) {
            notify("Нет актуальной горячей суммы для Коммунизма.", "info", card.id);
            break;
          }

          const { amount: stealAmount, promoCodeReduced } = calculatePromoAdjustedLoss({
            amount: baseStealAmount,
            hasPromoCode: victimData.customStatus === "promo_code_active",
          });

          let cardWasSpent = false;
          await runTransaction(db, async (transaction) => {
            const actorSnap = await transaction.get(playerRef);
            const inventory = (actorSnap.data() as Player | undefined)?.inventory ?? [];
            const hasCard = inventory.includes(card.id);

            if (!isAdmin && !hasCard) return;

            if (hasCard || actualRecipientRef === playerRef || actualTargetRef === playerRef) {
              const actorPatch: Record<string, unknown> = {};
              if (hasCard) actorPatch.inventory = removeOneCardFromInventory(inventory, card.id);
              if (actualTargetRef === playerRef) {
                actorPatch.tiltCoins = increment(-stealAmount);
                if (promoCodeReduced) Object.assign(actorPatch, clearTemporaryStatus);
              }
              if (actualRecipientRef === playerRef) {
                actorPatch.tiltCoins = increment(stealAmount);
              }
              if (Object.keys(actorPatch).length > 0) transaction.update(playerRef, actorPatch);
            }

            if (actualTargetRef !== playerRef) {
              transaction.update(actualTargetRef, {
                tiltCoins: increment(-stealAmount),
                ...(promoCodeReduced ? clearTemporaryStatus : {}),
              });
            }
            if (actualRecipientRef !== playerRef) {
              transaction.update(actualRecipientRef, { tiltCoins: increment(stealAmount) });
            }
            if (reflected) {
              transaction.update(targetRef, clearTemporaryStatus);
            }
            transaction.update(doc(db, "gameState", "current"), {
              hotCoinGain: null,
              revealedCards: arrayUnion(card.id),
            });
            cardWasSpent = true;
          });

          if (!cardWasSpent) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }

          const victimName = reflected ? playerData.login : targetPlayer.login;
          const getterName = reflected ? targetPlayer.login : playerData.login;
          const promoText = promoCodeReduced ? " Промокодик снизил потерю вдвое." : "";
          notify(`${getterName} получил ${stealAmount} монет от ${victimName}.${promoText}`, "success", card.id);
          logEvent({
            id: `communism_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: "coin_change",
            message: `${getterName} получил ${stealAmount} монет от ${victimName}.${promoText}`,
            playerId: user.uid,
            targetPlayerId,
            cardId: card.id,
            details: { amount: stealAmount, baseAmount: baseStealAmount, reflected, promoCodeReduced },
          });
          break;
        }
        case "promo_code_benefit":
          if (!(await commitPlayedCardAndGameState({
            playerRef,
            cardId: card.id,
            playerPatch: {
              customStatus: "promo_code_active",
              statusDuration: 1,
            },
            requireCardInInventory: !isAdmin,
          }))) {
            notify("Этой карты уже нет в руке.", "warning", card.id);
            break;
          }
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `promo_code_activated_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, cardId: card.id,
            details: { status: 'promo_code_active' }
          });
          break;



        default:
          console.warn("Неизвестное действие карты:", card.action);
          notify("Событие игры обновлено.", 'error');
      }
    } catch (e) {
      console.error(e);
      await updateDoc(playerRef, { inventory: playerData.inventory ?? [card.id] }).catch(() => {
        console.error("Ошибка действия.");
      });
      await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayRemove(card.id) }).catch(() => {
        console.error("Ошибка действия.");
      });
      notify("Событие игры обновлено.", 'error');
    }
  };

  // Текст восстановлен после сбоя кодировки.
  const handleDrawnCardDistribution = useCallback(
    async (
      player: Player,
      card: GameCard,
      transaction: any,
    ) => {
      const playerRef = doc(db, "players", player.id);
      let suppressCard = false;
      let finalRecipientId = player.id;

      if (player.redirectNextDrawnToPlayerId) {
        finalRecipientId = player.redirectNextDrawnToPlayerId;
      } else if (player.giveNextDrawnToPlayerId) {
        finalRecipientId = player.giveNextDrawnToPlayerId;
      }

      const finalRecipientRef = doc(db, "players", finalRecipientId);
      let recipientInventory = player.inventory;
      let finalRecipientName = player.login;
      if (finalRecipientId !== player.id) {
        const recipientSnap = await transaction.get(finalRecipientRef);
        const recipientData = recipientSnap.data() as Player | undefined;
        recipientInventory = recipientData?.inventory;
        finalRecipientName = recipientData?.login || finalRecipientName;
      }

      const isLegendaryPrize = isLegendaryPrizeCard(card, card.id);
      const gameStateRef = doc(db, "gameState", "current");
      const prizeRef = isLegendaryPrize ? doc(db, "prizes", card.id) : null;
      const prizeSnap = prizeRef ? await transaction.get(prizeRef) : null;
      const prizeData = prizeSnap?.exists() ? (prizeSnap.data() as GameCard) : null;

      if (player.discardNextDrawn) {
        suppressCard = true;
        transaction.update(playerRef, { discardNextDrawn: false });
        notify("Событие игры обновлено.", 'info');
        logEvent({
          id: `card_discarded_by_effect_${card.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'card_play',
          message: "Событие игры.",
          playerId: player.id, cardId: card.id,
          details: { reason: 'discard_next_drawn' }
        });
      } else if (player.redirectNextDrawnToPlayerId) {
        transaction.update(playerRef, { redirectNextDrawnToPlayerId: null });
        notify("Событие игры обновлено.", 'info');
      } else if (player.giveNextDrawnToPlayerId) {
        transaction.update(playerRef, { giveNextDrawnToPlayerId: null });
        notify("Событие игры обновлено.", 'info');
      }

      if (!suppressCard) {
        if (isLegendaryPrize) {
          if (prizeData?.isWon) {
            notify(`Легендарная карта "${card.name}" уже была получена в этой игре. Повтор не выдается.`, 'info', card.id);
            logEvent({
              id: `legendary_duplicate_blocked_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'info',
              message: `Легендарная карта "${card.name}" уже была получена ранее и не выдана повторно.`,
              playerId: finalRecipientId,
              cardId: card.id,
              details: { reason: 'legendary_unique' },
            });
            return;
          }

          if (prizeRef) {
            transaction.set(prizeRef, {
              ...card,
              isUnique: true,
              isWon: true,
              winnerId: finalRecipientId,
            }, { merge: true });
          }

          transaction.update(gameStateRef, {
            revealedCards: arrayUnion(card.id),
            [`notifications.${finalRecipientId}`]: {
              message: "Вы только что вытащили легендарную карту, будьте готовы к последствиям",
              timestamp: Date.now(),
              cardId: card.id,
            },
          });
          logEvent({
            id: `legendary_received_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'card_play',
            message: `Игрок "${finalRecipientName}" получил легендарную карту "${card.name}"`,
            playerId: finalRecipientId,
            cardId: card.id,
          });
          return;
        }

        transaction.update(finalRecipientRef, {
          inventory: addOneCardToInventory(recipientInventory, card.id),
        });
      }
    },
    [notify, logEvent]
  );
  const handleSelectOpponentCard = async (targetPlayerId: string, cardId: string) => {
    if (!user || !playerData) return;

    const gsRef = doc(db, "gameState", "current");

    // --- START: Golden Card Protection (inv_018) ---
    if (cardId === "inv_018") {
      notify("Событие игры обновлено.", 'warning');
      logEvent({
        id: `golden_card_protection_${cardId}_${Date.now()}`,
        timestamp: Date.now(), type: 'warning',
        message: "Событие игры.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: cardId,
        details: { action: 'steal_or_discard', outcome: 'blocked' }
      });
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gsRef);
        if (!gsSnap.exists()) return;

        const interaction = (gsSnap.data() as GameState).activeInteraction;
        if (
          interaction?.type === "discard_selection" &&
          interaction.playerId === user.uid &&
          interaction.targetPlayerId === targetPlayerId &&
          interaction.cards.includes(cardId)
        ) {
          transaction.update(gsRef, { activeInteraction: null });
        }
      });
      return;
    }
    // --- END: Golden Card Protection ---

    if (!user || !playerData) return;

    console.log("Выбор карты соперника:", targetPlayerId, "карта:", cardId);
    const cardName = allCards[cardId]?.name || "неизвестная карта";
    const actingCardId = gameState.activeInteraction?.actingCardId;
    const targetName = getPlayerById(targetPlayerId)?.login || "игрок";

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gsRef);
        if (!gsSnap.exists()) return;

        const interaction = (gsSnap.data() as GameState).activeInteraction;
        if (
          !interaction ||
          interaction.type !== "discard_selection" ||
          interaction.playerId !== user.uid ||
          interaction.targetPlayerId !== targetPlayerId ||
          !interaction.cards.includes(cardId)
        ) {
          throw new Error("Некорректное или устаревшее взаимодействие выбора карты.");
        }

        const isSteal = interaction?.actingCardId === "inv_011";
        const recipientId = interaction?.recipientId;
        const targetRef = doc(db, "players", targetPlayerId);
        const targetSnap = await transaction.get(targetRef);
        const targetInventory = (targetSnap.data() as Player | undefined)?.inventory;
        if (!targetInventory?.includes(cardId)) {
          throw new Error("Выбранной карты больше нет у цели.");
        }

        let recipientInventory: string[] | undefined;
        if (isSteal && recipientId) {
          const recipientSnap = await transaction.get(doc(db, "players", recipientId));
          recipientInventory = (recipientSnap.data() as Player | undefined)?.inventory;
        }

        // Текст восстановлен после сбоя кодировки.
        transaction.update(targetRef, {
          inventory: removeOneCardFromInventory(targetInventory, cardId),
          // Текст восстановлен после сбоя кодировки.
          lastNotification: {
            message: isSteal 
              ? `Игрок "${playerData.login}" забрал у вас карту "${cardName}"`
              : `Игрок "${playerData.login}" сбросил вашу карту "${cardName}"`,
            timestamp: Date.now(),
            cardId: cardId
          }
        });

        // Текст восстановлен после сбоя кодировки.
        if (isSteal && recipientId) {
          const recipientRef = doc(db, "players", recipientId);
          transaction.update(recipientRef, {
            inventory: addOneCardToInventory(recipientInventory, cardId),
            lastNotification: {
              message: `Вы забрали у игрока ${targetName} карту "${cardName}".`,
              timestamp: Date.now(),
              cardId,
            },
          });
        }

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, {
          activeInteraction: null,
          [`notifications.${user.uid}`]: {
            message: isSteal
              ? `Вы забрали у игрока ${targetName} карту "${cardName}".`
              : `Вы сбросили у игрока ${targetName} карту "${cardName}".`,
            timestamp: Date.now(),
            cardId,
          },
        });

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, {
          revealedCards: arrayUnion(cardId)
        });
      });
    } catch (e) {
      console.error("Ошибка действия.");
      if (actingCardId) {
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gsRef);
          const playerRef = doc(db, "players", user.uid);
          const playerSnap = await transaction.get(playerRef);
          if (!gsSnap.exists() || !playerSnap.exists()) return;

          const interaction = (gsSnap.data() as GameState).activeInteraction;
          if (
            !interaction ||
            interaction.type !== "discard_selection" ||
            interaction.playerId !== user.uid ||
            interaction.targetPlayerId !== targetPlayerId ||
            interaction.actingCardId !== actingCardId
          ) {
            return;
          }

          const currentInventory = (playerSnap.data() as Player).inventory;
          transaction.update(playerRef, { inventory: addOneCardToInventory(currentInventory, actingCardId) });
          transaction.update(gsRef, {
            activeInteraction: null,
            revealedCards: arrayRemove(actingCardId),
          });
        }).catch(() => {
          console.error("Ошибка действия.");
        });
      }
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `select_opponent_card_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: cardId,
        details: { error: e }
      });

    }
  };

  // New handler for confirming coin payment and initiating move for inv_013
  const handleConfirmMoveForCoins = async (steps: number) => {
    if (!user || !playerData || !gameState.activeInteraction || gameState.activeInteraction.type !== "move_for_coins_selection") {
      console.error("Invalid state for handleConfirmMoveForCoins");
      return;
    }

    const { targetPlayerId, actingCardId, playerId } = gameState.activeInteraction;
    if (!targetPlayerId) {
      console.error("Target player not found for active interaction");
      return;
    }
    if (!actingCardId) {
      console.error("Card not found for active interaction:", actingCardId);
      return;
    }
    const card = allCards[actingCardId];
    if (!card) {
      console.error("Card not found for active interaction:", actingCardId);
      return;
    }

    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");
    let availableCoins = playerData.tiltCoins ?? 0;

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists()) throw new Error("Game state not found");
        if (!pSnap.exists()) throw new Error("Player data not found");
        const currentInteraction = (gsSnap.data() as GameState).activeInteraction;
        if (
          !currentInteraction ||
          currentInteraction.type !== "move_for_coins_selection" ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.targetPlayerId !== targetPlayerId ||
          currentInteraction.actingCardId !== actingCardId
        ) {
          throw new Error("Invalid move-for-coins state.");
        }

        const currentPlayer = pSnap.data() as Player;
        const currentPlayerCoins = currentPlayer.tiltCoins || 0;
        availableCoins = currentPlayerCoins;
        if (currentPlayerCoins < steps) {
          throw new Error("INSUFFICIENT_CORRUPTION_COINS");
        }
        transaction.update(playerRef, { tiltCoins: increment(-steps) });
        transaction.update(gameStateRef, { revealedCards: arrayUnion(card.id) });

        const timestamp = Date.now();

        transaction.update(playerRef, {
          lastNotification: {
            message: "Событие игры.",
            timestamp,
            cardId: card.id,
          },
        });

        // Trigger card-controlled movement without touching the dice roll.
        transaction.update(gameStateRef, {
          cardMove: {
            id: `${card.id}_${timestamp}`,
            controllerId: playerId,
            controllerName: playerData.login,
            targetId: targetPlayerId,
            steps,
            cardId: card.id,
            cardName: card.name,
          },
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
          forcedMovePlayerId: null,
          activeInteraction: null,
        });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_CORRUPTION_COINS") {
        notify(`Не хватает монет для Коррупции: у вас ${availableCoins}, а выбрано ${steps}.`, "warning", actingCardId);
        return;
      }

      console.error(e);
      notify("Не удалось применить Коррупцию.", 'error', actingCardId);
      logEvent({
        id: `confirm_move_for_coins_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Не удалось подтвердить движение по карте Коррупция.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: actingCardId,
        details: { error: e }
      });

    }
  };

  const handleReflectResponse = async (useReflect: boolean) => {
    if (!user || !playerData || !gameState.activeInteraction || gameState.activeInteraction.type !== "reflect_response") return;

    const interaction = gameState.activeInteraction;
    if (interaction.playerId !== user.uid || !interaction.targetPlayerId || !interaction.actingCardId) return;

    const defenderId = user.uid;
    const attackerId = interaction.targetPlayerId;
    const actingCardId = interaction.actingCardId;
    const card = allCards[actingCardId];
    const attacker = getPlayerById(attackerId);
    const defender = playerData;
    const gameStateRef = doc(db, "gameState", "current");
    const defenderRef = doc(db, "players", defenderId);

    const isCurrentReflectInteraction = (currentInteraction: GameState["activeInteraction"] | undefined) =>
      currentInteraction?.type === "reflect_response" &&
      currentInteraction.playerId === defenderId &&
      currentInteraction.targetPlayerId === attackerId &&
      currentInteraction.actingCardId === actingCardId;

    const closeCurrentReflectInteraction = async () => {
      let interactionClosed = false;
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
        if (!isCurrentReflectInteraction(currentInteraction)) return;

        transaction.update(gameStateRef, { activeInteraction: null });
        interactionClosed = true;
      });
      return interactionClosed;
    };

    if (!card || !attacker) {
      await closeCurrentReflectInteraction();
      return;
    }

    const openMoveForCoins = async (controllerId: string, targetId: string, reflected: boolean) => {
      const controller = getPlayerById(controllerId);
      let interactionOpened = false;
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
        if (!isCurrentReflectInteraction(currentInteraction)) return;

        transaction.update(gameStateRef, {
          activeInteraction: {
            playerId: controllerId,
            type: "move_for_coins_selection",
            cards: [],
            targetPlayerId: targetId,
            actingCardId: card.id,
            reflected,
          },
        });
        interactionOpened = true;
      });
      if (interactionOpened) {
        notify(`${controller?.login || "Игрок"} выбирает, сколько монет потратить на коррупцию.`, 'info', card.id);
      }
    };

    const openDiscardSelection = async (selectorId: string, victimId: string, recipientId?: string) => {
      const victim = getPlayerById(victimId);
      const selectableInventory = victim?.inventory?.filter((inventoryCardId) => inventoryCardId !== "inv_018") ?? [];
      if (selectableInventory.length === 0) {
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (isCurrentReflectInteraction(currentInteraction)) {
            transaction.update(gameStateRef, { activeInteraction: null });
          }
        });
        notify("У цели нет карт для выбора.", 'info', card.id);
        return;
      }

      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
        if (!isCurrentReflectInteraction(currentInteraction)) return;

        transaction.update(gameStateRef, {
          activeInteraction: {
            playerId: selectorId,
            type: "discard_selection",
            targetPlayerId: victimId,
            ...(recipientId ? { recipientId } : {}),
            cards: shuffle(selectableInventory),
            actingCardId: card.id,
          },
        });
      });
    };
    const applyJudge = async (targetId: string, targetName: string, reflected: boolean) => {
      const roll = rollD6();
      const affectedPlayer = getPlayerById(targetId);
      const { delta, amount, promoCodeReduced } = calculateJudgeCoinsOutcome({
        roll,
        cardValue: card.value,
        hasPromoCode: affectedPlayer?.customStatus === "promo_code_active",
      });
      const promoText = promoCodeReduced ? " Промокодик смягчил потерю." : "";
      const message = `Судья душ: бросок ${roll}. ${targetName} ${delta >= 0 ? `получает ${amount} монет` : `теряет ${amount} монет`}.${promoText}`;

      let effectApplied = false;
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
        if (!isCurrentReflectInteraction(currentInteraction)) return;

        transaction.update(doc(db, "players", targetId), {
          tiltCoins: increment(delta),
          ...(promoCodeReduced ? clearTemporaryStatus : {}),
          lastNotification: { message, timestamp: Date.now(), cardId: card.id },
        });
        transaction.update(gameStateRef, {
          activeInteraction: null,
          ...(delta > 0 ? { hotCoinGain: makeHotCoinGain(targetId, delta, card.id, card.name) } : {}),
        });
        effectApplied = true;
      });
      if (!effectApplied) return;
      notify(reflected ? `Карта отражена. ${message}` : message, delta >= 0 ? 'success' : 'warning', card.id);
    };

    const applyMage = async (target: Player, reflected: boolean) => {
      const roll = rollD6();
      const timestamp = Date.now();
      const mageDiceRoll = {
        id: `${card.id}_${target.id}_${timestamp}`,
        playerId: target.id,
        playerName: target.login,
        cardId: card.id,
        value: roll,
        timestamp,
      };

      const resolveMageAfterVisualRoll = true;
      if (resolveMageAfterVisualRoll) {
        let effectApplied = false;
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (!isCurrentReflectInteraction(currentInteraction)) return;

          transaction.update(gameStateRef, {
            cardDiceRoll: mageDiceRoll,
            activeInteraction: null,
          });
          effectApplied = true;
        });
        if (!effectApplied) return;
        notify(reflected ? `Карта отражена. ${target.login} бросает кубик для "Сделки с магом".` : `${target.login} бросает кубик для "Сделки с магом".`, 'info', card.id);
        return;
        return;
      }

      if (roll <= 4) {
        await updateDoc(doc(db, "players", target.id), {
          ...(roll > 1 ? { tiltCoins: increment(card.value) } : {}),
          lastNotification: {
            message: `Сделка с магом: бросок ${roll}. ${roll > 1 ? `+${card.value} монет и ` : ""}открыт gambling.`,
            timestamp,
            cardId: card.id,
          },
        });
        await updateDoc(gameStateRef, {
          cardDiceRoll: mageDiceRoll,
          activeInteraction: {
            playerId: target.id,
            type: "gambling",
            cards: getRandomInteractionCardIds("gambling", allCards),
          },
        });
      } else {
        await updateDoc(doc(db, "players", target.id), {
          tiltCoins: increment(card.value),
          lastNotification: {
            message: `Сделка с магом: бросок ${roll}. +${card.value} монет.`,
            timestamp,
            cardId: card.id,
          },
        });
        await updateDoc(gameStateRef, { activeInteraction: null });
        await updateDoc(gameStateRef, { cardDiceRoll: mageDiceRoll });
      }

      notify(reflected ? `Карта отражена. Рыбка теперь у ${target.login}.` : `Рыбка теперь защищает ${target.login}.`, 'info', card.id);
    };

    const applyKatjit = async (target: Player, thief: Player, forcedFail: boolean) => {
      const timestamp = Date.now();
      const roll = forcedFail ? 1 : rollD6();

      if (roll >= 4) {
        const hasPromoCode = target.customStatus === "promo_code_active";
        const { amount: victimLoss, promoCodeReduced } = calculatePromoAdjustedLoss({
          amount: card.value,
          hasPromoCode,
        });
        let effectApplied = false;
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (!isCurrentReflectInteraction(currentInteraction)) return;

          transaction.update(doc(db, "players", target.id), {
            tiltCoins: increment(-victimLoss),
            lastNotification: {
              message: `${thief.login} украл у вас ${victimLoss} монет картой "Катжит не виноват!" (бросок ${roll}).`,
              timestamp,
              cardId: card.id,
            },
            ...(promoCodeReduced ? clearTemporaryStatus : {}),
          });
          transaction.update(doc(db, "players", thief.id), { tiltCoins: increment(victimLoss) });
          transaction.update(gameStateRef, { activeInteraction: null });
          effectApplied = true;
        });
        if (!effectApplied) return;

        notify(`Катжит: бросок ${roll}. ${thief.login} украл ${victimLoss} монет у ${target.login}.`, 'success', card.id);
      } else {
        let effectApplied = false;
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (!isCurrentReflectInteraction(currentInteraction)) return;

          transaction.update(doc(db, "players", thief.id), {
            tiltCoins: increment(-card.value),
            lastNotification: {
              message: `Катжит: бросок ${roll}. Провал, вы теряете ${card.value} монет.`,
              timestamp,
              cardId: card.id,
            },
          });
          transaction.update(gameStateRef, { activeInteraction: null });
          effectApplied = true;
        });
        if (!effectApplied) return;

        notify(`Катжит: бросок ${roll}. Провал, ${thief.login} теряет ${card.value} монет.`, 'warning', card.id);
      }
    };
    const applyTaxToOne = async (victim: Player, recipient: Player) => {
      const paymentAmount = card.value || 2;
      const victimCoins = victim.tiltCoins ?? 0;

      if (victimCoins >= paymentAmount) {
        let effectApplied = false;
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (!isCurrentReflectInteraction(currentInteraction)) return;

          transaction.update(doc(db, "players", victim.id), { tiltCoins: increment(-paymentAmount) });
          transaction.update(doc(db, "players", recipient.id), { tiltCoins: increment(paymentAmount) });
          transaction.update(gameStateRef, { activeInteraction: null });
          effectApplied = true;
        });
        if (!effectApplied) return;

        notify(`${victim.login} заплатил ${paymentAmount} монет игроку ${recipient.login}.`, 'info', card.id);
      } else {
        let effectApplied = false;
        await runTransaction(db, async (transaction) => {
          const gsSnap = await transaction.get(gameStateRef);
          const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
          if (!isCurrentReflectInteraction(currentInteraction)) return;

          transaction.update(gameStateRef, {
            activeInteraction: {
              playerId: victim.id,
              type: "gambling",
              cards: getRandomInteractionCardIds("gambling", allCards),
              actingCardId: card.id,
            },
          });
          effectApplied = true;
        });
        if (!effectApplied) return;

        notify(`${victim.login} не смог заплатить налог и тянет gambling.`, 'warning', card.id);
      }
    };
    try {
      if (useReflect) {
        if (card.id === "inv_013" && (defender.tiltCoins ?? 0) <= 0) {
          notify('Нельзя отразить "Коррупцию": у вас нет монет для движения.', 'warning', REFLECT_CARD_ID);
          return;
        }

        let reflectWasSpent = false;
        await runTransaction(db, async (transaction) => {
          const defenderSnap = await transaction.get(defenderRef);
          const defenderInventory = (defenderSnap.data() as Player | undefined)?.inventory ?? [];

          if (!defenderInventory.includes(REFLECT_CARD_ID)) return;

          transaction.update(defenderRef, {
            inventory: removeOneCardFromInventory(defenderInventory, REFLECT_CARD_ID),
          });
          transaction.update(gameStateRef, {
            revealedCards: arrayUnion(REFLECT_CARD_ID),
            ...(card.id === REFLECT_CARD_ID ? { activeInteraction: null } : {}),
          });
          reflectWasSpent = true;
        });

        if (!reflectWasSpent) {
          notify('У вас нет карты "А может тебя?".', 'warning', REFLECT_CARD_ID);
          return;
        }

        if (card.id === REFLECT_CARD_ID) {
          notify("Отражение отменило отражение. Карта не сработала.", 'info', REFLECT_CARD_ID);
          return;
        }
      }
      const reflected = useReflect;
      const target = reflected ? attacker : defender;
      const controller = reflected ? defender : attacker;

      switch (card.id) {
        case "inv_007": {
          const timestamp = Date.now();
          let effectApplied = false;
          await runTransaction(db, async (transaction) => {
            const gsSnap = await transaction.get(gameStateRef);
            const currentInteraction = (gsSnap.data() as GameState | undefined)?.activeInteraction;
            if (!isCurrentReflectInteraction(currentInteraction)) return;

            transaction.update(gameStateRef, {
              cardMove: {
                id: `${card.id}_${timestamp}`,
                controllerId: controller.id,
                controllerName: controller.login,
                targetId: target.id,
                steps: card.value,
                cardId: card.id,
                cardName: card.name,
              },
              forcedMovePlayerId: null,
              currentRoll: null,
              currentRollPlayerId: null,
              rollConfirmed: false,
              activeInteraction: null,
            });
            effectApplied = true;
          });
          if (!effectApplied) break;

          notify(reflected ? `Карта отражена. Теперь ${defender.login} управляет фишкой ${attacker.login}.` : `${attacker.login} управляет фишкой ${defender.login}.`, 'info', card.id);
          break;
        }        case "inv_008":
          await applyJudge(target.id, target.login, reflected);
          break;
        case "inv_009":
          await applyMage(target, reflected);
          break;
        case "inv_010":
          await openDiscardSelection(controller.id, target.id);
          break;
        case "inv_011":
          await openDiscardSelection(controller.id, target.id, controller.id);
          break;
        case "inv_013":
          await openMoveForCoins(controller.id, target.id, reflected);
          break;
        case "inv_015":
          if (reflected) {
            if (!(await closeCurrentReflectInteraction())) break;
            notify("Карта отражена. Вы не платите монеты и не тянете gambling.", 'info', card.id);
          } else {
            await applyTaxToOne(defender, attacker);
          }
          break;
        case "inv_016":
          await applyKatjit(defender, attacker, reflected);
          break;
        default:
          if (!(await closeCurrentReflectInteraction())) break;
          notify("Эту карту нельзя отразить.", 'warning', REFLECT_CARD_ID);
      }
    } catch (e) {
      console.error(e);
      notify("Не удалось обработать ответную карту.", 'error', REFLECT_CARD_ID);
    }
  };

  const handleTaxResponse = async (response: "pay" | "gambling" | "reflect" | "promo" | "fish") => {
    if (!user || !playerData || !gameState.activeInteraction || gameState.activeInteraction.type !== "tax_response") return;

    const interaction = gameState.activeInteraction;
    if (interaction.playerId !== user.uid) return;

    const ownerId = interaction.taxOwnerId || interaction.targetPlayerId;
    if (!ownerId) return;

    const ownerName = interaction.taxOwnerName || getPlayerById(ownerId)?.login || "игрок";
    const taxCardId = interaction.actingCardId || "inv_015";
    const taxCard = allCards[taxCardId];
    const paymentAmount = taxCard?.value || 2;
    const promoPaymentAmount = Math.floor(paymentAmount / 2);
    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid);

    let finalBank = 0;
    let finalCollectorName = ownerName;
    let queueFinished = false;
    let responseApplied = false;

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const playerSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !playerSnap.exists()) return;

        const currentInteraction = (gsSnap.data() as GameState).activeInteraction;
        const currentTaxCardId = currentInteraction?.actingCardId || "inv_015";
        const currentOwnerId = currentInteraction?.taxOwnerId || currentInteraction?.targetPlayerId;
        if (
          !currentInteraction ||
          currentInteraction.type !== "tax_response" ||
          currentInteraction.playerId !== user.uid ||
          currentTaxCardId !== taxCardId ||
          currentOwnerId !== ownerId
        ) {
          return;
        }

        let queue = currentInteraction.taxQueue ?? [];
        const timestamp = Date.now();
        let collectorId = currentInteraction.taxCollectorId || ownerId;
        let collectorName = currentInteraction.taxCollectorName || ownerName;
        let bank = currentInteraction.taxBank ?? 0;
        const updates: Record<string, unknown> = {};

        if (response === "pay" || response === "promo") {
          const currentPlayer = playerSnap.data() as Player;
          const currentInventory = currentPlayer.inventory;
          const usedPromo = response === "promo";
          const hasPromoInInventory = currentInventory?.includes("inv_019");
          const hasActivePromo = currentPlayer.customStatus === "promo_code_active";
          if (usedPromo && !hasPromoInInventory && !hasActivePromo) {
            throw new Error("promo_card_missing");
          }

          const actualPayment = usedPromo ? promoPaymentAmount : paymentAmount;
          bank += actualPayment;
          transaction.update(playerRef, {
            tiltCoins: increment(-actualPayment),
            ...(usedPromo && hasPromoInInventory ? { inventory: removeOneCardFromInventory(currentInventory, "inv_019") } : {}),
            ...(usedPromo && hasActivePromo ? clearTemporaryStatus : {}),
            lastNotification: {
              message: usedPromo
                ? `Вы использовали Промокодик и внесли ${actualPayment} монету в банк карты "Платите налоги!".`
                : `Вы внесли ${actualPayment} монеты в банк карты "Платите налоги!".`,
              timestamp,
              cardId: usedPromo ? "inv_019" : taxCardId,
            },
          });
          if (usedPromo) updates.revealedCards = arrayUnion("inv_019");
        }

        if (response === "fish") {
          const currentInventory = (playerSnap.data() as Player).inventory;
          if (!currentInventory?.includes("inv_006")) {
            throw new Error("fish_card_missing");
          }
          transaction.update(playerRef, {
            inventory: removeOneCardFromInventory(currentInventory, "inv_006"),
            lastNotification: {
              message: `Вы отменили налоги картой "No, no, no mr. Fish".`,
              timestamp,
              cardId: "inv_006",
            },
          });
          updates.revealedCards = arrayUnion("inv_006");
        }

        if (response === "reflect") {
          const currentInventory = (playerSnap.data() as Player).inventory;
          if (!currentInventory?.includes("inv_012")) {
            throw new Error("reflect_card_missing");
          }

          if (ownerId !== user.uid && !queue.includes(ownerId)) {
            queue = [...queue, ownerId];
          }

          collectorId = user.uid;
          collectorName = playerData.login;
          transaction.update(playerRef, {
            inventory: removeOneCardFromInventory(currentInventory, "inv_012"),
            lastNotification: {
              message: `Вы перехватили сбор налогов картой "А может тебя?". Сбор продолжается, текущий банк: ${bank} монет.`,
              timestamp,
              cardId: "inv_012",
            },
          });
          updates.revealedCards = arrayUnion("inv_012");
        }

        if (response === "gambling") {
          updates.activeInteraction = {
            playerId: user.uid,
            type: "gambling",
            cards: getRandomInteractionCardIds("gambling", allCards),
            actingCardId: taxCardId,
            fromTaxCard: true,
            taxQueue: queue,
            taxOwnerId: ownerId,
            taxOwnerName: ownerName,
            taxCollectorId: collectorId,
            taxCollectorName: collectorName,
            taxBank: bank,
            targetPlayerId: ownerId,
          };
          transaction.update(playerRef, {
            lastNotification: {
              message: `Вы выбрали gambling вместо взноса ${paymentAmount} монет в банк налогов.`,
              timestamp,
              cardId: taxCardId,
            },
          });
        } else {
          const nextInteraction = buildNextTaxInteraction({
            queue,
            collectorId,
            collectorName,
            bank,
            ownerId,
            ownerName,
            taxCardId,
            getPlayerById,
          });
          if (nextInteraction) {
            updates.activeInteraction = nextInteraction;
            updates[`notifications.${nextInteraction.playerId}`] = {
              message: `${collectorName} собирает банк налогов. Заплатите ${paymentAmount} монеты, используйте Промокодик или выберите gambling.`,
              timestamp,
              cardId: taxCardId,
            };
          } else {
            queueFinished = true;
            finalBank = bank;
            finalCollectorName = collectorName;
            updates.activeInteraction = null;
            updates.pendingTaxPayout = bank > 0
              ? {
                  id: `tax_payout_${collectorId}_${timestamp}`,
                  playerId: collectorId,
                  playerName: collectorName,
                  amount: bank,
                  cardId: taxCardId,
                }
              : null;
            updates[`notifications.${collectorId}`] = {
              message: `Сбор налогов завершен. Банк ${bank} монет уходит вам.`,
              timestamp,
              cardId: taxCardId,
            };
          }
        }

        transaction.update(gameStateRef, updates);
        responseApplied = true;
      });

      if (!responseApplied) return;

      if (response === "pay") {
        notify(`Вы внесли ${paymentAmount} монеты в банк налогов.`, 'info', taxCardId);
      } else if (response === "promo") {
        notify(`Промокодик сработал: в банк внесено ${promoPaymentAmount} монет.`, 'info', "inv_019");
      } else if (response === "fish") {
        notify(`Вы использовали "No, no, no mr. Fish" и освободились от налогов.`, 'info', "inv_006");
      } else if (response === "reflect") {
        notify("Вы перехватили сбор налогов. Очередь продолжается.", 'info', "inv_012");
      } else if (response === "gambling") {
        notify("Вы выбрали gambling вместо оплаты налога.", 'warning', taxCardId);
      }

      if (queueFinished) {
        notify(`Банк налогов ${finalBank} монет уходит игроку ${finalCollectorName}.`, 'success', taxCardId);
      }
    } catch (e) {
      console.error(e);
      notify("Не удалось обработать ответ на налог.", 'error', taxCardId);
    }
  };
  const handleCancelInteraction = async () => {
    if (!user || !playerData || !gameState.activeInteraction) return;

    const expectedInteraction = gameState.activeInteraction;
    const { actingCardId } = expectedInteraction;
    const playerRef = doc(db, "players", user.uid);
    const gsRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        // Текст восстановлен после сбоя кодировки.
        const gsSnap = await transaction.get(gsRef);
        const playerSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !playerSnap.exists()) return;

        const currentInteraction = (gsSnap.data() as GameState).activeInteraction;
        if (
          !currentInteraction ||
          currentInteraction.type !== expectedInteraction.type ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.actingCardId !== actingCardId
        ) {
          return;
        }

        if (currentInteraction.actingCardId) {
          const currentInventory = (playerSnap.data() as Player).inventory;
          transaction.update(playerRef, {
            inventory: addOneCardToInventory(currentInventory, currentInteraction.actingCardId),
          });
          transaction.update(gsRef, { revealedCards: arrayRemove(currentInteraction.actingCardId) });
        }
        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, { activeInteraction: null });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `cancel_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, cardId: actingCardId,
      });
    }
  };

  const handleDuelChallengeResponse = async (duelId: string, response: 'accept' | 'use_protection' | 'decline') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid);
    const duelState = gameState.activeDuels[duelId];

    if (!duelState || duelState.targetId !== user.uid) {
      console.error("Ошибка действия.");
      return;
    }

    const challengerPlayer = getPlayerById(duelState.challengerId);
    const duelCard = allCards[gameState.activeInteraction?.actingCardId || '']; // inv_015
    const challengerName = challengerPlayer?.login || "Игрок";
    const targetName = playerData.login || "Игрок";

    try {
      await runTransaction(db, async (transaction) => {
        const gameStateSnap = await transaction.get(gameStateRef);
        const playerSnap = await transaction.get(playerRef);
        if (!gameStateSnap.exists() || !playerSnap.exists()) return;

        const currentGameState = gameStateSnap.data() as GameState;
        const currentDuelState = currentGameState.activeDuels[duelId];
        const currentInteraction = currentGameState.activeInteraction;

        if (
          !currentDuelState ||
          currentDuelState.targetId !== user.uid ||
          currentDuelState.status !== 'pending' ||
          currentInteraction?.type !== "duel_challenge_response" ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.duelId !== duelId
        ) {
          throw new Error("Ошибка действия.");
        }

        const responseTimestamp = Date.now();

        if (response === 'decline') {
          const challengerRef = doc(db, "players", currentDuelState.challengerId);
          const declineFee = 3;
          const targetMessage = "Вы отказались от дуэли и заплатили 3 монеты.";
          const challengerMessage = `${targetName} отказался от дуэли и отдал вам 3 монеты.`;

          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];

          transaction.update(playerRef, {
            tiltCoins: increment(-declineFee),
            lastNotification: {
              message: targetMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          transaction.update(challengerRef, { tiltCoins: increment(declineFee) });
          transaction.update(gameStateRef, {
            activeDuels: updatedActiveDuels,
            activeInteraction: null,
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          logEvent({
            id: `duel_declined_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: challengerMessage,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'declined', fee: declineFee }
          });
        } else if (response === 'use_protection') {
          // Текст восстановлен после сбоя кодировки.
          const protectionCardId = "inv_006";
          const targetMessage = `Вы сбросили дуэль картой "No, no, no mr. Fish".`;
          const challengerMessage = `Дуэль сброшена картой "No, no, no mr. Fish", вы возвращаетесь ни с чем.`;
          const currentInventory = (playerSnap.data() as Player).inventory;
          if (!currentInventory?.includes(protectionCardId)) {
            throw new Error("Ошибка действия.");
          }

          // Текст восстановлен после сбоя кодировки.
          transaction.update(playerRef, { inventory: removeOneCardFromInventory(currentInventory, protectionCardId) });
          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, { revealedCards: arrayUnion(protectionCardId) });

          // Текст восстановлен после сбоя кодировки.
          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];
          transaction.update(gameStateRef, { activeDuels: updatedActiveDuels });

          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, { activeInteraction: null });

          // Текст восстановлен после сбоя кодировки.
          transaction.update(playerRef, {
            lastNotification: {
              message: targetMessage,
              timestamp: responseTimestamp,
              cardId: protectionCardId
            }
          });
          logEvent({
            id: `duel_avoided_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${targetName} сбросил дуэль картой "No, no, no mr. Fish".`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: protectionCardId,
            details: { outcome: 'avoided' }
          });

          transaction.update(gameStateRef, {
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
        } else { // response === 'accept'
          const challengerMessage = `${targetName} принял вызов. Ожидаем решения.`;
          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'accepted',
            activeInteraction: {
              playerId: currentDuelState.targetId,
              type: "duel_weapon_selection",
              duelId: duelId,
              cards: [],
              targetPlayerId: currentDuelState.targetId,
              actingCardId: duelCard?.id,
            },
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            },
          });

          logEvent({
            id: `duel_accepted_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${targetName} принял вызов на дуэль от ${challengerName}.`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'accepted' }
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handlePlaceDuelBet = async (duelId: string, betAmount: number) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !pSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];
        const currentInteraction = gs.activeInteraction;
        const normalizedBet = Math.floor(Number(betAmount));

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status !== 'betting') throw new Error("Ошибка действия.");
        if (duel.challengerId !== user.uid && duel.targetId !== user.uid) throw new Error("Invalid duel state.");
        if (duel.isReady?.[user.uid]) throw new Error("Invalid duel state.");
        if (
          currentInteraction?.type !== 'duel_betting' ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.duelId !== duelId
        ) {
          throw new Error("Invalid duel state.");
        }
        if (normalizedBet <= 0) throw new Error("Ошибка действия.");

        transaction.update(playerRef, { tiltCoins: increment(-normalizedBet) });

        const updatedBets = { ...duel.bets, [user.uid]: normalizedBet };
        const updatedIsReady = { ...duel.isReady, [user.uid]: true };

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.bets`]: updatedBets,
          [`activeDuels.${duelId}.isReady`]: updatedIsReady,
        });

        const allPlayersReady = Object.values(updatedIsReady).every(ready => ready === true);
        if (allPlayersReady) {
          if (duel.weapon === 'game') {
            transaction.update(gameStateRef, {
              [`activeDuels.${duelId}.status`]: 'admin_wait',
              activeInteraction: null,
            });
          } else {
            transaction.update(gameStateRef, {
              [`activeDuels.${duelId}.status`]: 'ready_to_roll',
              activeInteraction: {
                playerId: duel.challengerId,
                type: 'duel_ready_to_roll',
                duelId: duelId,
                targetPlayerId: duel.targetId,
                actingCardId: gs.activeInteraction?.actingCardId,
              },
            });
          }
        } else {
          const otherPlayerId = duel.challengerId === user.uid ? duel.targetId : duel.challengerId;
          transaction.update(gameStateRef, {
            activeInteraction: {
              playerId: otherPlayerId,
              type: 'duel_betting',
              duelId: duelId,
              targetPlayerId: duel.challengerId === user.uid ? duel.targetId : duel.challengerId,
              actingCardId: gs.activeInteraction?.actingCardId,
            },
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };
  const handleStartDuelRoll = async (duelId: string) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];
        const currentInteraction = gs.activeInteraction;

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status !== 'ready_to_roll') throw new Error("Ошибка действия.");
        if (duel.challengerId !== user.uid) throw new Error("Ошибка действия.");
        if (
          currentInteraction?.type !== 'duel_ready_to_roll' ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.duelId !== duelId
        ) {
          throw new Error("Invalid duel state.");
        }
        if (duel.weapon !== 'dice' && duel.weapon !== 'game') throw new Error("Invalid duel state.");

        if (duel.weapon === 'dice') {
          const challengerRoll = rollD6();
          const targetRoll = rollD6();
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'rolling',
            [`activeDuels.${duelId}.rolls`]: {
              [duel.challengerId]: challengerRoll,
              [duel.targetId]: targetRoll,
            },
            activeInteraction: null,
          });
        } else {
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'admin_wait',
            activeInteraction: null,
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_roll_start_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, details: { duelId: duelId }
      });
    }
  };

  const handleSelectDuelWeapon = async (duelId: string, weapon: DuelWeapon) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];
        const currentInteraction = gs.activeInteraction;

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status !== 'accepted') throw new Error("Invalid duel state.");
        if (duel.targetId !== user.uid) throw new Error("Invalid duel state.");
        if (weapon !== 'dice' && weapon !== 'game') throw new Error("Invalid duel state.");
        if (
          currentInteraction?.type !== 'duel_weapon_selection' ||
          currentInteraction.playerId !== user.uid ||
          currentInteraction.duelId !== duelId
        ) {
          throw new Error("Invalid duel state.");
        }

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.weapon`]: weapon,
          [`activeDuels.${duelId}.status`]: 'betting',
          // Текст восстановлен после сбоя кодировки.
          activeInteraction: {
            playerId: duel.challengerId,
            actingCardId: gs.activeInteraction?.actingCardId,
            type: 'duel_betting',
            duelId: duelId,
            targetPlayerId: duel.targetId
          }
        });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_weapon_select_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, details: { duelId: duelId, weapon: weapon }
      });
    }
  };

  const handleFinishDuel = async (duelId: string, manualWinnerId?: string | 'draw') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status === 'finished') return;
        if (duel.weapon !== 'dice' && duel.weapon !== 'game') throw new Error("Invalid duel state.");
        if (duel.weapon === 'dice' && (duel.status !== 'rolling' || manualWinnerId)) throw new Error("Invalid duel state.");
        if (duel.weapon === 'game' && (duel.status !== 'admin_wait' || !manualWinnerId)) return;
        if (
          manualWinnerId &&
          manualWinnerId !== 'draw' &&
          manualWinnerId !== duel.challengerId &&
          manualWinnerId !== duel.targetId
        ) {
          throw new Error("Invalid duel winner.");
        }

        let winnerId: string | 'draw' = 'draw';
        let challengerRoll = 0;
        let targetRoll = 0;

        if (duel.weapon === 'dice') {
          challengerRoll = duel.rolls?.[duel.challengerId] ?? rollD6();
          targetRoll = duel.rolls?.[duel.targetId] ?? rollD6();

          if (challengerRoll > targetRoll) {
            winnerId = duel.challengerId;
          } else if (targetRoll > challengerRoll) {
            winnerId = duel.targetId;
          }
        } else if (duel.weapon === 'game' && manualWinnerId) {
          winnerId = manualWinnerId;
        }

        const challengerBet = duel.bets[duel.challengerId] || 0;
        const targetBet = duel.bets[duel.targetId] || 0;
        const totalPot = challengerBet + targetBet;
        const challengerLogin = getPlayerById(duel.challengerId)?.login || "Игрок 1";
        const targetLogin = getPlayerById(duel.targetId)?.login || "Игрок 2";
        const timestamp = Date.now();

        if (winnerId !== 'draw') {
          transaction.update(doc(db, "players", winnerId), {
            tiltCoins: increment(totalPot),
          });
        } else {
          transaction.update(doc(db, "players", duel.challengerId), {
            tiltCoins: increment(challengerBet),
          });
          transaction.update(doc(db, "players", duel.targetId), {
            tiltCoins: increment(targetBet),
          });
        }

        const getMessage = (isChallenger: boolean) => {
          const myRoll = isChallenger ? challengerRoll : targetRoll;
          const oppRoll = isChallenger ? targetRoll : challengerRoll;
          const myId = isChallenger ? duel.challengerId : duel.targetId;
          const opponentName = isChallenger ? targetLogin : challengerLogin;
          const isMeWinner = winnerId === myId;

          if (winnerId === 'draw') {
            return duel.weapon === 'dice'
              ? `Дуэль: ничья (${myRoll} vs ${oppRoll}). Ставка возвращена.`
              : `Дуэль: ничья. Ставка возвращена.`;
          }

          if (duel.weapon === 'dice') {
            return isMeWinner
              ? `Победа! Вы выиграли дуэль (${myRoll} vs ${oppRoll}) и получили ${totalPot} монет.`
              : `Поражение. Вы проиграли дуэль (${myRoll} vs ${oppRoll}) игроку ${opponentName}.`;
          }

          return isMeWinner
            ? `Победа! Админ признал вас победителем кастомной дуэли. Вы получили ${totalPot} монет.`
            : `Поражение. Админ признал победителем игрока ${opponentName}.`;
        };

        const resultMessage = winnerId === 'draw'
          ? `Дуэль между ${challengerLogin} и ${targetLogin} завершилась ничьей.`
          : `${getPlayerById(winnerId)?.login || 'Игрок'} выиграл дуэль у ${winnerId === duel.challengerId ? targetLogin : challengerLogin}.`;

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.status`]: 'finished',
          [`activeDuels.${duelId}.winnerId`]: winnerId,
          activeInteraction: null,
          [`notifications.${duel.challengerId}`]: {
            message: getMessage(true),
            timestamp,
          },
          [`notifications.${duel.targetId}`]: {
            message: getMessage(false),
            timestamp,
          },
          hotCoinGain: winnerId !== 'draw' ? makeHotCoinGain(winnerId, totalPot, undefined, "Дуэль") : null,
        });

        logEvent({
          id: `duel_finished_${duelId}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'duel',
          message: resultMessage,
          playerId: winnerId === 'draw' ? 'system' : winnerId,
          targetPlayerId: winnerId === 'draw' ? duel.targetId : undefined,
          details: {
            winnerId,
            weapon: duel.weapon,
            pot: totalPot,
            challengerRoll,
            targetRoll,
          },
        });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_finish_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        message: "Событие игры.",
        playerId: user.uid,
        details: { duelId },
      });
    }
  };
  const handleMoveComplete = useCallback(
    async (
      position: number,
      prevCell: number | null,
      cellType?: string,
      playerId?: string,
      isCardMove: boolean = false,
    ) => {
      if (!user) return;
      const targetPlayerId = playerId || user.uid;
      const playerRef = doc(db, "players", targetPlayerId);
      const gameStateRef = doc(db, "gameState", "current");

      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;
        const { turnOrder = [], currentTurnIndex = 0 } = gsSnap.data() as GameState;
        if (!isCardMove) {
          transaction.update(playerRef, { position, prevCell });
          logEvent({
            id: `player_move_manual_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId,
            details: { from: prevCell, to: position, isCardMove: isCardMove }
          });
        }


        if (cellType === "gambling" || cellType === "bshop") {
          if (isCardMove) {
            transaction.update(playerRef, { position, prevCell });
          }
          transaction.update(gameStateRef, {
            activeInteraction: { 
              playerId: targetPlayerId,
              type: cellType,
              cards: getRandomInteractionCardIds(cellType, allCards),
              fromCardMove: isCardMove,
            },
            forcedMovePlayerId: null,
            cardMove: null,
          });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `landed_on_special_cell_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId, details: { cellType: cellType, position: position }
          });
          return;
        }

        if (isCardMove) {
          transaction.update(playerRef, { position, prevCell });
          transaction.update(gameStateRef, {
            forcedMovePlayerId: null,
            cardMove: null,
          });
          logEvent({
            id: `card_move_completed_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId,
            details: { from: prevCell, to: position, isCardMove: isCardMove }
          });
          return;
        }

        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
          forcedMovePlayerId: null,
          cardMove: null,
          hotCoinGain: null,
        });
      });
    },
    [user, allCards, notify, logEvent, getPlayerById], // Add notify and logEvent to dependencies
  );

  const handleFinishInteraction = async (
    cardId?: string,
    cost: number = 0,
    skipWithCardId?: string
  ) => {
    if (!user || !playerData || !gameState.activeInteraction) return;

    const expectedInteraction = gameState.activeInteraction;
    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !pSnap.exists()) return;

        const { turnOrder = [], currentTurnIndex = 0, activeInteraction } = gsSnap.data() as GameState;
        const player = { ...(pSnap.data() as Player), id: user.uid };
        if (
          !activeInteraction ||
          activeInteraction.type !== expectedInteraction.type ||
          activeInteraction.playerId !== expectedInteraction.playerId ||
          activeInteraction.targetPlayerId !== expectedInteraction.targetPlayerId ||
          activeInteraction.actingCardId !== expectedInteraction.actingCardId ||
          !!activeInteraction.fromCardMove !== !!expectedInteraction.fromCardMove ||
          !!activeInteraction.fromTaxCard !== !!expectedInteraction.fromTaxCard
        ) {
          return;
        }
        if (cardId && !activeInteraction.cards.includes(cardId)) {
          return;
        }

        let keepInteractionOpen = false;

        if (skipWithCardId) {
          if (!player.inventory?.includes(skipWithCardId)) return;
          transaction.update(playerRef, { inventory: removeOneCardFromInventory(player.inventory, skipWithCardId) });
          transaction.update(gameStateRef, { revealedCards: arrayUnion(skipWithCardId) });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `interaction_skipped_${skipWithCardId}_${Date.now()}`,
            timestamp: Date.now(), type: 'info',
            message: "Событие игры.",
            playerId: user.uid, cardId: skipWithCardId
          });
        } else if (cardId) {
          const card = allCards[cardId];
          if (!card) {
            notify("Карта не найдена. Попробуйте обновить страницу.", 'error');
            logEvent({
              id: `interaction_missing_card_${cardId}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'error',
              message: `Не удалось завершить взаимодействие: карта ${cardId} не найдена.`,
              playerId: user.uid,
              cardId
            });
            return;
          }

          if (card.deck === "inventory") {
            if (cost > 0) {
              transaction.update(playerRef, { tiltCoins: increment(-cost) });
            }

            notify("Событие игры обновлено.", 'success');
            logEvent({
              id: `card_acquired_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'card_play',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { cost: cost, reason: cost > 0 ? 'buy_card' : 'interaction_reward' }
            });

            await handleDrawnCardDistribution(player, card, transaction);
          } else {
            keepInteractionOpen = await applyMomentalCardEffect(player, card, transaction, !!activeInteraction?.fromCardMove);
          }

          transaction.update(gameStateRef, { revealedCards: arrayUnion(cardId) });
        }

        if (keepInteractionOpen) {
          return;
        }

        if (activeInteraction?.fromCardMove) {
          transaction.update(gameStateRef, { activeInteraction: null });
          return;
        }

        if (activeInteraction?.fromTaxCard) {
          const collectorId = activeInteraction.taxCollectorId || activeInteraction.taxOwnerId;
          const collectorName = activeInteraction.taxCollectorName || activeInteraction.taxOwnerName || "игрок";
          const bank = activeInteraction.taxBank ?? 0;
          const timestamp = Date.now();
          const taxOwnerId = activeInteraction.taxOwnerId || activeInteraction.targetPlayerId;
          const taxCardId = activeInteraction.actingCardId || "inv_015";
          const nextTaxInteraction = taxOwnerId
            ? buildNextTaxInteraction({
                queue: activeInteraction.taxQueue,
                collectorId: collectorId || taxOwnerId,
                collectorName,
                bank,
                ownerId: taxOwnerId,
                ownerName: activeInteraction.taxOwnerName,
                taxCardId,
                getPlayerById,
              })
            : null;
          const updates: Record<string, unknown> = {
            activeInteraction: nextTaxInteraction,
          };

          if (nextTaxInteraction) {
            updates[`notifications.${nextTaxInteraction.playerId}`] = {
              message: `${collectorName} собирает банк налогов. Заплатите 2 монеты, используйте Промокодик или выберите gambling.`,
              timestamp,
              cardId: taxCardId,
            };
          } else if (collectorId && bank > 0) {
            updates.pendingTaxPayout = {
              id: `tax_payout_${collectorId}_${timestamp}`,
              playerId: collectorId,
              playerName: collectorName,
              amount: bank,
              cardId: taxCardId,
            };
            updates[`notifications.${collectorId}`] = {
              message: `Сбор налогов завершен. Банк ${bank} монет уходит вам.`,
              timestamp,
              cardId: taxCardId,
            };
          }

          transaction.update(gameStateRef, updates);
          return;
        }
        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          activeInteraction: null,
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
          hotCoinGain: null,
          ...(isLast ? { goldenCardHolderIds: [] } : {}),
        });
      });
    } catch (e) {
      console.error(e);
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `finish_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, cardId: cardId
      });
    }
  };

  const handleResolveCardDiceRoll = async (rollId: string) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const displayOnlyCardIds = new Set(["inv_008", "inv_016"]);

    try {
      const resolution = await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return null;

        const gs = gsSnap.data() as GameState;
        const pendingRoll = gs.cardDiceRoll;
        if (
          !pendingRoll ||
          pendingRoll.id !== rollId ||
          pendingRoll.playerId !== user.uid
        ) {
          return null;
        }

        if (displayOnlyCardIds.has(pendingRoll.cardId)) {
          transaction.update(gameStateRef, { cardDiceRoll: null });
          return null;
        }

        if (pendingRoll.cardId !== "inv_009") return null;

        const card = allCards[pendingRoll.cardId];
        if (!card) {
          throw new Error("Card for dice roll not found.");
        }

        const resolvedRoll = pendingRoll.value;
        const playerRef = doc(db, "players", pendingRoll.playerId);
        const timestamp = Date.now();
        const shouldOpenGambling = pendingRoll.value <= 4;
        const shouldGiveCoins = pendingRoll.value > 1;
        const coinText = shouldGiveCoins ? `+${card.value} монет${shouldOpenGambling ? " и " : ""}` : "монет нет, ";
        const resolvedMessage = `Сделка с магом: бросок ${pendingRoll.value}. ${coinText}${shouldOpenGambling ? "открыт gambling." : "gambling не открывается."}`;
        const resolvedType: ToastNotification['type'] = pendingRoll.value === 1 ? 'warning' : pendingRoll.value <= 4 ? 'info' : 'success';

        transaction.update(playerRef, {
          ...(shouldGiveCoins ? { tiltCoins: increment(card.value) } : {}),
          lastNotification: {
            message: resolvedMessage,
            timestamp,
            cardId: card.id,
          },
        });

        transaction.update(gameStateRef, {
          cardDiceRoll: null,
          ...(shouldGiveCoins ? { hotCoinGain: makeHotCoinGain(pendingRoll.playerId, card.value, card.id, card.name) } : {}),
          activeInteraction: shouldOpenGambling
            ? {
                playerId: pendingRoll.playerId,
                type: "gambling",
                cards: getRandomInteractionCardIds("gambling", allCards),
              }
            : null,
        });

        return {
          cardId: card.id,
          cardName: card.name,
          coinValue: card.value,
          message: resolvedMessage,
          roll: resolvedRoll,
          type: resolvedType,
        };
      });

      if (resolution) {
        notify(resolution.message, resolution.type, resolution.cardId);
        logEvent({
          id: `mage_deal_result_${resolution.cardId}_${rollId}_${Date.now()}`,
          timestamp: Date.now(),
          type: resolution.roll > 1 ? 'coin_change' : 'card_play',
          message: `${playerData.login} завершил "${resolution.cardName}": бросок ${resolution.roll}.`,
          playerId: user.uid,
          cardId: resolution.cardId,
          details: {
            roll: resolution.roll,
            coins: resolution.roll > 1 ? resolution.coinValue : 0,
            gambling: resolution.roll <= 4,
          },
        });
      }
    } catch (e) {
      console.error(e);
      notify("Не удалось применить результат броска карты.", 'error', "inv_009");
    }
  };

  const handleRoll = async () => {
    if (!user || !canRoll) return;
    const bonus = gameState.rollBonus || 0;
    const baseRoll = rollD6();

    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: baseRoll + bonus,
      lastBaseRoll: baseRoll,
      currentRollPlayerId: user.uid,
      rollConfirmed: false,
      rollBonus: 0,
    });
    logEvent({
      id: `dice_roll_${Date.now()}`,
      timestamp: Date.now(), type: 'movement',
      message: "Событие игры.",
      playerId: user.uid,
      details: { baseRoll: baseRoll, bonus: bonus, totalRoll: baseRoll + bonus }
    });
  };

  const handleConfirmRoll = async () => {
    if (!user || !canConfirmRoll) return;
    await updateDoc(doc(db, "gameState", "current"), { rollConfirmed: true });
  };

  const handleStepPhase = async (direction: -1 | 1) => {
    if (!isAdmin) return;
    const currentIndex = PHASE_ORDER.indexOf(gameState.phase);
    let nextIndex = (currentIndex === -1 ? 0 : currentIndex) + direction;
    let nextRound = gameState.round;

    if (nextIndex >= PHASE_ORDER.length) {
      nextIndex = 0;
      nextRound += 1;
    } else if (nextIndex < 0) {
      nextIndex = PHASE_ORDER.length - 1;
      if (nextRound > 0) nextRound -= 1;
    }

    const nextPhase = PHASE_ORDER[nextIndex];
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Событие игры обновлено.", 'warning');
      return;
    }

    const payload: Partial<GameState> = { phase: nextPhase, round: nextRound, hotCoinGain: null };

    if (nextPhase === "turn") {
      const turnState = buildTurnState(players, gameState);
      Object.assign(payload, turnState);
      payload.goldenCardHolderIds = getGoldenCardHolderIds(players, gameState, turnState.turnOrder);
      if (turnState.turnOrder.length === 0) {
        notify("Очередь хода пуста: тестовый переход в ход без участников.", 'warning');
      }
    } else {
      payload.currentRoll = null;
      payload.currentRollPlayerId = null;
      payload.lastBaseRoll = null;
      payload.rollBonus = 0;
      payload.rollConfirmed = false;
    }

    if (payload.phase !== "turn") {
      payload.turnOrder = [];
      payload.currentTurnIndex = 0;
      payload.goldenCardHolderIds = [];
    }

    await updateDoc(doc(db, "gameState", "current"), payload);
  };

  const handleAdminUpdateCoins = async (targetId: string, amount: number) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), { tiltCoins: amount });
      notify("Событие игры обновлено.", 'success');
      logEvent({
        id: `admin_coin_update_${targetId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'coin_change',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        details: { amount, action: 'admin_override' }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handleAdminAddCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      const targetRef = doc(db, "players", targetId);
      let blockedLegendaryName: string | null = null;
      let awardedLegendaryName: string | null = null;
      let targetLogin = "Игрок";
      await runTransaction(db, async (transaction) => {
        const targetSnap = await transaction.get(targetRef);
        const targetData = targetSnap.data() as Player | undefined;
        targetLogin = targetData?.login || targetLogin;
        const card = allCards[cardId];

        if (isLegendaryPrizeCard(card, cardId)) {
          const prizeRef = doc(db, "prizes", cardId);
          const prizeSnap = await transaction.get(prizeRef);
          const prizeData = prizeSnap.exists() ? (prizeSnap.data() as GameCard) : card;

          if (prizeData?.isWon) {
            blockedLegendaryName = prizeData.name || cardId;
            return;
          }

          transaction.set(prizeRef, {
            ...(prizeData ?? card ?? { id: cardId }),
            isUnique: true,
            isWon: true,
            winnerId: targetId,
          }, { merge: true });
          awardedLegendaryName = prizeData?.name || card?.name || cardId;
          transaction.update(doc(db, "gameState", "current"), {
            revealedCards: arrayUnion(cardId),
            [`notifications.${targetId}`]: {
              message: "Вы только что вытащили легендарную карту, будьте готовы к последствиям",
              timestamp: Date.now(),
              cardId,
            },
          });
          return;
        }

        transaction.update(targetRef, {
          inventory: addOneCardToInventory((targetSnap.data() as Player | undefined)?.inventory, cardId),
        });
      });
      if (blockedLegendaryName) {
        notify(`Легендарная карта "${blockedLegendaryName}" уже была выдана в этой игре.`, 'warning', cardId);
        return;
      }
      if (awardedLegendaryName) {
        notify(`Легендарная карта "${awardedLegendaryName}" активирована.`, 'success', cardId);
        logEvent({
          id: `legendary_received_${cardId}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'card_play',
          message: `Игрок "${targetLogin}" получил легендарную карту "${awardedLegendaryName}"`,
          playerId: targetId,
          cardId,
        });
        return;
      }
      notify("Событие игры обновлено.", 'success');
      logEvent({
        id: `admin_add_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handleAdminRemoveCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      const targetRef = doc(db, "players", targetId);
      await runTransaction(db, async (transaction) => {
        const targetSnap = await transaction.get(targetRef);
        transaction.update(targetRef, {
          inventory: removeOneCardFromInventory((targetSnap.data() as Player | undefined)?.inventory, cardId),
        });
      });
      notify("Событие игры обновлено.", 'info');
      logEvent({
        id: `admin_rem_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'info',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handleAdminClearStatus = async (targetId: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), {
        customStatus: null,
        statusDuration: 0,
      });
      notify("Статус игрока снят.", "info");
      logEvent({
        id: `admin_clear_status_${targetId}_${Date.now()}`,
        timestamp: Date.now(),
        type: "info",
        message: "Админ снял статус с игрока.",
        playerId: user?.uid || "admin",
        targetPlayerId: targetId,
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Не удалось снять статус игрока.", "error");
    }
  };

  const handlePrepareTurn = async () => {
    if (!isAdmin) return;
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Событие игры обновлено.", 'warning');
      return;
    }

    const turnState = buildTurnState(players, gameState);
    if (turnState.turnOrder.length === 0) {
      notify("Очередь хода пуста. Админ может вручную добавить игроков с 0 очков.", 'warning');
    }

    await updateDoc(doc(db, "gameState", "current"), {
      ...turnState,
      phase: "turn",
      goldenCardHolderIds: getGoldenCardHolderIds(players, gameState, turnState.turnOrder),
    });
  };

  const handleResetGameForTesting = async () => {
    if (!isAdmin) return;

    const playersSnap = await getDocs(collection(db, "players"));
    await Promise.all(
      playersSnap.docs.map((playerDoc) =>
        updateDoc(playerDoc.ref, getResetPlayerPatch()),
      ),
    );

    await setDoc(doc(db, "gameState", "current"), defaultGameState);
    await resetStarterCards();
  };

  return {
    user,
    playerData,
    loading,
    players,
    gameState,
    allCards,
    gameEvents,
    isAdmin,
    currentTurnPlayerId,
    canRoll,
    notify, // Expose notify
    logEvent, // Expose logEvent
    canConfirmRoll,
    getPlayerById,
    handlers: {
      handleLogout,
      handleUpdateLogin,
      handleUpdateBorderColor,
      chooseStart,
      updateAvatar,
      handleUseCard,
      handleRerollWheel,
      grantPrizeCard,
      handleMoveComplete,
      handleFinishInteraction,
      handleRoll,
      handleResolveCardDiceRoll,
      handleConfirmRoll,
      handleStepPhase,
      handlePrepareTurn,
      handleResetGameForTesting,
      handleSelectOpponentCard,
      handleCancelInteraction,
      handleConfirmMoveForCoins, // Add new handler
      handleReflectResponse,
      handleTaxResponse,
      handleDuelChallengeResponse, // Add new handler
      handlePlaceDuelBet,
      handleStartDuelRoll,
      handleSelectDuelWeapon,
      handleFinishDuel,
      handleAdminUpdateCoins,
      handleAdminAddCard,
      handleAdminRemoveCard,
      handleAdminClearStatus,
    },
  };
}
