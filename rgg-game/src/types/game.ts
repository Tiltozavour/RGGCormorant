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
  lastTiltoCoins?: number; // Результат последнего раунда/голосования
  bonusPoints?: number;   // Очки за голосование в текущем раунде
  position?: number;
  prevCell?: number | null;
  inGame?: boolean;
  inventory?: string[];   // Массив ID карточек
  role?: "admin" | "player";
  isFrozen?: boolean;     // Флаг заморозки игрока (для Ледолуча)
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
  currentResults: Record<string, number>; // Добавляем поле для текущих результатов
  showWheel: boolean;
  currentRoll: number | null;
  currentRollPlayerId: string | null;
  lastBaseRoll: number | null; // Чистое значение кубика без бонусов
  rollBonus: number; // Бонусные шаги от карт, использованных ДО броска
  rollConfirmed: boolean;
  gameHistory: GameHistoryEntry[];
  revealedCards?: string[]; // Список ID карт, которые были "открыты" игроками
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
  currentResults: {}, // Инициализируем пустым объектом
  showWheel: false,
  currentRoll: null,
  currentRollPlayerId: null,
  lastBaseRoll: null,
  rollBonus: 0,
  rollConfirmed: false,
  gameHistory: [],
  revealedCards: [],
};
