import { doc, runTransaction, type DocumentReference } from "firebase/firestore";
import { db } from "../firebase";
import type { Player } from "../types/game";
import { buildPlayedCardPatches } from "./cardPlayPatches";

interface CommitPlayedCardInput {
  playerRef: DocumentReference;
  cardId: string;
  playerPatch?: Record<string, unknown>;
  gameStatePatch?: Record<string, unknown>;
  requireCardInInventory?: boolean;
}

export const commitPlayedCardAndGameState = async ({
  playerRef,
  cardId,
  playerPatch = {},
  gameStatePatch = {},
  requireCardInInventory = true,
}: CommitPlayedCardInput) =>
  runTransaction(db, async (transaction) => {
    const playerSnap = await transaction.get(playerRef);
    const player = playerSnap.data() as Player | undefined;
    const inventory = player?.inventory ?? [];
    const hasCard = inventory.includes(cardId);

    if (requireCardInInventory && !hasCard) {
      return false;
    }

    const patches = buildPlayedCardPatches({
      inventory,
      cardId,
      playerPatch,
      gameStatePatch,
    });

    if (hasCard) {
      transaction.update(playerRef, patches.playerPatch);
    }

    transaction.update(doc(db, "gameState", "current"), patches.gameStatePatch);
    return true;
  });
