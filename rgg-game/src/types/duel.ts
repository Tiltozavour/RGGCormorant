export type DuelWeapon = "dice" | "game";

export type DuelStatus =
  | "pending"
  | "accepted"
  | "betting"
  | "ready_to_roll"
  | "rolling"
  | "admin_wait"
  | "finished";

export interface DuelState {
  id: string;
  challengerId: string;
  targetId: string;
  status: DuelStatus;
  weapon: DuelWeapon | null;
  bets: Record<string, number>;
  isReady: Record<string, boolean>;
  rolls?: Record<string, number>;
  winnerId?: string | "draw";
}
