import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";

interface ResetPlayerPasswordPayload {
  playerId: string;
  temporaryPassword: string;
}

interface ResetPlayerPasswordResult {
  ok: boolean;
}

const functions = getFunctions(app);

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
