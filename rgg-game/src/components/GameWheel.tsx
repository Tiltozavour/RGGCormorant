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
  const requestRef = useRef<number>(); // Ref for animation frame ID

  const angleStep = items.length > 0 ? 360 / items.length : 0;

  const updateActiveSegment = () => {
    if (!wheelRef.current) return;
    const style = window.getComputedStyle(wheelRef.current);
    const matrix = new DOMMatrixReadOnly(style.transform);
    const currentAngle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    const normalizedAngle = (currentAngle < 0 ? currentAngle + 360 : currentAngle) % 360;
    // 270 градусов смещения, чтобы "верх" (12 часов) был точкой отсчета
    const currentActive = Math.floor(((360 - normalizedAngle + 270) % 360) / angleStep) % items.length;
    setActiveIndex(currentActive);
    requestRef.current = requestAnimationFrame(updateActiveSegment);
  };

  useEffect(() => {
    if (spinning) {
      requestRef.current = requestAnimationFrame(updateActiveSegment);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [spinning]);

  const getIndex = (rot: number) =>
    Math.floor(((360 - (rot % 360) + 270) % 360) / angleStep) % items.length;

  const spin = async () => {
    if (spinning || items.length === 0) return;

    setSpinning(true);
    setWinner(null);

    // Минимум 5 полных оборотов + случайный сектор
    const final = rotation + 1800 + Math.random() * 360;
    setRotation(final);

    setTimeout(() => {
      const index = getIndex(final);
      const winItem = items[index];
      setWinner(winItem);
      setSpinning(false);

      // Даем время порадоваться результату перед закрытием
      setTimeout(() => {
        onResult(winItem.name);
      }, 3000);
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
                    height: isTwoSegments ? '100.2%' : '50%', // Full height for 2 segments, half for others
                    left: '50%', // Start from the center horizontally
                    top: isTwoSegments ? '0' : '0', // Top edge for 2 segments, top edge for others
                    transformOrigin: isTwoSegments ? '0% 50%' : '0% 100%', // Center-left for 2 segments, bottom-left for others
                    zIndex: isSelected ? 10 : 0, // Активный сегмент выше, остальные на базовом уровне
                    borderLeft: '1px solid rgba(255, 255, 255, 0.2)', // Division line
                  }}
                >
                  {item.image && (
                    <div 
                      className="wheel-item-bg" 
                      style={{ 
                        backgroundImage: `url(${item.image})`,
                        transform: needsSkew ? `skewY(${-skewAngle}deg) scale(2.5)` : 'scale(1.5)', // Отменяем skew и масштабируем
                        opacity: isSelected ? 1 : 0.7 // Полная непрозрачность при выделении, иначе 70%
                      }} 
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {winner && (
          <div className="text-center animate-bounce">
            <p className="text-yellow-500 text-sm tracking-widest uppercase">Выпало:</p>
            <h2 className="text-4xl font-black text-white">{winner.name}</h2>
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