export type GamePhase =
  | "waiting_game"
  | "playing"
  | "results"
  | "voting"
  | "turn"
  | "next_game";

export interface GameScoreParts {
  total: number;
  game?: number;
  voting?: number;
}

export interface GameHistoryEntry {
  id: string;
  gameName: string;
  scores: Record<string, number | GameScoreParts>;
  createdAt?: unknown;
}

export type DuelWeapon = "dice" | "custom";

export interface DuelState {
  id: string;
  challengerId: string;
  targetId: string;
  status: "pending" | "accepted" | "betting" | "ready" | "rolling" | "admin_wait" | "finished";
  weapon: DuelWeapon | null;
  bets: Record<string, number>;
  isReady: Record<string, boolean>;
  winnerId?: string | "draw";
}

export interface ActiveInteraction {
  playerId: string;
  type:
    | "gambling"
    | "bshop"
    | "discard_selection"
    | "move_for_coins_selection"
    | "duel_challenge_response"
    | "duel_weapon_selection";
  cards: string[];
  targetPlayerId?: string;
  recipientId?: string;
  actingCardId?: string;
  duelId?: string;
  fromCardMove?: boolean;
}

export interface Player {
  id: string;
  login: string;
  avatar?: string;
  tiltCoins?: number;
  lastTiltoCoins?: number;
  bonusPoints?: number;
  position?: number;
  prevCell?: number | null;
  inGame?: boolean;
  inventory?: string[];
  role?: "admin" | "player";
  hasProtection?: boolean;
  customStatus?: string | null;
  statusDuration?: number;
  discardNextDrawn?: boolean;
  redirectNextDrawnToPlayerId?: string | null;
  giveNextDrawnToPlayerId?: string | null;
  borderColor?: string;
  lastNotification?: {
    message: string;
    timestamp: number;
    cardId?: string;
  };
  createdAt?: unknown;
  // Добавьте сюда поля, специфичные для дуэли, если они нужны для игрока (например, текущая ставка, выбранное оружие)
}

export interface GameState {
  phase: GamePhase;
  round: number;
  currentGame: string;
  nextGame: string;
  turnOrder: string[];
  currentTurnIndex: number;
  lastWheelResult: string | null;
  votes: Record<string, string>;
  scores: Record<string, number>;
  currentResults: Record<string, number>;
  showWheel: boolean;
  currentRoll: number | null;
  currentRollPlayerId: string | null;
  lastBaseRoll: number | null;
  forcedMovePlayerId: string | null;
  cardMove: {
    controllerId: string;
    targetId: string;
    steps: number;
  } | null;
  rollBonus: number;
  rollConfirmed: boolean;
  gameHistory: GameHistoryEntry[];
  revealedCards?: string[];
  activeInteraction?: ActiveInteraction | null;
  activeDuels: Record<string, DuelState>;
}

export const defaultGameState: GameState = {
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
  activeDuels: {}, // Инициализируем активные дуэли
};
