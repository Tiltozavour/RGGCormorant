import type { GameCard as GameCardType } from "../types/card";
import type { ToastNotification } from "./useModalStates";
import GameCard from "./GameCard";

interface ToastContainerProps {
  toasts: ToastNotification[];
  removeToast: (id: string) => void;
  allCards: Record<string, GameCardType>;
}

function ToastContainer({ toasts, removeToast, allCards }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[20000] flex flex-col-reverse items-end space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`relative p-3 rounded-lg shadow-lg text-white text-sm font-medium animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto
            ${toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' :
              toast.type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'}`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
          {toast.cardId && allCards[toast.cardId] && (
            <div className="absolute bottom-full right-0 mb-4 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-[20001] scale-[0.6] origin-bottom-right invisible group-hover:visible drop-shadow-2xl">
              <GameCard card={allCards[toast.cardId]} index={0} totalCards={1} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
