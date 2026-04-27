import React from "react";
import "./DiceVisual.css";

interface DiceVisualProps {
  value: number;
  isRolling: boolean;
  playerName: string;
}

const DiceVisual: React.FC<DiceVisualProps> = ({ value, isRolling, playerName }) => {
  // Функция возвращает углы поворота для каждой грани кубика
  const getRotation = (v: number) => {
    switch (v) {
      case 1: return "rotateX(0deg) rotateY(0deg)";
      case 2: return "rotateX(0deg) rotateY(-90deg)";
      case 3: return "rotateX(0deg) rotateY(-180deg)";
      case 4: return "rotateX(0deg) rotateY(90deg)";
      case 5: return "rotateX(-90deg) rotateY(0deg)";
      case 6: return "rotateX(90deg) rotateY(0deg)";
      default: return "rotateX(0deg) rotateY(0deg)";
    }
  };

  return (
    <div className="dice-overlay">
      <div className="dice-container">
        <div 
          className={`dice ${isRolling ? "dice-rolling" : ""}`}
          style={{ transform: !isRolling ? getRotation(value) : undefined }}
        >
          <div className="dice-face face-1"><div className="dot"></div></div>
          <div className="dice-face face-2"><div className="dot"></div><div className="dot"></div></div>
          <div className="dice-face face-3"><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
          <div className="dice-face face-4"><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
          <div className="dice-face face-5"><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
          <div className="dice-face face-6"><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div></div>
        </div>
      </div>
      
      {!isRolling && (
        <div className="roll-text-container">
          <p className="text-white/60 uppercase font-black tracking-widest text-[10px] mb-2" style={{ fontFamily: "'Comfortaa', sans-serif" }}>{playerName} выбрасывает:</p>
          <div className="dice-result-value italic">{value}</div>
        </div>
      )}
    </div>
  );
};

export default DiceVisual;