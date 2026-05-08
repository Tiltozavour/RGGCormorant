import { initializeApp } from "firebase/app";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from "firebase/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import starterCards from "../src/components/starterCards.json" with { type: "json" };

export function loadEnvFile(fileName) {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

export function loadLocalEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

export function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing Firebase env variable: ${key}`);
  return value;
}

export function createFirestoreFromEnv() {
  loadLocalEnv();

  const firebaseConfig = {
    apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
    authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv("VITE_FIREBASE_APP_ID"),
  };

  const app = initializeApp(firebaseConfig);
  return {
    app,
    db: getFirestore(app),
    projectId: firebaseConfig.projectId,
  };
}

export const defaultGameState = {
  phase: "waiting_game",
  round: 1,
  currentGame: "",
  nextGame: "",
  turnOrder: [],
  currentTurnIndex: 0,
  lastWheelResult: null,
  votes: {},
  scores: {},
  currentResults: {},
  goldenCardHolderIds: [],
  hotCoinGain: null,
  showWheel: false,
  currentRoll: null,
  currentRollPlayerId: null,
  lastBaseRoll: null,
  forcedMovePlayerId: null,
  cardMove: null,
  cardDiceRoll: null,
  pendingTaxPayout: null,
  rollBonus: 0,
  rollConfirmed: false,
  gameHistory: [],
  revealedCards: [],
  activeInteraction: null,
  activeDuels: {},
  notifications: {},
};

export function getResetPlayerPatch() {
  return {
    position: 0,
    prevCell: null,
    inGame: false,
    inventory: [],
    tiltCoins: 0,
    lastTiltoCoins: 0,
    bonusPoints: 0,
    hasProtection: false,
    customStatus: null,
    statusDuration: 0,
    discardNextDrawn: false,
    redirectNextDrawnToPlayerId: null,
    giveNextDrawnToPlayerId: null,
    lastNotification: deleteField(),
    isFrozen: deleteField(),
    freezeDuration: deleteField(),
  };
}

export async function deleteCollection(db, collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  let batch = writeBatch(db);
  let pending = 0;

  for (const snapshotDoc of snapshot.docs) {
    batch.delete(snapshotDoc.ref);
    pending += 1;

    if (pending === 450) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return snapshot.size;
}

export async function resetPlayers(db) {
  const snapshot = await getDocs(collection(db, "players"));
  let batch = writeBatch(db);
  let pending = 0;

  for (const playerDoc of snapshot.docs) {
    batch.update(playerDoc.ref, getResetPlayerPatch());
    pending += 1;

    if (pending === 450) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return snapshot.size;
}

export async function seedCardsAndPrizes(db, { clearExisting = false } = {}) {
  const deletedCards = clearExisting ? await deleteCollection(db, "cards") : 0;
  const deletedPrizes = clearExisting ? await deleteCollection(db, "prizes") : 0;

  let batch = writeBatch(db);
  let pending = 0;
  let uploadedCards = 0;
  let uploadedPrizes = 0;

  for (const card of starterCards) {
    const collectionName = card.rarity === "legendary" ? "prizes" : "cards";
    const cardRef = doc(db, collectionName, card.id);

    batch.set(cardRef, {
      ...card,
      ...(card.rarity === "legendary"
        ? { isUnique: true, isWon: card.isWon ?? false, winnerId: card.winnerId ?? null }
        : {}),
    });

    if (card.rarity === "legendary") uploadedPrizes += 1;
    else uploadedCards += 1;

    pending += 1;
    if (pending === 450) {
      await batch.commit();
      batch = writeBatch(db);
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  return {
    deletedCards,
    deletedPrizes,
    uploadedCards,
    uploadedPrizes,
  };
}

export function assertDevResetAllowed(projectId) {
  const firebaseEnv = process.env.VITE_FIREBASE_ENV ?? process.env.FIREBASE_ENV ?? "";
  const allowReset = process.env.FIREBASE_ALLOW_DEV_RESET === "true";
  const confirmProjectId = process.env.FIREBASE_RESET_CONFIRM_PROJECT_ID;
  const looksProduction =
    firebaseEnv === "production" ||
    /\bprod\b|production/i.test(projectId);

  if (looksProduction) {
    throw new Error(
      `Refusing dev reset for production-like Firebase project "${projectId}". ` +
        "Use a separate dev Firebase project.",
    );
  }

  if (!allowReset) {
    throw new Error(
      "Refusing dev reset. Set FIREBASE_ALLOW_DEV_RESET=true in .env.local when you really want to reset dev data.",
    );
  }

  if (confirmProjectId !== projectId) {
    throw new Error(
      `Refusing dev reset. Set FIREBASE_RESET_CONFIRM_PROJECT_ID=${projectId} to confirm the exact target project.`,
    );
  }
}

export function printJsonResult(result) {
  console.log(JSON.stringify(result, null, 2));
}
