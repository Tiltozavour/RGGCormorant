import { db } from "../firebase"; // Путь к вашему конфигу firebase
import { collection, getDocs, query, where } from "firebase/firestore";

export interface AvailableGame {
  id: string;
  name: string;
  active: boolean;
  image?: string;
}

const FALLBACK_GAMES: AvailableGame[] = [
  { id: "fallback_1", name: "Игра 1", active: true },
  { id: "fallback_2", name: "Игра 2", active: true },
  { id: "fallback_3", name: "Игра 3", active: true },
];

export async function fetchAvailableGames(): Promise<AvailableGame[]> {
  try {
    const gamesRef = collection(db, "wheel");
    const q = query(gamesRef, where("active", "==", true));
    const querySnapshot = await getDocs(q);
    
    const games = querySnapshot.docs.sort((a, b) => a.id.localeCompare(b.id)).map(doc => ({ 
      id: doc.id, 
      name: doc.data().name || doc.id, // Если поля name нет, берем ID (например, game1)
      image: doc.data().image || "",
      active: doc.data().active ?? false
    } as AvailableGame));

    if (games.length === 0) {
      const allGamesSnapshot = await getDocs(gamesRef);
      const allGames = allGamesSnapshot.docs.sort((a, b) => a.id.localeCompare(b.id)).map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.id,
        image: doc.data().image || "",
        active: true,
      } as AvailableGame));

      return allGames.length > 0 ? allGames : FALLBACK_GAMES;
    }
    
    console.log("Загруженные игры для колеса:", games);
    return games;
  } catch (error) {
    console.error("Ошибка при получении коллекции wheel:", error);
    return FALLBACK_GAMES;
  }
}
