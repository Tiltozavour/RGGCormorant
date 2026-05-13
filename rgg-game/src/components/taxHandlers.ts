import { useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import { doc, increment, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import type { ActiveInteraction, GameState, Player } from "../types/game";
import { makeHotCoinGain } from "./cardHandlers";
import type { ToastNotification } from "./useModalStates";

type Notify = (message: string, type?: ToastNotification["type"], cardId?: string) => void;

export const getTaxResponseCardIds = (player?: Pick<Player, "inventory"> | null) => [
  ...(player?.inventory?.includes("inv_012") ? ["inv_012"] : []),
  ...(player?.inventory?.includes("inv_006") ? ["inv_006"] : []),
  ...(player?.inventory?.includes("inv_019") ? ["inv_019"] : []),
];

export const buildNextTaxInteraction = ({
  queue,
  collectorId,
  collectorName,
  bank,
  ownerId,
  ownerName,
  taxCardId,
  getPlayerById,
}: {
  queue: string[] | undefined;
  collectorId: string;
  collectorName: string;
  bank: number;
  ownerId: string;
  ownerName?: string;
  taxCardId: string;
  getPlayerById: (playerId: string | null | undefined) => Player | null | undefined;
}): ActiveInteraction | null => {
  const [nextPlayerId, ...restQueue] = queue ?? [];
  if (!nextPlayerId) return null;

  const nextPlayer = getPlayerById(nextPlayerId);
  return {
    playerId: nextPlayerId,
    type: "tax_response",
    targetPlayerId: ownerId,
    taxOwnerId: ownerId,
    taxOwnerName: ownerName,
    taxCollectorId: collectorId,
    taxCollectorName: collectorName,
    taxBank: bank,
    taxQueue: restQueue,
    cards: getTaxResponseCardIds(nextPlayer),
    actingCardId: taxCardId,
  };
};

export const usePendingTaxPayout = (
  pendingTaxPayout: GameState["pendingTaxPayout"],
  user: User | null,
  notify: Notify,
) => {
  const lastAppliedTaxPayoutRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const payout = pendingTaxPayout;
    if (!payout || payout.playerId !== user.uid || payout.amount <= 0) return;
    if (lastAppliedTaxPayoutRef.current === payout.id) return;
    lastAppliedTaxPayoutRef.current = payout.id;

    void runTransaction(db, async (transaction) => {
      const gameStateRef = doc(db, "gameState", "current");
      const gsSnap = await transaction.get(gameStateRef);
      if (!gsSnap.exists()) return;

      const currentPayout = (gsSnap.data() as GameState).pendingTaxPayout;
      if (!currentPayout || currentPayout.id !== payout.id || currentPayout.playerId !== user.uid) return;

      const cardId = currentPayout.cardId || "inv_015";
      transaction.update(doc(db, "players", user.uid), {
        tiltCoins: increment(currentPayout.amount),
        lastNotification: {
          message: `Вы получили банк карты "Платите налоги!": ${currentPayout.amount} монет.`,
          timestamp: Date.now(),
          cardId,
        },
      });
      transaction.update(gameStateRef, {
        pendingTaxPayout: null,
        hotCoinGain: makeHotCoinGain(user.uid, currentPayout.amount, cardId, "Платите налоги!"),
      });
    }).catch((error) => {
      console.error(error);
      lastAppliedTaxPayoutRef.current = null;
      notify("Не удалось получить банк налогов.", "error", payout.cardId || "inv_015");
    });
  }, [notify, pendingTaxPayout, user]);
};
