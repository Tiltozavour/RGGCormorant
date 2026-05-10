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
  const config = RARITY_CONFIG[card.rarity] ?? RARITY_CONFIG.default;
  const isLegendary = card.rarity === 'legendary';
  void totalCards;
  
  // Вычисляем эффективный фоновый цвет для кнопок и наложений
  const effectiveBg = (isHexColor(card.bgCard) ? card.bgCard : config.bgCard) ?? config.bgCard;
  const legendaryArtBackground = isLegendary
    ? {
        backgroundImage: `
          radial-gradient(circle at 18% 14%, rgba(250, 204, 21, 0.32) 0%, transparent 18%),
          radial-gradient(circle at 74% 18%, rgba(147, 197, 253, 0.28) 0%, transparent 32%),
          radial-gradient(circle at 34% 72%, rgba(168, 85, 247, 0.34) 0%, transparent 38%),
          radial-gradient(circle at 82% 82%, rgba(34, 211, 238, 0.16) 0%, transparent 30%),
          linear-gradient(145deg, #020617 0%, #111827 28%, #312e81 58%, #0f172a 100%)
        `,
      }
    : undefined;
  const legendaryBodyBackground = isLegendary
    ? {
        backgroundImage: `
          url("/cards/card_face_light.svg"),
          radial-gradient(circle at 50% 0%, rgba(250, 204, 21, 0.16) 0%, transparent 36%),
          radial-gradient(circle at 12% 90%, rgba(168, 85, 247, 0.18) 0%, transparent 34%),
          radial-gradient(circle at 88% 84%, rgba(14, 165, 233, 0.14) 0%, transparent 34%),
          linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(2, 6, 23, 0.99) 54%, rgba(24, 24, 27, 0.98) 100%)
        `,
        backgroundSize: "cover, auto, auto, auto, auto",
        backgroundPosition: "center, center, center, center, center",
        backgroundBlendMode: "soft-light, screen, screen, screen, normal",
      }
    : {
        backgroundImage: card.faceCard ? `url("${card.faceCard}")` : 'none',
        backgroundSize: 'cover',
        backgroundBlendMode: 'overlay',
      };

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
        .card-number-wrapper {
          position: relative;
          cursor: help;
        }
        .card-howtowork-tooltip {
          pointer-events: none;
          position: absolute;
          bottom: 140%;
          left: 50%;
          transform: translateX(-50%) translateY(10px);
          width: 220px;
          padding: 12px;
          background: rgba(18, 18, 22, 0.98);
          border: 1px solid rgba(250, 171, 25, 0.5);
          border-radius: 14px;
          color: #fff;
          font-size: 11px;
          line-height: 1.4;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          backdrop-filter: blur(12px);
          z-index: 1000;
        }
        .card-number-wrapper:hover .card-howtowork-tooltip {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) translateY(0);
        }
      `}} />
    <div 
      onClick={onClick}
      className={`relative w-80 h-[520px] shrink-0 flex flex-col overflow-visible rounded-[2.5rem] border-2 transition-[transform,box-shadow,border-color] duration-500 cursor-pointer group select-none ${config.border} ${config.glow} bg-zinc-950 hover:scale-105 hover:-translate-y-4 hover:shadow-[0_30px_60px_rgba(0,0,0,0.8)]
        ${isLegendary ? 'animate-float animate-legendary-glow hover:animate-none' : ''}`}
      style={{
        zIndex: isInHand ? index + 10 : 1,
      }}
    >
      {/* Inner Highlight Border */}
      <div className="absolute inset-1 border border-white/10 rounded-[2.3rem] pointer-events-none z-5" />

      {/* Top Right: Card Number & Tooltip - ВЫНЕСЕНО ИЗ СЕКЦИИ */}
      <div className="absolute top-6 right-6 z-50">
        <div className="card-number-wrapper w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
          <span className="text-xs font-mono font-bold text-white/90">#{card.number}</span>
          {card.howtowork && (
            <div className="card-howtowork-tooltip">
              {card.howtowork}
            </div>
          )}
        </div>
      </div>

      {/* TOP SECTION (60%) */}
      <div 
        className={`relative h-[60%] w-full flex ${isLegendary ? 'items-end' : 'items-center'} justify-center overflow-hidden rounded-t-[2.3rem] bg-gradient-to-b ${config.artGradient}`}
        style={legendaryArtBackground}
      >
        {/* Holographic Overlay for Legendary */}
        {isLegendary && (
          <div 
            className="absolute inset-0 pointer-events-none z-[15] opacity-[0.38] mix-blend-screen animate-holo"
            style={{
              backgroundImage: `linear-gradient(115deg, rgba(255, 249, 196, 0.0) 0%, rgba(250, 204, 21, 0.36) 18%, rgba(96, 165, 250, 0.28) 38%, rgba(168, 85, 247, 0.28) 58%, rgba(34, 211, 238, 0.18) 76%, rgba(255, 249, 196, 0.0) 100%)`
            }}
          />
        )}

        {isLegendary && (
          <div
            className="absolute inset-0 pointer-events-none z-[16] opacity-55"
            style={{
              backgroundImage: `
                radial-gradient(circle at 22% 24%, rgba(255,255,255,0.65) 0 1px, transparent 1.5px),
                radial-gradient(circle at 68% 34%, rgba(255,255,255,0.55) 0 1px, transparent 1.5px),
                radial-gradient(circle at 84% 62%, rgba(255,255,255,0.5) 0 1px, transparent 1.5px),
                radial-gradient(circle at 36% 82%, rgba(255,255,255,0.45) 0 1px, transparent 1.5px),
                radial-gradient(circle at 52% 16%, rgba(250,204,21,0.65) 0 1px, transparent 1.5px)
              `,
            }}
          />
        )}

        {/* Subtle Dark Overlay for depth */}
        {isLegendary && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-[25]"> 
            <div className="absolute top-0 left-0 w-1/4 h-[200%] bg-gradient-to-r from-transparent via-sky-100/32 to-transparent animate-shimmer-fast" 
                 style={{ top: '-50%' }} />
          </div>
        )}

        <div className="absolute inset-0 bg-black/20 z-10" />
        
        {card.artCard ? (
          <img 
            src={card.artCard} 
            alt={card.name} 
            className={`${isLegendary ? 'h-full w-full' : 'h-[80%] w-[80%]'} object-contain ${isLegendary ? 'object-bottom' : ''} drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-20 transition-transform duration-500 group-hover:scale-110`} 
          />
        ) : (
          <div className="text-white/10 font-black text-4xl italic tracking-tighter rotate-12 z-0">NO ART</div>
        )}

        {/* Top Left: Rarity Badge */}
        <div className="absolute top-6 left-6 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 shadow-lg" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
          <div className={`w-2 h-2 rounded-full animate-pulse ${config.accent}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/90">{card.rarity}</span>
        </div>

        {/* Center Divider: Soft fade out */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-zinc-950 to-transparent z-25" />
      </div>

      {/* BOTTOM SECTION (40%) */}
      <div 
        className={`${isLegendary ? 'border-t border-sky-200/20 bg-slate-950/95' : 'border-t border-white/5 bg-zinc-900/80'} relative h-[40%] w-full overflow-hidden p-5 flex flex-col items-center gap-3 text-center z-40 backdrop-blur-xl rounded-b-[2.3rem]`}
        style={legendaryBodyBackground}
      >
        {/* Tint overlay based on bgCard */}
        <div
          className={`${isLegendary ? 'opacity-20' : 'opacity-30'} absolute inset-0 -z-10`}
          style={{ backgroundColor: effectiveBg }}
        />

        {isLegendary && (
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-sky-100/60 to-transparent" />
        )}

        <div className="flex min-h-0 flex-1 flex-col justify-start gap-2 px-3">
         <h3 className={`${isLegendary ? 'text-[24px] line-clamp-3 leading-tight min-h-[3.5rem]' : 'text-[22px] line-clamp-2 leading-tight min-h-[3.25rem]'} font-black text-white uppercase tracking-normal italic flex items-center justify-center text-center`}>
            {card.name}
          </h3>
          <div className={`min-h-0 flex-1 ${isLegendary ? 'overflow-y-auto pr-1 custom-scrollbar' : 'overflow-hidden'}`}>
           <p
              className={`${isLegendary ? 'text-[15px] leading-snug' : 'text-[14px] leading-snug line-clamp-3'} text-white font-medium italic min-h-0 flex items-start justify-center text-center`}
              style={{ fontFamily: "'Comfortaa', sans-serif" }}
            >
              {card.description}
            </p>
          </div>
        </div>

        {onUse && (
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="relative mt-auto w-full shrink-0 py-3 rounded-2xl font-black uppercase text-xs tracking-[0.18em] text-transparent transition-all active:scale-95 shadow-[0_10px_20px_rgba(0,0,0,0.4)] hover:brightness-125 border-t border-white/20"
            style={{ 
              backgroundColor: effectiveBg,
              fontFamily: "'Comfortaa', sans-serif"
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center text-white">
              Использовать
            </span>
            Использовать
          </button>
        )}
      </div>
    </div>
    </>
  );
};

export default GameCard;
