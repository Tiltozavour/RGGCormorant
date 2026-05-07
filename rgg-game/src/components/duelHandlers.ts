import { deleteField } from "firebase/firestore";
import type { GameState } from "../types/game";

export const getFinishedDuelCleanupUpdates = (activeDuels: GameState["activeDuels"]) => {
  const updates: Record<string, unknown> = {};

  Object.keys(activeDuels ?? {})
    .filter((id) => activeDuels[id].status === "finished")
    .forEach((id) => {
      updates[`activeDuels.${id}`] = deleteField();
    });

  return updates;
};
