import { doc, setDoc, collection, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { GameCard } from "./card";
import starterCards from "../components/starterCards.json";

/**
 * Функция для первичной инициализации коллекции карточек в БД.
 * Можно вызвать один раз из консоли разработчика или временной кнопки админа.
 */
export const uploadStarterCards = async () => {
  console.log("🚀 Начинаем загрузку карт в Firestore...");
  
  try {
    const batch = writeBatch(db);
    
    starterCards.forEach((card) => {
      const cardRef = doc(db, "cards", card.id);
      // Приводим тип из JSON к нашему интерфейсу GameCard
      batch.set(cardRef, card as GameCard);
    });

    await batch.commit();
    console.log("✅ Все карты успешно загружены в коллекцию 'cards'!");
  } catch (error) {
    console.error("❌ Ошибка при загрузке карт:", error);
    throw error;
  }
};