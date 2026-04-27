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
  rollBonus: number;
  rollConfirmed: boolean;
  gameHistory: GameHistoryEntry[];
  revealedCards?: string[];
  activeInteraction?: {
    playerId: string;
    type: "gambling" | "bshop" | "discard_selection";
    cards: string[];
    targetPlayerId?: string;
    recipientId?: string;
    actingCardId?: string;
  } | null;
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
  rollBonus: 0,
  rollConfirmed: false,
  gameHistory: [],
  revealedCards: [],
};
