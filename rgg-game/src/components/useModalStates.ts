import { useState, useCallback } from 'react';
import type { GameCard as GameCardType } from "../types/card";

export interface GameAlert {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning';
  cardId?: string;
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

  const closeAll = useCallback(() => {
    setIsHandOpen(false);
    setIsCollectionOpen(false);
    setIsLegendsOpen(false);
    setSelectedCard(null);
    setGameAlert(null);
    setPendingTargetCard(null);
    setIsAvatarModalOpen(false);
    setIsSidebarOpen(false);
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
    closeAll
  };
}