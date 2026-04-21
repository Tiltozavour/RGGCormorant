import { useState, useEffect } from "react";
import Auth from "./components/Auth";
import { syncWheelResult, syncWheelVisibility } from "./components/gameStateService";
import BottomPanel from "./components/BottomPanelPhase";
import GameBoard from "./components/GameBoard";
import PlayersSidebar from "./components/PlayersSidebar";
import ScoresDetailsPage from "./components/ScoresDetailsPage";
import type { Player } from "./types/game";
import type { GameCard as GameCardType, CardRarity as Rarity } from "./types/card"; 
import { useGameData } from "./components/useGameData";
import { FALLBACK_AVATAR, PHASE_LABELS, AURA_COLORS } from "./components/gameConstants";
import GameCard from "./components/GameCard";


function AppClean() {
  const {
    user, playerData, loading, players, gameState, allCards,
    isAdmin, currentTurnPlayerId, canRoll, canConfirmRoll,
    handlers
  } = useGameData();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isScoresDetailsOpen, setIsScoresDetailsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isPlayersSidebarOpen, setIsPlayersSidebarOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<GameCardType | null>(null);
  const [isHandOpen, setIsHandOpen] = useState(false);
  const [pendingTargetCard, setPendingTargetCard] = useState<GameCardType | null>(null); // Карта, ожидающая выбора цели

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

  // Проверка: требует ли карта выбора цели?
  const cardNeedsTarget = (card: GameCardType) => {
    const targetActions: string[] = ['steal_coins', 'steal_card', 'discard_card', 'freeze_player', 'duel'];
    // Специальные ID для карт типа "Судья душ" и "Жертвопредложение", которые используют общий action
    const targetIds = ['inv_008', 'inv_014', 'inv_017', 'inv_021']; 
    return targetActions.includes(card.action) || targetIds.includes(card.id);
  };

  const handleCardClick = (card: GameCardType) => {
    if (cardNeedsTarget(card)) {
      setPendingTargetCard(card);
    } else {
      void handlers.handleUseCard(card as any);
    }
  };

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
            style={{ fontFamily: "'Comfortaa', sans-serif" }}
          >
            <span className="text-yellow-200 text-xs font-black uppercase tracking-[0.2em]">
              {PHASE_LABELS[gameState.phase]}
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
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                {playerData.login}
              </span>
              {!isAdmin && (
              <span className="text-sm text-green-400 font-black leading-none mt-1"  style={{ fontFamily: "'Comfortaa', sans-serif" }}>{playerData.tiltCoins ?? 0} 🦖</span>
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
            onOpenHand={() => setIsHandOpen(true)}
          />
        </div>
      </div>

      {/* Модалка предпросмотра карты */}
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

      {/* Полноэкранная лента "Руки" */}
      {isHandOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10002] flex items-end justify-center pb-20 animate-in fade-in duration-300"
          onClick={() => setIsHandOpen(false)}
        >
          <div className="absolute top-10 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <h2 className="text-4xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-lg">Ваша колода</h2>
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-2">Нажмите на фон, чтобы вернуться к игре</p>
          </div>

          <div 
            className="flex gap-8 overflow-x-auto px-20 py-10 max-w-full custom-scrollbar items-center select-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Сначала выводим легендарные призы, потом всё остальное */}
            {[
              ...(playerData?.inventory?.filter(id => allCards[id]?.rarity === 'legendary') || []),
              ...(playerData?.inventory?.filter(id => allCards[id]?.rarity !== 'legendary') || [])
            ].map((cardId, idx, arr) => {
              const card = allCards[cardId];
              if (!card) return null;

              return (
                <div key={`${cardId}-${idx}`} className="relative group">
                  {card.rarity === 'legendary' && (
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest z-50 shadow-xl border-2 border-white animate-bounce">
                      🏆 ПРИЗ
                    </div>
                  )}
                  <GameCard
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
                </div>
              );
            })}
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
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-6 flex flex-col gap-8 z-50 transform transition-transform duration-500 ease-out ${
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

      {/* Модалка выбора цели (игрока) */}
      {pendingTargetCard && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[10005] p-4">
          <div className="bg-zinc-900 border-2 border-purple-500/50 p-8 rounded-[2.5rem] w-full max-w-md flex flex-col gap-6 shadow-[0_0_50px_rgba(168,85,247,0.3)] animate-in zoom-in duration-300">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Выбор цели</h2>
              <p className="text-purple-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                Для карты "{pendingTargetCard.name}"
              </p>
            </div>

            <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {players
                .filter(p => p.id !== user?.uid && p.inGame && p.role !== 'admin')
                .map(player => (
                  <button
                    key={player.id}
                    onClick={() => {
                      void handlers.handleUseCard(pendingTargetCard, player.id);
                      setPendingTargetCard(null);
                    }}
                    className="flex items-center gap-4 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/50 p-3 rounded-2xl transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full p-[2px]" style={{ background: player.borderColor || '#fac319' }}>
                      <img src={player.avatar || FALLBACK_AVATAR} className="w-full h-full rounded-full object-cover border-2 border-black" alt={player.login} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-white font-bold group-hover:text-purple-200 transition-colors" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
                        {player.login}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">
                        Клетка {player.position ?? 0} • {player.tiltCoins ?? 0} 🦖
                      </span>
                    </div>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-purple-400 font-black text-xs">
                      ВЫБРАТЬ
                    </div>
                  </button>
                ))}
              {players.filter(p => p.id !== user?.uid && p.inGame && p.role !== 'admin').length === 0 && (
                <div className="text-center py-4 text-zinc-500 italic">Нет доступных целей...</div>
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
    </div>
  );
}

export default AppClean;
