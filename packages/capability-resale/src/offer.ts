import type { DaySevenClassification } from './index';

export const AI_RESALE_OFFER_KINDS = ['STANDARD', 'MONITOR'] as const;
export type AiResaleOfferKind = (typeof AI_RESALE_OFFER_KINDS)[number];

export const AI_RESALE_OFFER_DECLINE_REASONS = [
  'PRICE_TOO_HIGH',
  'NOT_READY',
  'NOT_INTERESTED',
  'OTHER',
] as const;
export type AiResaleOfferDeclineReason = (typeof AI_RESALE_OFFER_DECLINE_REASONS)[number];

export interface AiResaleOfferTerms {
  schemaVersion: 1;
  moduleKey: 'AI_RESALE_V1';
  offerKey: AiResaleOfferKind;
  amountYen: number;
  currency: 'JPY';
  durationDays: 90;
  billingMode: 'EXTERNAL_MANUAL';
  applicationUrl: string | null;
  supportModes: Array<'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE'>;
}

export interface AiResaleOfferOption {
  offeringId: string;
  serviceProgramId: string;
  displayName: string;
  priceReference: string;
  terms: AiResaleOfferTerms;
}

export type AiResaleOfferStatus =
  'STANDARD' | 'MONITOR' | 'DECLINED' | 'PENDING_CONFIRMATION' | 'ENROLLED' | 'UNAVAILABLE';

export interface AiResaleOfferState {
  freeEnrollmentId: string;
  classification: DaySevenClassification;
  status: AiResaleOfferStatus;
  offer: AiResaleOfferOption | null;
  selectedOfferKind: AiResaleOfferKind | null;
  paidEnrollmentId: string | null;
}

export type AiResaleOfferAction =
  | { type: 'VIEW'; offerKind: AiResaleOfferKind; idempotencyKey: string }
  | {
      type: 'DECLINE_STANDARD';
      reason: AiResaleOfferDeclineReason;
      idempotencyKey: string;
    }
  | { type: 'SELECT'; offerKind: AiResaleOfferKind; idempotencyKey: string };

export type AiResaleOfferWriteResult = 'APPLIED' | 'ALREADY_APPLIED' | 'STALE' | 'NOT_FOUND';

export class AiResaleOfferError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
  }
}

export interface AiResaleOfferRepository {
  findState(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    freeEnrollmentId: string;
    now: Date;
  }): Promise<AiResaleOfferState | null>;
  applyAction(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    freeEnrollmentId: string;
    action: AiResaleOfferAction;
    occurredAt: Date;
  }): Promise<AiResaleOfferWriteResult>;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validApplicationUrl = (value: unknown) => {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export function parseAiResaleOfferTerms(value: unknown): AiResaleOfferTerms | null {
  if (!object(value)) return null;
  const supportModes = value['supportModes'];
  if (
    value['schemaVersion'] !== 1 ||
    value['moduleKey'] !== 'AI_RESALE_V1' ||
    !AI_RESALE_OFFER_KINDS.includes(value['offerKey'] as AiResaleOfferKind) ||
    !Number.isInteger(value['amountYen']) ||
    Number(value['amountYen']) <= 0 ||
    value['currency'] !== 'JPY' ||
    value['durationDays'] !== 90 ||
    value['billingMode'] !== 'EXTERNAL_MANUAL' ||
    !validApplicationUrl(value['applicationUrl']) ||
    !Array.isArray(supportModes) ||
    supportModes.length === 0 ||
    !supportModes.every((mode) => ['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'].includes(String(mode)))
  ) {
    return null;
  }
  return value as unknown as AiResaleOfferTerms;
}

export function resolveAiResaleOfferState(input: {
  freeEnrollmentId: string;
  classification: DaySevenClassification;
  standardOffer: AiResaleOfferOption | null;
  monitorOffer: AiResaleOfferOption | null;
  declineReason: AiResaleOfferDeclineReason | null;
  selectedOfferKind: AiResaleOfferKind | null;
  paidEnrollmentId: string | null;
}): AiResaleOfferState {
  if (input.paidEnrollmentId) {
    return {
      freeEnrollmentId: input.freeEnrollmentId,
      classification: input.classification,
      status: 'ENROLLED',
      offer: null,
      selectedOfferKind: input.selectedOfferKind,
      paidEnrollmentId: input.paidEnrollmentId,
    };
  }
  if (input.selectedOfferKind) {
    const selected =
      input.selectedOfferKind === 'STANDARD' ? input.standardOffer : input.monitorOffer;
    return {
      freeEnrollmentId: input.freeEnrollmentId,
      classification: input.classification,
      status: 'PENDING_CONFIRMATION',
      offer: selected,
      selectedOfferKind: input.selectedOfferKind,
      paidEnrollmentId: null,
    };
  }
  if (input.declineReason === 'PRICE_TOO_HIGH' && input.monitorOffer) {
    return {
      freeEnrollmentId: input.freeEnrollmentId,
      classification: input.classification,
      status: 'MONITOR',
      offer: input.monitorOffer,
      selectedOfferKind: null,
      paidEnrollmentId: null,
    };
  }
  if (input.declineReason) {
    return {
      freeEnrollmentId: input.freeEnrollmentId,
      classification: input.classification,
      status: 'DECLINED',
      offer: null,
      selectedOfferKind: null,
      paidEnrollmentId: null,
    };
  }
  return {
    freeEnrollmentId: input.freeEnrollmentId,
    classification: input.classification,
    status: input.standardOffer ? 'STANDARD' : 'UNAVAILABLE',
    offer: input.standardOffer,
    selectedOfferKind: null,
    paidEnrollmentId: null,
  };
}

export function aiResaleOfferMessage(classification: DaySevenClassification) {
  if (classification === 'LISTED') {
    return {
      title: '出品できた流れを、販売につながる形へ整えます',
      description: '次の90日間は、反応確認と改善を繰り返しながら販売まで伴走します。',
    };
  }
  if (classification === 'PARTIAL') {
    return {
      title: '途中からでも、次の一歩を一緒に決められます',
      description: '止まった場所から再開できる小さなActionを、毎回一つだけ提示します。',
    };
  }
  return {
    title: 'まだ始められなくても大丈夫です',
    description: '一人で迷わないよう、最初の小さなActionから90日間案内します。',
  };
}

export class AiResaleOfferService {
  constructor(private readonly repository: AiResaleOfferRepository) {}

  async current(input: Parameters<AiResaleOfferRepository['findState']>[0]) {
    const state = await this.repository.findState(input);
    if (!state) throw new AiResaleOfferError('NOT_FOUND', 'AI resale offer not found');
    return state;
  }

  async act(input: Parameters<AiResaleOfferRepository['applyAction']>[0]) {
    const result = await this.repository.applyAction(input);
    if (result === 'NOT_FOUND')
      throw new AiResaleOfferError('NOT_FOUND', 'AI resale offer not found');
    if (result === 'STALE') throw new AiResaleOfferError('CONFLICT', 'AI resale offer was updated');
    return result;
  }
}
