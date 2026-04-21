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

export const isHexColor = (val: string | null | undefined): boolean => 
  typeof val === 'string' && val.startsWith('#');

export const RARITY_CONFIG = {
  common: {
    border: 'border-slate-400/50',
    artGradient: 'from-slate-700 via-slate-800 to-slate-900',
    glow: 'shadow-[0_0_20px_rgba(148,163,184,0.2)]',
    bgCard: '#4b5563',
    bgGradientStart: '#4b5563',
    bgGradientEnd: '#1f2937',
    accent: 'bg-slate-500',
  },
  rare: {
    border: 'border-blue-400/50',
    artGradient: 'from-blue-600 via-blue-800 to-indigo-950',
    glow: 'shadow-[0_0_25px_rgba(59,130,246,0.4)]',
    bgCard: '#3b82f6',
    bgGradientStart: '#3b82f6',
    bgGradientEnd: '#1e3a8a',
    accent: 'bg-blue-500',
  },
  epic: {
    border: 'border-purple-400/50',
    artGradient: 'from-purple-600 via-indigo-900 to-black',
    glow: 'shadow-[0_0_30px_rgba(168,85,247,0.5)]',
    bgCard: '#a855f7',
    bgGradientStart: '#a855f7',
    bgGradientEnd: '#4f46e5',
    accent: 'bg-purple-500',
  },
  legendary: {
    border: 'border-yellow-400/60',
    artGradient: 'from-yellow-400 via-orange-600 to-red-950',
    glow: 'shadow-[0_0_40px_rgba(250,204,21,0.6)]',
    bgCard: '#facc15',
    bgGradientStart: '#facc15',
    bgGradientEnd: '#ea580c',
    accent: 'bg-yellow-500',
  },
  default: {
    border: 'border-zinc-500/50',
    artGradient: 'from-zinc-700 via-zinc-800 to-zinc-900',
    glow: 'shadow-[0_0_15px_rgba(113,113,122,0.2)]',
    bgCard: '#4b5563',
    bgGradientStart: '#4b5563',
    bgGradientEnd: '#1f2937',
    accent: 'bg-zinc-500',
  }
};