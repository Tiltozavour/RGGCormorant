import { useState, useCallback } from 'react';
import type { GameCard as GameCardType } from "../types/card";

export interface GameAlert {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning';
  cardId?: string;
}

export interface ToastNotification {
  id: string; // Unique ID for dismissal
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  cardId?: string; // Optional card ID for contextual preview
  timestamp: number;
}

export interface GameEvent {
  id: string; // Unique ID for event
  timestamp: number;
  type: 'card_play' | 'coin_change' | 'movement' | 'status_effect' | 'duel' | 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>; // More structured data
  cardId?: string; // Relevant card
  playerId?: string; // Player involved
  targetPlayerId?: string; // Target player involved
}

export function useModalStates() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isScoresDetailsOpen, setIsScoresDetailsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isPlayersSidebarOpen, setIsPlayersSidebarOpen] = useState(false);
  const [isLegendsOpen, setIsLegendsOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<GameCardType | null>(null);
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [isHandOpen, setIsHandOpen] = useState(false);
  const [gameAlert, setGameAlert] = useState<GameAlert | null>(null);
  const [pendingTargetCard, setPendingTargetCard] = useState<GameCardType | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);

  const closeAll = useCallback(() => {
    setIsHandOpen(false);
    setIsCollectionOpen(false);
    setIsLegendsOpen(false);
    setSelectedCard(null);
    setGameAlert(null);
    setPendingTargetCard(null);
    setIsAvatarModalOpen(false);
    setIsSidebarOpen(false);
    setToasts([]);
    setGameEvents([]);
    setIsPlayersSidebarOpen(false);
  }, []);

  return {
    isSidebarOpen, setIsSidebarOpen,
    isAvatarModalOpen, setIsAvatarModalOpen,
    isScoresDetailsOpen, setIsScoresDetailsOpen,
    isBottomPanelOpen, setIsBottomPanelOpen,
    isPlayersSidebarOpen, setIsPlayersSidebarOpen,
    isLegendsOpen, setIsLegendsOpen,
    selectedCard, setSelectedCard,
    isCollectionOpen, setIsCollectionOpen,
    isHandOpen, setIsHandOpen,
    gameAlert, setGameAlert,
    pendingTargetCard, setPendingTargetCard,
    toasts, setToasts,
    gameEvents, setGameEvents,
    closeAll
  };
}
