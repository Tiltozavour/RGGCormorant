import React, { useState, useRef, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import "./GameWheel.css";

interface Item {
  id: string;
  name: string;
  image?: string;
  active?: boolean;
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
  onResult: (result: string) => void;
  onClose?: () => void;
  canSpin: boolean;
  actionCards?: WheelActionCard[];
}

export const GameWheel: React.FC<Props> = ({
  items,
  onResult,
  onClose,
  canSpin,
  actionCards = [],
}) => {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Item | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null); // Состояние для наведения на таблицу
  const [removedGameId, setRemovedGameId] = useState<string | null>(null); // Новое состояние для анимации исчезновения
  const wheelRef = useRef<HTMLDivElement>(null); // Ref for the main wheel div
  const requestRef = useRef<number | null>(null); // Ref for animation frame ID

  const angleStep = items.length > 0 ? 360 / items.length : 0;

  // Синхронизация состояния колеса через Firebase
  useEffect(() => {
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

      if (!data.isSpinning && typeof data.winnerIndex === "number" && items[data.winnerIndex]) {
        setRotation(Number(data.targetRotation ?? rotation));
        setWinner(items[data.winnerIndex]);
      }
    });

    return () => unsub();
  }, [items, rotation]);

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
    setTimeout(() => onResult(game.name), 600); // Длительность анимации 0.5s + небольшой запас
  };

  const handleCloseWinner = async () => {
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999]">
      <div className="flex flex-row items-center justify-center w-full gap-12 px-12 max-h-[90vh]">
        
        {/* Левая распорка для центровки (равна ширине списка справа) */}
        <div className="w-80 hidden xl:block shrink-0" />

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
            {canSpin && !spinning && !winner && (
              <div
                className="bg-yellow-500 text-black px-12 py-4 rounded-full font-black text-xl cursor-pointer hover:bg-white transition-all shadow-[0_0_30px_rgba(250,204,21,0.4)]"
                onClick={spin}
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                КРУТИТЬ!
              </div>
            )}
            {!winner && renderActionCards()}
            {!spinning && (
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
            <table className="w-full text-left border-separate border-spacing-y-2">
              <tbody>
                {items.map((item, idx) => {
                  const isRemoved = removedGameId === item.id;
                  const isHighlighted = idx === activeIndex || idx === hoveredIndex;
                  return (
                    <tr 
                      key={idx} 
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={`group transition-all duration-300 ${isHighlighted ? 'bg-yellow-500/20 scale-[1.02]' : ''} ${isRemoved ? 'removed-game-row' : ''}`}
                    >
                    <td className="py-2 pl-3 rounded-l-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${(idx * 360) / items.length}, 75%, 45%)` }} />
                        <span className={`text-[11px] font-bold truncate max-w-[140px] uppercase ${isHighlighted ? 'text-yellow-400' : 'text-zinc-400'}`}>
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right rounded-r-lg">
                      <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded ${isHighlighted ? 'bg-yellow-500 text-black' : 'bg-zinc-800 text-zinc-500'}`}>
                        {item.active !== false ? "В списке" : "Выбыл"}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Окно победителя (вынесено из основного flex-потока для точной центровки) */}
      {winner && (
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
                <button onClick={() => handleConfirmResult(winner)} className="w-full bg-yellow-500 text-black py-4 rounded-2xl font-black text-lg hover:bg-white transition-all uppercase" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                  Принять выбор
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
