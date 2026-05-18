import type { CardAction } from "../types/card";
import type { GamePhase } from "../types/game";

export type CardUseBlockReason =
  | "only_wheel_card_in_next_game"
  | "not_current_turn"
  | "movement_already_started"
  | "quantum_after_roll"
  | "regular_after_roll"
  | "extra_roll_before_roll"
  | "cards_blocked_in_phase"
  | "protection_already_active"
  | "passive_card"
  | "reflect_response_only";

export type CardUseGuardResult =
  | { ok: true }
  | { ok: false; reason: CardUseBlockReason };

interface EvaluateCardUseGuardInput {
  isAdmin: boolean;
  card: {
    id: string;
    action: CardAction;
  };
  phase: GamePhase;
  currentRoll: number | null;
  rollConfirmed: boolean;
  showWheel: boolean;
  currentTurnPlayerId: string | null;
  userId: string | null | undefined;
  hasProtection?: boolean;
}

export interface CardUseGuardAlert {
  title: string;
  message: string;
  type: "info" | "success" | "warning";
}

const movementActions = new Set<CardAction>([
  "move_steps",
  "move_target_for_coins",
  "move_target_and_self",
]);

const isAlwaysAvailableDuringTurn = (action: CardAction) =>
  action === "protection" ||
  action === "fish_protection" ||
  action === "reflect_debuff" ||
  action === "communism" ||
  action === "promo_code_benefit";

const isSpecialAfterRollAction = (action: CardAction) =>
  isAlwaysAvailableDuringTurn(action) ||
  action === "extra_roll" ||
  movementActions.has(action);

export const evaluateCardUseGuard = ({
  isAdmin,
  card,
  phase,
  currentRoll,
  rollConfirmed,
  showWheel,
  currentTurnPlayerId,
  userId,
  hasProtection,
}: EvaluateCardUseGuardInput): CardUseGuardResult => {
  if (!isAdmin) {
    if (phase === "next_game") {
      const canUseInNextGame = card.action === "spin_wheel" || (card.action === "fish_protection" && showWheel);
      if (!canUseInNextGame) return { ok: false, reason: "only_wheel_card_in_next_game" };
    } else if (phase === "turn") {
      if (!isAlwaysAvailableDuringTurn(card.action) && currentTurnPlayerId !== userId) {
        return { ok: false, reason: "not_current_turn" };
      }

      if (movementActions.has(card.action) && rollConfirmed) {
        return { ok: false, reason: "movement_already_started" };
      }

      if (card.id === "inv_005" && currentRoll !== null) {
        return { ok: false, reason: "quantum_after_roll" };
      }

      if (!isSpecialAfterRollAction(card.action) && currentRoll !== null) {
        return { ok: false, reason: "regular_after_roll" };
      }

      if (card.action === "extra_roll" && currentRoll === null) {
        return { ok: false, reason: "extra_roll_before_roll" };
      }
    } else {
      return { ok: false, reason: "cards_blocked_in_phase" };
    }
  }

  if (card.action === "protection" && hasProtection) {
    return { ok: false, reason: "protection_already_active" };
  }

  if (card.action === "passive_benefit") {
    return { ok: false, reason: "passive_card" };
  }

  if (card.action === "reflect_debuff") {
    return { ok: false, reason: "reflect_response_only" };
  }

  return { ok: true };
};

export const getCardUseGuardAlert = (reason: CardUseBlockReason): CardUseGuardAlert => {
  switch (reason) {
    case "only_wheel_card_in_next_game":
      return {
        title: "Стоп!",
        message: "В этой фазе можно использовать только карту 'Подкрутка'.",
        type: "warning",
      };
    case "not_current_turn":
      return {
        title: "Не твой ход",
        message: "Обычные карты можно использовать только в свою очередь.",
        type: "info",
      };
    case "movement_already_started":
      return {
        title: "Движение начато",
        message: "Использовать карту перемещения можно только до подтверждения хода.",
        type: "warning",
      };
    case "quantum_after_roll":
      return {
        title: "Кубик брошен",
        message: "Квантовый прыжок можно использовать только до броска кубика.",
        type: "warning",
      };
    case "regular_after_roll":
      return {
        title: "Кубик брошен",
        message: "Обычные карты используются до броска кубика.",
        type: "warning",
      };
    case "extra_roll_before_roll":
      return {
        title: "Рано!",
        message: "Сначала бросьте кубик, чтобы использовать переброс.",
        type: "info",
      };
    case "cards_blocked_in_phase":
      return {
        title: "Заблокировано",
        message: "Использование карт в этой фазе запрещено.",
        type: "warning",
      };
    case "protection_already_active":
      return {
        title: "Уже защищен",
        message: "У вас уже активно Силовое поле. Не стоит тратить карту впустую.",
        type: "info",
      };
    case "passive_card":
      return {
        title: "Пассивная карта",
        message: "Эта карта работает автоматически и не тратится при нажатии.",
        type: "info",
      };
    case "reflect_response_only":
      return {
        title: "Ответная карта",
        message: 'Карта "А может тебя?" используется только как ответ на направленную карту.',
        type: "info",
      };
  }
};
