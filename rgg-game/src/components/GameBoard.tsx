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
  onMoveComplete: (position: number, prevCell: number | null) => Promise<void>;
  showWheel?: boolean;
  onWheelResult?: (gameName: string) => void;
  onCloseWheel?: () => void;
  round: number;
}

interface MapCell {
  id: number;
  x: number;
  y: number;
  next: number[];
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
  chooseStart,
  onMoveComplete,
  showWheel,
  onWheelResult,
  onCloseWheel,
  round,
}) => {
  const [piecePos, setPiecePos] = useState({ x: 50, y: 50 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [choice, setChoice] = useState<number[] | null>(null);
  const choiceResolveRef = useRef<((value: number) => void) | null>(null);
  const startPosRef = useRef<number>(0);
  const startPrevRef = useRef<number | null>(null);
  const onMoveCompleteRef = useRef(onMoveComplete);
  const activeMovementRef = useRef<number | null>(null);
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
    startPosRef.current = playerData.position ?? 0;
    startPrevRef.current = playerData.prevCell ?? null;
  }, [playerData.position, playerData.prevCell]);

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

    const rollKey = `${currentRoll}-${currentRollPlayerId}`;
    if (processedRollsRef.current.has(rollKey)) return;
    processedRollsRef.current.add(rollKey);

    const myId = ++movementCounterRef.current;
    activeMovementRef.current = myId;

    let cancelled = false;
    let currentPosition = startPosRef.current;
    let cameFrom = startPrevRef.current;

    const doMove = async () => {
      setIsAnimating(true);
      let stepsLeft = currentRoll;

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

          if (activeMovementRef.current === myId && !cancelled) {
            await updateDoc(doc(db, "players", playerData.id), {
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
        stepsLeft--;

        if (activeMovementRef.current === myId && !cancelled) {
          await updateDoc(doc(db, "players", playerData.id), {
            position: currentPosition,
            prevCell: cameFrom,
          });
        }

        await wait(STEP_DELAY);
      }

      if (activeMovementRef.current === myId && !cancelled) {
        activeMovementRef.current = null;
        setIsAnimating(false);
        await onMoveCompleteRef.current(currentPosition, cameFrom);
      }
    };

    void doMove();

    return () => {
      cancelled = true;
      setIsAnimating(false);
      if (choiceResolveRef.current) {
        const cell = getCell(currentPosition);
        if (cell && cell.next.length > 0) {
          choiceResolveRef.current(cell.next[0]);
        }
        choiceResolveRef.current = null;
      }
      setChoice(null);
    };
  }, [currentRoll, currentRollPlayerId, rollConfirmed, playerData.id]);

  if (round > 8) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black/40 backdrop-blur-md rounded-3xl border border-yellow-500/20">
        <h1 className="text-6xl font-black text-yellow-500 uppercase italic tracking-tighter drop-shadow-2xl animate-pulse">
          Результаты игры
        </h1>
      </div>
    );
  }

  useEffect(() => {
    if (!currentRoll || !currentRollPlayerId) {
      processedRollsRef.current.clear();
    }
  }, [currentRoll, currentRollPlayerId]);

  const handleChoice = (nextId: number) => {
    setChoice(null);
    if (choiceResolveRef.current) {
      choiceResolveRef.current(nextId);
      choiceResolveRef.current = null;
    }
  };

  const isAdminView = playerData.id === "__admin__";
  const playerCell = getCell(playerData.position ?? 0);
  const displayedPiecePos =
    !isAnimating && playerCell
      ? { x: playerCell.x, y: playerCell.y }
      : piecePos;

  if (!playerData.inGame && !isAdminView) {
    return (
      <div className="relative w-full h-full">
        <div className="flex items-center justify-center w-full h-full">
          <div className="relative w-[900px] h-[850px]" />
        </div>

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

          return (
            <div
              key={cell.id}
              className={`absolute flex items-center justify-center ${
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
                className={`
                  w-14 h-14
                  ${
                    isStartPoint
                      ? "bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)] group-hover:bg-yellow-500/50 group-hover:scale-110 transition-all duration-200"
                      : "bg-zinc-900/60 border-purple-500/20"
                  }
                  rounded-xl
                  border
                  backdrop-blur-md
                  flex items-center justify-center
                `}
              >
                <span className="absolute top-1 left-2 text-xs text-purple-300">
                  {cell.id}
                </span>

                {isStartPoint && (
                  <span className="text-xs text-yellow-400 font-semibold animate-pulse">
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
      <div className="flex items-center justify-center w-full h-full">
        <div className="relative w-[900px] h-[850px]" />
      </div>

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
            className="absolute flex items-center justify-center"
            style={{
              left: `${cell.x}%`,
              top: `${cell.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className={`
                w-14 h-14
                ${
                  isStartPoint
                    ? "bg-yellow-500/20 border-yellow-400/60 shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                    : isCurrent
                      ? "bg-purple-500/30 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]"
                      : "bg-zinc-900/60 border-purple-500/20"
                }
                rounded-xl
                border
                backdrop-blur-md
                flex items-center justify-center
              `}
            >
              <span className="absolute top-1 left-2 text-xs text-purple-300">
                {cell.id}
              </span>
            </div>
          </div>
        );
      })}

      {choice && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-50">
          {choice.map((id) => (
            <button
              key={id}
              onClick={() => handleChoice(id)}
              className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-500"
            >
              to {id}
            </button>
          ))}
        </div>
      )}

      {players
        .filter((player) => player.id !== playerData.id && player.inGame && player.position !== undefined)
        .map((otherPlayer) => {
          const pos = otherPlayer.position!;
          const cell = getCell(pos);
          if (!cell) return null;

          const isCurrentTurn = otherPlayer.id === currentTurnPlayerId;

          return (
            <div
              key={otherPlayer.id}
              className="absolute flex flex-col items-center transition-all duration-500 group"
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {/* Всплывающее количество коинов */}
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/90 border border-yellow-500/50 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 whitespace-nowrap pointer-events-none z-[60] shadow-xl transform translate-y-2 group-hover:translate-y-0">
                🦖 {otherPlayer.tiltCoins ?? 0}
              </div>

              {isCurrentTurn && (
                <div
                  className="absolute w-20 h-20 rounded-full blur-2xl opacity-60"
                  style={{ background: "#facc15" }}
                />
              )}

              <div
                className="absolute w-16 h-16 rounded-full blur-xl opacity-40"
                style={{ background: otherPlayer.borderColor || "#a855f7" }}
              />

              <div 
                className="mb-1 px-2 text-xs rounded bg-black/70 border flex items-center gap-1 font-bold"
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                {otherPlayer.login.toUpperCase()}
                {isCurrentTurn && <span>Turn</span>}
              </div>

              <div className="transition-transform duration-300 group-hover:scale-125">
                <div
                  className={`w-10 h-10 rounded-full p-[2px] ${isCurrentTurn ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent animate-piece-bounce" : ""}`}
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

      {!isAdminView && (
        <div
          className="absolute flex flex-col items-center group"
          style={{
            left: `${displayedPiecePos.x}%`,
            top: `${displayedPiecePos.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Всплывающее количество коинов для себя */}
          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/90 border border-yellow-500/50 px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 whitespace-nowrap pointer-events-none z-[60] shadow-xl transform translate-y-2 group-hover:translate-y-0">
            🦖 {playerData.tiltCoins ?? 0}
          </div>

          {playerData.id === currentTurnPlayerId && (
            <div
              className="absolute w-20 h-20 rounded-full blur-2xl opacity-60 animate-pulse"
              style={{ background: "#facc15" }}
            />
          )}

          <div
            className="absolute w-16 h-16 rounded-full blur-xl opacity-40"
            style={{ background: playerData.borderColor || "#facc15" }}
          />

          <div 
            className="mb-1 px-2 text-xs rounded bg-black/70 border flex items-center gap-1 font-bold"
            style={{ fontFamily: "'Comfortaa', sans-serif" }}
          >
            {playerData.login.toUpperCase()}
            {playerData.id === currentTurnPlayerId && <span>Turn</span>}
          </div>

          <div className="transition-transform duration-300 group-hover:scale-125">
            <div
              className={`w-10 h-10 rounded-full p-[2px] ${
                playerData.id === currentTurnPlayerId
                  ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent animate-piece-bounce"
                  : ""
              }`}
              style={{ background: playerData.borderColor || "#facc15" }}
            >
              <img
                src={playerData.avatar || FALLBACK_AVATAR}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameBoard;
