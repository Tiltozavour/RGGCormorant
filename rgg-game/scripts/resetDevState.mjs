import { doc, setDoc } from "firebase/firestore";
import {
  assertDevResetAllowed,
  createFirestoreFromEnv,
  defaultGameState,
  deleteCollection,
  printJsonResult,
  resetPlayers,
  seedCardsAndPrizes,
} from "./firebaseScriptUtils.mjs";

const { db, projectId } = createFirestoreFromEnv();
assertDevResetAllowed(projectId);

const [deletedCards, deletedPrizes, deletedEvents, playerCount] = await Promise.all([
  deleteCollection(db, "cards"),
  deleteCollection(db, "prizes"),
  deleteCollection(db, "gameEvents"),
  resetPlayers(db),
]);

await setDoc(doc(db, "gameState", "current"), defaultGameState);
const seeded = await seedCardsAndPrizes(db);

printJsonResult({
  ok: true,
  projectId,
  mode: "dev-reset",
  deletedCards,
  deletedPrizes,
  deletedEvents,
  resetPlayers: playerCount,
  uploadedCards: seeded.uploadedCards,
  uploadedPrizes: seeded.uploadedPrizes,
});
