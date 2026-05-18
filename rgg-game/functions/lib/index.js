import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
initializeApp();
const db = getFirestore();
const assertAdmin = async (uid) => {
    const adminSnap = await db.collection("players").doc(uid).get();
    if (adminSnap.data()?.role !== "admin") {
        throw new HttpsError("permission-denied", "Only admins can reset passwords.");
    }
};
export const resetPlayerPassword = onCall(async (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    await assertAdmin(request.auth.uid);
    const playerId = String(request.data?.playerId ?? "").trim();
    const temporaryPassword = String(request.data?.temporaryPassword ?? "");
    if (!playerId) {
        throw new HttpsError("invalid-argument", "Player id is required.");
    }
    if (temporaryPassword.length < 6) {
        throw new HttpsError("invalid-argument", "Temporary password must be at least 6 characters.");
    }
    await getAuth().updateUser(playerId, {
        password: temporaryPassword,
    });
    await db.collection("gameEvents").add({
        type: "admin_password_reset",
        playerId: request.auth.uid,
        targetPlayerId: playerId,
        timestamp: Date.now(),
        message: "Админ сбросил пароль игроку.",
    });
    return { ok: true };
});
