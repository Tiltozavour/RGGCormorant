import type { GameCard } from "../types/card";
import type { Player } from "../types/game";

const targetActions = new Set([
  "steal_coins",
  "steal_card",
  "discard_card",
  "duel",
  "judge_coins",
  "freeze_player",
  "move_target_for_coins",
  "move_target_and_self",
  "communism",
]);

export const cardNeedsTarget = (card: Pick<GameCard, "id" | "action" | "requiresTarget">) =>
  Boolean(card.requiresTarget) || targetActions.has(card.action) || card.id === "inv_007";

export const canTargetSelf = (card: Pick<GameCard, "id">) => card.id === "inv_007";

export const getSelectableCardTargets = (
  players: Player[],
  currentUserId: string | null | undefined,
  pendingTargetCard: Pick<GameCard, "id"> | null,
) =>
  players.filter((player) => {
    if (!player.inGame || player.role === "admin") return false;
    if (player.id === currentUserId) return Boolean(pendingTargetCard && canTargetSelf(pendingTargetCard));
    return true;
  });
