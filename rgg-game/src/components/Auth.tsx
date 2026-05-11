import { useState } from "react";
import { auth, db } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { getPublicAssetUrl } from "./gameConstants";

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    if (login.length < 3) {
      setError("Идентификатор слишком короткий");
      return;
    }

    try {
      // Приводим к нижнему регистру для надежности Auth
      const fakeEmail = `${login.trim().toLowerCase()}@cormorant.dev`;

      if (isRegister) {
        console.log("[Auth] Регистрация:", { login, inviteCode });

        const inviteQuery = query(
          collection(db, "invites"),
          where("code", "==", inviteCode.trim())
        );

        const inviteSnapshot = await getDocs(inviteQuery);

        if (inviteSnapshot.empty) {
          setError("Неверный код доступа");
          return;
        }

        const inviteDoc = inviteSnapshot.docs[0];
        const inviteData = inviteDoc.data();

        if (inviteData.used) {
          setError("Приглашение уже использовано");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          fakeEmail,
          password
        );

        const user = userCredential.user;

        await setDoc(doc(db, "players", user.uid), {
          login: login.trim(),
          position: 0,
          tiltCoins: 0,
          inGame: false,
          role: "player",
          createdAt: new Date(),
        });

        await updateDoc(doc(db, "invites", inviteDoc.id), {
          used: true,
          usedBy: user.uid,
        });

        onLogin(user);
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          fakeEmail,
          password
        );
        onLogin(userCredential.user);
      }
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      const errorCode = authError.code || "";
      const errorMessage = authError.message || "";

      console.error("[Auth] Детальная ошибка:", errorCode, errorMessage);

      if (errorCode === "auth/email-already-in-use") {
        setError("Этот идентификатор уже зарегистрирован, попробуйте войти");
      } else if (errorCode === "auth/invalid-credential" || errorCode === "auth/user-not-found" || errorCode === "auth/wrong-password") {
        setError("Неверный идентификатор или пароль");
      } else if (errorCode === "auth/weak-password") {
        setError("Пароль должен быть не менее 6 символов");
      } else if (errorCode === "permission-denied") {
        setError("Ошибка прав доступа (Rules). Проверьте консоль Firebase.");
      } else {
        setError(`Ошибка: ${errorMessage || "Доступ отклонен"}`);
      }
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-transparent text-white">
      <video
        autoPlay
        loop
        muted
        className="fixed top-0 left-0 w-full h-full object-cover blur-sm scale-105 -z-20"
      >
        <source src={getPublicAssetUrl("/video/bg.mp4")} type="video/mp4" />
      </video>

      <div className="bg-zinc-900 border border-yellow-500/20 p-10 rounded-2xl w-96 shadow-xl flex flex-col gap-3">
        <h1 className="text-3xl text-yellow-400 mb-2 text-center">
          Cormorant Society
        </h1>

        <p className="font-accent text-center text-yellow-400 mb-6">
          Доступ только по приглашению
        </p>

        {isRegister && (
          <input
            type="text"
            placeholder="Код приглашения"
            className="p-3 w-full rounded bg-black border border-gray-700"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
        )}

        <input
          type="text"
          placeholder="Идентификатор"
          className="font-accent p-3 w-full rounded bg-black border border-gray-700"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
        />

        <input
          type="password"
          placeholder="Пароль"
          className="font-accent p-3 w-full rounded bg-black border border-gray-700"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          className="w-full bg-yellow-500 text-black py-3 rounded hover:bg-yellow-400 transition"
        >
          {isRegister ? "Запросить доступ" : "Войти в общество"}
        </button>

        <button
          onClick={() => setIsRegister(!isRegister)}
          className="font-accent text-sm text-gray-400 underline text-center"
        >
          {isRegister ? "Уже есть доступ?" : "Есть код приглашения?"}
        </button>

        {error && <p className="text-red-500 text-center text-sm">{error}</p>}
      </div>
    </div>
  );
};

export default Auth;
