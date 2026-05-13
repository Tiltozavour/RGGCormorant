export const REFLECT_CARD_ID = "inv_012";

const REFLECTABLE_CARD_IDS = new Set([
  "inv_007",
  "inv_008",
  "inv_009",
  "inv_010",
  "inv_011",
  "inv_012",
  "inv_013",
  "inv_015",
  "inv_016",
]);

export const isReflectableCard = (cardId: string) => REFLECTABLE_CARD_IDS.has(cardId);

export const canOfferReflectResponse = ({
  cardId,
  currentPlayerId,
  targetPlayerId,
  targetInventory,
}: {
  cardId: string;
  currentPlayerId: string;
  targetPlayerId?: string | null;
  targetInventory?: string[];
}) => (
  Boolean(targetPlayerId) &&
  targetPlayerId !== currentPlayerId &&
  Boolean(targetInventory?.includes(REFLECT_CARD_ID)) &&
  isReflectableCard(cardId)
);

export const calculateJudgeCoinsOutcome = ({
  roll,
  cardValue,
  hasPromoCode,
}: {
  roll: number;
  cardValue?: number | null;
  hasPromoCode: boolean;
}) => {
  const value = cardValue || 2;
  const baseDelta = roll >= 4 ? value : -value;
  const promoCodeReduced = baseDelta < 0 && hasPromoCode;
  const delta = promoCodeReduced ? Math.ceil(baseDelta / 2) : baseDelta;

  return {
    roll,
    baseDelta,
    delta,
    amount: Math.abs(delta),
    promoCodeReduced,
  };
};

export const calculatePromoAdjustedLoss = ({
  amount,
  hasPromoCode,
}: {
  amount: number;
  hasPromoCode: boolean;
}) => ({
  amount: hasPromoCode ? Math.floor(amount / 2) : amount,
  promoCodeReduced: hasPromoCode,
});
