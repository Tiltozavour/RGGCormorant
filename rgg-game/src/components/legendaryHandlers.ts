import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import type { GameCard } from "../types/card";
import type { Player } from "../types/game";
import { addOneCardToInventory } from "./cardHandlers";
import type { ToastNotification } from "./useModalStates";

type Notify = (message: string, type?: ToastNotification["type"], cardId?: string) => void;

export const isLegendaryPrizeCard = (card: GameCard | undefined, cardId: string) =>
  card?.rarity === "legendary" || card?.action === "prize" || cardId.startsWith("leg_");

export const grantPrizeCardToPlayer = async ({
  isAdmin,
  playerId,
  cardId,
  notify,
}: {
  isAdmin: boolean;
  playerId: string;
  cardId: string;
  notify: Notify;
}) => {
  if (!isAdmin) return;

  const playerRef = doc(db, "players", playerId);
  const prizeRef = doc(db, "prizes", cardId);

  try {
    await runTransaction(db, async (transaction) => {
      const prizeSnap = await transaction.get(prizeRef);
      const playerSnap = await transaction.get(playerRef);
      if (!prizeSnap.exists()) return;

      const prizeData = prizeSnap.data() as GameCard;
      if (prizeData.isWon) {
        notify(`Легендарная карта "${prizeData.name}" уже была выдана в этой игре.`, "warning", prizeData.id);
        return;
      }

      transaction.update(playerRef, {
        inventory: addOneCardToInventory((playerSnap.data() as Player | undefined)?.inventory, cardId),
      });
      transaction.update(prizeRef, { isUnique: true, isWon: true, winnerId: playerId });
    });
  } catch (error) {
    console.error("Ошибка при выдаче легендарной карты:", error);
  }
};
