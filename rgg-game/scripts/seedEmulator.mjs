import { doc, setDoc, writeBatch } from "firebase/firestore";
import {
  createFirestoreFromEnv,
  defaultGameState,
  deleteCollection,
  loadEnvFile,
  printJsonResult,
  seedCardsAndPrizes,
} from "./firebaseScriptUtils.mjs";

loadEnvFile(".env.emulator");

if (process.env.VITE_USE_FIREBASE_EMULATOR !== "true") {
  process.env.VITE_USE_FIREBASE_EMULATOR = "true";
}

const { db, projectId, useEmulator } = createFirestoreFromEnv();

if (!useEmulator) {
  throw new Error("seedEmulator must run with VITE_USE_FIREBASE_EMULATOR=true.");
}

const authUsers = [
  {
    login: "Admin",
    password: "admin123",
    role: "admin",
  },
  {
    login: "Plastic",
    password: "player123",
    role: "player",
  },
  {
    login: "Katjit",
    password: "player123",
    role: "player",
  },
  {
    login: "Carmoran",
    password: "player123",
    role: "player",
  },
];

const playerProfiles = [
  {
    login: "Admin",
    role: "admin",
    tiltCoins: 5,
    inGame: false,
    inventory: [],
  },
  {
    login: "Plastic",
    role: "player",
    position: 6,
    prevCell: null,
    tiltCoins: 5,
    lastTiltoCoins: 0,
    bonusPoints: 0,
    inGame: true,
    inventory: ["inv_006", "inv_007", "inv_008", "inv_013"],
  },
  {
    login: "Katjit",
    role: "player",
    position: 15,
    prevCell: null,
    tiltCoins: 5,
    lastTiltoCoins: 0,
    bonusPoints: 0,
    inGame: true,
    inventory: ["inv_006", "inv_010", "inv_011", "inv_014"],
  },
  {
    login: "Carmoran",
    role: "player",
    position: 10,
    prevCell: null,
    tiltCoins: 5,
    lastTiltoCoins: 0,
    bonusPoints: 0,
    inGame: true,
    inventory: ["inv_009", "inv_015", "inv_016", "inv_020"],
  },
];

const wheelGames = [
  { id: "game_1", name: "Pummel Party", active: true, url: "https://example.com/game-1" },
  { id: "game_2", name: "Golf With Your Friends", active: true, url: "https://example.com/game-2" },
  { id: "game_3", name: "Move or Die", active: true, url: "https://example.com/game-3" },
];

const invites = [
  { id: "local-admin", code: "local-admin", login: "Admin", role: "admin", used: false },
  { id: "local-player", code: "local-player", login: "Player", role: "player", used: false },
];

const authBaseUrl = `http://127.0.0.1:9099`;

const clearAuthUsers = async () => {
  await fetch(`${authBaseUrl}/emulator/v1/projects/${projectId}/accounts`, {
    method: "DELETE",
  });
};

const createAuthUser = async ({ login, password }) => {
  const response = await fetch(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${login.trim().toLowerCase()}@cormorant.dev`,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to create auth user ${login}: ${JSON.stringify(payload)}`);
  }

  return payload.localId;
};

await Promise.all([
  deleteCollection(db, "cards"),
  deleteCollection(db, "prizes"),
  deleteCollection(db, "players"),
  deleteCollection(db, "gameEvents"),
  deleteCollection(db, "wheel"),
  deleteCollection(db, "invites"),
  deleteCollection(db, "game_settings"),
]);
await clearAuthUsers();

const seededCards = await seedCardsAndPrizes(db);
const authUserIds = new Map();

for (const authUser of authUsers) {
  const uid = await createAuthUser(authUser);
  authUserIds.set(authUser.login, uid);
}

const batch = writeBatch(db);

for (const player of playerProfiles) {
  const playerId = authUserIds.get(player.login);
  if (!playerId) throw new Error(`Missing auth uid for ${player.login}`);

  batch.set(doc(db, "players", playerId), {
    id: playerId,
    avatar: "",
    borderColor: "#fac319",
    customStatus: null,
    statusDuration: 0,
    hasProtection: false,
    createdAt: Date.now(),
    ...player,
  });
}

for (const game of wheelGames) {
  batch.set(doc(db, "wheel", game.id), game);
}

for (const invite of invites) {
  batch.set(doc(db, "invites", invite.id), invite);
}

batch.set(doc(db, "gameState", "current"), {
  ...defaultGameState,
  currentGame: "Локальная тестовая игра",
  phase: "turn",
  turnOrder: ["Plastic", "Katjit", "Carmoran"]
    .map((login) => authUserIds.get(login))
    .filter(Boolean),
  currentTurnIndex: 0,
});

batch.set(doc(db, "game_settings", "wheel"), {
  isSpinning: false,
  targetRotation: 0,
  winnerIndex: null,
  previousWinnerIndex: null,
  previousTargetRotation: null,
  wheelCardStack: [],
  lastSpinSource: null,
  rerollBy: null,
  updatedAt: Date.now(),
});

await batch.commit();

printJsonResult({
  ok: true,
  projectId,
  mode: "seed-emulator",
  ...seededCards,
  authUsers: authUsers.map(({ login, password, role }) => ({ login, password, role })),
  players: playerProfiles.length,
  wheelGames: wheelGames.length,
  invites: invites.length,
});
