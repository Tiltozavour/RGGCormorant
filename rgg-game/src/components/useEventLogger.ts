import { useCallback } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import type { GameEvent } from "./useModalStates";

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedFields) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedFields(entryValue)])
    ) as T;
  }

  return value;
};

export function useEventLogger() {
  return useCallback(async (event: GameEvent) => {
    try {
      await addDoc(collection(db, "gameEvents"), removeUndefinedFields(event));
    } catch (error) {
      console.error("Firestore log error:", error);
    }
  }, []);
}
