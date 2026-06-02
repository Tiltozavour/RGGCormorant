import { useMemo, useState } from "react";
import type { GameCard as GameCardType } from "../types/card";
import type { Player } from "../types/game";
import { RARITY_CONFIG } from "./gameConstants";
import GameCard from "./GameCard";
import type { GameEvent } from "./useModalStates";
import { ru } from "../i18n/ru";

interface EventLogProps {
  gameEvents: GameEvent[];
  allCards: Record<string, GameCardType>;
  players: Player[];
  onClear: () => void;
  isClearing: boolean;
  canClear: boolean;
}

function EventLog({ gameEvents, allCards, players, onClear, isClearing, canClear }: EventLogProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);

  const uniqueGameEvents = useMemo(() => {
    return Array.from(new Map(gameEvents.map(event => [event.id, event])).values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [gameEvents]);

  const previewCard = previewCardId ? allCards[previewCardId] : null;

  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 left-0 h-1/2 w-80 z-30 transition-transform duration-300 ${isCollapsed ? '-translate-x-full' : 'translate-x-0'}`}
      onMouseLeave={() => setPreviewCardId(null)}
    >
      <div className="h-full w-full bg-black/40 backdrop-blur-md border-r border-white/10 overflow-y-auto custom-scrollbar" style={{ direction: 'rtl' }}>
        <div className="p-4" style={{ direction: 'ltr' }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-white text-lg font-bold">{ru.eventLog.title}</h3>
            {canClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={isClearing || uniqueGameEvents.length === 0}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/60 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 disabled:pointer-events-none disabled:opacity-40"
                title={ru.eventLog.clearTitle}
              >
                {isClearing ? "..." : ru.eventLog.clearButton}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {uniqueGameEvents.map(event => (
              <div key={event.id} className="text-xs text-zinc-400">
                <span className="text-zinc-600 mr-2">[{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>
                <span 
                  className={`
                    ${event.type === 'success' ? 'text-green-400' :
                      event.type === 'error' ? 'text-red-400' :
                      event.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'}
                  `} 
                  style={{ fontFamily: "'Comfortaa', sans-serif" }}
                >
                  {(() => {
                    const match = event.message.match(/^\[(.*?)\] (.*)$/);
                    if (!match) return event.message;

                    const [, playerName, messageBody] = match;
                    // Ищем игрока по логину, чтобы получить цвет его ауры
                    const player = players.find(p => p.login === playerName);
                    const auraColor = player?.borderColor;

                    return (
                      <>
                        <span style={auraColor ? { color: auraColor, fontWeight: '900' } : { fontWeight: '900' }}>
                          [{playerName}]
                        </span>
                        {' '}{messageBody}
                      </>
                    );
                  })()}
                </span>
                {event.cardId && allCards[event.cardId] && (() => {
                  const card = allCards[event.cardId];
                  const config = RARITY_CONFIG[card.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG.default;
                  return (
                    <span className="inline-block ml-1">
                      <span
                        className="cursor-help font-bold underline decoration-2 underline-offset-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        style={{ color: config.bgCard }}
                        tabIndex={0}
                        onMouseEnter={() => setPreviewCardId(card.id)}
                        onMouseLeave={() => setPreviewCardId(null)}
                        onFocus={() => setPreviewCardId(card.id)}
                        onBlur={() => setPreviewCardId(null)}
                      >
                        [{card.name}]
                      </span>
                    </span>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {previewCard && !isCollapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 z-[100] ml-4 h-[234px] w-36 -translate-y-1/2 drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
          <div className="scale-[0.45] origin-top-left">
            <GameCard card={previewCard} index={0} totalCards={1} />
          </div>
        </div>
      )}

      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute left-full top-0 mt-4 h-10 w-8 bg-black/60 backdrop-blur-md border border-l-0 border-white/20 flex items-center justify-center text-white/70 hover:text-white rounded-r-xl shadow-2xl transition-all"
        title={isCollapsed ? ru.eventLog.expandTitle : ru.eventLog.collapseTitle}
      >
        <span className="text-[10px] transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>◀</span>
      </button>
    </div>
  );
}

export default EventLog;
