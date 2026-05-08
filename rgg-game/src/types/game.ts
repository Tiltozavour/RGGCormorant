import type { DuelState } from "./duel";
export type { DuelState, DuelStatus, DuelWeapon } from "./duel";

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

export interface ActiveInteraction {
  playerId: string;
  type:
    | "gambling"
    | "bshop"
    | "discard_selection"
    | "reflect_response"
    | "tax_response"
    | "move_for_coins_selection"
    | "duel_challenge_response"
    | "duel_weapon_selection"
    | "duel_betting"
    | "duel_ready_to_roll";
  cards: string[];
  targetPlayerId?: string;
  recipientId?: string;
  actingCardId?: string;
  duelId?: string;
  fromCardMove?: boolean;
  fromTaxCard?: boolean;
  reflected?: boolean;
  taxQueue?: string[];
  taxOwnerId?: string;
  taxOwnerName?: string;
  taxCollectorId?: string;
  taxCollectorName?: string;
  taxBank?: number;
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
  goldenCardHolderIds?: string[];
  hotCoinGain?: {
    playerId: string;
    amount: number;
    sourceCardId?: string;
    sourceName?: string;
    timestamp: number;
  } | null;
  showWheel: boolean;
  currentRoll: number | null;
  currentRollPlayerId: string | null;
  lastBaseRoll: number | null;
  forcedMovePlayerId: string | null;
  cardMove: {
    id: string;
    controllerId: string;
    controllerName?: string;
    targetId: string;
    steps: number;
    position?: number;
    prevCell?: number | null;
    cardId?: string;
    cardName?: string;
  } | null;
  cardDiceRoll?: {
    id: string;
    playerId: string;
    playerName: string;
    cardId: string;
    value: number;
    timestamp: number;
  } | null;
  pendingTaxPayout?: {
    id: string;
    playerId: string;
    playerName?: string;
    amount: number;
    cardId?: string;
  } | null;
  rollBonus: number;
  rollConfirmed: boolean;
  gameHistory: GameHistoryEntry[];
  revealedCards?: string[];
  activeInteraction?: ActiveInteraction | null;
  activeDuels: Record<string, DuelState>;
  notifications?: Record<string, {
    message: string;
    timestamp: number;
    cardId?: string;
  }>;
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
  goldenCardHolderIds: [],
  hotCoinGain: null,
  showWheel: false,
  currentRoll: null,
  currentRollPlayerId: null,
  lastBaseRoll: null,
  forcedMovePlayerId: null,
  cardMove: null,
  cardDiceRoll: null,
  pendingTaxPayout: null,
  rollBonus: 0,
  rollConfirmed: false,
  gameHistory: [],
  revealedCards: [],
  notifications: {},
  activeDuels: {}, // Инициализируем активные дуэли
};
