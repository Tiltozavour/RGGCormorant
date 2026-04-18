import React, { useState, useRef, useEffect } from "react";
import "./GameWheel.css";

interface Item {
  name: string;
  image?: string;
}

interface Props {
  items: Item[];
  onResult: (result: string) => void;
  onClose?: () => void;
  canSpin: boolean;
}

export const GameWheel: React.FC<Props> = ({
  items,
  onResult,
  onClose,
  canSpin,
}) => {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Item | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null); // Ref for the main wheel div
  const requestRef = useRef<number>(0); // Ref for animation frame ID

  const angleStep = items.length > 0 ? 360 / items.length : 0;

  const updateActiveSegment = () => {
    if (!wheelRef.current) return;
    const style = window.getComputedStyle(wheelRef.current);
    const matrix = new DOMMatrixReadOnly(style.transform);
    const currentAngle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    const normalizedAngle = (currentAngle < 0 ? currentAngle + 360 : currentAngle) % 360;
    // 270 градусов смещения, чтобы "лево" (9 часов) было точкой отсчета
    const currentActive = Math.floor(((360 - normalizedAngle + 270) % 360) / angleStep) % items.length;
    setActiveIndex(currentActive);
    requestRef.current = requestAnimationFrame(updateActiveSegment);
  };

  useEffect(() => {
    if (spinning) {
      requestRef.current = requestAnimationFrame(updateActiveSegment);
    } else {
      if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current);
    }
    return () => { if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current); };
  }, [spinning]);

  const getIndex = (rot: number) =>
    Math.floor(((360 - (rot % 360) + 270) % 360) / angleStep) % items.length;

  const spin = async () => {
    if (spinning || items.length === 0) return;

    setSpinning(true);
    setWinner(null);

    // 1. Выбираем победителя заранее
    const selectedIndex = Math.floor(Math.random() * items.length);
    const winItem = items[selectedIndex];

    // 2. Вычисляем угол, который нужно добавить, чтобы сектор оказался слева (270 градусов в CSS)
    // Центр выбранного сектора
    const targetSegmentCenter = selectedIndex * angleStep + (angleStep / 2);
    
    // Рассчитываем доворот: (Цель - текущий_остаток - позиция_сектора)
    const currentRotationDegrees = rotation % 360;
    const extraDegrees = (270 - currentRotationDegrees - targetSegmentCenter + 1440) % 360;

    // Итоговое значение: текущая ротация + 5 полных оборотов + доворот
    const final = rotation + 1800 + extraDegrees;
    
    setRotation(final);

    setTimeout(() => {
      setWinner(winItem);
      setSpinning(false);
    }, 5000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999]">
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
              const isSelected = i === activeIndex;
              const isWinner = !spinning && winner && isSelected; // Проверка: колесо встало на этом сегменте
              const segmentColor = `hsl(${(i * 360) / items.length}, 75%, 45%)`;
              
              const needsSkew = items.length > 2;
              const skewAngle = needsSkew ? -(90 - angleStep) : 0;
              const isTwoSegments = items.length === 2;

              return (
                <div
                  key={i}
                  className={`wheel-item ${isSelected ? 'active-segment' : ''}`}
                  style={{
                    transform: `rotate(${i * angleStep}deg) ${needsSkew ? `skewY(${skewAngle}deg)` : ''}`,
                    backgroundColor: segmentColor, // Всегда есть базовый цвет
                    width: isTwoSegments ? '50.2%' : '50%', // Half the wheel's diameter
                    height: isTwoSegments ? '100.2%' : '50.2%', 
                    left: '50%', // Start from the center horizontally
                    top: isTwoSegments ? '0' : '0', // Top edge for 2 segments, top edge for others
                    transformOrigin: isTwoSegments ? '0% 50%' : '0% 100%', // Center-left for 2 segments, bottom-left for others
                    zIndex: isWinner ? 30 : (isSelected ? 10 : 0), // Победитель выше всех
                    borderLeft: isTwoSegments ? 'none' : '1px solid rgba(255, 255, 255, 0.15)', // Тонкая линия разделения
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
                          opacity: isSelected ? 1 : 0.7
                        }} 
                      />
                    );
                  })()}
                  <span 
                    className="wheel-label"
                    style={{ 
                      left: 0,
                      bottom: isTwoSegments ? 'auto' : 0,
                      top: isTwoSegments ? '50%' : 'auto',
                      // Отменяем наклон родителя и поворачиваем на середину сектора
                      transform: `skewY(${-skewAngle}deg) rotate(${angleStep / 2}deg)`,
                      paddingLeft: isTwoSegments ? '140px' : '70px'
                    }}
                  >
                    {item.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {winner && (
          <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 px-4">
            <div className="bg-zinc-900 border-2 border-yellow-500 p-8 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col items-center gap-6 max-w-sm w-full transform animate-in zoom-in duration-300">
              <div className="text-center">
                <p className="text-yellow-500 text-[10px] tracking-[0.4em] uppercase font-black mb-2 opacity-80">Выпала игра:</p>
                <h2 className="text-4xl font-black text-white uppercase italic leading-tight drop-shadow-xl">
                  {winner.name}
                </h2>
              </div>
              
              {winner.image && (
                <div className="relative w-full aspect-video overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                  <img src={winner.image} className="w-full h-full object-cover" alt={winner.name} />
                  <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />
                </div>
              )}

              <div className="flex flex-col w-full gap-3 mt-2">
                {canSpin && (
                  <button 
                    onClick={() => onResult(winner.name)}
                    className="w-full bg-yellow-500 text-black py-4 rounded-2xl font-black text-lg hover:bg-white transition-all shadow-[0_8px_0_#a16207] active:shadow-none active:translate-y-1 uppercase tracking-tighter"
                  >
                    Принять выбор
                  </button>
                )}
                <button 
                  onClick={() => setWinner(null)}
                  className="w-full py-3 text-zinc-500 hover:text-white text-sm font-bold transition-colors"
                >
                  Вернуться к колесу
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {canSpin && !spinning && !winner && (
            <div
              className="bg-yellow-500 text-black px-12 py-4 rounded-full font-black text-xl cursor-pointer hover:bg-white transition-all shadow-[0_0_30px_rgba(250,204,21,0.4)]"
              onClick={spin}
            >
              КРУТИТЬ!
            </div>
          )}
          {!spinning && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
};