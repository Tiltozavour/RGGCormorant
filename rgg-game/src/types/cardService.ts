import { collection, deleteDoc, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { GameCard } from "./card";
import starterCards from "../components/starterCards.json";
import { RARITY_CONFIG } from "../components/gameConstants";

type StarterCardSeed = Omit<GameCard, "bgGradientStart" | "bgGradientEnd"> & {
  bgGradientStart?: string | null;
  bgGradientEnd?: string | null;
};

export const uploadStarterCards = async () => {
  console.log("Начинаем загрузку карт в Firestore...");

  try {
    const batch = writeBatch(db);

    (starterCards as StarterCardSeed[]).forEach((rawCard) => {
      const config = RARITY_CONFIG[rawCard.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG.default;

      const card: GameCard = {
        ...rawCard,
        bgCard: rawCard.bgCard ?? config.bgCard,
        bgGradientStart: rawCard.bgGradientStart ?? config.bgGradientStart,
        bgGradientEnd: rawCard.bgGradientEnd ?? config.bgGradientEnd,
      };

      if (card.rarity === "legendary") {
        const prizeRef = doc(db, "prizes", card.id);
        batch.set(prizeRef, {
          ...card,
          isUnique: true,
          isWon: card.isWon ?? false,
          winnerId: card.winnerId ?? null,
        });
      } else {
        const cardRef = doc(db, "cards", card.id);
        batch.set(cardRef, card);
      }
    });

    await batch.commit();
    console.log("Все карты успешно загружены в Firestore.");
  } catch (error) {
    console.error("Ошибка при загрузке карт:", error);
    throw error;
  }
};

export const resetStarterCards = async () => {
  const [cardsSnap, prizesSnap] = await Promise.all([
    getDocs(collection(db, "cards")),
    getDocs(collection(db, "prizes")),
  ]);

  await Promise.all([
    ...cardsSnap.docs.map((cardDoc) => deleteDoc(cardDoc.ref)),
    ...prizesSnap.docs.map((prizeDoc) => deleteDoc(prizeDoc.ref)),
  ]);

  await uploadStarterCards();
};
