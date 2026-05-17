/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from "react";
import Auth from "./Auth";
import { syncWheelResult, syncWheelVisibility } from "../services/gameStateService"; 
import BottomPanel from "./BottomPanel";
import GameBoard from "./GameBoard";
import { GameWheel } from "./GameWheel";
import PlayersSidebar from "./PlayersSidebar";
import ProfileSidebar from "./ProfileSidebar";
import ScoresDetailsPage from "./ScoresDetailsPage";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
//import { v4 as uuidv4 } from 'uuid'; 

import type { Player } from "../types/game";
import type { GameCard as GameCardType } from "../types/card";
import { useGameData } from "./useGameData";
import { useEventLogger } from "./useEventLogger";
import { useModalStates } from "../components/useModalStates";
import GameCard from "./GameCard";
import GameAlertOverlay from "./GameAlertOverlay";
import DiceVisual from "./DiceVisual";
import DuelDiceVisual from "./DuelDiceVisual"; // Import the new component
import { FALLBACK_AVATAR, PHASE_LABELS, getPublicAssetUrl } from "./gameConstants";
import EventLog from "./EventLog";
import InteractionPendingOverlay from "./InteractionPendingOverlay";
import ShopAndGamblingOverlays from "./ShopAndGamblingOverlays";
import TaxResponseOverlay from "./TaxResponseOverlay";
import ToastContainer from "./ToastContainer";
import { evaluateCardUseGuard, getCardUseGuardAlert } from "./cardUseGuards";
import { cardNeedsTarget, getSelectableCardTargets } from "./cardTargetRules";
import type { ToastNotification } from "./useModalStates";
import { ru } from "../i18n/ru";
import { fetchAvailableGames, type AvailableGame } from "./gameList";

const getNotificationKey = (
  source: "player" | "game",
  userId: string,
  notif: { message: string; timestamp: number; cardId?: string },
) => `${source}:${userId}:${notif.timestamp}:${notif.cardId ?? ""}:${notif.message}`;

const SEEN_NOTIFICATION_STORAGE_LIMIT = 200;

const getSeenNotificationStorageKey = (userId: string) => `rgg-shown-notifications:${userId}`;

const getSeenNotificationKeys = (userId: string) => {
  try {
    const rawValue = window.localStorage.getItem(getSeenNotificationStorageKey(userId));
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
};

const hasSeenNotification = (userId: string, notifKey: string) => (
  getSeenNotificationKeys(userId).includes(notifKey) ||
  window.localStorage.getItem(`rgg-shown-notification:${notifKey}`) === "1"
);

const markNotificationSeen = (userId: string, notifKey: string) => {
  const nextKeys = [
    notifKey,
    ...getSeenNotificationKeys(userId).filter((key) => key !== notifKey),
  ].slice(0, SEEN_NOTIFICATION_STORAGE_LIMIT);

  window.localStorage.setItem(getSeenNotificationStorageKey(userId), JSON.stringify(nextKeys));
};

const getInventoryCardStacks = (
  inventory: string[] | undefined,
  allCards: Record<string, GameCardType>,
) => {
  const counts = new Map<string, number>();
  (inventory ?? []).forEach((cardId) => counts.set(cardId, (counts.get(cardId) ?? 0) + 1));

  return Array.from(counts.entries())
    .map(([cardId, count]) => {
      const card = allCards[cardId];
      return card ? { card, count } : null;
    })
    .filter((entry): entry is { card: GameCardType; count: number } => Boolean(entry))
    .sort((entryA, entryB) => {
      const rarityValA = RARITY_ORDER[entryA.card.rarity] || 99;
      const rarityValB = RARITY_ORDER[entryB.card.rarity] || 99;

      if (rarityValA !== rarityValB) return rarityValA - rarityValB;
      return entryA.card.number - entryB.card.number;
    });
};


const RARITY_ORDER: Record<string, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const LoadingScreen = ({ message }: { message: string }) => (
  <div className="h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-6 text-center">
    <img
      src={getPublicAssetUrl("/video/load.gif")}
      alt=""
      className="h-36 w-36 object-contain"
      aria-hidden="true"
    />
    <div className="flex flex-col items-center gap-2">
      <p className="text-lg font-bold tracking-wide">{message}</p>
      <p className="text-xs uppercase tracking-[0.35em] text-white/40">Пожалуйста, подождите</p>
    </div>
  </div>
);

function AppClean() {
  const {
    isSidebarOpen, setIsSidebarOpen,
    isScoresDetailsOpen, setIsScoresDetailsOpen, // Keep for modal
    isBottomPanelOpen, setIsBottomPanelOpen, // Keep for panel
    isPlayersSidebarOpen, setIsPlayersSidebarOpen,
    isLegendsOpen, setIsLegendsOpen,
    selectedCard, setSelectedCard,
    isCollectionOpen, setIsCollectionOpen,
    isHandOpen, setIsHandOpen,
    gameAlert, setGameAlert,
    pendingTargetCard, setPendingTargetCard,
    toasts, setToasts,
    gameEvents: localEvents, setGameEvents: setLocalEvents,
    closeAll
  } = useModalStates();
  void localEvents; void setLocalEvents;
  const [isClearingEventLog, setIsClearingEventLog] = useState(false);
  const [selectedCardPreviewMode, setSelectedCardPreviewMode] = useState<'use' | 'view'>('use');
  const [isWheelInfoOpen, setIsWheelInfoOpen] = useState(false);
  const [wheelInfoGames, setWheelInfoGames] = useState<AvailableGame[]>([]);

  const notify = useCallback((message: string, type: ToastNotification['type'] = 'info', cardId?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [
      ...prev,
      { id, message, type, cardId, timestamp: Date.now() },
    ]);
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, type === 'error' ? 7000 : 4500);
     return () => clearTimeout(timer); // Но notify вызывается не в useEffect, тут сложнее.
  }, [setToasts]);

  const logEvent = useEventLogger();

  const {
    user, playerData, loading, players, gameState, allCards, gameEvents,
    isAdmin, currentTurnPlayerId, canRoll, canConfirmRoll,
    handlers, getPlayerById
  } = useGameData(notify, logEvent);

  useEffect(() => {
    if (!isWheelInfoOpen) return;

    void fetchAvailableGames().then(setWheelInfoGames);
  }, [isWheelInfoOpen]);

  const handleClearEventLog = useCallback(async () => {
    if (isClearingEventLog) return;

    setIsClearingEventLog(true);
    try {
      const snapshot = await getDocs(collection(db, "gameEvents"));
      const docs = snapshot.docs;

      for (let i = 0; i < docs.length; i += 450) {
        const batch = writeBatch(db);
        docs.slice(i, i + 450).forEach((eventDoc) => batch.delete(eventDoc.ref));
        await batch.commit();
      }

      notify(docs.length > 0 ? ru.app.eventLogCleared(docs.length) : ru.app.eventLogAlreadyEmpty, 'success');
    } catch (error) {
      console.error("Failed to clear event log:", error);
      notify(ru.app.eventLogClearError, 'error');
    } finally {
      setIsClearingEventLog(false);
    }
  }, [isClearingEventLog, notify]);

  const hasGoldenCard = (gameState.goldenCardHolderIds ?? []).includes(playerData?.id ?? "");
  const getBaseCardPrice = (card: GameCardType) => {
    const defaultPrices = { common: 3, rare: 7, epic: 15, legendary: 0, default: 0 };
    return card.price !== null ? card.price : defaultPrices[card.rarity] || defaultPrices.default;
  };
  const getCardPrice = (card: GameCardType) => {
    const basePrice = getBaseCardPrice(card);
    return hasGoldenCard && basePrice > 0 ? Math.max(1, Math.ceil(basePrice / 2)) : basePrice;
  };
  const displayedHandInventory = [
    ...(playerData?.inventory ?? []),
    ...(hasGoldenCard ? ["inv_018"] : []),
  ];
  const activeInteraction = gameState.activeInteraction;
  const isWaitingForTaxResponse = Boolean(
    activeInteraction?.type === "tax_response" &&
    activeInteraction.playerId !== user?.uid &&
    (activeInteraction.taxOwnerId === user?.uid || activeInteraction.taxCollectorId === user?.uid),
  );
  const canUseSelectedCard = Boolean(
    selectedCardPreviewMode === 'use' &&
    selectedCard &&
    selectedCard.id !== "inv_018" &&
    selectedCard.action !== "passive_benefit" &&
    playerData?.inventory?.includes(selectedCard.id)
  );
  const canUseHandCard = (card: GameCardType) =>
    card.id !== "inv_018" &&
    card.action !== "passive_benefit";

  const [coinNotification, setCoinNotification] = useState<{ amount: number; type: 'gain' | 'loss' } | null>(null);

  const [visualRoll, setVisualRoll] = useState<{ value: number; rolling: boolean; playerName: string } | null>(null);
  const [cardVisualRoll, setCardVisualRoll] = useState<{ value: number; rolling: boolean; playerName: string } | null>(null);
  const [coinsToPay, setCoinsToPay] = useState<number>(1); // New state for coin input
  const lastProcessedRollRef = useRef<string | null>(null);
  const lastProcessedCardRollRef = useRef<string | null>(null);
  const lastShownCardMoveRef = useRef<string | null>(null);

  const [isShuffling, setIsShuffling] = useState(false);
  const [isInteractionPending, setIsInteractionPending] = useState(false);
  const [revealedGamblingCardId, setRevealedGamblingCardId] = useState<string | null>(null);
  const [duelBetAmount, setDuelBetAmount] = useState<number>(1); // New state for duel bet amount
  const [duelVisualRoll, setDuelVisualRoll] = useState<{
    challenger: { value: number; rolling: boolean; playerName: string };
    target: { value: number; rolling: boolean; playerName: string };
    duelId: string;
  } | null>(null);
  const scheduledDuelRollRef = useRef<string | null>(null);
  const interactionPendingRef = useRef(false);
  const shownNotificationKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Сбрасываем блокировку, если нет активного интерактива, закончилась анимация тасовки 
    // или обновился инвентарь (значит действие карты применилось)
    if (!gameState.activeInteraction && !isShuffling) {
      setIsInteractionPending(false);
      setRevealedGamblingCardId(null);
    }
  }, [gameState.activeInteraction, isShuffling, playerData?.inventory, gameState.rollConfirmed]);

  useEffect(() => {
    if (gameState.activeInteraction?.type !== 'gambling') {
      setRevealedGamblingCardId(null);
    }
  }, [gameState.activeInteraction?.type, gameState.activeInteraction?.cards]);

  const runInteractionAction = useCallback(async (action: () => void | Promise<void>) => {
    if (interactionPendingRef.current) return false;
    interactionPendingRef.current = true;
    setIsInteractionPending(true);
    try {
      await action();
      return true;
    } catch (error) {
      console.error(error);
      notify(ru.app.cardActionError, "error");
      return false;
    } finally {
      interactionPendingRef.current = false;
      setIsInteractionPending(false);
    }
  }, [notify]);

  useEffect(() => {
    if (gameState.activeInteraction?.type === 'discard_selection') {
      setIsShuffling(true);
      const timer = setTimeout(() => setIsShuffling(false), 1200); // 1.2 секунды на "тасовку"
      return () => {
        clearTimeout(timer);
        setIsShuffling(false);
      };
    }
  }, [gameState.activeInteraction?.type]);

  // Логика отслеживания уведомлений от других игроков (например, когда у вас сбросили карту)
  useEffect(() => {
    const notif = playerData?.lastNotification;
    if (!notif || !user?.uid) return;

    const notifKey = getNotificationKey("player", user.uid, notif);
    if (shownNotificationKeysRef.current.has(notifKey)) return;

    if (hasSeenNotification(user.uid, notifKey)) {
      shownNotificationKeysRef.current.add(notifKey);
      return;
    }

    shownNotificationKeysRef.current.add(notifKey);
    markNotificationSeen(user.uid, notifKey);
    setGameAlert({
      title: ru.app.attention,
      message: notif.message,
      type: 'warning',
      cardId: notif.cardId
    });
  }, [playerData?.lastNotification, user?.uid]);

  useEffect(() => {
    const notif = user?.uid ? gameState.notifications?.[user.uid] : null;
    if (!notif || !user?.uid) return;

    const notifKey = getNotificationKey("game", user.uid, notif);
    if (shownNotificationKeysRef.current.has(notifKey)) return;

    if (hasSeenNotification(user.uid, notifKey)) {
      shownNotificationKeysRef.current.add(notifKey);
      return;
    }

    shownNotificationKeysRef.current.add(notifKey);
    markNotificationSeen(user.uid, notifKey);
    setGameAlert({
      title: ru.app.attention,
      message: notif.message,
      type: 'warning',
      cardId: notif.cardId
    });
  }, [gameState.notifications, user?.uid, setGameAlert]);

  useEffect(() => {
    const cardMove = gameState.cardMove;
    if (!cardMove || cardMove.targetId !== user?.uid || lastShownCardMoveRef.current === cardMove.id) return;

    lastShownCardMoveRef.current = cardMove.id;
    setGameAlert({
      title: ru.app.controlledPieceTitle,
      message: ru.app.controlledPieceMessage(
        cardMove.controllerName ?? ru.app.fallbackController,
        cardMove.cardName ?? ru.app.fallbackCard,
      ),
      type: 'warning',
      cardId: cardMove.cardId,
    });
  }, [gameState.cardMove, user?.uid, setGameAlert]);

  // Логика отслеживания изменения монет для всплывающего уведомления
  const prevCoinsRef = useRef<number | undefined>(playerData?.tiltCoins);

  useEffect(() => {
    if (playerData?.tiltCoins !== undefined && prevCoinsRef.current !== undefined) {
      const diff = playerData.tiltCoins - prevCoinsRef.current;
      if (diff !== 0) {
        prevCoinsRef.current = playerData.tiltCoins;
        setCoinNotification({ amount: Math.abs(diff), type: diff > 0 ? 'gain' : 'loss' });
        // Скрываем уведомление через 3 секунды
        const timer = setTimeout(() => setCoinNotification(null), 3000);
        return () => clearTimeout(timer);
      }
    }
    prevCoinsRef.current = playerData?.tiltCoins;
  }, [playerData?.tiltCoins]);

  // Логика визуального броска кубика
  useEffect(() => {
    // Срабатывает, когда есть бросок, но он еще не подтвержден
    if (gameState.currentRoll !== null && !gameState.rollConfirmed && gameState.currentRollPlayerId) {
      // Если lastBaseRoll еще не долетел, берем currentRoll (но не более 6 для визуала)
      const rollValue = gameState.lastBaseRoll || (gameState.currentRoll > 6 ? 6 : gameState.currentRoll);
      const rollKey = `${gameState.currentRollPlayerId}-${gameState.round}-${rollValue}`;
      
      if (lastProcessedRollRef.current !== rollKey) {
        lastProcessedRollRef.current = rollKey;
        const rollPlayer = players.find(p => p.id === gameState.currentRollPlayerId);
        const playerName = rollPlayer?.login || "Кто-то";


        setVisualRoll({ value: rollValue, rolling: true, playerName });
        
        // Трясем кубик 1 секунду, потом останавливаем на нужном значении
        setTimeout(() => {
          setVisualRoll(prev => {
            if (prev && prev.value === rollValue) return { ...prev, rolling: false };
            return prev;
          });
        }, 1000);

        // Полностью скрываем через 4 секунды (даем время рассмотреть результат)
        setTimeout(() => {
          setVisualRoll(prev => (prev && prev.value === rollValue) ? null : prev);
        }, 4000);
      }
    } else if (gameState.currentRoll === null && !visualRoll?.rolling) {
      // Сбрасываем реф только когда кубиков нет на экране
      lastProcessedRollRef.current = null;
    }
  }, [gameState.currentRoll, gameState.lastBaseRoll, gameState.rollConfirmed, gameState.currentRollPlayerId, players, gameState.round, visualRoll?.rolling]);

  useEffect(() => {
    const cardRoll = gameState.cardDiceRoll;
    if (!cardRoll) return;
    if (lastProcessedCardRollRef.current === cardRoll.id) return;

    const cardRollTitle: Record<string, string> = {
      inv_008: "Judge",
      inv_009: "Mage",
      inv_016: "Katjit",
    };

    lastProcessedCardRollRef.current = cardRoll.id;
    setCardVisualRoll({
      value: cardRoll.value,
      rolling: true,
      playerName: `${cardRoll.playerName} - ${cardRollTitle[cardRoll.cardId] || cardRoll.cardId}`,
    });

    window.setTimeout(() => {
      setCardVisualRoll(prev => {
        if (prev && prev.value === cardRoll.value) return { ...prev, rolling: false };
        return prev;
      });
    }, 1000);

    window.setTimeout(() => {
      if (cardRoll.playerId === user?.uid) {
        void handlers.handleResolveCardDiceRoll(cardRoll.id);
      }
    }, 1350);

    window.setTimeout(() => {
      setCardVisualRoll(prev => (prev && prev.value === cardRoll.value) ? null : prev);
    }, 3600);
  }, [gameState.cardDiceRoll, handlers, user?.uid]);

  // Logic for duel dice visual roll
  useEffect(() => {
    const activeDuel = Object.values(gameState.activeDuels || {})
      .find(duel => duel.status === 'rolling' && duel.weapon === 'dice') ?? null;

    if (activeDuel && activeDuel.status === 'rolling' && activeDuel.weapon === 'dice') {
      if (scheduledDuelRollRef.current === activeDuel.id) return;
      scheduledDuelRollRef.current = activeDuel.id;

      const challengerPlayer = getPlayerById(activeDuel.challengerId);
      const targetPlayer = getPlayerById(activeDuel.targetId);

      const visualChallengerRoll = activeDuel.rolls?.[activeDuel.challengerId] ?? 1;
      const visualTargetRoll = activeDuel.rolls?.[activeDuel.targetId] ?? 1;

      setDuelVisualRoll({
        duelId: activeDuel.id,
        challenger: { value: visualChallengerRoll, rolling: true, playerName: challengerPlayer?.login || 'Игрок 1' },
        target: { value: visualTargetRoll, rolling: true, playerName: targetPlayer?.login || 'Игрок 2' },
      });

      // Start rolling animation
      setTimeout(() => {
        setDuelVisualRoll(prev => {
          if (prev?.duelId === activeDuel.id) {
            return {
              ...prev,
              challenger: { ...prev.challenger, rolling: false },
              target: { ...prev.target, rolling: false },
            };
          }
          return prev;
        });
      }, 1000); // Roll for 1 second

      // After animation, call handleFinishDuel
      setTimeout(() => {
        void handlers.handleFinishDuel(activeDuel.id);
        setDuelVisualRoll(null); // Clear visual after duel is finished
        scheduledDuelRollRef.current = null;
      }, 2500); // Total animation time + a bit
    } else {
      scheduledDuelRollRef.current = null;
    }
  }, [gameState.activeDuels, handlers, players, getPlayerById]);

  const protectionCardsInInv = playerData?.inventory
    ?.map((id: string) => allCards[id])
    .filter((c): c is GameCardType => !!c && (c.action === "protection" || c.action === "fish_protection")) || [];

  const selectableTargets = getSelectableCardTargets(players, user?.uid, pendingTargetCard);

  const handleCardClick = async (card: GameCardType) => {
    if (isInteractionPending) return;

    const guard = evaluateCardUseGuard({
      isAdmin,
      card,
      phase: gameState.phase,
      currentRoll: gameState.currentRoll,
      rollConfirmed: gameState.rollConfirmed,
      showWheel: gameState.showWheel,
      currentTurnPlayerId,
      userId: user?.uid,
      hasProtection: playerData?.hasProtection,
    });

    if (!guard.ok) {
      const alert = getCardUseGuardAlert(guard.reason);
      setGameAlert({ ...alert, cardId: card.id });
      return;
    }

    if (cardNeedsTarget(card)) {
      setPendingTargetCard(card);
      setSelectedCard(null); // Закрываем предпросмотр, чтобы не мешал выбирать цель
    } else {
      try {
        const completed = await runInteractionAction(() => handlers.handleUseCard(card)); // Делаем вызов асинхронным
        if (completed) setSelectedCard(null);
      } catch {
        // Ошибка уже показана в runInteractionAction.
      }
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

  // Обработка клавиши Escape для закрытия всех модальных окон
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeAll]);

  // Блокировка прокрутки фона при открытых полноэкранных окнах (магазин, гемблинг, выбор карты)
  useEffect(() => {
    const interactionShouldLock = Boolean(
      gameState.activeInteraction &&
      !(gameState.activeInteraction.type === "tax_response" && gameState.activeInteraction.playerId !== user?.uid),
    );
    const shouldLock = interactionShouldLock || isHandOpen || isCollectionOpen || isLegendsOpen || isWheelInfoOpen;
    if (shouldLock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [gameState.activeInteraction, isHandOpen, isCollectionOpen, isLegendsOpen, isWheelInfoOpen, user?.uid]);

  if (loading) {
    return <LoadingScreen message={ru.common.loadingAccess} />;
  }

  if (!user) return <Auth onLogin={() => {}} />;

  if (!playerData) return <LoadingScreen message={ru.common.loadingProfile} />;

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
        <source src={getPublicAssetUrl("/video/bg.webm")} type="video/webm" />
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
        {/* Индикатор удаленного управления фишкой */}
        {gameState.forcedMovePlayerId && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-2 pointer-events-none">
            {gameState.forcedMovePlayerId === user?.uid ? (
              <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-md px-6 py-2 rounded-full animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                <span className="text-red-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="animate-pulse">⚠️</span> Вашей фишкой управляет другой игрок!
                </span>
              </div>
            ) : gameState.currentRollPlayerId === user?.uid ? (
              <div className="bg-purple-600/30 border border-purple-400/50 backdrop-blur-md px-6 py-2 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)] flex flex-col items-center gap-2 pointer-events-auto">
                <span className="text-purple-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="text-lg">🎮</span> Вы управляете фишкой игрока{" "}
                  <b className="text-white">{players.find(p => p.id === gameState.forcedMovePlayerId)?.login}</b>
                </span>
                {!gameState.rollConfirmed && (
                  <button
                    disabled={isInteractionPending}
                    onClick={() => {
                      void runInteractionAction(handlers.handleConfirmRoll);
                    }}
                    className="mt-1 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase px-4 py-1 rounded-full transition-all active:scale-95 shadow-lg"
                  >
                    Начать перемещение
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-zinc-800/80 border border-white/10 backdrop-blur-md px-6 py-2 rounded-full">
                <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                  Происходит удаленное перемещение...
                </span>
              </div>
            )}
          </div>
        )}

        {gameState.cardMove && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[56] flex flex-col items-center gap-2 pointer-events-none">
            {gameState.cardMove.targetId === user?.uid ? (
              <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-md px-6 py-2 rounded-full animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                <span className="text-red-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="animate-pulse">!</span>
                  Вашей фишкой управляет игрок{" "}
                  <b className="text-white">{gameState.cardMove.controllerName ?? "игрок"}</b>
                  {" "}из-за карты{" "}
                  <b className="text-white">{gameState.cardMove.cardName ?? "карта"}</b>
                </span>
              </div>
            ) : gameState.cardMove.controllerId === user?.uid ? (
              <div className="bg-purple-600/30 border border-purple-400/50 backdrop-blur-md px-6 py-2 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                <span className="text-purple-200 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="text-lg">🎮</span>
                  Вы управляете фишкой игрока{" "}
                  <b className="text-white">{players.find(p => p.id === gameState.cardMove?.targetId)?.login}</b>
                  {" "}картой{" "}
                  <b className="text-white">{gameState.cardMove.cardName ?? "карта"}</b>
                </span>
              </div>
            ) : (
              <div className="bg-zinc-800/80 border border-white/10 backdrop-blur-md px-6 py-2 rounded-full">
                <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                  Происходит перемещение картой...
                </span>
              </div>
            )}
          </div>
        )}

        {isWaitingForTaxResponse && activeInteraction?.type === "tax_response" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[57] pointer-events-none">
            <div className="bg-amber-500/20 border border-amber-300/40 backdrop-blur-md px-6 py-2 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.25)]">
              <span className="text-amber-100 text-[10px] font-black uppercase tracking-widest">
                Ожидаем ответ игрока{" "}
                <b className="text-white">{players.find(p => p.id === activeInteraction.playerId)?.login || "игрок"}</b>
                {" "}по карте "Платите налоги!"
              </span>
            </div>
          </div>
        )}

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
            forcedMovePlayerId={gameState.forcedMovePlayerId}
            cardMove={gameState.cardMove}
            chooseStart={handlers.chooseStart}
            onMoveComplete={handlers.handleMoveComplete}
            showWheel={gameState.showWheel}
            onWheelResult={(res) => void syncWheelResult("current", res)}
            onCloseWheel={() => void syncWheelVisibility("current", false)}
            wheelActionCards={["inv_017", "inv_006"]
              .flatMap((cardId) => {
                const card = allCards[cardId];
                const count = playerData?.inventory?.filter((inventoryCardId) => inventoryCardId === cardId).length ?? 0;
                if (!card || count === 0) return [];

                return [{
                  id: card.id,
                  name: card.name,
                  image: getPublicAssetUrl(card.artCard || card.faceCard),
                  count,
                  requiresResult: true,
                  onUse: () => { void handlers.handleUseCard(card); },
                }];
              })}
            round={gameState.round}
            goldenCardHolderIds={gameState.goldenCardHolderIds ?? []}
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
            isDiceRolling={visualRoll?.rolling ?? false}
            allCards={allCards}
            onCardClick={(card) => {
              setSelectedCardPreviewMode('use');
              setSelectedCard(card);
            }}
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
            onUse={canUseSelectedCard ? () => {
              if (isInteractionPending) return;
              handleCardClick(selectedCard);
              setSelectedCard(null);
            } : undefined}
          />
        </div>
      )}

      {/* Полноэкранная лента "Руки" (всей колоды в ряд) */}
      {isHandOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[10002] flex items-end justify-center pb-16 overflow-y-auto animate-in fade-in duration-500"
          onClick={() => setIsHandOpen(false)} // Закрываем по клику на фон
        >
          {/* Кнопка закрытия справа сверху */}
          <button 
            onClick={() => setIsHandOpen(false)}
            className="absolute top-10 right-10 z-[10003] text-white/30 hover:text-white hover:scale-110 active:scale-90 transition-all p-4 text-4xl font-light"
            title="Закрыть колоду"
          >
            ✕
          </button>

          <div className="absolute top-10 left-1/2 -translate-x-1/2 text-center pointer-events-none">
            <h2 className="text-4xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-lg">Ваша колода</h2>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.4em] mt-2">Нажмите на фон, чтобы закрыть</p>
          </div>

          {displayedHandInventory.length > 0 ? (
            <div
              className="flex gap-8 px-[10vw] pt-64 pb-20 overflow-x-auto overflow-y-visible max-w-full custom-scrollbar items-end select-none"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                  e.stopPropagation();
                }
              }}
              onClick={e => e.stopPropagation()} // Предотвращаем закрытие при клике на саму ленту
            >
              {getInventoryCardStacks(displayedHandInventory, allCards)
                .map(({ card, count }, idx, arr) => (
                  <div key={card.id} className="relative">
                    <GameCard
                      card={card}
                      index={idx}
                      totalCards={arr.length}
                      isInHand={true}
                      onClick={() => { 
                        if (isInteractionPending) return;
                        setSelectedCardPreviewMode('use');
                        setSelectedCard(card); 
                        setIsHandOpen(false); 
                      }}
                      onUse={canUseHandCard(card) ? () => { 
                        if (isInteractionPending) return;
                        handleCardClick(card); 
                        setIsHandOpen(false); 
                      } : undefined}
                    />
                    {count > 1 && (
                      <div className="absolute -top-3 -right-3 z-20 min-w-10 h-10 px-2 rounded-full bg-yellow-400 text-black border-2 border-black/60 shadow-[0_0_20px_rgba(250,204,21,0.45)] flex items-center justify-center text-sm font-black">
                        x{count}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-zinc-500 text-lg italic mt-20">Ваша рука пуста...</div>
          )}
        </div>
      )}

      {/* Экран МУЗЕЯ / КОЛЛЕКЦИИ */}
      {isCollectionOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/95 backdrop-blur-md z-[10002] flex flex-col items-center py-20 overflow-hidden animate-in fade-in duration-500"
          onClick={() => setIsCollectionOpen(false)}
        >
          {/* Кнопка закрытия справа сверху */}
          <button 
            onClick={() => setIsCollectionOpen(false)}
            className="absolute top-10 right-10 z-[10003] text-white/30 hover:text-white hover:scale-110 active:scale-90 transition-all p-4 text-4xl font-light"
            title="Закрыть галерею"
          >
            ✕
          </button>

          <div className="text-center mb-12 pointer-events-none">
            <h2 className="text-5xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(234,179,8,0.3)]">Галерея Артефактов</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-[0.5em] mt-4">Карты открываются после использования игроками</p>
          </div>

          <div 
            className="flex flex-wrap gap-10 justify-center overflow-y-auto px-10 pt-24 pb-20 max-w-7xl custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            {(Object.values(allCards) as GameCardType[])
              .filter((card: GameCardType) => card.rarity !== 'legendary')
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
                        src={getPublicAssetUrl("/cards/card_back.svg")}
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
                  <div key={card.id} className="relative group pb-12">
                    <GameCard
                      card={card}
                      index={0}
                      totalCards={1}
                      onClick={() => {
                        setSelectedCardPreviewMode('view');
                        setSelectedCard(card);
                      }}
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

      {/* Экран КОЛЛЕКЦИИ ЛЕГЕНД */}
      {isLegendsOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/95 backdrop-blur-md z-[10002] flex flex-col items-center py-20 overflow-hidden animate-in fade-in duration-500"
          onClick={() => setIsLegendsOpen(false)}
        >
          {/* Кнопка закрытия справа сверху */}
          <button 
            onClick={() => setIsLegendsOpen(false)}
            className="absolute top-10 right-10 z-[10003] text-white/30 hover:text-white hover:scale-110 active:scale-90 transition-all p-4 text-4xl font-light"
            title="Закрыть легенды"
          >
            ✕
          </button>

          <div className="text-center mb-12 pointer-events-none">
            <h2 className="text-5xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(234,179,8,0.3)]">Коллекция Легенд</h2>
            <p className="text-white/40 text-xs font-bold uppercase tracking-[0.5em] mt-4">Уникальные персонажи Cormorant Society</p>
          </div>

          <div 
            className="flex flex-wrap gap-10 justify-center overflow-y-auto px-10 pt-24 pb-20 max-w-7xl custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            {(Object.values(allCards) as GameCardType[])
              .filter((card: GameCardType) => card.rarity === 'legendary')
              .sort((a: GameCardType, b: GameCardType) => a.number - b.number)
              .map((card: GameCardType) => {
                const winner = players.find((player) => player.id === card.winnerId);
                const isRevealed = card.isWon || gameState.revealedCards?.includes(card.id);
                
                if (!isRevealed) {
                  return (
                    <div 
                      key={card.id}
                      className="w-80 h-[520px] rounded-[2.5rem] bg-zinc-900 border-2 border-white/5 flex flex-col items-center justify-center gap-4 relative group"
                    >
                      <img 
                        src={getPublicAssetUrl("/cards/card_back.svg")}
                        className="w-full h-full object-cover rounded-[2.5rem] opacity-20 grayscale" 
                        alt="locked" 
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-white/10 text-6xl font-black italic">?</span>
                        <span className="text-zinc-700 text-[10px] font-black uppercase tracking-widest mt-4">Скрытая Легенда</span>
                        <span className="text-zinc-800 text-[8px] font-bold mt-1 italic">#{card.number}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={card.id} className="relative group pb-12">
                    <GameCard
                      card={card}
                      index={0}
                      totalCards={1}
                      onClick={() => {
                        setSelectedCardPreviewMode('view');
                        setSelectedCard(card);
                      }}
                    />
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                      Раскрыто
                    </div>
                    {winner && (
                      <div className="absolute bottom-0 left-1/2 w-max max-w-[18rem] -translate-x-1/2 rounded-full border border-yellow-300/30 bg-black/70 px-4 py-1 text-center text-[10px] font-black uppercase tracking-wide text-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.18)]">
                        Получил легенду: {winner.login}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          
          <button className="mt-8 text-zinc-500 hover:text-white font-black uppercase text-xs tracking-widest transition-all">Нажмите в любое место, чтобы выйти</button>
        </div>
      )}

      {isWheelInfoOpen && (
        <GameWheel
          items={wheelInfoGames}
          onResult={() => {}}
          onClose={() => setIsWheelInfoOpen(false)}
          canSpin={false}
          readOnly
        />
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
                    disabled={isInteractionPending}
                    onClick={async () => {
                      if (!pendingTargetCard) return;
                      const card = pendingTargetCard;
                      const completed = await runInteractionAction(() => handlers.handleUseCard(card, player.id));
                      if (completed) setPendingTargetCard(null);
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
        gameState={gameState} // Передаем gameState
        allCards={allCards}
        isAdmin={isAdmin}
        onUpdateCoins={handlers.handleAdminUpdateCoins}
        onAddCard={handlers.handleAdminAddCard}
        onRemoveCard={handlers.handleAdminRemoveCard}
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

      <ProfileSidebar
        isOpen={isSidebarOpen}
        playerData={playerData}
        isAdmin={isAdmin}
        onClose={() => setIsSidebarOpen(false)}
        onOpenLegends={() => setIsLegendsOpen(true)}
        onOpenCollection={() => setIsCollectionOpen(true)}
        onOpenWheelInfo={() => setIsWheelInfoOpen(true)}
        onUpdateLogin={handlers.handleUpdateLogin}
        onUpdateBorderColor={handlers.handleUpdateBorderColor}
        onUpdateAvatar={handlers.updateAvatar}
        onResetGame={handlers.handleResetGameForTesting}
        onLogout={handlers.handleLogout}
        notify={notify}
      />

      {/* ЭКРАН СБРОСА КАРТЫ СОПЕРНИКА (inv_010) */}
      {gameState.activeInteraction?.type === 'discard_selection' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-red-950/95 backdrop-blur-xl z-[10010] flex h-screen flex-col items-center overflow-hidden px-4 py-5 sm:px-8 sm:py-6 animate-in fade-in duration-500">
          <style>
            {`
              @keyframes rggBlindShuffle {
                0% { transform: translate(-50%, -50%) rotate(var(--start-rot)) scale(0.92); opacity: 0.55; }
                18% { transform: translate(calc(-50% + var(--x1)), calc(-50% + var(--y1))) rotate(var(--rot1)) scale(1); opacity: 1; }
                38% { transform: translate(calc(-50% + var(--x2)), calc(-50% + var(--y2))) rotate(var(--rot2)) scale(0.97); }
                62% { transform: translate(calc(-50% + var(--x3)), calc(-50% + var(--y3))) rotate(var(--rot3)) scale(1.03); }
                82% { transform: translate(calc(-50% + var(--x4)), calc(-50% + var(--y4))) rotate(var(--rot4)) scale(0.98); opacity: 1; }
                100% { transform: translate(-50%, -50%) rotate(var(--end-rot)) scale(0.92); opacity: 0.7; }
              }
            `}
          </style>
          <div className="relative z-10 text-center mb-4 shrink-0 max-w-5xl">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-500/30 animate-pulse">
              <span className="text-4xl">✂️</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-red-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(239,68,68,0.5)] min-h-[1.2em]">
               {isShuffling ? 'Перемешиваем...' : (gameState.activeInteraction.actingCardId === 'inv_011' ? 'Забираем!' : 'Выкидываем!')}
            </h2>
            <p className="text-white/40 text-xs sm:text-sm font-bold uppercase tracking-[0.25em] sm:tracking-[0.4em] mt-3 max-w-4xl px-2">
               {gameState.activeInteraction.actingCardId === 'inv_011' ? 'Выберите карту, которую хотите ЗАБРАТЬ у игрока ' : 'Выберите карту, которую хотите УДАЛИТЬ у игрока '}
              <span className="text-white">{players.find(p => p.id === gameState.activeInteraction?.targetPlayerId)?.login}</span>
            </p>
          </div>
          
          <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden custom-scrollbar px-1 pt-3">
            <div className="min-h-full flex flex-col items-center justify-start">
            {isShuffling ? (
              /* Анимация тасовки стопки */
              <div className="relative h-[280px] sm:h-[320px] w-[520px] max-w-[88vw] scale-[0.68] sm:scale-75 mt-2 mb-4 overflow-hidden rounded-[2rem]">
                {[
                  ["-190px", "-42px", "150px", "52px", "-90px", "88px", "180px", "-72px", "-19deg", "34deg", "-28deg", "18deg", "-7deg"],
                  ["170px", "36px", "-160px", "-70px", "120px", "-96px", "-180px", "55px", "13deg", "-31deg", "26deg", "-22deg", "8deg"],
                  ["-105px", "95px", "205px", "-34px", "-170px", "-58px", "92px", "86px", "22deg", "-14deg", "36deg", "-33deg", "4deg"],
                  ["118px", "-98px", "-214px", "24px", "152px", "76px", "-70px", "-104px", "-25deg", "20deg", "-17deg", "32deg", "-5deg"],
                  ["0px", "-128px", "0px", "118px", "220px", "0px", "-220px", "0px", "5deg", "-38deg", "12deg", "-27deg", "2deg"],
                  ["-230px", "0px", "100px", "-118px", "-35px", "132px", "210px", "28px", "-8deg", "28deg", "-36deg", "21deg", "-9deg"],
                  ["224px", "0px", "-118px", "116px", "52px", "-132px", "-205px", "-34px", "18deg", "-26deg", "39deg", "-19deg", "6deg"],
                  ["-58px", "-120px", "188px", "96px", "-210px", "20px", "42px", "-128px", "-33deg", "16deg", "-21deg", "37deg", "-3deg"],
                  ["74px", "124px", "-190px", "-92px", "210px", "-18px", "-38px", "130px", "29deg", "-18deg", "24deg", "-34deg", "10deg"],
                ].map(([x1, y1, x2, y2, x3, y3, x4, y4, startRot, rot1, rot2, rot3, endRot], i) => (
                  <div 
                    key={i}
                    className="absolute left-1/2 top-[62%] w-40 h-[250px] sm:w-44 sm:h-[275px] bg-zinc-900 border-4 border-red-500/40 rounded-[1.5rem] shadow-2xl"
                    style={{ 
                      zIndex: 50 + ((i * 7) % 9),
                      animation: `rggBlindShuffle 1.35s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 35}ms both`,
                      ["--x1" as string]: x1,
                      ["--y1" as string]: y1,
                      ["--x2" as string]: x2,
                      ["--y2" as string]: y2,
                      ["--x3" as string]: x3,
                      ["--y3" as string]: y3,
                      ["--x4" as string]: x4,
                      ["--y4" as string]: y4,
                      ["--start-rot" as string]: startRot,
                      ["--rot1" as string]: rot1,
                      ["--rot2" as string]: rot2,
                      ["--rot3" as string]: rot3,
                      ["--rot4" as string]: `${(i % 2 === 0 ? 1 : -1) * (18 + i * 3)}deg`,
                      ["--end-rot" as string]: endRot,
                    }}
                  >
                    <img src={getPublicAssetUrl("/cards/card_back.svg")} className="w-full h-full object-cover rounded-[1.1rem] opacity-60" alt="Shuffling" />
                  </div>
                ))}
                <div className="absolute -inset-20 bg-red-500/10 blur-[100px] rounded-full animate-pulse" />
              </div>
            ) : (
              /* Сетка карт после перемешивания */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 sm:gap-7 justify-items-center content-start max-w-7xl w-full pt-2 pb-8 animate-in zoom-in-95 duration-500">
                {gameState.activeInteraction.cards.map((cardId: string, idx: number) => (
                  <button 
                    key={`${cardId}-${idx}`}
                    type="button"
                    disabled={isInteractionPending}
                    onClick={() => {
                      if (isInteractionPending) return;
                      if (gameState.activeInteraction?.targetPlayerId) {
                        const targetPlayerId = gameState.activeInteraction.targetPlayerId;
                        void runInteractionAction(() => handlers.handleSelectOpponentCard(targetPlayerId, cardId));
                      }
                    }}
                    className="w-36 h-[225px] sm:w-44 sm:h-[275px] rounded-[1.5rem] bg-zinc-900 border-4 border-red-500/30 cursor-pointer hover:scale-105 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center relative group pointer-events-auto disabled:pointer-events-none disabled:opacity-50"
                  >
                    <img src={getPublicAssetUrl("/cards/card_back.svg")} className="w-full h-full object-cover rounded-[1.1rem] opacity-80 group-hover:opacity-100" alt="Back" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-red-200/10 text-8xl font-black italic group-hover:text-red-200/20 transition-colors">?</span>
                    </div>
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-4 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-xl whitespace-nowrap">
                      ВЫБРАТЬ
                    </div>
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>

          <button 
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              void runInteractionAction(handlers.handleCancelInteraction);
            }}
            className="mt-12 text-white/30 hover:text-red-400 font-black uppercase text-xs tracking-[0.3em] transition-all flex items-center gap-2 group"
          >
            <span className="group-hover:rotate-90 transition-transform text-lg">✕</span> Отменить и вернуть карту
          </button>
        </div>
      )}
      <ShopAndGamblingOverlays
        gameState={gameState}
        user={user}
        playerData={playerData}
        allCards={allCards}
        protectionCardsInInv={protectionCardsInInv}
        revealedGamblingCardId={revealedGamblingCardId}
        setRevealedGamblingCardId={setRevealedGamblingCardId}
        hasGoldenCard={hasGoldenCard}
        getBaseCardPrice={getBaseCardPrice}
        getCardPrice={getCardPrice}
        isInteractionPending={isInteractionPending}
        runInteractionAction={runInteractionAction}
        handlers={handlers}
      />

      {/* ЭКРАН ОТВЕТА НА ВЫЗОВ НА ДУЭЛЬ */}
      {gameState.activeInteraction?.type === 'reflect_response' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-cyan-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-10 max-w-2xl">
            <h2 className="text-5xl font-black text-cyan-300 uppercase italic tracking-tighter">А может тебя?</h2>
            <p className="text-white/50 text-sm font-bold uppercase tracking-[0.3em] mt-4">
              {getPlayerById(gameState.activeInteraction.targetPlayerId)?.login || 'Игрок'} сыграл против вас карту
            </p>
            <p className="mt-3 text-2xl font-black text-white">
              "{allCards[gameState.activeInteraction.actingCardId || '']?.name || 'Игрок'}"
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 min-w-80">
            <button
              disabled={isInteractionPending}
              onClick={() => {
                if (isInteractionPending) return;
                void runInteractionAction(() => handlers.handleReflectResponse(true));
              }}
              className="w-full bg-cyan-400 text-black px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all disabled:opacity-50"
            >
              Отразить картой
            </button>
            <button
              disabled={isInteractionPending}
              onClick={() => {
                if (isInteractionPending) return;
                void runInteractionAction(() => handlers.handleReflectResponse(false));
              }}
              className="w-full bg-zinc-800 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-700 transition-all disabled:opacity-50"
            >
              Не отражать
            </button>
          </div>
        </div>
      )}

      {gameState.activeInteraction?.type === 'move_for_coins_selection' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-emerald-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-10">
            <h2 className="text-5xl font-black text-emerald-300 uppercase italic tracking-tighter">Оплатить движение</h2>
            <p className="text-white/50 text-sm font-bold uppercase tracking-[0.3em] mt-4">
              Монеты: {playerData.tiltCoins ?? 0}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-5 min-w-80">
            <input
              type="number"
              min={1}
              max={Math.min(playerData.tiltCoins ?? 0, 6)}
              value={coinsToPay}
              onChange={(event) => {
                const max = Math.max(1, Math.min(playerData.tiltCoins ?? 0, 6));
                const next = Math.max(1, Math.min(max, Number(event.target.value) || 1));
                setCoinsToPay(next);
              }}
              className="w-24 bg-black/50 border border-emerald-400/40 rounded-xl px-4 py-3 text-center text-2xl font-black text-emerald-200"
            />
            <div className="flex gap-3">
              <button
                disabled={isInteractionPending || (playerData.tiltCoins ?? 0) <= 0}
                onClick={() => {
                  if (isInteractionPending) return;
                  void runInteractionAction(() => handlers.handleConfirmMoveForCoins(coinsToPay));
                }}
                className="bg-emerald-500 text-black px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all disabled:opacity-50"
              >
                Подтвердить
              </button>
              <button
                disabled={isInteractionPending}
                onClick={() => {
                  if (isInteractionPending) return;
                  void runInteractionAction(handlers.handleCancelInteraction);
                }}
                className="bg-zinc-800 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-700 transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      <TaxResponseOverlay
        interaction={gameState.activeInteraction}
        user={user}
        getPlayerById={getPlayerById}
        isInteractionPending={isInteractionPending}
        runInteractionAction={runInteractionAction}
        onTaxResponse={handlers.handleTaxResponse}
      />
      {gameState.activeInteraction?.type === 'duel_challenge_response' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-purple-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-purple-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">Вызов на дуэль!</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">
              Игрок <span className="text-white">{players.find(p => p.id === gameState.activeInteraction?.targetPlayerId)?.login}</span> вызвал вас на дуэль!
            </p>
            <p className="text-white/60 text-xs font-medium mt-2">
              Подготовьтесь отстоять свою честь.
            </p>
          </div>

          <div className="flex flex-col gap-6 items-center">
            {gameState.activeInteraction.cards.includes("inv_006") && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-6 rounded-[2rem] flex flex-col items-center gap-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-700">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-yellow-300 uppercase tracking-[0.3em]">У вас есть карта защиты!</span>
                  <p className="text-white/40 text-[9px] font-medium">Вы можете избежать дуэли, потратив карту "No, no, no mr. Fish"</p>
                </div>
                <button
                  disabled={isInteractionPending}
                  onClick={() => {
                    if (isInteractionPending) return;
                    const duelId = gameState.activeInteraction?.duelId;
                    if (!duelId) return;
                    void runInteractionAction(() => handlers.handleDuelChallengeResponse(duelId, 'use_protection'));
                  }}
                  className="bg-yellow-500 text-black px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
                >
                  Использовать "No, no, no mr. Fish"
                </button>
              </div>
            )}

            <button
              disabled={isInteractionPending}
              onClick={() => {
                if (isInteractionPending) return;
                const duelId = gameState.activeInteraction?.duelId;
                if (!duelId) return;
                void runInteractionAction(() => handlers.handleDuelChallengeResponse(duelId, 'accept'));
              }}
              className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_5px_0_#6d28d9] active:shadow-none active:translate-y-1"
            >
              Принять вызов
            </button>

            <button
              disabled={isInteractionPending}
              onClick={() => {
                if (isInteractionPending) return;
                const duelId = gameState.activeInteraction?.duelId;
                if (!duelId) return;
                void runInteractionAction(() => handlers.handleDuelChallengeResponse(duelId, 'decline'));
              }}
              className="bg-zinc-800 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-zinc-700 transition-all active:scale-95 shadow-[0_5px_0_#27272a] active:shadow-none active:translate-y-1"
            >
              Отказаться и заплатить 3
            </button>
          </div>
        </div>
      )}

      {/* ЭКРАН ВЫБОРА ОРУЖИЯ ДЛЯ ДУЭЛИ */}
      {gameState.activeInteraction?.type === 'duel_weapon_selection' && (
        gameState.activeInteraction.playerId === user?.uid ? (
          /* ДИАЛОГОВОЕ ОКНО ДЛЯ ВЫБИРАЮЩЕГО */
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[10010] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-zinc-900 border-2 border-purple-500/50 p-10 rounded-[3rem] w-full max-w-xl flex flex-col items-center shadow-[0_0_80px_rgba(168,85,247,0.2)]">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-black text-purple-400 uppercase italic tracking-tighter drop-shadow-md">Выберите оружие</h2>
                <p className="text-white/40 text-xs font-bold uppercase tracking-[0.3em] mt-2">Ваш ход в дуэли</p>
              </div>
              
              <div className="flex gap-6">
                <button 
                  disabled={isInteractionPending}
                  onClick={() => {
                    if (isInteractionPending) return;
                    const duelId = gameState.activeInteraction?.duelId;
                    if (!duelId) return;
                    void runInteractionAction(() => handlers.handleSelectDuelWeapon(duelId, 'dice'));
                  }}
                  className="group relative bg-purple-600 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_8px_0_#6d28d9] active:shadow-none active:translate-y-1 disabled:opacity-50 overflow-hidden"
                >
                  <span className="relative z-10">Кубики</span>
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <button 
                  disabled={isInteractionPending}
                  onClick={() => {
                    if (isInteractionPending) return;
                    const duelId = gameState.activeInteraction?.duelId;
                    if (!duelId) return;
                    void runInteractionAction(() => handlers.handleSelectDuelWeapon(duelId, 'game'));
                  }}
                  className="group relative bg-purple-600 text-white px-12 py-5 rounded-[2rem] font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_8px_0_#6d28d9] active:shadow-none active:translate-y-1 disabled:opacity-50 overflow-hidden"
                >
                  <span className="relative z-10">Игра по выбору</span>
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* НЕБОЛЬШОЕ УВЕДОМЛЕНИЕ ДЛЯ ОСТАЛЬНЫХ */
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[10010] animate-in slide-in-from-top-4 fade-in duration-500 pointer-events-none w-full max-w-sm px-4">
            <div className="bg-purple-900/40 border border-purple-500/40 backdrop-blur-xl px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 border-l-4 border-l-purple-400">
              <div className="relative shrink-0">
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-ping absolute inset-0" />
                <div className="w-3 h-3 bg-purple-400 rounded-full relative" />
              </div>
              <div className="flex flex-col">
                <span className="text-purple-400 text-[9px] font-black uppercase tracking-[0.3em]">Дуэль</span>
                <span className="text-white text-xs font-bold mt-0.5 leading-tight">
                  {players.find(p => p.id === gameState.activeInteraction?.playerId)?.login || 'Игрок'} выбирает оружие...
                </span>
              </div>
            </div>
          </div>
        )
      )}

      {/* ЭКРАН ВВОДА СТАВОК ДЛЯ ДУЭЛИ */}
      {gameState.activeInteraction?.type === 'duel_betting' && gameState.activeInteraction.duelId && (
        <div className="fixed inset-0 bg-purple-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-purple-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">Дуэль: Ставки!</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">
              {gameState.activeInteraction.playerId === user?.uid
                ? `Ваш ход сделать ставку против ${getPlayerById(gameState.activeInteraction.targetPlayerId)?.login}.`
                : `Ожидаем ставку от ${getPlayerById(gameState.activeInteraction.playerId)?.login}.`}
            </p>
            {gameState.activeDuels[gameState.activeInteraction.duelId]?.weapon === 'dice' && (
              <p className="text-white/60 text-xs font-medium mt-2">
                Оружие: Кубики. Победитель забирает весь банк.
              </p>
            )}
           {gameState.activeDuels[gameState.activeInteraction.duelId]?.weapon === 'game' && (
              <p className="text-white/60 text-xs font-medium mt-2">
                Оружие: Игра по выбору. Победитель забирает весь банк.
              </p>
            )}
            <p className="text-white/50 text-sm font-bold uppercase tracking-[0.3em] mt-4">
              Ваши коины: {playerData.tiltCoins ?? 0} 🦖
            </p>
          </div>

          {gameState.activeInteraction.playerId === user?.uid && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-5 min-w-80">
              <input
                type="number"
                min={1}
                value={duelBetAmount}
                onChange={(event) => {
                  const next = Math.max(1, Math.floor(Number(event.target.value) || 1));
                  setDuelBetAmount(next);
                }}
                className="w-24 bg-black/50 border border-purple-400/40 rounded-xl px-4 py-3 text-center text-2xl font-black text-purple-200"
              />
              {(playerData.tiltCoins ?? 0) < duelBetAmount && (
                <p className="max-w-72 text-center text-xs font-bold text-yellow-300">
                  Вы уйдете в минус, если проиграете.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  disabled={isInteractionPending || duelBetAmount <= 0}
                  onClick={() => {
                    if (isInteractionPending) return;
                    const duelId = gameState.activeInteraction?.duelId;
                    if (!duelId) return;
                    void runInteractionAction(() => handlers.handlePlaceDuelBet(duelId, duelBetAmount));
                  }}
                  className="bg-purple-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-purple-500 transition-all disabled:opacity-50"
                >
                  Сделать ставку {duelBetAmount} 🦖
                </button>
                <button
                  disabled={isInteractionPending}
                  onClick={() => {
                    if (isInteractionPending) return;
                    void runInteractionAction(handlers.handleCancelInteraction);
                  }}
                  className="bg-zinc-800 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-700 transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ПАНЕЛЬ АДМИНА ДЛЯ ПОДВЕДЕНИЯ ИТОГОВ ДУЭЛИ (Weapon: Game) */}
      {isAdmin && Object.values(gameState.activeDuels || {}).some(d => d.status === 'admin_wait') && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[10020] w-full max-w-lg px-4 animate-in slide-in-from-top-10 duration-500">
          {Object.values(gameState.activeDuels)
            .filter(duel => duel.status === 'admin_wait')
            .map(duel => {
              const challenger = getPlayerById(duel.challengerId);
              const target = getPlayerById(duel.targetId);
              const pot = (duel.bets[duel.challengerId] || 0) + (duel.bets[duel.targetId] || 0);

              return (
                <div key={duel.id} className="bg-zinc-900 border-2 border-yellow-500/50 p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                  <div className="text-center mb-6">
                    <span className="text-yellow-500 text-[10px] font-black uppercase tracking-[0.4em]">Панель Судьи</span>
                    <h3 className="text-white text-xl font-black italic uppercase mt-1">Кто победил в мини-игре?</h3>
                    <p className="text-zinc-500 text-xs mt-2">Банк дуэли: <span className="text-green-400 font-bold">{pot} 🦖</span></p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      disabled={isInteractionPending}
                      onClick={() => void runInteractionAction(() => handlers.handleFinishDuel(duel.id, duel.challengerId))}
                      className="flex flex-col items-center gap-2 bg-white/5 hover:bg-purple-500/20 border border-white/10 p-4 rounded-2xl transition-all group"
                    >
                      <img src={challenger?.avatar || FALLBACK_AVATAR} className="w-12 h-12 rounded-full border-2 border-purple-500 shadow-lg" alt="P1" />
                      <span className="text-white font-bold text-xs truncate w-full text-center">{challenger?.login}</span>
                      <span className="text-[9px] text-purple-400 font-black uppercase">Победитель</span>
                    </button>

                    <button
                      disabled={isInteractionPending}
                      onClick={() => void runInteractionAction(() => handlers.handleFinishDuel(duel.id, duel.targetId))}
                      className="flex flex-col items-center gap-2 bg-white/5 hover:bg-emerald-500/20 border border-white/10 p-4 rounded-2xl transition-all group"
                    >
                      <img src={target?.avatar || FALLBACK_AVATAR} className="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-lg" alt="P2" />
                      <span className="text-white font-bold text-xs truncate w-full text-center">{target?.login}</span>
                      <span className="text-[9px] text-emerald-400 font-black uppercase">Победитель</span>
                    </button>
                  </div>

                  <button
                    disabled={isInteractionPending}
                    onClick={() => void runInteractionAction(() => handlers.handleFinishDuel(duel.id, 'draw'))}
                    className="w-full mt-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all"
                  >
                    Объявить ничью (возврат ставок)
                  </button>
                </div>
              );
            })
          }
        </div>
      )}

      {/* ЭКРАН ГОТОВНОСТИ К БРОСКУ ДЛЯ ДУЭЛИ */}
      {gameState.activeInteraction?.type === 'duel_ready_to_roll' && gameState.activeInteraction.duelId && (
        <div className="fixed inset-0 bg-purple-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-purple-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">Дуэль: Готовы?</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">
              {gameState.activeInteraction.playerId === user?.uid
                ? `Нажмите "Бросить кубики", чтобы начать дуэль против ${getPlayerById(gameState.activeInteraction.targetPlayerId)?.login}.`
                : `Ожидаем, пока ${getPlayerById(gameState.activeInteraction.playerId)?.login} бросит кубики.`}
            </p>
          </div>

          {gameState.activeInteraction.playerId === user?.uid && (
            <button
              disabled={isInteractionPending}
              onClick={() => {
                if (isInteractionPending) return;
                const duelId = gameState.activeInteraction?.duelId;
                if (!duelId) return;
                void runInteractionAction(() => handlers.handleStartDuelRoll(duelId));
              }}
              className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_5px_0_#6d28d9] active:shadow-none active:translate-y-1 disabled:opacity-50"
            >
              Бросить кубики!
            </button>
          )}
        </div>
      )}

      <GameAlertOverlay alert={gameAlert} allCards={allCards} onClose={() => setGameAlert(null)} />

      {/* Визуализация броска кубика */}
      {visualRoll && (
        <DiceVisual 
          value={visualRoll.value} 
          isRolling={visualRoll.rolling} 
          playerName={visualRoll.playerName} 
        />
      )}

      {/* Визуализация броска кубиков для дуэли */}
      {cardVisualRoll && !visualRoll && !duelVisualRoll && (
        <DiceVisual
          value={cardVisualRoll.value}
          isRolling={cardVisualRoll.rolling}
          playerName={cardVisualRoll.playerName}
        />
      )}

      {duelVisualRoll && (
        <DuelDiceVisual
          challengerRoll={duelVisualRoll.challenger.value}
          challengerName={duelVisualRoll.challenger.playerName}
          targetRoll={duelVisualRoll.target.value}
          targetName={duelVisualRoll.target.playerName}
          isRolling={duelVisualRoll.challenger.rolling || duelVisualRoll.target.rolling}
        />
      )}

      {isInteractionPending && <InteractionPendingOverlay />}

      {/* Всплывающие уведомления (Toasts) */}
      <ToastContainer 
        toasts={toasts} 
        removeToast={(id) => setToasts(prev => prev.filter(t => t.id !== id))} 
        allCards={allCards} 
      />

      {/* Лог игровых событий */}
      <EventLog 
        gameEvents={gameEvents} 
        allCards={allCards} 
        players={players} 
        onClear={handleClearEventLog}
        isClearing={isClearingEventLog}
        canClear={isAdmin}
      />
    </div>
  );
}

export default AppClean;
