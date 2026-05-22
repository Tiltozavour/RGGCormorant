import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFirestoreFromEnv, loadEnvFile } from "./firebaseScriptUtils.mjs";

loadEnvFile(".env.backup");

const CORE_COLLECTIONS = [
  "players",
  "gameState",
  "cards",
  "prizes",
  "wheel",
  "game_settings",
  "invites",
];

const args = new Set(process.argv.slice(2));
const includeEvents = args.has("--include-events");
const collections = includeEvents ? [...CORE_COLLECTIONS, "gameEvents"] : CORE_COLLECTIONS;

function toBackupValue(value) {
  if (value == null) return value;

  if (typeof value.toDate === "function") {
    return {
      __type: "timestamp",
      value: value.toDate().toISOString(),
    };
  }

  if (Array.isArray(value)) {
    return value.map(toBackupValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, toBackupValue(nestedValue)]),
    );
  }

  return value;
}

async function readCollection(db, collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return Object.fromEntries(
    snapshot.docs.map((snapshotDoc) => [
      snapshotDoc.id,
      toBackupValue(snapshotDoc.data({ serverTimestamps: "estimate" })),
    ]),
  );
}

async function main() {
  const { db, projectId, useEmulator } = createFirestoreFromEnv();

  if (!useEmulator) {
    const email = process.env.FIREBASE_BACKUP_EMAIL;
    const password = process.env.FIREBASE_BACKUP_PASSWORD;

    if (!email || !password) {
      throw new Error(
        "Missing FIREBASE_BACKUP_EMAIL/FIREBASE_BACKUP_PASSWORD. " +
          "Put them into .env.backup or set them before running the script.",
      );
    }

    await signInWithEmailAndPassword(getAuth(), email, password);
  }

  const backup = {
    meta: {
      projectId,
      useEmulator,
      createdAt: new Date().toISOString(),
      collections,
    },
    data: {},
  };

  for (const collectionName of collections) {
    backup.data[collectionName] = await readCollection(db, collectionName);
    console.log(`${collectionName}: ${Object.keys(backup.data[collectionName]).length} docs`);
  }

  const backupDir = resolve(process.cwd(), "backups");
  mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = includeEvents
    ? `firestore-backup-${projectId}-${stamp}-with-events.json`
    : `firestore-backup-${projectId}-${stamp}.json`;
  const filePath = resolve(backupDir, fileName);

  writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  console.log(`Backup saved: ${filePath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
