import React from 'react';
import type { GameCard as GameCardType } from '../types/card';
import { RARITY_CONFIG, isHexColor } from './gameConstants';

interface GameCardProps {
  card: GameCardType;
  index: number;
  totalCards: number;
  isInHand?: boolean;
  onClick?: () => void;
  onUse?: () => void;
}

const GameCard: React.FC<GameCardProps> = ({ 
  card, 
  index, 
  totalCards, 
  isInHand = false,
  onClick, 
  onUse 
}) => {
  const config = (RARITY_CONFIG as any)[card.rarity] || RARITY_CONFIG.default;
  
  // Вычисляем эффективный фоновый цвет для кнопок и наложений
  const effectiveBg = isHexColor(card.bgCard) ? card.bgCard : config.bgCard;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes holo-foil {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(250%) skewX(-20deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(250, 204, 21, 0.4); border-color: rgba(250, 204, 21, 0.6); }
          50% { box-shadow: 0 0 40px rgba(250, 204, 21, 0.8); border-color: rgba(250, 204, 21, 1); }
        }
        .animate-holo {
          animation: holo-foil 8s ease infinite;
          background-size: 200% 200%;
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-shimmer-fast {
          animation: shimmer 3s infinite;
          filter: blur(5px);
        }
        .animate-legendary-glow {
          animation: glow-pulse 3s ease-in-out infinite;
        }
      `}} />
    <div 
      onClick={onClick}
      className={`relative w-80 h-[520px] shrink-0 flex flex-col overflow-hidden rounded-[2.5rem] border-2 transition-all duration-500 cursor-pointer group select-none ${config.border} ${config.glow} bg-zinc-950 hover:scale-105 hover:-translate-y-4 hover:shadow-[0_30px_60px_rgba(0,0,0,0.8)]
        ${card.rarity === 'legendary' ? 'animate-float animate-legendary-glow hover:animate-none' : ''}`}
      style={{
        zIndex: isInHand ? index + 10 : 1,
        transitionDelay: isInHand ? `${index * 30}ms` : '0ms',
      }}
    >
      {/* Inner Highlight Border */}
      <div className="absolute inset-1 border border-white/10 rounded-[2.3rem] pointer-events-none z-5" />

      {/* TOP SECTION (60%) */}
      <div 
        className={`relative h-[60%] w-full flex ${card.rarity === 'legendary' ? 'items-end' : 'items-center'} justify-center overflow-hidden bg-gradient-to-b ${config.artGradient}`}
      >
        {/* Holographic Overlay for Legendary */}
        {card.rarity === 'legendary' && (
          <div 
            className="absolute inset-0 pointer-events-none z-[15] opacity-[0.4] mix-blend-color-dodge animate-holo"
            style={{
              backgroundImage: `linear-gradient(110deg, #ff0000 0%, #ff7f00 15%, #ffff00 30%, #00ff00 45%, #00ffff 60%, #0000ff 75%, #8b00ff 90%, #ff0000 100%)`
            }}
          />
        )}

        {/* Subtle Dark Overlay for depth */}
        {card.rarity === 'legendary' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[25]"> 
            <div className="absolute top-0 left-0 w-1/4 h-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer-fast" 
                 style={{ top: '-50%' }} />
          </div>
        )}

        <div className="absolute inset-0 bg-black/20 z-10" />
        
        {card.artCard ? (
          <img 
            src={card.artCard} 
            alt={card.name} 
            className={`${card.rarity === 'legendary' ? 'h-full w-full' : 'h-[80%] w-[80%]'} object-contain ${card.rarity === 'legendary' ? 'object-bottom' : ''} drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-20 transition-transform duration-500 group-hover:scale-110`} 
          />
        ) : (
          <div className="text-white/10 font-black text-4xl italic tracking-tighter rotate-12 z-0">NO ART</div>
        )}

        {/* Top Left: Rarity Badge */}
        <div className="absolute top-6 left-6 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-lg" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${config.accent}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/90">{card.rarity}</span>
        </div>

        {/* Top Right: Card Number */}
        <div className="absolute top-6 right-6 z-30 w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-xl">
          <span className="text-xs font-mono font-bold text-white/60">#{card.number}</span>
        </div>

        {/* Center Divider: Soft fade out */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-zinc-950 to-transparent z-25" />
      </div>

      {/* BOTTOM SECTION (40%) */}
      <div 
        className="relative h-[40%] w-full p-6 flex flex-col items-center text-center justify-between border-t border-white/5 z-40 bg-zinc-900/80 backdrop-blur-xl"
        style={{ 
          backgroundImage: card.faceCard ? `url("${card.faceCard}")` : 'none',
          backgroundSize: 'cover',
          backgroundBlendMode: 'overlay'
        }}
      >
        {/* Tint overlay based on bgCard */}
        <div className="absolute inset-0 -z-10 opacity-30" style={{ backgroundColor: effectiveBg }} />

        <div className="flex flex-col gap-2 mt-2">
          <h2 className="text-2xl font-black text-white uppercase tracking-tight drop-shadow-sm line-clamp-1 italic">
            {card.name}
          </h2>
          <p className="text-[11px] leading-relaxed text-white font-medium italic line-clamp-3 px-2" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
            "{card.description}"
          </p>
        </div>

        {onUse && (
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="w-full py-4 mb-2 rounded-2xl font-black uppercase text-xs tracking-[0.2em] text-white transition-all active:scale-95 shadow-[0_10px_20px_rgba(0,0,0,0.4)] hover:brightness-125 border-t border-white/20"
            style={{ 
              backgroundColor: effectiveBg,
              fontFamily: "'Comfortaa', sans-serif"
            }}
          >
            Использовать
          </button>
        )}
      </div>
    </div>
    </>
  );
};

export default GameCard;