import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import type { GameCard } from "./card";
import starterCards from "../components/starterCards.json";

type StarterCardSeed = Omit<GameCard, "bgGradientStart" | "bgGradientEnd"> & {
  bgGradientStart?: string | null;
  bgGradientEnd?: string | null;
};

/**
 * Р¤СѓРЅРєС†РёСЏ РґР»СЏ РїРµСЂРІРёС‡РЅРѕР№ РёРЅРёС†РёР°Р»РёР·Р°С†РёРё РєРѕР»Р»РµРєС†РёРё РєР°СЂС‚РѕС‡РµРє РІ Р‘Р”.
 * РњРѕР¶РЅРѕ РІС‹Р·РІР°С‚СЊ РѕРґРёРЅ СЂР°Р· РёР· РєРѕРЅСЃРѕР»Рё СЂР°Р·СЂР°Р±РѕС‚С‡РёРєР° РёР»Рё РІСЂРµРјРµРЅРЅРѕР№ РєРЅРѕРїРєРё Р°РґРјРёРЅР°.
 */
export const uploadStarterCards = async () => {
  console.log("рџљЂ РќР°С‡РёРЅР°РµРј Р·Р°РіСЂСѓР·РєСѓ РєР°СЂС‚ РІ Firestore...");

  try {
    const batch = writeBatch(db);

    (starterCards as StarterCardSeed[]).forEach((rawCard) => {
      const card: GameCard = {
        ...rawCard,
        bgGradientStart: rawCard.bgGradientStart ?? undefined,
        bgGradientEnd: rawCard.bgGradientEnd ?? undefined,
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
