import React from "react";
import type { Player } from "../types/game";
import type { User } from "firebase/auth";

interface BottomPanelProps {
  players: Player[];
  currentUser: User | null;
  isAdmin: boolean;
  onRoll: () => void;
}

const BottomPanel: React.FC<BottomPanelProps> = ({
  players,
  currentUser,
  isAdmin,
  onRoll,
}) => {
  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col">

      {/* 🎮 Верхняя строка */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10">

        <h3 className="text-purple-300 text-base font-bold">
          Игроки ({players.length})
        </h3>

        {/* 🎲 Кнопка хода */}
        {!isAdmin && (
          <button
            onClick={onRoll}
            className="bg-purple-600 px-6 py-2 rounded hover:bg-purple-500 text-base font-bold"
          >
            🎲 Бросить кубик
          </button>
        )}

        {/* 🛠️ Админ панель */}
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

      {/* 👥 Список игроков */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 px-4 py-2 min-w-max">

          {players.map((p) => {
            const isMe = p.id === currentUser?.uid;

            return (
              <div
                key={p.id}
                className={`
                  min-w-[120px] p-2 rounded-xl border
                  ${isMe ? "border-yellow-400" : "border-purple-500/20"}
                  bg-zinc-900/60 flex flex-col items-center
                `}
              >
                <img
                  src={p.avatar || "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg"}
                  className="w-12 h-12 rounded-full object-cover mb-1"
                />

                <span className="text-sm text-center font-bold text-zinc-100">
                  {p.login}
                </span>

                <span className="text-xs text-purple-300 font-medium">
                  🦖 {p.tiltCoins}
                </span>
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
};

export default BottomPanel;
