import { db } from "../firebase"; // Путь к вашему конфигу firebase
import { collection, getDocs, query, where } from "firebase/firestore";

export interface AvailableGame {
  id: string;
  name: string;
  active: boolean;
  image?: string;
}

export async function fetchAvailableGames(): Promise<AvailableGame[]> {
  try {
    const gamesRef = collection(db, "wheel");
    const q = query(gamesRef, where("active", "==", true));
    const querySnapshot = await getDocs(q);
    
    const games = querySnapshot.docs.map(doc => ({ 
      id: doc.id, 
      name: doc.data().name || doc.id, // Если поля name нет, берем ID (например, game1)
      image: doc.data().image || "",
      active: doc.data().active ?? false
    } as AvailableGame));
    
    console.log("Загруженные игры для колеса:", games);
    return games;
  } catch (error) {
    console.error("Ошибка при получении коллекции wheel:", error);
    return [];
  }
}