import { deleteField } from "firebase/firestore";

export const getResetPlayerPatch = () => ({
  position: 0,
  prevCell: null,
  inGame: false,
  inventory: [],
  tiltCoins: 0,
  lastTiltoCoins: 0,
  bonusPoints: 0,
  hasProtection: false,
  customStatus: null,
  statusDuration: 0,
  discardNextDrawn: false,
  redirectNextDrawnToPlayerId: null,
  giveNextDrawnToPlayerId: null,
  lastNotification: deleteField(),
  hasGoldenCard: deleteField(),
  isFrozen: deleteField(),
  freezeDuration: deleteField(),
});
