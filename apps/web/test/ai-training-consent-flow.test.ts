import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_AI_CONSENT_TEXT,
  AI_TRAINING_AI_CONSENT_VERSION,
  invitationAcceptedPath,
  resolveAiTrainingParticipationState,
} from '../src/services/ai-training-consent-policy';
const consentService = readFileSync(
  new URL('../src/services/ai-training-consent.ts', import.meta.url),
  'utf8',
);

const evaluationJob = readFileSync(
  new URL('../src/jobs/training-answer-evaluation-job-handler.ts', import.meta.url),
  'utf8',
);
const evidenceJob = readFileSync(
  new URL('../src/jobs/personal-learning-evidence-review.ts', import.meta.url),
  'utf8',
);
const queue = readFileSync(
  new URL('../src/services/ai-training-evaluation-queue.ts', import.meta.url),
  'utf8',
);
const participantPage = readFileSync(
  new URL('../app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx', import.meta.url),
  'utf8',
);

describe('Manaberu AI training consent flow', () => {
  it('keeps invitation behavior unchanged for other services and routes training invites to confirmation', () => {
    expect(invitationAcceptedPath('hassy', false)).toBe('/s/hassy/home');
    expect(invitationAcceptedPath('manaberu-style', true)).toBe('/s/manaberu-style/training');
  });

  it('waits in order for a program, enrollment, INTERNAL seat, then explicit consent', () => {
    expect(
      resolveAiTrainingParticipationState({
        hasProgram: false,
        hasEnrollment: false,
        hasInternalSeat: false,
        hasCurrentConsent: false,
      }),
    ).toBe('PROGRAM_WAITING');
    expect(
      resolveAiTrainingParticipationState({
        hasProgram: true,
        hasEnrollment: false,
        hasInternalSeat: false,
        hasCurrentConsent: false,
      }),
    ).toBe('ENROLLMENT_WAITING');
    expect(
      resolveAiTrainingParticipationState({
        hasProgram: true,
        hasEnrollment: true,
        hasInternalSeat: false,
        hasCurrentConsent: false,
      }),
    ).toBe('SEAT_WAITING');
    expect(
      resolveAiTrainingParticipationState({
        hasProgram: true,
        hasEnrollment: true,
        hasInternalSeat: true,
        hasCurrentConsent: false,
      }),
    ).toBe('CONSENT_REQUIRED');
    expect(
      resolveAiTrainingParticipationState({
        hasProgram: true,
        hasEnrollment: true,
        hasInternalSeat: true,
        hasCurrentConsent: true,
      }),
    ).toBe('READY');
  });

  it('requires the revised consent wording and appends its new version without deleting history', () => {
    expect(AI_TRAINING_AI_CONSENT_VERSION).toBe('AI_TRAINING_EXTERNAL_AI_V2');
    expect(AI_TRAINING_AI_CONSENT_TEXT).toContain('この同意は、この研修への参加に対するものです');
    expect(AI_TRAINING_AI_CONSENT_TEXT).not.toContain('Enrollment');
    expect(consentService).toContain('consentVersion: AI_TRAINING_AI_CONSENT_VERSION');
    expect(consentService).toContain('aiTrainingUsageConsent.upsert');
    expect(consentService).not.toContain('aiTrainingUsageConsent.delete');
  });

  it('rechecks current consent in the HTTP enqueue path and both AI worker paths', () => {
    expect(queue).toContain('requireAiTrainingUsageConsent');
    expect(evaluationJob).toContain('requireAiTrainingUsageConsent');
    expect(evidenceJob).toContain('requireAiTrainingUsageConsent');
    const providerAttempt = evaluationJob.lastIndexOf('providerAttempted = true');
    expect(
      evaluationJob.lastIndexOf('await requireAiTrainingUsageConsent', providerAttempt),
    ).toBeGreaterThan(-1);
    const evidenceProvider = evidenceJob.indexOf(
      'const result = await generateLearningEvidenceReview',
    );
    expect(
      evidenceJob.lastIndexOf('await requireAiTrainingUsageConsent', evidenceProvider),
    ).toBeGreaterThan(-1);
  });

  it('redirects a pilot training participant back to confirmation until consent and seat are verified', () => {
    expect(participantPage).toContain('await requireAiTrainingUsageConsent({');
    expect(participantPage).toContain('redirect(`/s/${serviceSlug}/training`)');
  });
});
