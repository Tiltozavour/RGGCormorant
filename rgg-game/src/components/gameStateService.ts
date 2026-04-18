import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Функция для открытия или закрытия колеса выбора игр для всех участников.
 * @param gameId ID документа с состоянием игры (например, "current")
 * @param isOpen Состояние видимости
 */
export const syncWheelVisibility = async (gameId: string, isOpen: boolean) => {
  // Используем вашу существующую коллекцию gameState
  const gameRef = doc(db, "gameState", gameId);
  try {
    console.log(`[Firebase] Переключаем showWheel в ${isOpen}...`);
    await updateDoc(gameRef, {
      showWheel: isOpen
    });
    console.log("[Firebase] Успешно обновлено!");
  } catch (error) {
    console.error("Ошибка при переключении видимости колеса:", error);
  }
};

/**
 * Функция для сохранения результата вращения и автоматического закрытия колеса.
 */
export const syncWheelResult = async (gameId: string, selectedGame: string) => {
  const gameRef = doc(db, "gameState", gameId);
  console.log("Результат колеса:", selectedGame);
  try {
    await updateDoc(gameRef, {
      nextGame: selectedGame, // Записываем в ваше существующее поле
      showWheel: false,       // Закрываем колесо
    });
  } catch (error) {
    console.error("Ошибка при сохранении результата колеса:", error);
  }
};