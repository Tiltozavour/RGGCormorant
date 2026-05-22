import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

interface ResetPlayerPasswordPayload {
  playerId: string;
  temporaryPassword: string;
}

interface ResetPlayerPasswordResult {
  ok: boolean;
}

export const resetPlayerPassword = async (
  playerId: string,
  temporaryPassword: string,
) => {
  const resetPassword = httpsCallable<
    ResetPlayerPasswordPayload,
    ResetPlayerPasswordResult
  >(functions, "resetPlayerPassword");

  const result = await resetPassword({ playerId, temporaryPassword });
  return result.data;
};
