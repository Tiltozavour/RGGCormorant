import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../firebase";
import type { Player } from "../types/game";
import { FALLBACK_AVATAR } from "./gameConstants";
import { ru } from "../i18n/ru";

type ChatMessage = {
  id: string;
  text: string;
  playerId: string;
  login: string;
  avatar: string;
  borderColor: string;
  timestamp: any;
  replyTo?: {
    login: string;
    text: string;
    borderColor: string;
  } | null;
};

type ChatBoxProps = {
  playerData: Player;
  isOpen: boolean;
  lastReadTime: number;
  hasUnread: boolean; // Новый пропс
  // onToggle: () => void; // Removed, parent handles toggle
};


function ChatBox({ playerData, isOpen, lastReadTime, hasUnread }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showLine, setShowLine] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Для прокрутки
  const inputRef = useRef<HTMLInputElement>(null); // Для фокуса

  useEffect(() => {
    const q = query(
      collection(db, "chatMessages"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];
      // Показываем последние 50 сообщений в правильном порядке
      setMessages(msgs.reverse());
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOpen) { // Если панель чата открыта
      setShowLine(true);
      // Используем небольшой таймаут, чтобы дождаться отрисовки DOM
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ block: "end" }); // Мгновенная прокрутка
        inputRef.current?.focus(); // Автоматический фокус
      }, 100);

      // Таймер на исчезновение разделителя через 10 секунд
      const fadeTimer = setTimeout(() => {
        setShowLine(false);
      }, 10000);

      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    } else {
      inputRef.current?.blur(); // Снимаем фокус, если чат закрыт
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText("");

    try {
      await addDoc(collection(db, "chatMessages"), {
        text,
        playerId: playerData.id,
        login: playerData.login,
        avatar: playerData.avatar || FALLBACK_AVATAR,
        borderColor: playerData.borderColor || "#fac319",
        timestamp: serverTimestamp(),
        replyTo: replyingTo ? {
          login: replyingTo.login,
          text: replyingTo.text,
          borderColor: replyingTo.borderColor
        } : null
      });
      setReplyingTo(null);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 w-full" style={{ direction: 'rtl' }}>
        <div className="p-4 space-y-3" style={{ direction: 'ltr' }}>
          {(() => {
          let hasRenderedSeparator = false;
          return messages.map((msg) => {
          const isMe = msg.playerId === playerData.id;
          const msgMillis = msg.timestamp?.toMillis?.() || Date.now();
          
          // Рисуем черту только перед первым новым сообщением от ЧУЖОГО игрока
          const showSeparator = !isMe && !hasRenderedSeparator && msgMillis > lastReadTime;
          if (showSeparator) hasRenderedSeparator = true;

          return (
            <React.Fragment key={msg.id}>
              {showSeparator && (
                <div className={`flex items-center gap-3 transition-all duration-1000 overflow-hidden ${showLine ? 'my-4 opacity-100 max-h-10' : 'my-0 opacity-0 max-h-0'}`}>
                  <div className="flex-1 h-px bg-red-500/30" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500/60 whitespace-nowrap">{ru.chat.newMessages}</span>
                  <div className="flex-1 h-px bg-red-500/30" />
                </div>
              )}
              <div className={`flex items-start gap-2 group/msg w-full animate-in fade-in slide-in-from-bottom-1 duration-300 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <img src={msg.avatar || FALLBACK_AVATAR} className="w-6 h-6 rounded-full border-2 border-black shrink-0 mt-0.5" style={{ borderColor: msg.borderColor }} alt="" />
              <div className={`flex flex-col min-w-0 max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-1.5 mb-0.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: msg.borderColor }}>{msg.login}</span>
                  <span className="text-[8px] text-zinc-500 font-bold opacity-60">
                    {msg.timestamp?.toDate ? (
                      `${msg.timestamp.toDate().toLocaleDateString([], { day: '2-digit', month: '2-digit' })}, ${msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    ) : ''}
                  </span>
                </div>
                <div className={`text-[13px] text-zinc-200 break-all [word-break:break-word] whitespace-pre-wrap leading-tight px-2.5 py-1.5 rounded-2xl border border-white/5 shadow-inner relative ${isMe ? 'rounded-tr-none text-right' : 'rounded-tl-none text-left'}`}
                   // Применяем цвет ауры с прозрачностью 10% для всех сообщений
                   style={{ backgroundColor: hexToRgba(msg.borderColor, 0.1) }}>
                  {msg.replyTo && (
                    <div className="mb-1.5 pb-1 border-b border-white/10 text-[10px] text-zinc-400 italic flex flex-col overflow-hidden">
                      <span className="font-black text-[8px] uppercase not-italic opacity-80" style={{ color: msg.replyTo.borderColor }}>@{msg.replyTo.login}</span>
                      <span className="line-clamp-2 break-all [word-break:break-word] opacity-70">"{msg.replyTo.text}"</span>
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
              
              {/* Кнопка ответа символом */}
              <button 
                onClick={() => {
                  setReplyingTo(msg);
                  inputRef.current?.focus();
                }}
                className={`p-1 mt-6 text-xs grayscale hover:grayscale-0 transition-all opacity-0 group-hover/msg:opacity-100 hover:scale-125 active:scale-90 ${isMe ? 'mr-1' : 'ml-1'}`}
                title={ru.chat.replyTo}
              >
                ↻
              </button>
            </div>
            </React.Fragment>
          );
          });
        })()}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Превью ответа */}
      {replyingTo && (
        <div className="px-4 py-2 bg-zinc-800/80 border-t border-white/5 flex items-center justify-between animate-in slide-in-from-bottom-1 duration-200">
          <div className="flex flex-col min-w-0">
            <span className="text-[8px] font-black uppercase" style={{ color: replyingTo.borderColor }}>{ru.chat.replyTo} {replyingTo.login}</span>
            <span className="text-[10px] text-zinc-400 line-clamp-2 break-all [word-break:break-word] italic">"{replyingTo.text}"</span>
          </div>
          <button 
            onClick={() => setReplyingTo(null)} 
            className="text-zinc-500 hover:text-white p-1 ml-2 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-3 bg-zinc-900 border-t border-white/10 flex gap-2 shrink-0 relative z-10">
        <input
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={ru.chat.placeholder}
          className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white outline-none focus:border-yellow-500/50 transition-all placeholder:text-zinc-600"
        />
        <button type="submit" className="bg-yellow-500 hover:bg-white text-black font-black uppercase text-[10px] px-3 py-2 rounded-lg transition-all active:scale-95 shadow-lg">➔</button>
      </form>
    </div>
  );
}

export default ChatBox;

// Вспомогательная функция вынесена за пределы компонента для оптимизации
function hexToRgba(hex: string, alpha: number): string {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    const val = parseInt(c.join(''), 16);
    return `rgba(${[(val >> 16) & 255, (val >> 8) & 255, val & 255].join(',')},${alpha})`;
  }
  return `rgba(0,0,0,${alpha})`;
}