/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Auth from "./Auth";
import { syncWheelResult, syncWheelVisibility } from "../services/gameStateService"; 
import BottomPanel from "./BottomPanel";
import GameBoard from "./GameBoard";
import PlayersSidebar from "./PlayersSidebar";
import ScoresDetailsPage from "./ScoresDetailsPage";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase";
//import { v4 as uuidv4 } from 'uuid'; 

import type { Player } from "../types/game";
import type { GameCard as GameCardType } from "../types/card";
import { useGameData } from "./useGameData";
import { useModalStates } from "../components/useModalStates";
import GameCard from "./GameCard";
import DiceVisual from "./DiceVisual";
import DuelDiceVisual from "./DuelDiceVisual"; // Import the new component
import { FALLBACK_AVATAR, PHASE_LABELS, AURA_COLORS } from "./gameConstants";
import type { GameEvent, ToastNotification } from "./useModalStates";

// New conceptual components for notifications
const ToastContainer: React.FC<{ toasts: ToastNotification[], removeToast: (id: string) => void, allCards: Record<string, GameCardType> }> = ({ toasts, removeToast, allCards }) => {
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
          {looksLikeMojibake(toast.message) ? fallbackToastMessage(toast.type) : toast.message}
          {/* Предпросмотр карты при наведении */}
          {toast.cardId && allCards[toast.cardId] && ( 
            // TODO: Реализовать всплывающее превью карты при наведении
            <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {/* Mini card preview here */}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const EventLog: React.FC<{ gameEvents: GameEvent[], allCards: Record<string, GameCardType>, players: Player[] }> = ({ gameEvents, allCards, players }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const getPlayerLogin = (playerId?: string) => players.find(p => p.id === playerId)?.login || 'Неизвестный';
  void getPlayerLogin;
  return (
    <div className={`fixed top-1/2 -translate-y-1/2 left-0 h-1/2 w-80 z-30 transition-transform duration-300 ${isCollapsed ? '-translate-x-full' : 'translate-x-0'}`}>
      <div className="h-full w-full bg-black/40 backdrop-blur-md border-r border-white/10 p-4 overflow-y-auto">
        <h3 className="text-white text-lg font-bold mb-4">Лог событий</h3>
        <div className="flex flex-col gap-2">
          {gameEvents.map(event => {
            const eventMessage = looksLikeMojibake(event.message)
              ? fallbackEventMessage(event, allCards, players)
              : event.message;

            return (
            <div key={event.id} className="text-xs text-zinc-400">
              <span className="text-zinc-600 mr-2">[{new Date(event.timestamp).toLocaleTimeString()}]</span>
              <span className={`
                ${event.type === 'success' ? 'text-green-400' :
                  event.type === 'error' ? 'text-red-400' :
                  event.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'}
              `}>
                {eventMessage}
              </span>
              {event.cardId && allCards[event.cardId] && (
                <span className="ml-1 text-purple-300 cursor-help hover:underline">
                  ({allCards[event.cardId].name})
                </span>
              )}
            </div>
            );
          })}
        </div>
      </div>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute left-full top-0 mt-4 h-10 w-8 bg-black/60 backdrop-blur-md border border-l-0 border-white/20 flex items-center justify-center text-white/70 hover:text-white rounded-r-xl shadow-2xl transition-all"
        title={isCollapsed ? "Развернуть лог" : "Свернуть лог"}
      >
        <span className="text-[10px] transition-transform duration-300" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>◀</span>
      </button>
    </div>
  );
};

const removeUndefinedFields = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedFields) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefinedFields(entryValue)])
    ) as T;
  }

  return value;
};

const looksLikeMojibake = (value?: string | null) =>
  !!value && /(Р\s?[ВРС]|РЋ|Р†|РЎ|Рџ|Рќ|Р”|Р‘|Р’|СЃ|СЊ|С‹|С‚|С€|вЂ|�)/.test(value);

const fallbackToastMessage = (type: ToastNotification['type']) => {
  if (type === 'success') return 'Действие выполнено.';
  if (type === 'error') return 'Произошла ошибка. Подробности в консоли.';
  if (type === 'warning') return 'Проверьте условия действия.';
  return 'Событие обновлено.';
};

const fallbackEventMessage = (
  event: GameEvent,
  allCards: Record<string, GameCardType> = {},
  players: Player[] = [],
) => {
  const playerName = players.find((player) => player.id === event.playerId)?.login;
  const targetName = players.find((player) => player.id === event.targetPlayerId)?.login;
  const cardName = event.cardId ? allCards[event.cardId]?.name ?? event.cardId : null;
  const actor = playerName ?? 'Игрок';

  if (event.type === 'card_play') {
    return cardName
      ? `${actor} использует карту "${cardName}"${targetName ? ` на ${targetName}` : ''}.`
      : `${actor} использует карту.`;
  }
  if (event.type === 'coin_change') return `${actor}: изменение монет.`;
  if (event.type === 'movement') return `${actor}: событие перемещения.`;
  if (event.type === 'duel') return targetName ? `Дуэль: ${actor} и ${targetName}.` : 'Событие дуэли.';
  if (event.type === 'status_effect') return cardName ? `${actor}: эффект карты "${cardName}".` : `${actor}: эффект статуса.`;
  if (event.type === 'error') return 'Ошибка действия. Подробности в консоли.';
  if (event.type === 'warning') return 'Предупреждение игры.';
  if (event.type === 'success') return 'Действие выполнено.';
  return 'Событие игры.';
};

const RARITY_ORDER: Record<string, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

function AppClean() {
  const {
    isSidebarOpen, setIsSidebarOpen,
    isAvatarModalOpen, setIsAvatarModalOpen,
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

  const notify = useCallback((message: string, type: ToastNotification['type'] = 'info', cardId?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const safeMessage = looksLikeMojibake(message) ? fallbackToastMessage(type) : message;
    setToasts(prev => [
      ...prev,
      { id, message: safeMessage, type, cardId, timestamp: Date.now() },
    ]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, type === 'error' ? 7000 : 4500);
  }, [setToasts]);

  const logEvent = useCallback(async (event: GameEvent) => {
    const safeEvent = {
      ...event,
      message: looksLikeMojibake(event.message)
        ? fallbackEventMessage(event)
        : event.message,
    };

    setLocalEvents(prev => [safeEvent, ...prev].slice(0, 100));
    try {
      await addDoc(collection(db, "gameEvents"), removeUndefinedFields(safeEvent));
    } catch (e) {
      console.error("Firestore log error:", e);
    }
  }, [setLocalEvents]);

  const {
    user, playerData, loading, players, gameState, allCards, gameEvents,
    isAdmin, currentTurnPlayerId, canRoll, canConfirmRoll,
    handlers, getPlayerById
  } = useGameData(notify, logEvent);
  const visibleGameEvents = useMemo(() => {
    const seen = new Set<string>();
    return [...localEvents, ...gameEvents]
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 100);
  }, [gameEvents, localEvents]);

  const getCardPrice = (card: GameCardType) => {
    const hasGoldenCard = playerData?.inventory?.includes("inv_021") ?? false;
    const defaultPrices = { common: 3, rare: 7, epic: 15, legendary: 0, default: 0 };
    const basePrice = card.price !== null ? card.price : defaultPrices[card.rarity] || defaultPrices.default;
    return hasGoldenCard && card.id !== "inv_021" ? Math.max(1, Math.ceil(basePrice / 2)) : basePrice;
  };

  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [coinNotification, setCoinNotification] = useState<{ amount: number; type: 'gain' | 'loss' } | null>(null);

  const [visualRoll, setVisualRoll] = useState<{ value: number; rolling: boolean; playerName: string } | null>(null);
  const [coinsToPay, setCoinsToPay] = useState<number>(1); // New state for coin input
  const lastProcessedRollRef = useRef<string | null>(null);
  const scheduledDuelRollRef = useRef<string | null>(null);
  const lastShownNotifRef = useRef<number>(0);
  const lastShownCardMoveRef = useRef<string | null>(null);

  const [isShuffling, setIsShuffling] = useState(false);
  const [isInteractionPending, setIsInteractionPending] = useState(false);
  const [duelBetAmount, setDuelBetAmount] = useState<number>(1); // New state for duel bet amount
  const [duelVisualRoll, setDuelVisualRoll] = useState<{
    challenger: { value: number; rolling: boolean; playerName: string };
    target: { value: number; rolling: boolean; playerName: string };
    duelId: string;
  } | null>(null);

  useEffect(() => {
    // Сбрасываем блокировку, если нет активного интерактива, закончилась анимация тасовки 
    // или обновился инвентарь (значит действие карты применилось)
    if (!gameState.activeInteraction && !isShuffling) {
      setIsInteractionPending(false);
    }
  }, [gameState.activeInteraction, isShuffling, playerData?.inventory, gameState.rollConfirmed]);

  useEffect(() => {
    setIsInteractionPending(false);
  }, [
    gameState.activeInteraction?.type,
    gameState.activeInteraction?.playerId,
    gameState.activeInteraction?.duelId,
  ]);

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
    // Показываем только если уведомление свежее (проверяем по timestamp)
    if (notif && notif.timestamp > lastShownNotifRef.current) {
      lastShownNotifRef.current = notif.timestamp;
      setGameAlert({
        title: "Внимание!",
        message: looksLikeMojibake(notif.message) ? fallbackToastMessage('info') : notif.message,
        type: 'warning',
        cardId: notif.cardId
      });
    }
  }, [playerData]);

  useEffect(() => {
    const notif = user?.uid ? gameState.notifications?.[user.uid] : null;
    if (notif && notif.timestamp > lastShownNotifRef.current) {
      lastShownNotifRef.current = notif.timestamp;
      setGameAlert({
        title: "Внимание!",
        message: notif.message,
        type: 'warning',
        cardId: notif.cardId
      });
    }
  }, [gameState.notifications, user?.uid, setGameAlert]);

  useEffect(() => {
    const cardMove = gameState.cardMove;
    if (!cardMove || cardMove.targetId !== user?.uid || lastShownCardMoveRef.current === cardMove.id) return;

    lastShownCardMoveRef.current = cardMove.id;
    setGameAlert({
      title: "Вашей фишкой управляют",
      message: `Вашей фишкой управляет игрок "${cardMove.controllerName ?? "игрок"}" из-за карты "${cardMove.cardName ?? "карта"}".`,
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
      }, 2500); // Total animation time + a bit
    } else {
      scheduledDuelRollRef.current = null;
    }
  }, [gameState.activeDuels, handlers, getPlayerById]);

  // Проверка: требует ли карта выбора цели?
  const cardNeedsTarget = (card: GameCardType) => {
    const targetActions = ['steal_coins', 'steal_card', 'discard_card', 'duel', 'judge_coins', 'freeze_player', 'reflect_debuff', 'move_target_for_coins', 'move_target_and_self', 'pay_or_move_back', 'communism']; // inv_019 does not require target
    return card.requiresTarget || targetActions.includes(card.action);
  };

  const protectionCardsInInv = playerData?.inventory
    ?.map((id: string) => allCards[id])
    .filter((c): c is GameCardType => !!c && c.action === "protection") || [];

  const canTargetSelf = (card: GameCardType) => card.id === "inv_007";

  const selectableTargets = players.filter((player) => {
    if (!player.inGame || player.role === "admin") return false;
    if (player.id === user?.uid) return !!pendingTargetCard && canTargetSelf(pendingTargetCard);
    return true;
  });

  const handleCardClick = async (card: GameCardType) => {
    if (isInteractionPending) return;

    // Предварительная проверка правил использования (дублируем логику из хука для UI)
    if (!isAdmin) {
      const { phase, currentRoll, showWheel } = gameState;
      const isProtection = card.action === 'protection';
      const isFish = card.action === 'fish_protection';
      const isWheelCard = card.action === 'spin_wheel';
      const isExtraRoll = card.action === 'extra_roll';
      const isReflect = card.action === 'reflect_debuff';
      const isMovement = card.action === 'move_steps' || card.action === 'move_target_for_coins' || card.action === 'move_target_and_self';
      const isPromoCode = card.action === 'promo_code_benefit';

      if (phase === 'next_game' && !isWheelCard && !(isFish && showWheel)) {
        setGameAlert({ title: "Стоп!", message: "В этой фазе можно использовать только карту 'Подкрутка'!", type: 'warning', cardId: card.id });
        return;
      }
      
      if (phase === 'turn') {
        // Защиту, Отражение и Промокодик можно всегда. Остальное только в свой ход.
        if (!isProtection && !isFish && !isReflect && !isPromoCode && currentTurnPlayerId !== user?.uid) {
          setGameAlert({ title: "Не твой ход", message: "Обычные карты можно использовать только в свою очередь.", type: 'info', cardId: card.id });
          return;
        }

        if (isMovement && gameState.rollConfirmed) {
          setGameAlert({ title: "Движение начато", message: "Использовать карту перемещения можно только до подтверждения хода.", type: 'warning', cardId: card.id });
          return;
        }

        // Обычные карты (не движение, не защита, не переброс) только ДО броска
        const isSpecialAction = isProtection || isFish || isExtraRoll || isMovement;
        const isMyRollDone = currentRoll !== null && gameState.currentRollPlayerId === user?.uid;
        
        if (!isSpecialAction && isMyRollDone) {
          setGameAlert({ title: "Кубик брошен", message: "Обычные карты (не движение и не защита) используются ДО броска.", type: 'warning', cardId: card.id });
          return;
        }

        if (isExtraRoll && currentRoll === null) {
          setGameAlert({ title: "Рано!", message: "Сначала бросьте кубик, чтобы использовать переброс!", type: 'info' });
          return;
        }
      } else if (phase !== 'next_game' && !isFish) {
        setGameAlert({ title: "Заблокировано", message: "Использование карт в этой фазе запрещено.", type: 'warning', cardId: card.id });
        return;
      }
    }

    if (card.action === 'protection' && playerData?.hasProtection) {
      setGameAlert({ title: "Уже защищен", message: "У вас уже активно Силовое поле! Не стоит тратить карту впустую.", type: 'info', cardId: card.id });
      return;
    }

    if (card.action === 'passive_benefit') {
      setGameAlert({ title: "Пассивная карта", message: "Эта карта работает автоматически и не тратится при нажатии.", type: 'info', cardId: card.id });
      return;
    }

    if (cardNeedsTarget(card)) {
      setPendingTargetCard(card);
      setSelectedCard(null); // Закрываем предпросмотр, чтобы не мешал выбирать цель
    } else {
      setIsInteractionPending(true); // Устанавливаем pending перед вызовом
      try {
        await handlers.handleUseCard(card); // Делаем вызов асинхронным
        setSelectedCard(null); 
      } finally {
        setIsInteractionPending(false); // Гарантируем сброс состояния после завершения или ошибки
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

  const handleConfirmAvatar = () => {
    void handlers.updateAvatar(newAvatarUrl);
    setIsAvatarModalOpen(false);
    setNewAvatarUrl("");
  }

  // Блокировка прокрутки фона при открытых полноэкранных окнах (магазин, гемблинг, выбор карты)
  useEffect(() => {
    const shouldLock = !!gameState.activeInteraction || isHandOpen || isCollectionOpen || isLegendsOpen;
    if (shouldLock) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [gameState.activeInteraction, isHandOpen, isCollectionOpen, isLegendsOpen]);

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
                      if (isInteractionPending) return;
                      setIsInteractionPending(true);
                      void handlers.handleConfirmRoll();
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
            onResetGame={handlers.handleResetGameForTesting}
            onConfirmRoll={handlers.handleConfirmRoll}
            canConfirmRoll={canConfirmRoll}
            onToggleWheel={() => void syncWheelVisibility("current", !gameState.showWheel)}
            isDiceRolling={visualRoll?.rolling ?? false}
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
              if (isInteractionPending) return;
              handleCardClick(selectedCard);
              setSelectedCard(null);
            }}
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

          {playerData?.inventory && playerData.inventory.length > 0 ? (
            <div
              className="flex gap-8 px-[10vw] pt-24 pb-20 overflow-x-auto overflow-y-visible max-w-full custom-scrollbar items-end select-none"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  // Убираем scroll-smooth из классов контейнера, чтобы убрать задержку (лаги).
                  // Теперь прокрутка колесиком будет отзывчивой и быстрой.
                  e.currentTarget.scrollLeft += e.deltaY * 1.2;
                  // Останавливаем всплытие, чтобы не дергался фон
                  e.stopPropagation();
                  // Сдвигаем горизонтально 1 к 1 для предсказуемости
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              onClick={e => e.stopPropagation()} // Предотвращаем закрытие при клике на саму ленту
            >
              {playerData.inventory
                .map(cardId => allCards[cardId])
                .filter((c): c is GameCardType => !!c) // Отфильтровываем null/undefined карты
                .sort((cardA, cardB) => {
                  const rarityValA = RARITY_ORDER[cardA.rarity] || 99; 
                  const rarityValB = RARITY_ORDER[cardB.rarity] || 99;

                  if (rarityValA !== rarityValB) {
                    return rarityValA - rarityValB;
                  }
                  return cardA.number - cardB.number;
                })
                .map((card, idx, arr) => (
                  <GameCard
                    key={`${card.id}-${idx}`} // Используем ID карты для ключа, чтобы избежать проблем при изменении порядка
                    card={card}
                    index={idx}
                    totalCards={arr.length}
                    isInHand={true}
                    onClick={() => { 
                      if (isInteractionPending) return;
                      setSelectedCard(card); 
                      setIsHandOpen(false); 
                    }}
                    onUse={() => { 
                      if (isInteractionPending) return;
                      handleCardClick(card); 
                      setIsHandOpen(false); 
                    }}
                  />
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
                        <span className="text-zinc-700 text-[10px] font-black uppercase tracking-widest mt-4">Скрытая Легенда</span>
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
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
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
                    disabled={isInteractionPending}
                    onClick={async () => {
                      if (!pendingTargetCard) return;
                      setIsInteractionPending(true);
                      try {
                        await handlers.handleUseCard(pendingTargetCard, player.id);
                      } finally {
                        setIsInteractionPending(false);
                      }
                      setPendingTargetCard(null); // Очищаем модальное окно выбора цели
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


             {/* Кнопка открытия коллекции */}
            <button
              onClick={() => {
                setIsLegendsOpen(true);
                setIsSidebarOpen(false);
              }}
              className="w-full py-4 mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center gap-3 group hover:bg-yellow-500/20 transition-all active:scale-95"
            >
              <span className="text-xl group-hover:rotate-12 transition-transform">👑</span>
              <span className="text-yellow-500 font-black uppercase text-xs tracking-widest">Коллекция Легенд</span>
            </button>

                 {/* Кнопка открытия коллекции артефактов */}
            <button
              onClick={() => {
                setIsCollectionOpen(true);
                setIsSidebarOpen(false);
              }}
              className="w-full py-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-center justify-center gap-3 group hover:bg-yellow-500/20 transition-all active:scale-95"
            >
              <span className="text-xl group-hover:rotate-12 transition-transform">🏺</span>
              <span className="text-yellow-500 font-black uppercase text-xs tracking-widest">Галерея Артефактов</span>
            </button>

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

      {/* ЭКРАН СБРОСА КАРТЫ СОПЕРНИКА (inv_010) */}
      {gameState.activeInteraction?.type === 'discard_selection' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-red-950/95 backdrop-blur-xl z-[10010] flex flex-col items-center justify-start overflow-y-auto py-20 px-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30 animate-pulse">
              <span className="text-4xl">✂️</span>
            </div>
            <h2 className="text-6xl font-black text-red-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(239,68,68,0.5)] min-h-[1.2em]">
               {isShuffling ? 'Перемешиваем...' : (gameState.activeInteraction.actingCardId === 'inv_011' ? 'Забираем!' : 'Выкидываем!')}
            </h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">
               {gameState.activeInteraction.actingCardId === 'inv_011' ? 'Выберите карту, которую хотите ЗАБРАТЬ у игрока ' : 'Выберите карту, которую хотите УДАЛИТЬ у игрока '}
              <span className="text-white">{players.find(p => p.id === gameState.activeInteraction?.targetPlayerId)?.login}</span>
            </p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] w-full">
            {isShuffling ? (
              /* Анимация тасовки стопки */
              <div className="relative scale-110 mb-20">
                {[...Array(5)].map((_, i) => (
                  <div 
                    key={i}
                    className="absolute inset-0 w-48 h-[300px] bg-zinc-900 border-4 border-red-500/40 rounded-[1.5rem] shadow-2xl animate-pulse"
                    style={{ 
                      transform: `rotate(${i * 6 - 12}deg) translate(${i * 4}px, ${i * 2}px)`,
                      zIndex: 50 - i
                    }}
                  >
                    <img src="/cards/card_back.svg" className="w-full h-full object-cover rounded-[1.1rem] opacity-60" alt="Shuffling" />
                  </div>
                ))}
                <div className="absolute -inset-20 bg-red-500/10 blur-[100px] rounded-full animate-pulse" />
              </div>
            ) : (
              /* Сетка карт после перемешивания */
              <div className="flex flex-wrap gap-8 justify-center max-w-7xl pb-20 animate-in zoom-in-95 duration-500">
                {gameState.activeInteraction.cards.map((cardId: string, idx: number) => (
                  <button 
                    key={`${cardId}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (isInteractionPending) return;
                      if (gameState.activeInteraction?.targetPlayerId) {
                        setIsInteractionPending(true);
                        void handlers.handleSelectOpponentCard(gameState.activeInteraction.targetPlayerId, cardId);
                      }
                    }}
                    className="w-48 h-[300px] rounded-[1.5rem] bg-zinc-900 border-4 border-red-500/30 cursor-pointer hover:scale-105 hover:border-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center relative group pointer-events-auto"
                  >
                    <img src="/cards/card_back.svg" className="w-full h-full object-cover rounded-[1.1rem] opacity-80 group-hover:opacity-100" alt="Back" />
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

          <button 
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              setIsInteractionPending(true);
              void handlers.handleCancelInteraction();
            }}
            className="mt-12 text-white/30 hover:text-red-400 font-black uppercase text-xs tracking-[0.3em] transition-all flex items-center gap-2 group"
          >
            <span className="group-hover:rotate-90 transition-transform text-lg">✕</span> Отменить и вернуть карту
          </button>
        </div>
      )}

      {/* ЭКРАН ГЕМБЛИНГА (КАЗИНО) */}
      {gameState.activeInteraction?.type === 'gambling' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-blue-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-blue-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]">Испытай удачу!</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">Выбери одну из трех карт</p>
          </div>
          
          <div className={`flex gap-10 ${isInteractionPending ? 'pointer-events-none opacity-60' : ''}`}>
            {gameState.activeInteraction.cards.map((cardId: string, idx: number) => (
              <div 
                key={idx}
                onClick={() => {
                  if (isInteractionPending) return;
                  setIsInteractionPending(true);
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

          {/* Предложение использовать карточку защиты */}
          {protectionCardsInInv.length > 0 && (
            <div className="mt-12 flex flex-col items-center gap-4 bg-white/5 p-8 rounded-[2.5rem] border border-white/10 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-700">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-blue-300 uppercase tracking-[0.3em]">У вас есть защита</span>
                <p className="text-white/40 text-[9px] font-medium">Вы можете избежать гемблинга, потратив карту</p>
              </div>
              <div className="flex gap-4">
                {protectionCardsInInv.map((card) => (
                  <button
                    key={card.id}
                    disabled={isInteractionPending}
                    onClick={() => {
                      if (isInteractionPending) return;
                      setIsInteractionPending(true);
                      void handlers.handleFinishInteraction(undefined, 0, card.id);
                    }}
                    className="bg-yellow-500 text-black px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
                  >
                    Использовать "{card.name}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ЭКРАН B-SHOP (МАГАЗИН) */}
      {gameState.activeInteraction?.type === 'bshop' && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-pink-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-pink-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(236,72,153,0.5)]">B-Shop</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">Ваши коины: {playerData.tiltCoins ?? 0} 🦖</p>
          </div>
          
          <div className={`flex gap-8 items-start ${isInteractionPending ? 'pointer-events-none opacity-60' : ''}`}>
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
                    disabled={!canAfford || isInteractionPending}
                    onClick={() => {
                      if (isInteractionPending) return;
                      setIsInteractionPending(true);
                      void handlers.handleFinishInteraction(cardId, price);
                    }}
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
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              setIsInteractionPending(true);
              void handlers.handleFinishInteraction();
            }}
            className="mt-12 text-white/30 hover:text-white font-black uppercase text-xs tracking-[0.3em] transition-all"
          >
            Ничего не покупать и уйти
          </button>
        </div>
      )}

      {/* ЭКРАН ОТВЕТА НА ВЫЗОВ НА ДУЭЛЬ */}
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
                  setIsInteractionPending(true);
                  void handlers.handleConfirmMoveForCoins(coinsToPay);
                }}
                className="bg-emerald-500 text-black px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all disabled:opacity-50"
              >
                Подтвердить
              </button>
              <button
                disabled={isInteractionPending}
                onClick={() => {
                  if (isInteractionPending) return;
                  setIsInteractionPending(true);
                  void handlers.handleCancelInteraction();
                }}
                className="bg-zinc-800 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-700 transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

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
                    setIsInteractionPending(true);
                    void handlers.handleDuelChallengeResponse(duelId, 'use_protection');
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
                setIsInteractionPending(true);
                void handlers.handleDuelChallengeResponse(duelId, 'accept');
              }}
              className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_5px_0_#6d28d9] active:shadow-none active:translate-y-1"
            >
              Принять вызов
            </button>

            <button
              disabled={isInteractionPending || (playerData.tiltCoins ?? 0) < 3}
              onClick={() => {
                if (isInteractionPending) return;
                const duelId = gameState.activeInteraction?.duelId;
                if (!duelId) return;
                setIsInteractionPending(true);
                void handlers.handleDuelChallengeResponse(duelId, 'decline');
              }}
              className="bg-zinc-800 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-zinc-700 transition-all active:scale-95 shadow-[0_5px_0_#27272a] active:shadow-none active:translate-y-1 disabled:opacity-40"
            >
              Отказаться за 3 🦖
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
                    setIsInteractionPending(true);
                    void handlers.handleSelectDuelWeapon(duelId, 'dice');
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
                    setIsInteractionPending(true);
                    void handlers.handleSelectDuelWeapon(duelId, 'game');
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
      {gameState.activeInteraction?.type === 'duel_betting' && gameState.activeInteraction.duelId && gameState.activeInteraction.playerId === user?.uid && (
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
            {duelBetAmount > (playerData.tiltCoins ?? 0) && (
              <p className="max-w-xs text-center text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-300">
                Вы уйдете в минус, если проиграете.
              </p>
            )}
            <div className="flex gap-3">
              <button
                disabled={isInteractionPending || duelBetAmount <= 0}
                onClick={() => {
                  if (isInteractionPending) return;
                  setIsInteractionPending(true);
                  const duelId = gameState.activeInteraction?.duelId;
                  if (!duelId) return;
                  void handlers.handlePlaceDuelBet(duelId, duelBetAmount);
                }}
                className="bg-purple-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-purple-500 transition-all disabled:opacity-50"
              >
                Сделать ставку {duelBetAmount} 🦖
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.activeInteraction?.type === 'duel_betting' && gameState.activeInteraction.duelId && gameState.activeInteraction.playerId !== user?.uid && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[10010] animate-in slide-in-from-top-4 fade-in duration-500 pointer-events-none w-full max-w-sm px-4">
          <div className="bg-purple-900/40 border border-purple-500/40 backdrop-blur-xl px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 border-l-4 border-l-purple-400">
            <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse shrink-0" />
            <div className="flex flex-col">
              <span className="text-purple-400 text-[9px] font-black uppercase tracking-[0.3em]">Дуэль</span>
              <span className="text-white text-xs font-bold mt-0.5 leading-tight">
                {getPlayerById(gameState.activeInteraction.playerId)?.login || 'Игрок'} делает ставку...
              </span>
            </div>
          </div>
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
                      onClick={() => void handlers.handleFinishDuel(duel.id, duel.challengerId)}
                      className="flex flex-col items-center gap-2 bg-white/5 hover:bg-purple-500/20 border border-white/10 p-4 rounded-2xl transition-all group"
                    >
                      <img src={challenger?.avatar || FALLBACK_AVATAR} className="w-12 h-12 rounded-full border-2 border-purple-500 shadow-lg" alt="P1" />
                      <span className="text-white font-bold text-xs truncate w-full text-center">{challenger?.login}</span>
                      <span className="text-[9px] text-purple-400 font-black uppercase">Победитель</span>
                    </button>

                    <button
                      onClick={() => void handlers.handleFinishDuel(duel.id, duel.targetId)}
                      className="flex flex-col items-center gap-2 bg-white/5 hover:bg-emerald-500/20 border border-white/10 p-4 rounded-2xl transition-all group"
                    >
                      <img src={target?.avatar || FALLBACK_AVATAR} className="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-lg" alt="P2" />
                      <span className="text-white font-bold text-xs truncate w-full text-center">{target?.login}</span>
                      <span className="text-[9px] text-emerald-400 font-black uppercase">Победитель</span>
                    </button>
                  </div>

                  <button
                    onClick={() => void handlers.handleFinishDuel(duel.id, 'draw')}
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
      {gameState.activeInteraction?.type === 'duel_ready_to_roll' && gameState.activeInteraction.duelId && gameState.activeInteraction.playerId === user?.uid && (
        <div className="fixed inset-0 bg-purple-950/90 backdrop-blur-xl z-[10010] flex flex-col items-center justify-center p-10 animate-in fade-in duration-500">
          <div className="text-center mb-12">
            <h2 className="text-6xl font-black text-purple-400 uppercase italic tracking-tighter drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">Дуэль: Готовы?</h2>
            <p className="text-white/40 text-sm font-bold uppercase tracking-[0.5em] mt-4">
              {gameState.activeInteraction.playerId === user?.uid
                ? `Нажмите "Бросить кубики", чтобы начать дуэль против ${getPlayerById(gameState.activeInteraction.targetPlayerId)?.login}.`
                : `Ожидаем, пока ${getPlayerById(gameState.activeInteraction.playerId)?.login} бросит кубики.`}
            </p>
          </div>

          <button
            disabled={isInteractionPending}
            onClick={() => {
              if (isInteractionPending) return;
              setIsInteractionPending(true);
              const duelId = gameState.activeInteraction?.duelId;
              if (!duelId) return;
              void handlers.handleStartDuelRoll(duelId);
            }}
            className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm hover:bg-purple-500 transition-all active:scale-95 shadow-[0_5px_0_#6d28d9] active:shadow-none active:translate-y-1 disabled:opacity-50"
          >
            Бросить кубики!
          </button>
        </div>
      )}

      {gameState.activeInteraction?.type === 'duel_ready_to_roll' && gameState.activeInteraction.duelId && gameState.activeInteraction.playerId !== user?.uid && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[10010] animate-in slide-in-from-top-4 fade-in duration-500 pointer-events-none w-full max-w-sm px-4">
          <div className="bg-purple-900/40 border border-purple-500/40 backdrop-blur-xl px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 border-l-4 border-l-purple-400">
            <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse shrink-0" />
            <div className="flex flex-col">
              <span className="text-purple-400 text-[9px] font-black uppercase tracking-[0.3em]">Дуэль</span>
              <span className="text-white text-xs font-bold mt-0.5 leading-tight">
                {getPlayerById(gameState.activeInteraction.playerId)?.login || 'Игрок'} запускает итог дуэли...
              </span>
            </div>
          </div>
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

            {gameAlert.cardId && allCards[gameAlert.cardId] && (
              <div className="mb-6 relative group inline-block">
                <div 
                  className="bg-red-500/10 border border-red-500/30 px-4 py-2 rounded-xl cursor-help transition-all hover:bg-red-500/20"
                >
                  <span className="text-red-400 font-bold text-sm tracking-wide uppercase">
                    {allCards[gameAlert.cardId].name}
                  </span>
                </div>
                {/* Всплывающее превью карты при наведении */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-[20001] scale-[0.6] origin-bottom invisible group-hover:visible drop-shadow-2xl">
                  <GameCard card={allCards[gameAlert.cardId]} index={0} totalCards={1} />
                </div>
              </div>
            )}

            <button 
              onClick={() => setGameAlert(null)}
              className="w-full py-4 bg-yellow-500 text-black rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-white transition-all active:scale-95"
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      {/* Визуализация броска кубика */}
      {visualRoll && (
        <DiceVisual 
          value={visualRoll.value} 
          isRolling={visualRoll.rolling} 
          playerName={visualRoll.playerName} 
        />
      )}

      {/* Визуализация броска кубиков для дуэли */}
      {duelVisualRoll && (
        <DuelDiceVisual
          challengerRoll={duelVisualRoll.challenger.value}
          challengerName={duelVisualRoll.challenger.playerName}
          targetRoll={duelVisualRoll.target.value}
          targetName={duelVisualRoll.target.playerName}
          isRolling={duelVisualRoll.challenger.rolling || duelVisualRoll.target.rolling}
        />
      )}

      {/* Глобальный индикатор сетевого ожидания для карточных действий */}
      {isInteractionPending && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/10 backdrop-blur-[1px] cursor-wait pointer-events-auto">
          <div className="bg-zinc-900/90 border-2 border-purple-500/50 p-6 rounded-[2rem] flex flex-col items-center gap-4 shadow-[0_0_80px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <div className="flex flex-col items-center text-center">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-400">Магия Cormorant...</span>
              <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 mt-2">Обрабатываем действие</span>
            </div>
          </div>
        </div>
      )}

      {/* Всплывающие уведомления (Toasts) */}
      <ToastContainer 
        toasts={toasts} 
        removeToast={(id) => setToasts(prev => prev.filter(t => t.id !== id))} 
        allCards={allCards} 
      />

      {/* Лог игровых событий */}
      <EventLog 
        gameEvents={visibleGameEvents} 
        allCards={allCards} 
        players={players} 
      />
    </div>
  );
}

export default AppClean;
