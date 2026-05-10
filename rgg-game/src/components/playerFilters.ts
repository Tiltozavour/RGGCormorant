import type { Player } from "../types/game";

export const isGameParticipant = (player: Player) =>
  player.inGame === true && player.role !== "admin";
