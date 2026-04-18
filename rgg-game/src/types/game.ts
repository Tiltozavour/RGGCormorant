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
  position?: number;
  prevCell?: number | null;
  inGame?: boolean;
  role?: "admin" | "player";
  borderColor?: string;
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
  showWheel: boolean;
  currentRoll: number | null;
  currentRollPlayerId: string | null;
  rollConfirmed: boolean;
  gameHistory: GameHistoryEntry[];
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
  showWheel: false,
  currentRoll: null,
  currentRollPlayerId: null,
  rollConfirmed: false,
  gameHistory: [],
};
