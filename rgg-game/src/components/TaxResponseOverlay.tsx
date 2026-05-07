import type { User } from "firebase/auth";
import type { ActiveInteraction, Player } from "../types/game";

interface TaxResponseOverlayProps {
  interaction: ActiveInteraction | null | undefined;
  user: User | null;
  getPlayerById: (playerId?: string | null) => Player | null;
  isInteractionPending: boolean;
  runInteractionAction: (action: () => void | Promise<void>) => Promise<boolean>;
  onTaxResponse: (response: "pay" | "gambling" | "reflect" | "promo" | "fish") => void | Promise<void>;
}

function TaxResponseOverlay({
  interaction,
  user,
  getPlayerById,
  isInteractionPending,
  runInteractionAction,
  onTaxResponse,
}: TaxResponseOverlayProps) {
  if (interaction?.type !== "tax_response" || interaction.playerId !== user?.uid) return null;

  const collectorName =
    interaction.taxCollectorName ||
    interaction.taxOwnerName ||
    getPlayerById(interaction.taxOwnerId)?.login ||
    "Игрок";

  return (
    <div className="fixed inset-0 bg-amber-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="text-center mb-8 max-w-2xl">
        <h2 className="text-4xl sm:text-5xl font-black text-amber-300 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(251,191,36,0.45)]">
          Платите налоги!
        </h2>
        <p className="text-white/70 text-sm font-bold uppercase tracking-[0.2em] mt-4">
          {collectorName} собирает банк налогов
        </p>
        <p className="text-amber-200/80 text-sm font-bold mt-3">
          В банке сейчас: {interaction.taxBank ?? 0} монет
        </p>
        <p className="text-white/45 text-xs font-medium mt-3">
          Можно внести 2 монеты в банк, выбрать gambling или перехватить сбор картой "А может тебя?", если она есть в руке.
        </p>
      </div>

      <div className="grid gap-4 w-full max-w-md">
        <button
          disabled={isInteractionPending}
          onClick={() => {
            if (isInteractionPending) return;
            void runInteractionAction(() => onTaxResponse("pay"));
          }}
          className="bg-amber-400 text-black px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#b45309] active:shadow-none active:translate-y-1 disabled:opacity-50"
        >
          Внести 2 монеты
        </button>

        <button
          disabled={isInteractionPending}
          onClick={() => {
            if (isInteractionPending) return;
            void runInteractionAction(() => onTaxResponse("gambling"));
          }}
          className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-red-500 transition-all active:scale-95 shadow-[0_5px_0_#991b1b] active:shadow-none active:translate-y-1 disabled:opacity-50"
        >
          Выбрать gambling
        </button>

        {interaction.cards.includes("inv_006") && (
          <button
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              void runInteractionAction(() => onTaxResponse("fish"));
            }}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-blue-500 transition-all active:scale-95 shadow-[0_5px_0_#1e40af] active:shadow-none active:translate-y-1 disabled:opacity-50"
          >
            Использовать "No, no, no mr. Fish"
          </button>
        )}

        {interaction.cards.includes("inv_012") && (
          <button
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              void runInteractionAction(() => onTaxResponse("reflect"));
            }}
            className="bg-cyan-400 text-black px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#0e7490] active:shadow-none active:translate-y-1 disabled:opacity-50"
          >
            Перехватить сбор
          </button>
        )}

        {interaction.cards.includes("inv_019") && (
          <button
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              void runInteractionAction(() => onTaxResponse("promo"));
            }}
            className="bg-zinc-800 text-zinc-300 px-8 py-4 rounded-2xl font-black uppercase text-sm hover:bg-zinc-700 transition-all active:scale-95 disabled:opacity-50"
          >
            Промокодик
          </button>
        )}
      </div>
    </div>
  );
}

export default TaxResponseOverlay;
