import React from "react";
import type { GameState, Player } from "../types/game";
import type { User } from "firebase/auth";

interface BottomPanelTurnProps {
  players: Player[];
  currentUser: User | null;
  isAdmin: boolean;
  gameState: GameState;
  onRoll: () => void;
  canRoll: boolean;
  currentTurnPlayerId: string | null;
  onPrevPhase: () => void;
  onNextPhase: () => void;
  onPrepareTurn: () => void;
}

const BottomPanelTurn: React.FC<BottomPanelTurnProps> = ({
  players,
  currentUser,
  isAdmin,
  gameState,
  onRoll,
  canRoll,
  currentTurnPlayerId,
  onPrevPhase,
  onNextPhase,
  onPrepareTurn,
}) => {
  void onPrevPhase;
  void onNextPhase;
  void onPrepareTurn;

  const turnLabel =
    gameState.turnOrder.length === 0
      ? "Свободный ход"
      : currentTurnPlayerId === currentUser?.uid
        ? "Ход: ваш"
        : `Ход: ${currentTurnPlayerId ?? "не задан"}`;

  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 gap-3">
        <h3 className="text-purple-300 text-base font-bold">Игроки ({players.length})</h3>

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
            {gameState.currentRoll !== null
              ? "Бросок выполняется"
              : "Бросить кубик"}
          </button>
        )}

        {isAdmin && (
          <div className="flex gap-2 font-bold">
            <button className="bg-yellow-600 px-4 py-1.5 rounded text-sm">
              Этап
            </button>
            <button className="bg-green-600 px-4 py-1.5 rounded text-sm">
              Очки
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 px-4 py-2 min-w-max">
          {players.map((player) => {
            const isMe = player.id === currentUser?.uid;

            return (
              <div
                key={player.id}
                className={`min-w-[120px] p-2 rounded-xl border ${
                  isMe ? "border-yellow-400" : "border-purple-500/20"
                } bg-zinc-900/60 flex flex-col items-center`}
              >
                <img
                  src={
                    player.avatar ||
                    "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg"
                  }
                className="w-12 h-12 rounded-full object-cover mb-1"
                />

              <span className="text-sm text-center font-bold text-zinc-100">{player.login}</span>

              <span className="text-xs text-purple-300 font-medium">
                  🦖 {player.tiltCoins ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomPanelTurn;
