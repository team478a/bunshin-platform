import { describe, expect, it } from 'vitest';
import {
  aiResaleOfferMessage,
  parseAiResaleOfferTerms,
  resolveAiResaleOfferState,
  type AiResaleOfferOption,
} from '../src/offer';

const offer = (offerKey: 'STANDARD' | 'MONITOR'): AiResaleOfferOption => ({
  offeringId: `${offerKey.toLowerCase()}-offering`,
  serviceProgramId: `${offerKey.toLowerCase()}-program`,
  displayName: `${offerKey} 90日`,
  priceReference: `manual:${offerKey}`,
  terms: {
    schemaVersion: 1,
    moduleKey: 'AI_RESALE_V1',
    offerKey,
    amountYen: offerKey === 'STANDARD' ? 29_800 : 9_800,
    currency: 'JPY',
    durationDays: 90,
    billingMode: 'EXTERNAL_MANUAL',
    applicationUrl: null,
    supportModes: ['GUIDED'],
  },
});

describe('AI resale DAY7 offer', () => {
  it('reads price and duration from offering terms', () => {
    expect(parseAiResaleOfferTerms(offer('STANDARD').terms)).toEqual(
      expect.objectContaining({ offerKey: 'STANDARD', amountYen: 29_800, durationDays: 90 }),
    );
    expect(
      parseAiResaleOfferTerms({ ...offer('STANDARD').terms, applicationUrl: 'http://bad' }),
    ).toBe(null);
  });

  it('shows the monitor offer only after a price decline', () => {
    const base = {
      freeEnrollmentId: 'free',
      classification: 'PARTIAL' as const,
      standardOffer: offer('STANDARD'),
      monitorOffer: offer('MONITOR'),
      selectedOfferKind: null,
      paidEnrollmentId: null,
    };
    expect(resolveAiResaleOfferState({ ...base, declineReason: null }).status).toBe('STANDARD');
    expect(resolveAiResaleOfferState({ ...base, declineReason: 'PRICE_TOO_HIGH' }).status).toBe(
      'MONITOR',
    );
    expect(resolveAiResaleOfferState({ ...base, declineReason: 'NOT_READY' }).status).toBe(
      'DECLINED',
    );
  });

  it('keeps an application pending until an operator confirms paid enrollment', () => {
    const state = resolveAiResaleOfferState({
      freeEnrollmentId: 'free',
      classification: 'LISTED',
      standardOffer: offer('STANDARD'),
      monitorOffer: offer('MONITOR'),
      declineReason: null,
      selectedOfferKind: 'STANDARD',
      paidEnrollmentId: null,
    });
    expect(state.status).toBe('PENDING_CONFIRMATION');
    expect(state.offer?.terms.amountYen).toBe(29_800);
  });

  it('changes the copy for each DAY7 classification', () => {
    expect(aiResaleOfferMessage('NOT_STARTED').title).toContain('始められなくても');
    expect(aiResaleOfferMessage('PARTIAL').title).toContain('途中から');
    expect(aiResaleOfferMessage('LISTED').title).toContain('販売');
  });
});
