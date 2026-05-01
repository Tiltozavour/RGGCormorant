import React from 'react';

interface DuelDiceVisualProps {
  challengerRoll: number;
  challengerName: string;
  targetRoll: number;
  targetName: string;
  isRolling: boolean;
}

const PIP_POSITIONS: Record<number, string[]> = {
  1: ['col-start-2 row-start-2'],
  2: ['col-start-1 row-start-1', 'col-start-3 row-start-3'],
  3: ['col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3'],
  4: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
  5: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
  6: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-2', 'col-start-3 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
};

const Die: React.FC<{ value: number; rolling: boolean }> = ({ value, rolling }) => {
  const safeValue = Math.max(1, Math.min(6, value || 1));

  return (
    <div
      className={`relative grid h-24 w-24 grid-cols-3 grid-rows-3 rounded-2xl border-4 border-white bg-zinc-50 p-4 shadow-[0_0_35px_rgba(250,204,21,0.35)] transition-transform duration-300 ${
        rolling ? 'scale-110 animate-pulse' : 'scale-100'
      }`}
    >
      {PIP_POSITIONS[safeValue].map((position) => (
        <span
          key={position}
          className={`${position} m-auto h-4 w-4 rounded-full bg-zinc-950 shadow-sm`}
        />
      ))}
    </div>
  );
};

const DuelDiceVisual: React.FC<DuelDiceVisualProps> = ({
  challengerRoll,
  challengerName,
  targetRoll,
  targetName,
  isRolling,
}) => {
  const winnerText = challengerRoll > targetRoll
    ? `${challengerName} побеждает!`
    : targetRoll > challengerRoll
      ? `${targetName} побеждает!`
      : 'Ничья!';

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-8">
        <h2 className="text-center text-5xl font-black uppercase italic tracking-normal text-yellow-400 drop-shadow-lg">
          {isRolling ? 'Дуэль: бросок!' : 'Дуэль: результат!'}
        </h2>

        <div className="flex flex-wrap justify-center gap-12">
          <div className="flex flex-col items-center gap-4">
            <span className="max-w-40 truncate text-lg font-bold text-white">{challengerName}</span>
            <Die value={challengerRoll} rolling={isRolling} />
          </div>

          <div className="flex flex-col items-center gap-4">
            <span className="max-w-40 truncate text-lg font-bold text-white">{targetName}</span>
            <Die value={targetRoll} rolling={isRolling} />
          </div>
        </div>

        {!isRolling && (
          <p className="mt-4 text-xl font-bold text-zinc-200">
            {winnerText}
          </p>
        )}
      </div>
    </div>
  );
};

export default DuelDiceVisual;
