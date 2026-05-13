import { useEffect } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
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

export const useFinishedDuelCleanup = (
  activeDuels: GameState["activeDuels"],
  isAdmin: boolean,
) => {
  useEffect(() => {
    if (!isAdmin || !activeDuels) return;

    const updates = getFinishedDuelCleanupUpdates(activeDuels);
    if (Object.keys(updates).length === 0) return;

    const timer = window.setTimeout(async () => {
      await updateDoc(doc(db, "gameState", "current"), updates);
    }, 15000);

    return () => window.clearTimeout(timer);
  }, [activeDuels, isAdmin]);
};
