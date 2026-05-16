import type { User } from "firebase/auth";
import type { GameCard as GameCardType } from "../types/card";
import type { GameState, Player } from "../types/game";
import GameCard from "./GameCard";
import { ru } from "../i18n/ru";
import { getPublicAssetUrl } from "./gameConstants";

interface ShopAndGamblingOverlaysProps {
  gameState: GameState;
  user: User | null;
  playerData: Player;
  allCards: Record<string, GameCardType>;
  protectionCardsInInv: GameCardType[];
  revealedGamblingCardId: string | null;
  setRevealedGamblingCardId: (cardId: string) => void;
  hasGoldenCard: boolean;
  getBaseCardPrice: (card: GameCardType) => number;
  getCardPrice: (card: GameCardType) => number;
  isInteractionPending: boolean;
  runInteractionAction: (action: () => void | Promise<void>) => Promise<boolean>;
  handlers: {
    handleFinishInteraction: (cardId?: string, price?: number, protectionCardId?: string) => void | Promise<void>;
  };
}

function ShopAndGamblingOverlays({
  gameState,
  user,
  playerData,
  allCards,
  protectionCardsInInv,
  revealedGamblingCardId,
  setRevealedGamblingCardId,
  hasGoldenCard,
  getBaseCardPrice,
  getCardPrice,
  isInteractionPending,
  runInteractionAction,
  handlers,
}: ShopAndGamblingOverlaysProps) {
  const interaction = gameState.activeInteraction;
  const interactionCards = Array.isArray(interaction?.cards) ? interaction.cards : [];
  const interactionCardIds =
    interactionCards.filter((cardId: string, idx: number, cards: string[]) =>
      Boolean(allCards[cardId]) && cards.indexOf(cardId) === idx
    );

  return (
    <>
      {interaction?.type === 'gambling' && interaction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-blue-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-blue-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">{ru.gambling.title}</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">{ru.gambling.subtitle}</p>
          </div>

          <div className={`flex gap-10 ${isInteractionPending ? 'pointer-events-none' : ''}`}>
            {interactionCardIds.map((cardId: string, idx: number) => {
              const card = allCards[cardId];
              const isRevealed = revealedGamblingCardId === cardId;
              const isDimmed = Boolean(revealedGamblingCardId && !isRevealed);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isInteractionPending) return;
                    void runInteractionAction(async () => {
                      setRevealedGamblingCardId(cardId);
                      await new Promise((resolve) => setTimeout(resolve, 1200));
                      await handlers.handleFinishInteraction(cardId);
                    });
                  }}
                  className={`relative w-64 h-[400px] cursor-pointer transition-all duration-500 [perspective:1200px] ${
                    isDimmed ? 'opacity-25 scale-95' : 'hover:scale-110'
                  }`}
                >
                  <div
                    className="relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d]"
                    style={{ transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                  >
                    <div className="absolute inset-0 rounded-[2rem] bg-blue-900/50 border-4 border-blue-400/30 hover:border-blue-400 hover:shadow-[0_0_50px_rgba(59,130,246,0.4)] transition-all flex items-center justify-center group [backface-visibility:hidden]">
                      <img src={getPublicAssetUrl("/cards/card_back.svg")} className="w-full h-full object-cover rounded-[1.8rem] opacity-80 group-hover:opacity-100" alt="Back" />
                      <span className="absolute text-blue-200/20 text-8xl font-black italic">?</span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
                      <div className="scale-[0.78] drop-shadow-[0_0_40px_rgba(59,130,246,0.45)]">
                        <GameCard card={card} index={0} totalCards={1} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {protectionCardsInInv.length > 0 && (
            <div className="mt-12 flex flex-col items-center gap-4 bg-white/5 p-8 rounded-[2.5rem] border border-white/10 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-700">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-blue-300 uppercase tracking-[0.3em]">{ru.gambling.protectionTitle}</span>
                <p className="text-white/40 text-[9px] font-medium">{ru.gambling.protectionSubtitle}</p>
              </div>
              <div className="flex gap-4">
                {protectionCardsInInv.map((card, idx) => (
                  <button
                    key={`${card.id}-${idx}`}
                    disabled={isInteractionPending}
                    onClick={() => {
                      if (isInteractionPending) return;
                      void runInteractionAction(() => handlers.handleFinishInteraction(undefined, 0, card.id));
                    }}
                    className="bg-yellow-500 text-black px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
                  >
                    {ru.gambling.useCard(card.name)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {interaction?.type === 'bshop' && [user?.uid, playerData.id].includes(interaction.playerId) && (
        <div className="fixed inset-0 bg-pink-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-pink-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(236,72,153,0.5)]">B-Shop</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">{ru.bshop.coins(playerData.tiltCoins ?? 0)}</p>
            {hasGoldenCard && (
              <p className="mt-3 text-sm font-bold text-yellow-200">
                {ru.bshop.goldenDiscount}
              </p>
            )}
          </div>

          <div className={`flex gap-8 items-start ${isInteractionPending ? 'pointer-events-none opacity-60' : ''}`}>
            {interactionCardIds.map((cardId: string, idx: number) => {
              const card = allCards[cardId];
              const basePrice = getBaseCardPrice(card);
              const price = getCardPrice(card);
              const hasDiscount = hasGoldenCard && basePrice > price;
              const canAfford = (playerData.tiltCoins ?? 0) >= price;

              return (
                <div key={idx} className="flex flex-col gap-4 items-center">
                  <div className="scale-90">
                    <GameCard card={card} index={0} totalCards={1} />
                  </div>
                  <button
                    disabled={!canAfford || isInteractionPending}
                    onClick={() => {
                      if (isInteractionPending) return;
                      void runInteractionAction(() => handlers.handleFinishInteraction(cardId, price));
                    }}
                    className={`w-full py-4 rounded-2xl font-black uppercase text-sm tracking-widest transition-all ${
                      canAfford
                      ? "bg-pink-500 text-white hover:bg-pink-400 shadow-[0_10px_20px_rgba(236,72,153,0.3)]"
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    {hasDiscount ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="text-white/45 line-through">{basePrice}</span>
                        <span>{ru.bshop.buy(price)}</span>
                      </span>
                    ) : (
                      <span>{ru.bshop.buy(price)}</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <button
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              void runInteractionAction(() => handlers.handleFinishInteraction());
            }}
            className="mt-12 text-white/30 hover:text-white font-black uppercase text-xs tracking-[0.3em] transition-all"
          >
            {ru.bshop.leave}
          </button>
        </div>
      )}
    </>
  );
}

export default ShopAndGamblingOverlays;
