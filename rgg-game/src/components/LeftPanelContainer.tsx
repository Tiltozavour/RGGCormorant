import React, { useState, useCallback, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import EventLog from "./EventLog";
import ChatBox from "./ChatBox";
import type { GameEvent } from "./useModalStates";
import type { GameCard as GameCardType } from "../types/card";
import type { Player } from "../types/game";
import { ru } from "../i18n/ru";

interface LeftPanelContainerProps {
  gameEvents: GameEvent[];
  allCards: Record<string, GameCardType>;
  players: Player[];
  playerData: Player; // Assuming playerData is always available when this is rendered
  onClearEventLog: () => void;
  isClearingEventLog: boolean;
  canClearEventLog: boolean;
  onClearChat: () => void;
  isClearingChat: boolean;
  isAdmin: boolean;
}

function LeftPanelContainer({
  gameEvents,
  allCards,
  players,
  playerData,
  onClearEventLog,
  isClearingEventLog,
  canClearEventLog,
  onClearChat,
  isClearingChat,
  isAdmin,
}: LeftPanelContainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'chat'>('log');
  const [hasUnread, setHasUnread] = useState(false);
  const [lastReadTime, setLastReadTime] = useState(Date.now());
  const lastSeenRef = useRef<number>(Date.now());
  const prevVisibleRef = useRef(false);

  const isChatVisible = isOpen && activeTab === 'chat';

  useEffect(() => {
    // Запоминаем время, когда пользователь перестал смотреть в чат
    if (prevVisibleRef.current && !isChatVisible) {
      setLastReadTime(Date.now());
    }
    prevVisibleRef.current = isChatVisible;
  }, [isChatVisible]);

  // Подписка на уведомления о новых сообщениях
  useEffect(() => {
    const q = query(collection(db, "chatMessages"), orderBy("timestamp", "desc"), limit(1));
    return onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const data = snap.docs[0].data();
      const msgTime = data.timestamp?.toMillis?.() || Date.now();

      if (!isChatVisible && msgTime > lastSeenRef.current) {
        setHasUnread(true);
      }
      if (isChatVisible) {
        lastSeenRef.current = msgTime;
        setHasUnread(false);
      }
    });
  }, [isChatVisible]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleTabChange = useCallback((tab: 'log' | 'chat') => {
    setActiveTab(tab);
    setIsOpen(true); // Automatically open the panel when switching tabs
  }, []);

  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 left-0 h-1/2 w-80 z-[75] transition-transform duration-300 flex flex-col bg-black/60 backdrop-blur-xl border-r border-white/10 shadow-2xl rounded-tr-2xl ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ fontFamily: "'Comfortaa', sans-serif" }}
    >
      {/* Header with tabs and toggle button */}
      <div className="p-2 border-b border-white/10 flex justify-between items-center bg-black/40">
        <div className="flex gap-1">
          <button
            onClick={() => handleTabChange('log')}
            className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'log' ? 'bg-purple-600 text-white shadow-md' : 'bg-black/40 text-white/50 hover:text-white'}`}
            title="Лог событий"
          >
            {ru.eventLog.title}
          </button>
          <button
            onClick={() => handleTabChange('chat')}
            className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'chat' ? 'bg-yellow-500 text-black shadow-md' : 'bg-black/40 text-white/50 hover:text-white'}`}
            title="Чат"
          >
            <span className="flex items-center gap-1.5">
              {ru.chat.title}
              {hasUnread && activeTab !== 'chat' && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              )}
            </span>
          </button>
        </div>

        {/* Кнопки очистки в шапке */}
        <div className="flex items-center pr-1">
          {activeTab === 'log' && canClearEventLog && (
            <button
              type="button"
              onClick={onClearEventLog}
              disabled={isClearingEventLog || gameEvents.length === 0}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/60 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 disabled:pointer-events-none disabled:opacity-40"
              title={ru.eventLog.clearTitle}
            >
              {isClearingEventLog ? "..." : ru.eventLog.clearButton}
            </button>
          )}
          {activeTab === 'chat' && isAdmin && (
            <button
              type="button"
              onClick={onClearChat}
              disabled={isClearingChat}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/60 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200 disabled:pointer-events-none disabled:opacity-40"
              title={ru.chat.clearTitle}
            >
              {isClearingChat ? "..." : ru.chat.clearButton}
            </button>
          )}
        </div>
      </div>

      {/* Кнопка-язычок (вынесена за пределы основного контейнера по X) */}
      <button
        onClick={handleToggle}
        className="absolute left-full top-0 h-10 w-8 bg-black/60 backdrop-blur-md border border-l-0 border-white/20 flex items-center justify-center text-white/70 hover:text-white rounded-r-xl shadow-2xl transition-all"
        title={isOpen ? ru.common.collapse : ru.common.expand}
      >
        <span className={`text-[10px] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>▶</span>

        {hasUnread && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500 shadow-sm border border-black/20"></span>
          </span>
        )}
      </button>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'log' && (
          <EventLog gameEvents={gameEvents} allCards={allCards} players={players} isOpen={isOpen} />
        )}
        {activeTab === 'chat' && (
          <ChatBox 
            playerData={playerData} 
            isOpen={isOpen} 
            lastReadTime={lastReadTime} 
            hasUnread={hasUnread}
          />
        )}
      </div>
    </div>
  );
}

export default LeftPanelContainer;