export const PLAY_CARD_CALLABLE_NAME = "playCard";

export const PLAY_CARD_CONTRACT_VERSION = 1;

export const PLAY_CARD_REQUEST_SOURCES = [
  "hand",
  "wheel",
  "interaction",
  "admin",
] as const;

export type PlayCardRequestSource = (typeof PLAY_CARD_REQUEST_SOURCES)[number];

export interface PlayCardRequest {
  version: typeof PLAY_CARD_CONTRACT_VERSION;
  cardId: string;
  targetPlayerId?: string | null;
  source: PlayCardRequestSource;
  clientRequestId: string;
}

export type PlayCardErrorCode =
  | "unauthenticated"
  | "invalid_request"
  | "card_not_found"
  | "card_not_owned"
  | "not_allowed_now"
  | "target_required"
  | "target_invalid"
  | "already_resolved"
  | "conflict"
  | "internal";

export interface PlayCardSuccessResponse {
  ok: true;
  message?: string;
  openedInteractionId?: string;
  revealedCardId?: string;
}

export interface PlayCardErrorResponse {
  ok: false;
  code: PlayCardErrorCode;
  message: string;
}

export type PlayCardResponse = PlayCardSuccessResponse | PlayCardErrorResponse;

export type PlayCardValidationResult =
  | { ok: true; value: PlayCardRequest }
  | { ok: false; code: "invalid_request"; message: string };

const MAX_ID_LENGTH = 128;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isBoundedString = (value: unknown, maxLength = MAX_ID_LENGTH): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

const isPlayCardRequestSource = (value: unknown): value is PlayCardRequestSource =>
  typeof value === "string" && PLAY_CARD_REQUEST_SOURCES.includes(value as PlayCardRequestSource);

export const validatePlayCardRequest = (value: unknown): PlayCardValidationResult => {
  if (!isPlainRecord(value)) {
    return { ok: false, code: "invalid_request", message: "Request must be an object." };
  }

  if (value.version !== PLAY_CARD_CONTRACT_VERSION) {
    return { ok: false, code: "invalid_request", message: "Unsupported playCard contract version." };
  }

  if (!isBoundedString(value.cardId)) {
    return { ok: false, code: "invalid_request", message: "cardId is required." };
  }

  if (!isBoundedString(value.clientRequestId)) {
    return { ok: false, code: "invalid_request", message: "clientRequestId is required." };
  }

  if (!isPlayCardRequestSource(value.source)) {
    return { ok: false, code: "invalid_request", message: "source is invalid." };
  }

  if (
    value.targetPlayerId !== undefined &&
    value.targetPlayerId !== null &&
    !isBoundedString(value.targetPlayerId)
  ) {
    return { ok: false, code: "invalid_request", message: "targetPlayerId is invalid." };
  }

  return {
    ok: true,
    value: {
      version: PLAY_CARD_CONTRACT_VERSION,
      cardId: value.cardId.trim(),
      targetPlayerId: value.targetPlayerId === undefined ? null : value.targetPlayerId,
      source: value.source,
      clientRequestId: value.clientRequestId.trim(),
    },
  };
};

export const makePlayCardRequest = (
  input: Omit<PlayCardRequest, "version" | "clientRequestId"> & { clientRequestId?: string },
): PlayCardRequest => ({
  version: PLAY_CARD_CONTRACT_VERSION,
  cardId: input.cardId,
  targetPlayerId: input.targetPlayerId ?? null,
  source: input.source,
  clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
});
