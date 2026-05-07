import { useMemo, useState } from "react";
import type { GameCard as GameCardType } from "../types/card";
import type { Player } from "../types/game";
import { RARITY_CONFIG } from "./gameConstants";
import GameCard from "./GameCard";
import type { GameEvent } from "./useModalStates";

interface EventLogProps {
  gameEvents: GameEvent[];
  allCards: Record<string, GameCardType>;
  players: Player[];
  onClear: () => void;
  isClearing: boolean;
  canClear: boolean;
}

function EventLog({ gameEvents, allCards, players, onClear, isClearing, canClear }: EventLogProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  void players;

  const uniqueGameEvents = useMemo(() => {
    return Array.from(new Map(gameEvents.map(event => [event.id, event])).values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [gameEvents]);

  return (
    <div className={`fixed top-1/2 -translate-y-1/2 left-0 h-1/2 w-80 z-30 transition-transform duration-300 ${isCollapsed ? '-translate-x-full' : 'translate-x-0'}`}>
      <div className="h-full w-full bg-black/40 backdrop-blur-md border-r border-white/10 overflow-y-auto custom-scrollbar" style={{ direction: 'rtl' }}>
        <div className="p-4" style={{ direction: 'ltr' }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-white text-lg font-bold">Лог событий</h3>
            {canClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={isClearing || uniqueGameEvents.length === 0}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/60 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 disabled:pointer-events-none disabled:opacity-40"
                title="Очистить лог событий"
              >
                {isClearing ? "..." : "Очистить"}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {uniqueGameEvents.map(event => (
              <div key={event.id} className="text-xs text-zinc-400">
                <span className="text-zinc-600 mr-2">[{new Date(event.timestamp).toLocaleTimeString()}]</span>
                <span className={`
                  ${event.type === 'success' ? 'text-green-400' :
                    event.type === 'error' ? 'text-red-400' :
                    event.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'}
                `} style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                  {event.message}
                </span>
                {event.cardId && allCards[event.cardId] && (() => {
                  const card = allCards[event.cardId];
                  const config = RARITY_CONFIG[card.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG.default;
                  return (
                    <span className="relative group/card inline-block ml-1">
                      <span
                        className="cursor-help font-bold underline decoration-2 underline-offset-2 transition-colors"
                        style={{ color: config.bgCard }}
                      >
                        [{card.name}]
                      </span>
                      <div className="fixed left-80 bottom-1/4 scale-[0.45] origin-left opacity-0 group-hover/card:opacity-100 pointer-events-none transition-all duration-200 z-[100] drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                        <GameCard card={card} index={0} totalCards={1} />
                      </div>
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute left-full top-0 mt-4 h-10 w-8 bg-black/60 backdrop-blur-md border border-l-0 border-white/20 flex items-center justify-center text-white/70 hover:text-white rounded-r-xl shadow-2xl transition-all"
        title={isCollapsed ? "Развернуть лог" : "Свернуть лог"}
      >
        <span className="text-[10px] transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>◀</span>
      </button>
    </div>
  );
}

export default EventLog;
