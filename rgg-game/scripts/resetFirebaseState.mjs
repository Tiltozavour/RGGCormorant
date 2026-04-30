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
import starterCards from "../src/components/starterCards.json" with { type: "json" };

const firebaseConfig = {
  apiKey: "AIzaSyAooKu3en7NMs-Hhlsl_Np432NVYOgIE8E",
  authDomain: "rggcormarant.firebaseapp.com",
  projectId: "rggcormarant",
  storageBucket: "rggcormarant.firebasestorage.app",
  messagingSenderId: "542738594296",
  appId: "1:542738594296:web:327d4527fcb5ce6096be0d",
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
