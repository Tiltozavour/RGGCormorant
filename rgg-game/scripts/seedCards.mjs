import {
  assertDevResetAllowed,
  createFirestoreFromEnv,
  printJsonResult,
  seedCardsAndPrizes,
} from "./firebaseScriptUtils.mjs";

const { db, projectId } = createFirestoreFromEnv();
const clearExisting = process.argv.includes("--reset") || process.env.SEED_RESET_CARDS === "true";

if (clearExisting) {
  assertDevResetAllowed(projectId);
}

const result = await seedCardsAndPrizes(db, { clearExisting });

printJsonResult({
  ok: true,
  projectId,
  mode: clearExisting ? "reset-and-seed-cards" : "seed-cards",
  ...result,
});
