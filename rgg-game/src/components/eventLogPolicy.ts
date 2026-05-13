import type { GameEvent } from "./useModalStates";

export const VERBOSE_EVENT_LOG_STORAGE_KEY = "rgg-verbose-firestore-events";

const LOW_PRIORITY_EVENT_TYPES = new Set<GameEvent["type"]>([
  "coin_change",
  "movement",
  "status_effect",
  "info",
]);
const EVENT_DEDUP_WINDOW_MS = 3000;
const EVENT_WRITE_WINDOW_MS = 60_000;
const MAX_EVENT_WRITES_PER_WINDOW = 80;

const recentEventWrites = new Map<string, number>();
let eventWriteTimestamps: number[] = [];

export const resetEventLogPolicyStateForTests = () => {
  recentEventWrites.clear();
  eventWriteTimestamps = [];
};

export const isVerboseFirestoreEventsEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(VERBOSE_EVENT_LOG_STORAGE_KEY) === "1";
};

const getEventFingerprint = (event: GameEvent) => [
  event.type,
  event.cardId ?? "",
  event.playerId ?? "",
  event.targetPlayerId ?? "",
  event.message,
].join("|");

export const shouldPersistGameEvent = (
  event: GameEvent,
  now = Date.now(),
  verboseEvents = isVerboseFirestoreEventsEnabled(),
) => {
  if (!verboseEvents && LOW_PRIORITY_EVENT_TYPES.has(event.type)) {
    return false;
  }

  const fingerprint = getEventFingerprint(event);
  const lastWriteAt = recentEventWrites.get(fingerprint);
  if (lastWriteAt !== undefined && now - lastWriteAt < EVENT_DEDUP_WINDOW_MS) {
    return false;
  }

  eventWriteTimestamps = eventWriteTimestamps.filter((timestamp) => now - timestamp < EVENT_WRITE_WINDOW_MS);
  if (eventWriteTimestamps.length >= MAX_EVENT_WRITES_PER_WINDOW) {
    return event.type === "error" || event.type === "warning";
  }

  recentEventWrites.set(fingerprint, now);
  eventWriteTimestamps.push(now);
  return true;
};
