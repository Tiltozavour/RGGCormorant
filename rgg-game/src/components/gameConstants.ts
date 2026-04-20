import type { GamePhase } from "../types/game";

export const FALLBACK_AVATAR =
  "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg";

export const PHASE_ORDER: GamePhase[] = [
  "waiting_game",
  "playing",
  "results",
  "voting",
  "turn",
  "next_game",
];

export const PHASE_LABELS: Record<GamePhase, string> = {
  waiting_game: "Ожидание начала игры",
  playing: "Игра началась",
  results: "Результаты раунда",
  voting: "Голосование",
  turn: "Ход",
  next_game: "Раунд завершен",
};

export const AURA_COLORS = ["#fac319", "#a855f7", "#3b82f6", "#ef4444", "#10b981", "#f97316", "#ffffff"];