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
  console.log("рџљЂ РќР°С‡РёРЅР°РµРј Р·Р°РіСЂСѓР·РєСѓ РєР°СЂС‚ РІ Firestore...");

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
        batch.set(prizeRef, card);
      } else {
        const cardRef = doc(db, "cards", card.id);
        batch.set(cardRef, card);
      }
    });

    await batch.commit();
    console.log("вњ… Р’СЃРµ РєР°СЂС‚С‹ СѓСЃРїРµС€РЅРѕ Р·Р°РіСЂСѓР¶РµРЅС‹ РІ РєРѕР»Р»РµРєС†РёСЋ 'cards'!");
  } catch (error) {
    console.error("вќЊ РћС€РёР±РєР° РїСЂРё Р·Р°РіСЂСѓР·РєРµ РєР°СЂС‚:", error);
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
