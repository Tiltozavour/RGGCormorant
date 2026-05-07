import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import starterCards from "../src/components/starterCards.json" with { type: "json" };

function loadEnvFile(fileName) {
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

loadEnvFile(".env");
loadEnvFile(".env.local");

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing Firebase env variable: ${key}`);
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const defaultGameState = {
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
  showWheel: false,
  currentRoll: null,
  currentRollPlayerId: null,
  lastBaseRoll: null,
  forcedMovePlayerId: null,
  cardMove: null,
  rollBonus: 0,
  rollConfirmed: false,
  gameHistory: [],
  revealedCards: [],
  activeInteraction: null,
  activeDuels: {},
};

async function deleteCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  await Promise.all(snapshot.docs.map((snapshotDoc) => deleteDoc(snapshotDoc.ref)));
  return snapshot.size;
}

async function uploadCards() {
  const batch = writeBatch(db);

  for (const card of starterCards) {
    const collectionName = card.rarity === "legendary" ? "prizes" : "cards";
    batch.set(doc(db, collectionName, card.id), {
      ...card,
      isWon: false,
      winnerId: null,
    });
  }

  await batch.commit();
}

async function resetPlayers() {
  const snapshot = await getDocs(collection(db, "players"));

  await Promise.all(
    snapshot.docs.map((playerDoc) =>
      updateDoc(playerDoc.ref, {
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
      }),
    ),
  );

  return snapshot.size;
}

const [deletedCards, deletedPrizes, playerCount] = await Promise.all([
  deleteCollection("cards"),
  deleteCollection("prizes"),
  resetPlayers(),
]);

await setDoc(doc(db, "gameState", "current"), defaultGameState);
await uploadCards();

console.log(
  JSON.stringify(
    {
      ok: true,
      deletedCards,
      deletedPrizes,
      uploadedCards: starterCards.filter((card) => card.rarity !== "legendary").length,
      uploadedPrizes: starterCards.filter((card) => card.rarity === "legendary").length,
      resetPlayers: playerCount,
    },
    null,
    2,
  ),
);
