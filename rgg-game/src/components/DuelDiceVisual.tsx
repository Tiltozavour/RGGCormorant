import React from 'react';

interface DuelDiceVisualProps {
  challengerRoll: number;
  challengerName: string;
  targetRoll: number;
  targetName: string;
  isRolling: boolean;
}

const DuelDiceVisual: React.FC<DuelDiceVisualProps> = ({
  challengerRoll,
  challengerName,
  targetRoll,
  targetName,
  isRolling,
}) => {
  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-8">
        <h2 className="text-5xl font-black text-yellow-400 uppercase italic tracking-tighter drop-shadow-lg">
          {isRolling ? 'Дуэль: Бросок!' : 'Дуэль: Результат!'}
        </h2>

        <div className="flex gap-12">
          <div className="flex flex-col items-center gap-4">
            <span className="text-white text-lg font-bold">{challengerName}</span>
            <div className={`w-24 h-24 bg-white rounded-xl flex items-center justify-center text-5xl font-black shadow-lg ${isRolling ? 'animate-spin' : ''}`}>
              {isRolling ? '?' : challengerRoll}
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <span className="text-white text-lg font-bold">{targetName}</span>
            <div className={`w-24 h-24 bg-white rounded-xl flex items-center justify-center text-5xl font-black shadow-lg ${isRolling ? 'animate-spin' : ''}`}>
              {isRolling ? '?' : targetRoll}
            </div>
          </div>
        </div>

        {!isRolling && (
          <p className="text-zinc-300 text-xl mt-4">
            {challengerRoll > targetRoll ? `${challengerName} побеждает!` :
             targetRoll > challengerRoll ? `${targetName} побеждает!` :
             'Ничья!'}
          </p>
        )}
      </div>
    </div>
  );
};

export default DuelDiceVisual;