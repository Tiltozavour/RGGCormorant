import React, { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { gameMap } from "./gameMap";
import type { Player } from "../types/game";
import { GameWheel } from "./GameWheel";
import { fetchAvailableGames } from "./gameList";
import "./GameWheel.css";

interface GameBoardProps {
  playerData: Player;
  players: Player[];
  currentRoll: number | null;
  currentRollPlayerId: string | null;
  rollConfirmed: boolean;
  currentTurnPlayerId: string | null;
  chooseStart: (id: number) => void;
  onMoveComplete: (position: number, prevCell: number | null, cellType?: string, playerId?: string) => Promise<void>;
  showWheel?: boolean;
  onWheelResult?: (gameName: string) => void;
  onCloseWheel?: () => void;
  round: number;
  forcedMovePlayerId?: string | null;
}

interface MapCell {
  id: number;
  x: number;
  y: number;
  next: number[];
  type: 'neutral' | 'b-shop' | 'gambling';
}

const map = gameMap as MapCell[];

const FALLBACK_AVATAR =
  "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg";

const GameBoard: React.FC<GameBoardProps> = ({
  playerData,
  players,
  currentRoll,
  currentRollPlayerId,
  rollConfirmed,
  currentTurnPlayerId,
  forcedMovePlayerId,
  chooseStart,
  onMoveComplete,
  showWheel,
  onWheelResult,
  onCloseWheel,
  round,
}) => {
  // Иници                  ализируем локальную позицию сразу координатами из текущей клетки в БД
  const [piecePos, setPiecePos] = useState(() => {
    const initialCell = map.find((c) => c.id === (playerData.position ?? 0));
    return initialCell ? { x: initialCell.x, y: initialCell.y } : { x: 50, y: 50 };
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [isTeleporting, setIsTeleporting] = useState(false);
  const [choice, setChoice] = useState<number[] | null>(null);
  const choiceResolveRef = useRef<((value: number) => void) | null>(null);
  const startPosRef = useRef<number>(0);
  const startPrevRef = useRef<number | null>(null);
  const onMoveCompleteRef = useRef(onMoveComplete);
  const lastPosRef = useRef<number | undefined>(playerData.position);
  const activeMovementRef = useRef<number | null>(null);
  const isLoopRunningRef = useRef(false);
  const movementCounterRef = useRef(0);
  const processedRollsRef = useRef<Set<string>>(new Set());

  const [wheelGames, setWheelGames] = useState<{id: string, name: string, image?: string}[]>([]);

  useEffect(() => {
    if (showWheel) {
      fetchAvailableGames().then(games => {
        setWheelGames(games);
      });
    }
  }, [showWheel]);

  useEffect(() => {
    onMoveCompleteRef.current = onMoveComplete;
  }, [onMoveComplete]);

  const getCell = (id: number) => map.find((cell) => cell.id === id);

  useEffect(() => {
    // Определяем, за чьей позицией следит локальный стейт анимации.
    // Если мы двигаем другого игрока (forcedMovePlayerId), инициализируем анимацию для него.
    const isRemoteControl = currentRollPlayerId === playerData.id && forcedMovePlayerId;
    const targetPlayer = isRemoteControl 
      ? players.find(p => p.id === forcedMovePlayerId) 
      : playerData;

    const currentPos = targetPlayer?.position ?? 0;

    // Детекция прыжка (телепортации): не анимируемся, prevCell сброшен, позиция изменилась
    const isJump = !isAnimating && 
                   targetPlayer?.prevCell === null && 
                   currentPos !== lastPosRef.current && 
                   lastPosRef.current !== undefined;

    if (isJump) {
      window.setTimeout(() => setIsTeleporting(true), 0);
      // Сначала "схлопываем" фишку в старой позиции
      setTimeout(() => {
        const cell = map.find((c) => c.id === currentPos);
        if (cell) setPiecePos({ x: cell.x, y: cell.y });
        // Затем плавно проявляем в новой
        setTimeout(() => setIsTeleporting(false), 300);
      }, 400);
    } else if (!isAnimating) {
      const cell = map.find((c) => c.id === currentPos);
      if (cell) window.setTimeout(() => setPiecePos({ x: cell.x, y: cell.y }), 0);
    }

    lastPosRef.current = currentPos;
    startPosRef.current = currentPos;
    startPrevRef.current = targetPlayer?.prevCell ?? null;
  }, [playerData.position, playerData.prevCell, isAnimating, currentRollPlayerId, forcedMovePlayerId, players]);

  const animateTo = (target: { x: number; y: number }): Promise<void> =>
    new Promise((resolve) => {
      const animate = () => {
        setPiecePos((prev) => {
          const dx = target.x - prev.x;
          const dy = target.y - prev.y;
          const speed = 0.08;

          if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
            resolve();
            return target;
          }

          requestAnimationFrame(animate);
          return {
            x: prev.x + dx * speed,
            y: prev.y + dy * speed,
          };
        });
      };

      requestAnimationFrame(animate);
    });

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const STEP_DELAY = 300;

  useEffect(() => {
    const isMyRoll = currentRollPlayerId === playerData.id;
    if (!currentRoll || currentRoll <= 0 || !isMyRoll || !rollConfirmed) return;

    const targetId = forcedMovePlayerId || playerData.id;
    // Находим актуальные данные цели, чтобы не зависеть от stale-состояний
    const targetPlayer = players.find(p => p.id === targetId) || playerData;
    if (!targetPlayer) return;

    const rollKey = `${currentRoll}-${currentRollPlayerId}-${targetId}`;
    if (processedRollsRef.current.has(rollKey)) return;
    
    // Если цикл уже запущен для этого броска, не входим второй раз
    if (isLoopRunningRef.current) return;

    processedRollsRef.current.add(rollKey);

    const myId = ++movementCounterRef.current;
    activeMovementRef.current = myId;

    isLoopRunningRef.current = true;
    let cancelled = false;
    let currentPosition = targetPlayer.position ?? 0;
    let cameFrom = targetPlayer.prevCell ?? null;

    const doMove = async () => {
      setIsAnimating(true);
      let stepsLeft = currentRoll;

      // Синхронизируем начальную позицию анимации с текущей позицией цели
      // Чтобы фишка не прыгала от игрока-инициатора к цели
      const startCell = getCell(currentPosition);
      if (startCell) {
        setPiecePos({ x: startCell.x, y: startCell.y });
      }

      while (stepsLeft > 0 && !cancelled) {
        if (activeMovementRef.current !== myId) return;

        const cell = getCell(currentPosition);
        if (!cell) break;

        const possibleMoves = cell.next.filter((id) => id !== cameFrom);

        if (possibleMoves.length > 1) {
          const chosen = await new Promise<number>((resolve) => {
            setChoice(possibleMoves);
            choiceResolveRef.current = resolve;
          });

          if (activeMovementRef.current !== myId || cancelled) return;

          const nextCell = getCell(chosen);
          if (!nextCell) break;

          await animateTo(nextCell);
          cameFrom = currentPosition;
          currentPosition = chosen;
          stepsLeft--;

          // ОБНОВЛЕНИЕ: Записываем в БД, что мы дошли до развилки
          if (activeMovementRef.current === myId && !cancelled) {
            void updateDoc(doc(db, "players", targetId), {
              position: currentPosition,
              prevCell: cameFrom,
            });
          }

          await wait(STEP_DELAY);
          continue;
        }

        if (possibleMoves.length === 0) break;

        const nextId = possibleMoves[0];
        const nextCell = getCell(nextId);
        if (!nextCell) break;

        await animateTo(nextCell);
        cameFrom = currentPosition;
        currentPosition = nextId;

        // ОПТИМИЗАЦИЯ: Если осталось много шагов, можно обновлять БД раз в 2 шага
        if (activeMovementRef.current === myId && !cancelled && (stepsLeft % 2 === 0 || stepsLeft === 1)) {
             void updateDoc(doc(db, "players", targetId), {
               position: currentPosition,
               prevCell: cameFrom,
             });
        }

        stepsLeft--;

        await wait(STEP_DELAY);
      }

      if (activeMovementRef.current === myId && !cancelled) {
        activeMovementRef.current = null;
        setIsAnimating(false);
        isLoopRunningRef.current = false;
        
        const finalCell = getCell(currentPosition);
        // Нормализуем 'b-shop' в 'bshop' для синхронизации с useGameData
        const cellType = finalCell?.type === 'b-shop' ? 'bshop' : finalCell?.type;
        await onMoveCompleteRef.current(currentPosition, cameFrom, cellType, targetId);
      } else {
        isLoopRunningRef.current = false;
      }
    };

    void doMove();

    return () => {
    };
  }, [currentRoll, currentRollPlayerId, rollConfirmed, playerData.id, forcedMovePlayerId]);

  useEffect(() => {
    if (!currentRoll || !currentRollPlayerId) {
      processedRollsRef.current.clear();
    }
  }, [currentRoll, currentRollPlayerId]);

  if (round > 8) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-md rounded-3xl border border-yellow-500/20">
        <h1 className="text-6xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-2xl animate-pulse">
          Результаты игры
        </h1>
      </div>
    );
  }

  const handleChoice = (nextId: number) => {
    setChoice(null);
    if (choiceResolveRef.current) {
      choiceResolveRef.current(nextId);
      choiceResolveRef.current = null;
    }
  };

  const isAdminView = playerData.id === "__admin__";
  // Визуальная позиция теперь всегда управляется локальным стейтом для плавности
  const displayedPiecePos = piecePos;

  // Флаг: мы сейчас управляем чужой фишкой (например, картой "Только вперед")
  const isControllingOther = !!(currentRollPlayerId === playerData.id && forcedMovePlayerId);

  // Собираем всех активных игроков в один список для расчета смещения на клетках
  const allActivePlayers = [
    ...(isAdminView ? [] : [playerData]),
    ...players.filter(p => p.id !== playerData.id && p.inGame && p.position !== undefined)
  ];

  const getPlayersOnCell = (pos: number) => allActivePlayers.filter(p => (p.id === playerData.id ? (playerData.position ?? 0) : p.position) === pos);
  const getPlayerOffset = (playerId: string, pos: number) => {
    const playersOnCell = getPlayersOnCell(pos);
    const numPlayers = playersOnCell.length;
    if (numPlayers <= 1) return { x: 0, y: 0 };
    
    const index = playersOnCell.findIndex(p => p.id === playerId);
    const angle = (index / numPlayers) * 2 * Math.PI;
    
    // Если игроков больше 4, увеличиваем радиус, чтобы они не слипались
    const radius = numPlayers > 4 ? 32 : 22; 

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  };

  if (!playerData.inGame && !isAdminView) {
    return (
      <div className="relative w-full h-full">
        <img
          src="/map.jpg"
          className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none"
        />

        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 bg-black/70 border border-yellow-500/30 px-6 py-3 rounded-xl backdrop-blur-lg">
          <p className="text-yellow-200 text-center text-sm">
            Выбери стартовую позицию:
          </p>
          <p className="text-yellow-400 text-center text-xs mt-1">
            Кликни на клетку <b>6</b> или <b>15</b>
          </p>
        </div>

        {map.map((cell) => {
          const isStartPoint = cell.id === 6 || cell.id === 15;
          if (!isStartPoint) return null;

          return (
            <div
              key={cell.id}
              className={`absolute flex items-center justify-center transition-all duration-500 ${
                isStartPoint ? "cursor-pointer group" : ""
              }`}
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                transform: "translate(-50%, -50%)",
              }}
              onClick={() => isStartPoint && chooseStart(cell.id)}
            >
              <div
                title={cell.type === 'b-shop' ? "B-Shop" : cell.type === 'gambling' ? "Gambling" : undefined}
                className={`
                  ${isStartPoint ? "w-24 h-24" : "w-14 h-14"}
                  ${
                    isStartPoint
                      ? "bg-purple-600/30 border-purple-400 shadow-[0_0_40px_rgba(168,85,247,0.6)] group-hover:bg-purple-500/50 group-hover:scale-110 active:scale-95 cursor-pointer transition-all duration-200"
                      : cell.type === 'gambling'
                        ? "bg-[#ec4899]/20 border-[#ec4899]/60 shadow-[0_0_25px_rgba(236,72,153,0.3)]"
                        : cell.type === 'b-shop'
                          ? "bg-[#00c8ff]/20 border-[#00c8ff]/60 shadow-[0_0_25px_rgba(0,200,255,0.3)]"
                          : "bg-[#001c69]/40 border-[#1e3a8a]/50"
                  } 
                  rounded-xl
                  border
                  backdrop-blur-md
                  flex items-center justify-center relative
                `}
              >
                <span 
                  className={`absolute right-2 font-black tracking-tighter ${isStartPoint ? "bottom-2 text-xs" : "bottom-1 text-[10px]"} text-purple-300/40`}
                  style={{ fontFamily: "'Comfortaa', sans-serif" }}
                >
                  {cell.id}
                </span>

                {/* Иконки для спецклеток в режиме выбора старта */}
                {cell.type === 'gambling' && <span className="absolute top-1.5 left-1.5 text-xs">🎲</span>}
                {cell.type === 'b-shop' && <span className="absolute top-1.5 left-1.5 text-xs">💵</span>}

                {isStartPoint && (
                  <span 
                    className="text-xs text-purple-200 font-black animate-pulse tracking-widest"
                    style={{ fontFamily: "'Comfortaa', sans-serif" }}
                  >
                    START
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
    {showWheel && wheelGames.length > 0 && (
  <GameWheel
    items={wheelGames}
    onResult={(res) => {
      onWheelResult?.(res);
    }}
    onClose={onCloseWheel}
    canSpin={isAdminView}
  />
)}
      <div className="relative w-full h-full">
      <img
        src="/map.jpg"
        className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none"
      />

      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {map.map((cell) =>
          cell.next.map((nextId) => {
            const next = getCell(nextId);
            if (!next) return null;

            return (
              <line
                key={`${cell.id}-${nextId}`}
                x1={`${cell.x}%`}
                y1={`${cell.y}%`}
                x2={`${next.x}%`}
                y2={`${next.y}%`}
                stroke="rgba(168,85,247,0.8)"
                strokeWidth="3"
                strokeLinecap="round"
                className="neon-line"
              />
            );
          })
        )}
      </svg>

      {map.map((cell) => {
        const isStartPoint = cell.id === 6 || cell.id === 15;
        const isCurrent = cell.id === (playerData.position ?? -1);

        return (
          <div
            key={cell.id}
            className="absolute flex items-center justify-center transition-all duration-500"
            style={{
              left: `${cell.x}%`,
              top: `${cell.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              title={cell.type === 'b-shop' ? "B-Shop" : cell.type === 'gambling' ? "Gambling" : undefined}
              className={`
                ${isStartPoint ? "w-24 h-24" : "w-14 h-14"}
                ${
                  isStartPoint
                    ? "bg-purple-600/20 border-purple-400/60 shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                    : isCurrent
                      ? "bg-purple-500/30 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]"
                      : cell.type === 'gambling'
                        ? "bg-[#ec4899]/20 border-[#ec4899]/60 shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                        : cell.type === 'b-shop'
                          ? "bg-[#00c8ff]/20 border-[#00c8ff]/60 shadow-[0_0_20px_rgba(0,200,255,0.3)]"
                          : "bg-[#001c69]/40 border-[#1e3a8a]/50"
                }
                rounded-xl transition-all duration-200 hover:scale-110 hover:z-10
                border
                backdrop-blur-md
                flex items-center justify-center relative
              `}
            >
              <span
                className={`absolute right-2 font-black tracking-tighter ${isStartPoint ? "bottom-2 text-xs" : "bottom-1 text-[10px]"} text-purple-300/40`}
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                {cell.id}
              </span>

              {/* Иконки для спецклеток */}
              {cell.type === 'gambling' && <span className="absolute top-1.5 left-1.5 text-xs drop-shadow-md">🎲</span>}
              {cell.type === 'b-shop' && <span className="absolute top-1.5 left-1.5 text-xs drop-shadow-md">💵</span>}
            </div>
          </div>
        );
      })}

      {choice && (
        <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-[10015] animate-in fade-in zoom-in duration-300">
          <div className="bg-black/80 backdrop-blur-md border border-white/20 px-4 py-1.5 rounded-full shadow-2xl">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
              {isControllingOther 
                ? `Управление игроком: ${players.find(p => p.id === forcedMovePlayerId)?.login}` 
                : "Выберите направление"}
            </span>
          </div>
          <div className="flex gap-3">
            {choice.map((id) => (
              <button
                key={id}
                onClick={() => handleChoice(id)}
                className={`${
                  isControllingOther 
                    ? "bg-red-600 hover:bg-red-500 shadow-red-500/40 animate-pulse" 
                    : "bg-purple-600 hover:bg-purple-500 shadow-purple-500/20"
                } hover:scale-110 active:scale-95 transition-all px-6 py-2 rounded-xl font-black uppercase text-sm shadow-xl border border-white/10 text-white`}
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                В сторону {id}
              </button>
            ))}
          </div>
        </div>
      )}

      {players
        .filter((player) => {
          if (player.id === playerData.id || !player.inGame || player.position === undefined) return false;
          // Если мы анимируем этого игрока как цель, не рисуем его здесь статично
          if (isControllingOther && player.id === forcedMovePlayerId) return false;
          return true;
        })
        .map((otherPlayer) => {
          const pos = otherPlayer.position!;
          const cell = getCell(pos);
          if (!cell) return null;

          const isCurrentTurn = otherPlayer.id === currentTurnPlayerId;
          const offset = getPlayerOffset(otherPlayer.id, pos);

          return (
            <div
              key={otherPlayer.id}
              className={`absolute flex flex-col items-center group ${isCurrentTurn ? "z-40" : "z-30"}`}
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                transition: 'left 0.4s ease-in-out, top 0.4s ease-in-out', // Плавное скольжение для чужих фишек
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            >
              {/* Всплывающее количество коинов */}
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/90 border border-yellow-500/50 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 whitespace-nowrap pointer-events-none z-[60] shadow-xl transform translate-y-2 group-hover:translate-y-0">
                🦖 {otherPlayer.tiltCoins ?? 0}
              </div>

              {otherPlayer.hasProtection && (
                <div
                  className="absolute w-16 h-16 rounded-full blur-xl opacity-70 animate-pulse"
                  style={{ background: "rgba(0, 200, 255, 0.6)" }}
                />
              )}

              {otherPlayer.customStatus === 'fish_shield' && (
                <div
                  className="absolute w-16 h-16 rounded-full blur-2xl opacity-80 animate-pulse"
                  style={{ background: "rgba(37, 99, 235, 0.7)" }}
                />
              )}

              <div
                className="absolute w-16 h-16 rounded-full blur-xl opacity-40"
                style={{ background: otherPlayer.borderColor || "#a855f7" }}
              />

              <div 
                className={`mb-1 px-2 text-[10px] rounded bg-black/70 border flex items-center gap-1 font-black uppercase ${isCurrentTurn ? "text-yellow-400 border-yellow-500/50" : "text-zinc-300 border-white/10"}`}
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                {otherPlayer.login}
                {otherPlayer.hasProtection && <span title="Силовое поле">🛡️</span>}
                {otherPlayer.customStatus === 'fish_shield' && <span title="No, no mr. Fish">🐟</span>}
                {isCurrentTurn && <span className="text-[8px] opacity-70">●</span>}
              </div>

              <div className="transition-transform duration-300 group-hover:scale-125">
                <div
                  className={`w-10 h-10 rounded-full p-[2px] ${isCurrentTurn ? "animate-piece-bounce" : ""}`}
                  style={{ background: otherPlayer.borderColor || "#a855f7" }}
                >
                  <img
                    src={otherPlayer.avatar || FALLBACK_AVATAR}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              </div>
            </div>
          );
        })}

      {!isAdminView && (() => {
        const isTargetingSelf = !isControllingOther;
        const activePlayer = isTargetingSelf ? playerData : players.find(p => p.id === forcedMovePlayerId);
        if (!activePlayer) return null;

        return (
        <div
          className={`absolute flex flex-col items-center group ${
            activePlayer.id === currentTurnPlayerId ? "z-40" : "z-30"
          } ${isTeleporting ? "scale-0 opacity-0 blur-2xl" : "scale-100 opacity-100 blur-0"}`}
          style={{
            transition: isAnimating ? 'none' : 'left 0.4s ease-in-out, top 0.4s ease-in-out, transform 0.5s, opacity 0.5s',
            left: isAnimating ? `${displayedPiecePos.x}%` : `${getCell(activePlayer.position ?? 0)?.x}%`,
            top: isAnimating ? `${displayedPiecePos.y}%` : `${getCell(activePlayer.position ?? 0)?.y}%`,
            transform: isAnimating 
              ? "translate(-50%, -50%)" 
              : `translate(calc(-50% + ${getPlayerOffset(activePlayer.id, activePlayer.position ?? 0).x}px), calc(-50% + ${getPlayerOffset(activePlayer.id, activePlayer.position ?? 0).y}px))`,
          }}
        >
          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/90 border border-yellow-500/50 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 whitespace-nowrap pointer-events-none z-[60] shadow-xl transform translate-y-2 group-hover:translate-y-0">
            🦖 {activePlayer.tiltCoins ?? 0}
          </div>

          {activePlayer.hasProtection && (
            <div
              className="absolute w-16 h-16 rounded-full blur-xl opacity-70 animate-pulse"
              style={{ background: "rgba(0, 200, 255, 0.6)" }}
            />
          )}

          {activePlayer.customStatus === 'fish_shield' && (
            <div
              className="absolute w-16 h-16 rounded-full blur-2xl opacity-80 animate-pulse"
              style={{ background: "rgba(37, 99, 235, 0.7)" }}
            />
          )}

          <div
            className="absolute w-16 h-16 rounded-full blur-xl opacity-40"
            style={{ background: activePlayer.borderColor || "#facc15" }}
          />

          <div 
            className={`mb-1 px-2 text-[10px] rounded bg-black/70 border flex items-center gap-1 font-black uppercase ${playerData.id === currentTurnPlayerId ? "text-yellow-400 border-yellow-500/50" : "text-zinc-300 border-white/10"}`}
            style={{ fontFamily: "'Comfortaa', sans-serif" }}
          >
            {activePlayer.login}
            {activePlayer.hasProtection && <span title="Силовое поле">🛡️</span>}
            {activePlayer.customStatus === 'fish_shield' && <span title="No, no mr. Fish">🐟</span>}
            {activePlayer.id === currentTurnPlayerId && <span className="text-[8px] opacity-70">●</span>}
          </div>

          <div className="transition-transform duration-300 group-hover:scale-125">
            <div
              className={`w-10 h-10 rounded-full p-[2px] ${
                activePlayer.id === currentTurnPlayerId ? "animate-piece-bounce" : ""
              }`}
              style={{ background: activePlayer.borderColor || "#facc15" }}
            >
              <img
                src={activePlayer.avatar || FALLBACK_AVATAR}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
        </div>
      )})()}

      {/* Если мы управляем чужой фишкой, рисуем свою статично и полупрозрачно */}
      {isControllingOther && (() => {
         const pos = playerData.position ?? 0;
         const cell = getCell(pos);
         if (!cell) return null;
         const offset = getPlayerOffset(playerData.id, pos);
         return (
           <div
             className="absolute flex flex-col items-center z-30 opacity-50 grayscale"
             style={{
               left: `${cell.x}%`,
               top: `${cell.y}%`,
               transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
             }}
           >
             <div className="w-10 h-10 rounded-full p-[2px]" style={{ background: playerData.borderColor || "#facc15" }}>
               <img src={playerData.avatar || FALLBACK_AVATAR} className="w-full h-full rounded-full object-cover" />
             </div>
           </div>
         );
      })()}
    </div>
    </div>
  );
};

export default GameBoard;
