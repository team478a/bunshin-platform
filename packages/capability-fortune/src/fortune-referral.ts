import {
  evaluateServiceReferralQualificationGate,
  normalizeServiceReferralQualificationPolicy,
  type ReferralQualificationConditions,
  type ServiceReferralQualificationMemberEvidence,
  type ServiceReferralQualificationPolicy,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export const FORTUNE_REFERRAL_PROFILE = 'FORTUNE_REFERRAL';
export const FORTUNE_REFERRAL_PROFILE_REVISION = 'fortune-referral-qualification-v1';

export function normalizeFortuneReferralConditions(value: ReferralQualificationConditions) {
  const {
    requireFirstFreeReading,
    minimumActiveDays,
    minimumPaidPurchases,
    registeredFrom,
    registeredBefore,
  } = value;
  const validDate = (date: number | boolean | undefined): date is number | undefined =>
    date === undefined ||
    (typeof date === 'number' &&
      Number.isSafeInteger(date) &&
      date > 0 &&
      date <= 8_640_000_000_000_000);
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'requireFirstFreeReading',
          'minimumActiveDays',
          'minimumPaidPurchases',
          'registeredFrom',
          'registeredBefore',
        ].includes(key),
    ) ||
    !validDate(registeredFrom) ||
    !validDate(registeredBefore) ||
    (registeredFrom !== undefined &&
      registeredBefore !== undefined &&
      registeredFrom >= registeredBefore) ||
    typeof requireFirstFreeReading !== 'boolean' ||
    typeof minimumActiveDays !== 'number' ||
    !Number.isSafeInteger(minimumActiveDays) ||
    minimumActiveDays < 0 ||
    minimumActiveDays > 3660 ||
    typeof minimumPaidPurchases !== 'number' ||
    !Number.isSafeInteger(minimumPaidPurchases) ||
    minimumPaidPurchases < 0 ||
    minimumPaidPurchases > 1000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid fortune referral conditions');
  return {
    requireFirstFreeReading,
    minimumActiveDays,
    minimumPaidPurchases,
    ...(registeredFrom === undefined ? {} : { registeredFrom }),
    ...(registeredBefore === undefined ? {} : { registeredBefore }),
  };
}

export function evaluateFortuneReferralQualification(
  policy: ServiceReferralQualificationPolicy,
  rawConditions: ReferralQualificationConditions,
  evidence: ServiceReferralQualificationMemberEvidence & {
    freeReadingDays: number;
    paidPurchases: number;
  },
  asOf: Date,
) {
  const conditions = normalizeFortuneReferralConditions(rawConditions);
  const memberPolicy = normalizeServiceReferralQualificationPolicy({
    ...policy,
    requireNewRegistration: true,
  });
  const gate = evaluateServiceReferralQualificationGate(memberPolicy, evidence, asOf);
  if (gate.decision !== 'CONTINUE') return gate.decision;
  const registeredAt = evidence.registeredAt!.getTime();
  if (
    (conditions.registeredFrom !== undefined && registeredAt < conditions.registeredFrom) ||
    (conditions.registeredBefore !== undefined && registeredAt >= conditions.registeredBefore)
  )
    return 'REJECTED';
  return evidence.freeReadingDays >=
    Math.max(Number(conditions.requireFirstFreeReading), conditions.minimumActiveDays) &&
    evidence.paidPurchases >= conditions.minimumPaidPurchases
    ? 'QUALIFIED'
    : 'PENDING';
}
