import { useState, useEffect, useRef } from "react";
import Auth from "./Auth";
import { syncWheelResult, syncWheelVisibility } from "./gameStateService";
import BottomPanel from "./BottomPanelPhase";
import GameBoard from "./GameBoard"; // Corrected import path
import PlayersSidebar from "./PlayersSidebar";
import ScoresDetailsPage from "./ScoresDetailsPage";
import type { Player } from "../types/game";
import type { GameCard as GameCardType } from "../types/card";
import { useGameData } from "./useGameData";
import GameCard from "./GameCard";
import { FALLBACK_AVATAR, PHASE_LABELS, AURA_COLORS } from "./gameConstants";

function AppClean() {
  const {
    user, playerData, loading, players, gameState, allCards,
    isAdmin, currentTurnPlayerId, canRoll, canConfirmRoll,
    handlers
  } = useGameData();

  const getCardPrice = (card: GameCardType) => {
    if (card.rarity === 'common') return 3;
    if (card.rarity === 'rare') return 7;
    if (card.rarity === 'epic') return 15;
    return 0;
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isScoresDetailsOpen, setIsScoresDetailsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isPlayersSidebarOpen, setIsPlayersSidebarOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<GameCardType | null>(null);
  const [isCollectionOpen, setIsCollectionOpen] = useState(false); // Состояние для музея карт
  const [isHandOpen, setIsHandOpen] = useState(false); // Состояние для открытия "руки" с картами
  const [coinNotification, setCoinNotification] = useState<{ amount: number; type: 'gain' | 'loss' } | null>(null);
  const [gameAlert, setGameAlert] = useState<{ title: string; message: string; type?: 'info' | 'success' | 'warning' } | null>(null);
  const [pendingTargetCard, setPendingTargetCard] = useState<GameCardType | null>(null); // Карта, ожидающая выбора цели

  // Логика отслеживания изменения монет для всплывающего уведомления
  const prevCoinsRef = useRef<number | undefined>(playerData?.tiltCoins);

  useEffect(() => {
    if (playerData?.tiltCoins !== undefined && prevCoinsRef.current !== undefined) {
      const diff = playerData.tiltCoins - prevCoinsRef.current;
      if (diff !== 0) {
        setCoinNotification({ amount: Math.abs(diff), type: diff > 0 ? 'gain' : 'loss' });
        // Скрываем уведомление через 3 секунды
        const timer = setTimeout(() => setCoinNotification(null), 3000);
        return () => clearTimeout(timer);
      }
    }
    prevCoinsRef.current = playerData?.tiltCoins;
  }, [playerData?.tiltCoins]);

  // Проверка: требует ли карта выбора цели?
  const cardNeedsTarget = (card: GameCardType) => {
    const targetActions: string[] = ['steal_coins', 'steal_card', 'discard_card', 'freeze_player', 'duel', 'judge_coins'];
    // inv_007: Карта движения (может на себя или другого), inv_013: Заказное, inv_017: Налоги, inv_018: Катжит, inv_020: Ледолуч
    const targetIds = ['inv_007', 'inv_013', 'inv_016', 'inv_017', 'inv_018', 'inv_020']; 
    return targetActions.includes(card.action) || targetIds.includes(card.id);
  };

  const canTargetSelf = (card: GameCardType) => card.id === "inv_007";

  const selectableTargets = players.filter((player) => {
    if (!player.inGame || player.role === "admin") return false;
    if (player.id === user?.uid) return !!pendingTargetCard && canTargetSelf(pendingTargetCard);
    return true;
  });

  const handleCardClick = (card: GameCardType) => {
    // Предварительная проверка правил использования (дублируем логику из хука для UI)
    if (!isAdmin) {
      const { phase, currentRoll } = gameState;
      const isProtection = card.action === 'protection';
      const isWheelCard = card.action === 'spin_wheel';
      const isExtraRoll = card.action === 'extra_roll';
      const isMovement = card.action === 'move_steps';

      if (phase === 'next_game' && !isWheelCard) {
        setGameAlert({ title: "Стоп!", message: "В этой фазе можно использовать только карту 'Подкрутка'!", type: 'warning' });
        return;
      }
      
      if (phase === 'turn') {
        // Защиту можно всегда. Остальное только в свой ход.
        if (!isProtection && currentTurnPlayerId !== user?.uid) {
          setGameAlert({ title: "Не твой ход", message: "Обычные карты можно использовать только в свою очередь.", type: 'info' });
          return;
        }

        if (isMovement && gameState.rollConfirmed) {
          setGameAlert({ title: "Движение начато", message: "Использовать карту перемещения можно только до подтверждения хода.", type: 'warning' });
          return;
        }

        // Обычные карты (не движение, не защита, не переброс) только ДО броска
        const isSpecialAction = isProtection || isExtraRoll || isMovement;
        const isMyRollDone = currentRoll !== null && gameState.currentRollPlayerId === user?.uid;

        if (!isSpecialAction && isMyRollDone) {
          setGameAlert({ title: "Кубик брошен", message: "Обычные карты (не движение и не защита) используются ДО броска.", type: 'warning' });
          return;
        }

        if (isExtraRoll && currentRoll === null) {
          setGameAlert({ title: "Рано!", message: "Сначала бросьте кубик, чтобы использовать переброс!", type: 'info' });
          return;
        }
      } else if (phase !== 'next_game') {
        setGameAlert({ title: "Заблокировано", message: "Использование карт в этой фазе запрещено.", type: 'warning' });
        return;
      }
    }

    if (card.action === 'protection' && playerData?.hasProtection) {
      setGameAlert({ title: "Уже защищен", message: "У вас уже активно Силовое поле! Не стоит тратить карту впустую.", type: 'info' });
      return;
    }

    if (cardNeedsTarget(card)) {
      setPendingTargetCard(card);
    } else {
      void handlers.handleUseCard(card);
    }
  };
  

  // Автоматическое открытие панели при прокрутке вниз
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) {
        setIsBottomPanelOpen(true);
      } else {
        setIsBottomPanelOpen(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleConfirmAvatar = () => {
    void handlers.updateAvatar(newAvatarUrl);
    setIsAvatarModalOpen(false);
    setNewAvatarUrl("");
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-black text-white">Проверка доступа...</div>;
  }

  if (!user) return <Auth onLogin={() => {}} />;

  if (!playerData) return <div className="h-screen flex items-center justify-center bg-black text-white">Загрузка профиля...</div>;

  if (isScoresDetailsOpen) {
    return (
      <ScoresDetailsPage
        players={players}
        totalScores={gameState.scores}
        gameHistory={gameState.gameHistory}
        onBack={() => setIsScoresDetailsOpen(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col overflow-x-hidden">
      <div className="fixed inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-80 -z-10" />

      <video
        autoPlay
        loop
        muted
        className="fixed top-0 left-0 w-full h-full object-cover blur-sm scale-105 -z-20"
      >
        <source src="/video/bg.mp4" type="video/mp4" />
      </video>

      <div className="sticky top-0 z-[60] flex justify-between items-center p-4 backdrop-blur-md border-b border-yellow-500/20 bg-black/20">
        <div className="flex items-center gap-6">
          <h2 
            className="font-title text-2xl text-yellow-400 tracking-widest cursor-pointer hover:opacity-80 transition-all active:scale-95"
            onClick={() => setIsPlayersSidebarOpen(true)}
            title="Открыть рейтинг игроков"
          >
            Cormorant Society
            <span className="text-xl font-bold text-purple-400/90 "> | Этап {gameState.round}</span>
          </h2>

          <div 
            className="bg-yellow-900/60 border border-yellow-500/40 px-4 py-1 rounded-lg backdrop-blur-xl animate-pulse flex items-center justify-center"
            style={{ fontFamily: "'Comfortaa', sans-serif" } as React.CSSProperties}
          >
            <span className="text-yellow-200 text-xs font-black uppercase tracking-[0.2em]">
              {PHASE_LABELS[gameState.phase as keyof typeof PHASE_LABELS]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div
            className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-all active:scale-95 group"
            onClick={() => setIsSidebarOpen(true)}
          >
            <div className="flex flex-col items-end hidden sm:flex">
              <span 
                className="text-sm font-black text-white tracking-tight"
                style={{ fontFamily: "'Comfortaa', sans-serif" } as React.CSSProperties}
              >
                {playerData.login}
              </span>
              {!isAdmin && (
                <div className="relative">
                  <span className="text-sm text-green-400 font-black leading-none mt-1 flex items-center gap-1" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                    {playerData.tiltCoins ?? 0} 🦖
                  </span>
                  
                  {/* Всплывающее уведомление об изменении коинов */}
                  {coinNotification && (
                    <div 
                      className={`absolute -bottom-6 right-0 font-black text-sm animate-in fade-in slide-in-from-top-2 duration-500 pointer-events-none drop-shadow-md
                        ${coinNotification.type === 'gain' ? 'text-green-400' : 'text-red-500'}`}
                      style={{ fontFamily: "'Comfortaa', sans-serif" } as React.CSSProperties}
                    >
                      {coinNotification.type === 'gain' ? '+' : '-'}{coinNotification.amount}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div 
              className="w-10 h-10 rounded-full p-[2px] shadow-lg transition-transform duration-300 group-hover:rotate-12"
              style={{ background: playerData.borderColor || '#fac319' }}
            >
              <img
                src={playerData.avatar || FALLBACK_AVATAR}
                className="w-full h-full rounded-full object-cover border-2 border-black"
                alt="me"
              />
            </div>

            <div 
              className="text-zinc-500 font-light text-xl ml-1 group-hover:text-yellow-500 transition-colors"
              title={isAdmin ? "Открыть панель администратора" : "Открыть настройки профиля"}
            >
              {isAdmin ? "⚙️" : "☰"}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex-1">
        <div className="relative h-[calc(100vh-73px)] w-full">
          <GameBoard
            playerData={
              isAdmin
                ? ({ id: "__admin__", login: "Admin", inGame: false } as Player)
                : playerData!
            }
            players={players}
            currentRoll={gameState.currentRoll}
            currentRollPlayerId={gameState.currentRollPlayerId}
            rollConfirmed={gameState.rollConfirmed}
            currentTurnPlayerId={currentTurnPlayerId}
            chooseStart={handlers.chooseStart}
            onMoveComplete={handlers.handleMoveComplete}
            showWheel={gameState.showWheel}
            onWheelResult={(res) => void syncWheelResult("current", res)}
            onCloseWheel={() => void syncWheelVisibility("current", false)}
            round={gameState.round}
          />
        </div>
        
        {/* Распорка для активации вертикальной прокрутки и авто-открытия панели */}
        <div className="h-[150px]" />

        {/* Кнопка-язычок для вызова панели управления */}
        <button
          onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
          className={`fixed left-1/2 -translate-x-1/2 z-[55] bg-purple-600/90 hover:bg-purple-500 text-white px-8 py-2 rounded-t-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all active:scale-95 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] border-x border-t border-white/20 backdrop-blur-md transition-all duration-300 ${
            isBottomPanelOpen ? "bottom-40" : "bottom-0"
          }`}
          style={{ fontFamily: "'Comfortaa', sans-serif" }}
        >
          {isBottomPanelOpen ? "▼ Скрыть управление" : "▲ Панель управления"}
        </button>

        {/* Сама панель теперь фиксированная, но управляется скроллом и кнопкой */}
        <div className={`fixed bottom-0 left-0 right-0 transition-all duration-500 ease-out z-50 ${
          isBottomPanelOpen 
            ? "translate-y-0 opacity-100 pointer-events-auto" 
            : "translate-y-full opacity-0 pointer-events-none"
        }`}>
          <BottomPanel
            currentUser={user}
            players={players}
            isAdmin={isAdmin}
            gameState={gameState}
            onRoll={handlers.handleRoll}
            canRoll={canRoll}
            currentTurnPlayerId={currentTurnPlayerId}
            onPrevPhase={() => { void handlers.handleStepPhase(-1); }}
            onNextPhase={() => { void handlers.handleStepPhase(1); }}
            onPrepareTurn={() => { void handlers.handlePrepareTurn(); }}
            onConfirmRoll={handlers.handleConfirmRoll}
            canConfirmRoll={canConfirmRoll}
            onToggleWheel={() => void syncWheelVisibility("current", !gameState.showWheel)}
            allCards={allCards}
            onCardClick={(card) => setSelectedCard(card)}
            onOpenHand={() => setIsHandOpen(true)} // Передаем функцию для открытия "руки"
          />
        </div>
      </div>

      {/* Модалка предпросмотра одиночной карты */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10003]" onClick={() => setSelectedCard(null)}>
          <GameCard 
            card={selectedCard} 
            index={0} 
            totalCards={1} 
            onUse={() => {
              handleCardClick(selectedCard);
              setSelectedCard(null);
            }}
          />
        </div>
      )}

      {/* Полноэкранная лента "Руки" (всей колоды в ряд) */}
      {isHandOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[10002] flex items-end justify-center pb-16 overflow-hidden"
          onClick={() => setIsHandOpen(false)} // Закрываем по клику на фон
        >
          <div className="absolute top-10 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <h2 className="text-4xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-lg">Ваша колода</h2>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Нажмите на фон, чтобы закрыть</p>
          </div>

          <div
            className="flex px-[10vw] py-20 overflow-x-auto overflow-y-hidden max-w-full custom-scrollbar items-end select-none scroll-smooth"
            onClick={e => e.stopPropagation()} // Предотвращаем закрытие при клике на саму ленту
          >
            {playerData?.inventory?.map((cardId: string, idx: number, arr: string[]) => {
              const card = allCards[cardId];
              if (!card) return null;

              return (
                <GameCard
                  key={`${cardId}-${idx}`}
                  card={card}
                  index={idx}
                  totalCards={arr.length}
                  isInHand={true}
                  onClick={() => {
                    setSelectedCard(card);
                    setIsHandOpen(false);
                  }}
                  onUse={() => {
                    handleCardClick(card);
                    setIsHandOpen(false);
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Экран МУЗЕЯ / КОЛЛЕКЦИИ */}
      {isCollectionOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/95 backdrop-blur-md z-[10002] flex flex-col items-center py-20 overflow-hidden animate-in fade-in duration-500"
          onClick={() => setIsCollectionOpen(false)}
        >
          <div className="text-center mb-12 pointer-events-none">
            <h2 className="text-5xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(234,179,8,0.3)]">Галерея Артефактов</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-[0.5em] mt-4">Карты открываются после использования игроками</p>
          </div>

          <div 
            className="flex flex-wrap gap-10 justify-center overflow-y-auto px-10 pb-20 max-w-7xl custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            {(Object.values(allCards) as GameCardType[])
              .sort((a: GameCardType, b: GameCardType) => a.number - b.number)
              .map((card: GameCardType) => {
                const isRevealed = gameState.revealedCards?.includes(card.id);
                
                if (!isRevealed) {
                  return (
                    <div 
                      key={card.id}
                      className="w-80 h-[520px] rounded-[2.5rem] bg-zinc-900 border-2 border-white/5 flex flex-col items-center justify-center gap-4 relative group"
                    >
                      <img 
                        src="/cards/card_back.svg" 
                        className="w-full h-full object-cover rounded-[2.5rem] opacity-20 grayscale" 
                        alt="locked" 
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-white/10 text-6xl font-black italic">?</span>
                        <span className="text-zinc-700 text-[10px] font-black uppercase tracking-widest mt-4">Неизвестный артефакт</span>
                        <span className="text-zinc-800 text-[8px] font-bold mt-1 italic">#{card.number}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={card.id} className="relative group">
                    <GameCard
                      card={card}
                      index={0}
                      totalCards={1}
                      onClick={() => setSelectedCard(card)}
                    />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                      Раскрыто
                    </div>
                  </div>
                );
              })}
          </div>
          
          <button className="mt-8 text-zinc-500 hover:text-white font-black uppercase text-xs tracking-widest transition-all">Нажмите в любое место, чтобы выйти</button>
        </div>
      )}

      {pendingTargetCard && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[10005] p-4">
          <div className="bg-zinc-900 border-2 border-purple-500/50 p-8 rounded-[2.5rem] w-full max-w-md flex flex-col gap-6 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Выбор цели</h2>
              <p className="text-purple-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                Для карты "{pendingTargetCard.name}"
              </p>
            </div>

            <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {selectableTargets.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => {
                      void handlers.handleUseCard(pendingTargetCard, player.id);
                      setPendingTargetCard(null);
                    }}
                    className="flex items-center gap-4 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/50 p-3 rounded-2xl transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full p-[2px]" style={{ background: player.borderColor || "#fac319" }}>
                      <img
                        src={player.avatar || FALLBACK_AVATAR}
                        className="w-full h-full rounded-full object-cover border-2 border-black"
                        alt={player.login}
                      />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-white font-bold group-hover:text-purple-200 transition-colors" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                        {player.login}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">
                        Клетка {player.position ?? 0} • {player.tiltCoins ?? 0} coins
                      </span>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 font-black text-xs">
                      Выбрать
                    </div>
                  </button>
                ))}
              {selectableTargets.length === 0 && (
                <div className="text-center py-4 text-zinc-500 italic">Нет доступных целей</div>
              )}
            </div>

            <button
              onClick={() => setPendingTargetCard(null)}
              className="w-full py-4 text-zinc-500 hover:text-white font-bold uppercase text-xs tracking-widest transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <PlayersSidebar
        isOpen={isPlayersSidebarOpen}
        players={players}
        totalScores={gameState.scores}
        gameHistory={gameState.gameHistory}
        currentUserId={user?.uid || null}
        onClose={() => setIsPlayersSidebarOpen(false)}
        onOpenDetails={() => {
          setIsPlayersSidebarOpen(false);
          setIsScoresDetailsOpen(true);
        }}
        onOpenCollection={() => {
          setIsPlayersSidebarOpen(false);
          setIsCollectionOpen(true);
        }}
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-6 pt-24 flex flex-col gap-8 z-[70] transform transition-transform duration-500 ease-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ fontFamily: "'Comfortaa', sans-serif" }}
      >
        <div className="flex justify-end -mr-2 -mt-2">
          <button 
            onClick={() => setIsSidebarOpen(false)}
            title="Закрыть панель управления"
            className="text-zinc-500 hover:text-white hover:scale-110 active:scale-90 transition-all p-2 text-2xl font-light"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div 
            className="relative p-1 rounded-full transition-all duration-500 shadow-2xl"
            style={{ background: playerData.borderColor || '#fac319' }}
          >
            <img
              src={playerData.avatar || FALLBACK_AVATAR}
              onClick={() => setIsAvatarModalOpen(true)}
              className="w-28 h-28 rounded-full cursor-pointer object-cover border-4 border-black hover:opacity-80 transition-opacity"
              title="Нажмите, чтобы изменить аватар"
            />
          </div>

          <div className="flex flex-col gap-5 w-full">
            {/* Кнопка открытия коллекции */}
            <button
              onClick={() => {
                setIsCollectionOpen(true);
                setIsSidebarOpen(false);
              }}
              className="w-full py-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center gap-3 group hover:bg-yellow-500/20 transition-all active:scale-95"
            >
              <span className="text-xl group-hover:rotate-12 transition-transform">🏺</span>
              <span className="text-yellow-500 font-black uppercase text-xs tracking-widest">Галерея артефактов</span>
            </button>

            <div className="flex flex-col gap-2">
              <label htmlFor="nickname-input" className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Ваш позывной</label>
              <input 
                id="nickname-input"
                key={playerData.id + playerData.login}
                defaultValue={playerData.login}
                onBlur={(e) => handlers.handleUpdateLogin(e.target.value)}
                placeholder="Введите ник"
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-500/50 outline-none transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Цвет ауры</label>
              <div className="flex gap-2.5 flex-wrap px-1">
                {AURA_COLORS.map(color => (
                  <button 
                    key={color}
                    title={`Выбрать цвет ауры: ${color}`}
                    onClick={() => handlers.handleUpdateBorderColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${playerData.borderColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-yellow-500/20 pt-4 mt-auto">
          <button
            onClick={handlers.handleLogout}
            className="w-full px-4 py-2 bg-red-900/40 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-900/60 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Выйти
          </button>
        </div>
      </aside>

      {isAvatarModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
          <div className="bg-zinc-950 border border-yellow-500/30 p-8 rounded-[2.5rem] w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-300" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-black text-yellow-500 uppercase italic tracking-tighter">Сменить аватар</h2>
              <p className="text-xs text-zinc-500">Введите прямую ссылку на изображение</p>
            </div>

            <div className="flex flex-col gap-2">
              <input
                value={newAvatarUrl}
                title="URL вашего изображения"
                onChange={(e) => setNewAvatarUrl(e.target.value)}
                placeholder="https://i.pinimg.com/..."
                className="w-full p-4 bg-black/50 border border-white/10 rounded-2xl text-white outline-none focus:border-yellow-500/50 transition-all font-bold placeholder:text-zinc-700"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleConfirmAvatar}
                className="flex-1 bg-yellow-500 text-black py-4 rounded-2xl font-black uppercase text-sm hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
              >
                Принять
              </button>
              <button 
                onClick={() => setIsAvatarModalOpen(false)}
                className="flex-1 bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-bold uppercase text-sm hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ЭКРАН ГЕМБЛИНГА (КАЗИНО) */}
      {gameState.activeInteraction?.type === 'gambling' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-blue-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-blue-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">Испытай удачу!</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">Выбери одну из трех карт</p>
          </div>
          
          <div className="flex gap-10">
            {gameState.activeInteraction.cards.map((cardId: string, idx: number) => (
              <div 
                key={idx}
                onClick={() => {
                  const card = allCards[cardId];
                  setGameAlert({ title: "Выпала карта!", message: `Вы получили: ${card.name}. ${card.description}` });
                  void handlers.handleFinishInteraction(cardId);
                }}
                className="w-64 h-[400px] rounded-[2rem] bg-blue-900/50 border-4 border-blue-400/30 cursor-pointer hover:scale-110 hover:border-blue-400 hover:shadow-[0_0_50px_rgba(59,130,246,0.4)] transition-all flex items-center justify-center group"
              >
                <img src="/cards/card_back.svg" className="w-full h-full object-cover rounded-[1.8rem] opacity-80 group-hover:opacity-100" alt="Back" />
                <span className="absolute text-blue-200/20 text-8xl font-black italic">?</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ЭКРАН B-SHOP (МАГАЗИН) */}
      {gameState.activeInteraction?.type === 'bshop' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-pink-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-pink-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(236,72,153,0.5)]">B-Shop</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">Ваши коины: {playerData.tiltCoins ?? 0} 🦖</p>
          </div>
          
          <div className="flex gap-8 items-start">
            {gameState.activeInteraction.cards.map((cardId: string, idx: number) => {
              const card = allCards[cardId];
              const price = getCardPrice(card as GameCardType);
              const canAfford = (playerData.tiltCoins ?? 0) >= price;

              return (
                <div key={idx} className="flex flex-col gap-4 items-center">
                  <div className="scale-90">
                    <GameCard card={card} index={0} totalCards={1} />
                  </div>
                  <button 
                    disabled={!canAfford}
                    onClick={() => void handlers.handleFinishInteraction(cardId, price)}
                    className={`w-full py-4 rounded-2xl font-black uppercase text-sm tracking-widest transition-all ${
                      canAfford 
                      ? "bg-pink-500 text-white hover:bg-pink-400 shadow-[0_10px_20px_rgba(236,72,153,0.3)]" 
                      : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    {price} 🦖 КУПИТЬ
                  </button>
                </div>
              );
            })}
          </div>

          <button 
            onClick={() => void handlers.handleFinishInteraction()}
            className="mt-12 text-white/30 hover:text-white font-black uppercase text-xs tracking-[0.3em] transition-all"
          >
            Ничего не покупать и уйти
          </button>
        </div>
      )}

      {/* КРАСИВОЕ ИГРОВОЕ УВЕДОМЛЕНИЕ */}
      {gameAlert && (
        <div className="fixed inset-0 flex items-center justify-center z-[20000] p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGameAlert(null)} />
          <div className="relative bg-zinc-900 border-2 border-yellow-500/50 p-8 rounded-[2rem] max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,1)] text-center transform animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
              <span className="text-3xl">🔔</span>
            </div>
            <h3 className="text-xl font-black text-yellow-500 uppercase italic tracking-tighter mb-2">
              {gameAlert.title}
            </h3>
            <p className="text-zinc-300 text-sm font-medium leading-relaxed mb-6" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
              {gameAlert.message}
            </p>
            <button 
              onClick={() => setGameAlert(null)}
              className="w-full py-4 bg-yellow-500 text-black rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all active:scale-95"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppClean;
