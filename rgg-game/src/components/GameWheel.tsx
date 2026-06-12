import React, { useState, useRef, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { Player } from "../types/game";
import type { WheelCardStackEntry } from "./wheelHandlers";
import "./GameWheel.css";

interface Item {
  id: string;
  name: string;
  image?: string;
  active?: boolean;
  url?: string;
}

interface WheelActionCard {
  id: string;
  name: string;
  image?: string;
  count?: number;
  disabled?: boolean;
  requiresResult?: boolean;
  onUse: () => void;
}

interface Props {
  items: Item[];
  players: Player[];
  onResult: (result: string) => void;
  onClose?: () => void;
  canSpin: boolean;
  actionCards?: WheelActionCard[];
  readOnly?: boolean;
  confirmLockUntil?: number;
}

export const GameWheel: React.FC<Props> = ({
  items,
  players,
  onResult,
  onClose,
  canSpin,
  actionCards = [],
  readOnly = false,
  confirmLockUntil,
}) => {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Item | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null); // Состояние для наведения на таблицу
  const [removedGameId, setRemovedGameId] = useState<string | null>(null); // Новое состояние для анимации исчезновения
  const [cardStack, setCardStack] = useState<WheelCardStackEntry[]>([]);
  const [lockSeconds, setLockSeconds] = useState(0);
  const wheelRef = useRef<HTMLDivElement>(null); // Ref for the main wheel div
  const requestRef = useRef<number | null>(null); // Ref for animation frame ID

  const angleStep = items.length > 0 ? 360 / items.length : 0;

  // Синхронизация состояния колеса через Firebase
  useEffect(() => {
    if (readOnly) return;

    const unsub = onSnapshot(doc(db, "game_settings", "wheel"), (snap) => {
      const data = snap.data();
      if (!data) return;

      // Если в БД началось вращение, а локально мы еще не крутимся
      if (data.isSpinning && data.targetRotation !== rotation) {
        setRotation(data.targetRotation);
        setSpinning(true);
        setWinner(null);

        // Локальный таймер остановки (синхронен с CSS transition 5s)
        setTimeout(() => {
          setSpinning(false);
          if (data.winnerIndex !== null && items[data.winnerIndex]) {
            setWinner(items[data.winnerIndex]);
            // onResult(items[data.winnerIndex].name); // Результат обрабатывается только после подтверждения админом
          }
          void updateDoc(doc(db, "game_settings", "wheel"), {
            isSpinning: false,
            updatedAt: Date.now(),
          }).catch((error) => {
            console.error("Не удалось зафиксировать остановку колеса:", error);
          });
        }, 5000);
      }

      // Если админ сбросил результат в БД
      if (data.winnerIndex === null && !data.isSpinning) {
        setWinner(null);
      }

      setCardStack(data.wheelCardStack || []);

      if (!data.isSpinning && typeof data.winnerIndex === "number" && items[data.winnerIndex]) {
        setRotation(Number(data.targetRotation ?? rotation));
        setWinner(items[data.winnerIndex]);
      }
    });

    return () => unsub();
  }, [items, readOnly, rotation]);

  // Логика обратного отсчета для блокировки кнопки
  useEffect(() => {
    if (!confirmLockUntil) return;
    const update = () => {
      const diff = Math.ceil((confirmLockUntil - Date.now()) / 1000);
      setLockSeconds(Math.max(0, diff));
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [confirmLockUntil]);

  const updateActiveSegment = useCallback(() => {
    const tick = () => {
      if (!wheelRef.current) return;
      const style = window.getComputedStyle(wheelRef.current);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const currentAngle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
      const normalizedAngle = (currentAngle < 0 ? currentAngle + 360 : currentAngle) % 360;
      const currentActive =
        Math.floor(((360 - normalizedAngle + 270) % 360) / angleStep) % items.length;
      setActiveIndex(currentActive);
      requestRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [angleStep, items.length]);

  useEffect(() => {
    if (spinning) {
      requestRef.current = requestAnimationFrame(updateActiveSegment);
    } else {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    }
    return () => { if (requestRef.current !== null) cancelAnimationFrame(requestRef.current); };
  }, [spinning, updateActiveSegment]);

  const spin = async () => {
    if (readOnly) return;
    if (spinning || items.length === 0 || winner) return;

    const selectedIndex = Math.floor(Math.random() * items.length);
    
    const targetSegmentCenter = selectedIndex * angleStep + (angleStep / 2);
    const currentRotationDegrees = rotation % 360;
    const extraDegrees = (270 - currentRotationDegrees - targetSegmentCenter + 1440) % 360;
    const final = rotation + 1800 + extraDegrees;
    
    // Записываем команду на вращение в Firebase
    await setDoc(doc(db, "game_settings", "wheel"), {
      isSpinning: true,
      targetRotation: final,
      winnerIndex: selectedIndex,
      previousWinnerIndex: null,
      previousTargetRotation: rotation,
      lastSpinSource: "admin",
      rerollBy: null,
      wheelCardStack: [],
      updatedAt: Date.now(),
    }, { merge: true });
  };

  const renderActionCards = () => {
    if (readOnly) return null;
    if (actionCards.length === 0) return null;

    return (
      <div className="flex flex-wrap justify-center gap-3 max-w-md">
        {actionCards.map((card) => {
          const isDisabled = spinning || card.disabled || (card.requiresResult && !winner);
          return (
            <button
              key={card.id}
              type="button"
              disabled={isDisabled}
              onClick={card.onUse}
              className="group relative flex h-24 w-40 items-center gap-3 rounded-xl border border-yellow-500/30 bg-zinc-950/85 p-2 text-left shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition-all hover:border-yellow-400 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: "'Comfortaa', sans-serif" }}
            >
              <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-800">
                {card.image ? (
                  <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-purple-700/50" />
                )}
              </div>
              <span className="min-w-0 text-[10px] font-black uppercase leading-snug text-white">
                {card.name}
              </span>
              {(card.count ?? 0) > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-yellow-500 px-2 py-0.5 text-[10px] font-black text-black">
                  x{card.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const handleConfirmResult = async (game: Item) => {
    if (readOnly) return;
    setRemovedGameId(game.id); // Отмечаем игру как удаленную для локальной анимации

    const batch = writeBatch(db);
    batch.update(doc(db, "wheel", game.id), {
      active: false
    });
    batch.update(doc(db, "game_settings", "wheel"), {
      isSpinning: false,
      winnerIndex: null,
      targetRotation: rotation % 360 // Сохраняем текущий угол для следующего старта
    });
    batch.update(doc(db, "gameState", "current"), {
      phase: "waiting_game",
      currentGame: game.name
    });
    await batch.commit();

    // Задерживаем вызов onResult, чтобы анимация исчезновения строки успела проиграться
    // Теперь onResult вызывается только здесь, после подтверждения админом
    setTimeout(() => onResult(game.name), 600); // Длительность анимации 0.5s + небольшой запас
  };

  const handleCloseWinner = async () => {
    if (readOnly) {
      setWinner(null);
      return;
    }

    if (canSpin) {
      await updateDoc(doc(db, "game_settings", "wheel"), {
        winnerIndex: null,
        isSpinning: false
      });
    } else {
      setWinner(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10020]">
      <div className="flex flex-row items-center justify-center w-full gap-12 px-12 max-h-[90vh]">
        
        {/* Левая часть: История манипуляций */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl w-80 flex flex-col gap-4 shrink-0 h-[600px] overflow-hidden hidden xl:flex">
          <h3 className="text-purple-400 font-black uppercase tracking-tighter text-lg border-b border-white/5 pb-2">Манипуляции</h3>
          <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
            <div className="flex flex-col gap-4">
              {cardStack.length === 0 ? (
                <div className="text-zinc-600 text-xs italic text-center mt-10">
                  Карт пока не применяли
                </div>
              ) : (
                cardStack.map((entry, idx) => {
                  const player = players.find(p => p.id === entry.playerId);
                  const isFish = entry.cardId === "inv_006";
                  const gameName = items[entry.resultWinnerIndex]?.name || "???";
                  
                  return (
                    <div key={idx} className="flex flex-col gap-1 border-l-2 border-purple-500/30 pl-3 py-1">
                      <div className="flex items-center gap-2">
                        <img 
                          src={player?.avatar || "/fallback-avatar.png"} 
                          className="w-5 h-5 rounded-full border border-white/10" 
                          alt="" 
                        />
                        <span className="text-[11px] font-black text-white truncate">
                          {player?.login || "???"}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {isFish ? (
                          <span className="text-blue-400 font-bold">Отменил (Mr.Fish)</span>
                        ) : (
                          <span className="text-yellow-500 font-bold">Подкрутил</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-200 bg-white/5 px-2 py-1 rounded mt-1">
                        ➔ {gameName}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {cardStack.length > 0 && (
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest text-center">
              Последнее действие внизу
            </div>
          )}
        </div>

        {/* Центральная часть: Колесо */}
        <div className="flex flex-col items-center gap-8">
          <div className="wheel-wrap">
            <div className="pointer" />
            
            <div 
              className="wheel" 
              ref={wheelRef}
              style={{ 
                transform: `rotate(${rotation}deg)`,
                transition: spinning ? 'transform 5s cubic-bezier(0.1, 0, 0, 1)' : 'none'
              }}
            >
              {items.map((item, i) => {
                const isHighlighted = i === activeIndex || i === hoveredIndex; // Подсветка при вращении или наведении
                const isWinner = !spinning && winner && (winner.id === item.id); // Надежная проверка победителя
                const segmentColor = `hsl(${(i * 360) / items.length}, 75%, 45%)`;
                
                const needsSkew = items.length > 2;
                const skewAngle = needsSkew ? -(90 - angleStep) : 0;
                const isTwoSegments = items.length === 2;

                return (
                  <div
                    key={i}
                    className={`wheel-item ${isHighlighted ? 'active-segment' : ''}`}
                    style={{
                      transform: `rotate(${i * angleStep}deg) ${needsSkew ? `skewY(${skewAngle}deg)` : ''}`,
                      backgroundColor: segmentColor,
                      width: isTwoSegments ? '50.2%' : '50%',
                      height: isTwoSegments ? '100.2%' : '50.2%', 
                      left: '50%',
                      top: isTwoSegments ? '0' : '0',
                      transformOrigin: isTwoSegments ? '0% 50%' : '0% 100%',
                      zIndex: isWinner ? 30 : (isHighlighted ? 10 : 0),
                      borderLeft: isTwoSegments ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    {item.image && (() => {
                      const baseScale = needsSkew 
                        ? Math.max(2.5, 1 / Math.cos((skewAngle * Math.PI) / 180) * 1.5)
                        : 1.5;
                      const finalScale = isWinner ? baseScale * 1.25 : baseScale;
                      
                      return (
                        <div 
                          className="wheel-item-bg" 
                          style={{ 
                            backgroundImage: `url("${item.image}")`,
                            transform: needsSkew 
                              ? `skewY(${-skewAngle}deg) scale(${finalScale})` 
                              : `scale(${finalScale})`,
                            transformOrigin: isTwoSegments ? '0% 50%' : '0% 100%',
                            opacity: isHighlighted ? 1 : 0.7
                          }} 
                        />
                      );
                    })()}
                    <div 
                      className="wheel-label"
                      style={{ 
                        left: 0,
                        top: isTwoSegments ? '50%' : '100%',
                        transform: `skewY(${-skewAngle}deg) rotate(${angleStep / 2}deg) translateY(-50%)`,
                        paddingLeft: isTwoSegments ? '140px' : '65px'
                      }}
                    >
                      {item.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {!readOnly && canSpin && !spinning && !winner && (
              <div
                className="bg-yellow-500 text-black px-12 py-4 rounded-full font-black text-xl cursor-pointer hover:bg-white transition-all shadow-[0_0_30px_rgba(250,204,21,0.4)]"
                onClick={spin}
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                КРУТИТЬ!
              </div>
            )}
            {!readOnly && !winner && renderActionCards()} {/* Action cards can be used by players too if they have them */}
            {!spinning && (readOnly || canSpin) && ( // Кнопка "Закрыть" видна только админу на основном колесе или всегда на readOnly колесе
              <button onClick={onClose} className="text-zinc-500 hover:text-white hover:scale-105 active:scale-95 transition-all text-sm uppercase font-bold tracking-widest" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                Закрыть
              </button>
            )}
          </div>
        </div>

        {/* Правая часть: Список игр */}
        <div className="games-list-container bg-zinc-900/50 border border-white/10 rounded-3xl p-6 backdrop-blur-xl w-80 flex flex-col gap-4 shrink-0 h-[600px] overflow-hidden">
          <h3 className="text-yellow-500 font-black uppercase tracking-tighter text-lg border-b border-white/5 pb-2">Список игр ({items.length})</h3>
          <div className="overflow-y-auto pr-2 custom-scrollbar">
            <div className="flex flex-col gap-2">
              {items.map((item, idx) => {
                const isRemoved = removedGameId === item.id;
                const isHighlighted = idx === activeIndex || idx === hoveredIndex;
                const hasUrl = Boolean(item.url);
                const tooltip = hasUrl ? `${item.name}\n${item.url}` : item.name;

                return (
                  <button
                    key={item.id || idx}
                    type="button"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => {
                      if (!item.url) return;
                      window.open(item.url, "_blank", "noopener,noreferrer");
                    }}
                    title={tooltip}
                    disabled={!hasUrl}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_5.75rem] items-center gap-3 rounded-lg py-2 pl-3 pr-2 text-left transition-all duration-300 disabled:cursor-default ${
                      hasUrl ? 'cursor-pointer' : ''
                    } ${isHighlighted ? 'bg-yellow-500/20 scale-[1.02]' : ''} ${isRemoved ? 'removed-game-row' : ''}`}
                  >
                    <span className="grid min-w-0 grid-cols-[0.5rem_minmax(0,1fr)_0.75rem] items-center gap-3">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(${(idx * 360) / items.length}, 75%, 45%)` }} />
                      <span className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold uppercase ${isHighlighted ? 'text-yellow-400' : 'text-zinc-400'}`}>
                        {item.name}
                      </span>
                      <span className={`text-[9px] font-black ${hasUrl ? (isHighlighted ? 'text-yellow-300' : 'text-zinc-600') : 'text-transparent'}`}>
                        {hasUrl ? "↗" : ""}
                      </span>
                    </span>
                    <span className={`justify-self-end whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-black uppercase ${isHighlighted ? 'bg-yellow-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                      {item.active !== false ? "В списке" : "Выбыл"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Окно победителя (вынесено из основного flex-потока для точной центровки) */}
      {!readOnly && winner && (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 px-4">
          <div className="bg-zinc-900 border-2 border-yellow-500 p-8 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col items-center gap-6 max-w-sm w-full transform animate-in zoom-in duration-300">
            <div className="text-center">
              <p className="text-yellow-500 text-[10px] tracking-[0.4em] uppercase font-black mb-2 opacity-80" style={{ fontFamily: "'Comfortaa', sans-serif" }}>Выпала игра:</p>
              <h2 className="text-4xl font-black text-white uppercase italic leading-tight drop-shadow-xl">{winner.name}</h2>
            </div>
            {winner.image && (
              <div className="relative w-full aspect-video overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                <img src={winner.image} className="w-full h-full object-cover" alt={winner.name} />
              </div>
            )}
            <div className="flex flex-col w-full gap-3 mt-2">
              {!canSpin && renderActionCards()}
              {canSpin && (
                <button 
                  disabled={lockSeconds > 0}
                  onClick={() => handleConfirmResult(winner)} 
                  className="w-full bg-yellow-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-black py-4 rounded-2xl font-black text-lg hover:bg-white transition-all uppercase" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                  {lockSeconds > 0 ? `Ожидание (${lockSeconds}с)` : "Принять выбор"}
                </button>
              )}
              <button onClick={handleCloseWinner} className="w-full py-3 text-zinc-500 hover:text-white text-sm font-bold" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                <span className="hover:underline active:opacity-50 transition-all">Вернуться к колесу</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
