import { arrayUnion } from "firebase/firestore";
import { removeOneCardFromInventory } from "./cardHandlers";

interface BuildPlayedCardPatchesInput {
  inventory: string[] | undefined;
  cardId: string;
  playerPatch?: Record<string, unknown>;
  gameStatePatch?: Record<string, unknown>;
}

export const buildPlayedCardPatches = ({
  inventory,
  cardId,
  playerPatch = {},
  gameStatePatch = {},
}: BuildPlayedCardPatchesInput) => ({
  playerPatch: {
    ...playerPatch,
    inventory: removeOneCardFromInventory(inventory, cardId),
  },
  gameStatePatch: {
    ...gameStatePatch,
    revealedCards: arrayUnion(cardId),
  },
});
