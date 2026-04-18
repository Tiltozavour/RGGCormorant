import React from "react";
import type { GameState } from "../types/game";
import type { User } from "firebase/auth";

interface BottomPanelPhaseProps {
  currentUser: User | null;
  isAdmin: boolean;
  gameState: GameState;
  onRoll: () => void;
  canRoll: boolean;
  currentTurnPlayerId: string | null;
  onPrevPhase: () => void;
  onNextPhase: () => void;
  onPrepareTurn: () => void;
  onConfirmRoll: () => void;
  canConfirmRoll: boolean;
  onToggleWheel?: () => void;
}

const BottomPanelPhase: React.FC<BottomPanelPhaseProps> = ({
  currentUser,
  isAdmin,
  gameState,
  onRoll,
  canRoll,
  currentTurnPlayerId,
  onPrevPhase,
  onNextPhase,
  onPrepareTurn,
  onConfirmRoll,
  canConfirmRoll,
  onToggleWheel,
}) => {
  const turnLabel =
    gameState.turnOrder.length === 0
      ? "Свободный ход"
      : currentTurnPlayerId === currentUser?.uid
        ? "Ход: ваш"
        : "Ход: другой игрок";

  const rollLabel =
    gameState.currentRoll !== null
      ? `Выпало: ${gameState.currentRoll}`
      : gameState.phase !== "turn"
        ? "Ход недоступен"
        : "Бросить кубик";

  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 gap-3">
        <h3 className="text-purple-300 text-base font-bold">Панель игры</h3>

        <div className="text-sm text-zinc-200">
          {gameState.phase === "waiting_game" ? (
            <span className="flex items-center gap-1 text-base">
              Следующая игра — <b className="text-yellow-400 uppercase">{gameState.currentGame || "..."}</b> | 
              Ожидаем начала, следите за анонсом в канале Карморанта
            </span>
          ) : (
            <>Этап: {gameState.phase} | Раунд: {gameState.round}</>
          )}
        </div>

        {gameState.phase !== "waiting_game" && (
          <div className="text-sm text-yellow-300 font-semibold">{turnLabel}</div>
        )}

        {gameState.currentRoll !== null &&
          !gameState.rollConfirmed &&
          canConfirmRoll && (
            <div className="flex items-center gap-3 bg-yellow-900/40 border border-yellow-500/30 px-4 py-2 rounded">
              <span className="text-lg text-yellow-200">
                Выпало: <b>{gameState.currentRoll}</b>
              </span>
              <button
                onClick={onConfirmRoll}
                className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-semibold transition"
              >
                Начать ход
              </button>
            </div>
          )}

        {gameState.currentRoll !== null &&
          !gameState.rollConfirmed &&
          !canConfirmRoll && (
            <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/10 px-3 py-1 rounded">
              <span className="text-sm text-yellow-400">
                Игрок выбирает ход...
              </span>
            </div>
          )}

        {gameState.currentRoll !== null && gameState.rollConfirmed && (
          <div className="flex items-center gap-2 bg-purple-900/50 px-3 py-1 rounded">
            <span className="text-sm text-purple-300">
              Ход: {gameState.currentRoll}
            </span>
          </div>
        )}

        {!isAdmin && (
          <button
            onClick={onRoll}
            disabled={!canRoll}
            className={`px-4 py-2 rounded text-base font-bold transition ${
              canRoll
                ? "bg-purple-600 hover:bg-purple-500"
                : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
          >
            {rollLabel}
          </button>
        )}

        {isAdmin && (
          <div className="flex gap-2 font-bold">
            <button
              onClick={() => {
                console.log("Нажатие на 🎡. Пропс onToggleWheel существует?", !!onToggleWheel);
                onToggleWheel?.();
              }}
              className="bg-purple-600 hover:bg-purple-500 px-4 py-1.5 rounded text-sm flex items-center gap-1 transition"
            >
              🎡 Колесо
            </button>
            <button
              onClick={onPrevPhase}
              className="bg-yellow-700 px-4 py-1.5 rounded text-sm"
            >
              Этап -
            </button>
            <button
              onClick={onNextPhase}
              className="bg-yellow-600 px-4 py-1.5 rounded text-sm"
            >
              Этап +
            </button>
            <button
              onClick={onPrepareTurn}
              className="bg-green-600 px-4 py-1.5 rounded text-sm"
            >
              Подготовить ход
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-3 text-base text-zinc-200 flex items-center">
        Таблица игроков перенесена в левую боковую панель. Здесь можно
        оставить карточки и игровые элементы следующего этапа.
      </div>
    </div>
  );
};

export default BottomPanelPhase;
