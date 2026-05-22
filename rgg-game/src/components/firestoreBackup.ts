import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const BACKUP_COLLECTIONS = [
  "players",
  "gameState",
  "cards",
  "prizes",
  "wheel",
  "game_settings",
  "invites",
] as const;

function toBackupValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
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

async function readCollection(collectionName: string) {
  const snapshot = await getDocs(collection(db, collectionName));
  return Object.fromEntries(
    snapshot.docs.map((snapshotDoc) => [
      snapshotDoc.id,
      toBackupValue(snapshotDoc.data({ serverTimestamps: "estimate" })),
    ]),
  );
}

function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFirestoreBackup() {
  const backup = {
    meta: {
      createdAt: new Date().toISOString(),
      collections: BACKUP_COLLECTIONS,
    },
    data: {} as Record<string, unknown>,
  };

  for (const collectionName of BACKUP_COLLECTIONS) {
    backup.data[collectionName] = await readCollection(collectionName);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadJson(`rgg-firestore-backup-${stamp}.json`, backup);
}
