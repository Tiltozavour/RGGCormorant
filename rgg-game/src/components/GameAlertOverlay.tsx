import type { GameCard as GameCardType } from "../types/card";
import GameCard from "./GameCard";
import type { GameAlert } from "./useModalStates";

interface GameAlertOverlayProps {
  alert: GameAlert | null;
  allCards: Record<string, GameCardType>;
  onClose: () => void;
}

function GameAlertOverlay({ alert, allCards, onClose }: GameAlertOverlayProps) {
  if (!alert) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[20000] p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border-2 border-yellow-500/50 p-8 rounded-[2rem] max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,1)] text-center transform animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
          <span className="text-3xl">🔔</span>
        </div>
        <h3 className="text-xl font-black text-yellow-500 uppercase italic tracking-tighter mb-2">
          {alert.title}
        </h3>
        <p className="text-zinc-300 text-sm font-medium leading-relaxed mb-6" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
          {alert.message}
        </p>

        {alert.cardId && allCards[alert.cardId] && (
          <div className="mb-6 relative group inline-block">
            <div className="bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-xl cursor-help transition-all hover:bg-red-500/20">
              <span className="text-red-400 font-bold text-sm tracking-wide uppercase">
                {allCards[alert.cardId].name}
              </span>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[20001] scale-[0.6] origin-bottom invisible group-hover:visible drop-shadow-2xl">
              <GameCard card={allCards[alert.cardId]} index={0} totalCards={1} />
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-4 bg-yellow-500 text-black rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all active:scale-95"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

export default GameAlertOverlay;
