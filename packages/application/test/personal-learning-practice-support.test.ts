import { describe, expect, it } from 'vitest';
import {
  validatePracticeSupportAdvice,
  validatePracticeSupportCommand,
  validatePersonalLearningTextOperation,
  type PracticeSupportCommand,
} from '../src';
const id = '11111111-1111-4111-8111-111111111111';
const command: PracticeSupportCommand = {
  actor: {
    actorUserId: id,
    scope: {
      workspaceId: id,
      groupId: id,
      programEnrollmentId: id,
      groupMembershipId: id,
      userId: id,
    },
  },
  assignmentId: id,
  operationId: id,
  expectedNoteRevision: 0,
  expectedSupportRevision: 0,
  reason: 'ENVIRONMENT_MISMATCH',
  text: '画面が違う',
  image: null,
};
const advice = {
  cause: 'ENVIRONMENT_MISMATCH',
  explanation: '画面の違いを確認します',
  nextAction: 'いま表示されている見出しを短く教えてください',
  question: '',
};
describe('practice support contract', () => {
  it('keeps support separate from assessment and accepts environment barriers', () => {
    expect(() => validatePracticeSupportCommand(command)).not.toThrow();
    expect(validatePracticeSupportAdvice(advice)).toEqual(advice);
  });
  it('unknown cause asks a short question without speculative next action', () => {
    expect(
      validatePracticeSupportAdvice({
        ...advice,
        cause: 'UNKNOWN',
        nextAction: '',
        question: 'どこまで進めましたか',
      }).cause,
    ).toBe('UNKNOWN');
    expect(() => validatePracticeSupportAdvice({ ...advice, cause: 'UNKNOWN' })).toThrow();
    expect(() =>
      validatePracticeSupportAdvice({
        ...advice,
        cause: 'UNKNOWN',
        question: '不明',
        nextAction: 'このボタンを押す',
      }),
    ).toThrow();
  });
  it.each([
    { text: '' },
    { text: 'x'.repeat(501) },
    { text: ' 前後空白 ' },
    { reason: 'LOW_ABILITY' },
    { expectedNoteRevision: -1 },
    { expectedSupportRevision: 1000 },
    { operationId: 'fake' },
  ])('rejects invalid consultation %j', (change) => {
    expect(() =>
      validatePracticeSupportCommand({ ...command, ...change } as PracticeSupportCommand),
    ).toThrow();
  });
  it('requires image bytes, canonical base64, size, and a digest-shaped identifier together', () => {
    const image = {
      mimeType: 'image/jpeg' as const,
      base64: '/9j/2Q==',
      sha256: 'a'.repeat(64),
      sizeBytes: 4,
    };
    expect(() => validatePracticeSupportCommand({ ...command, image })).not.toThrow();
    for (const invalid of [
      { ...image, mimeType: 'image/png' },
      { ...image, sizeBytes: image.sizeBytes + 1 },
      { ...image, base64: 'invalid' },
      { ...image, sha256: 'not-a-digest' },
      { ...image, sizeBytes: 512_001 },
    ])
      expect(() =>
        validatePracticeSupportCommand({ ...command, image: invalid } as PracticeSupportCommand),
      ).toThrow();
  });
  it.each([
    { ...advice, score: 1 },
    { ...advice, goalComplete: true },
    { ...advice, cause: 'BEGINNER' },
    { ...advice, explanation: '' },
    { ...advice, nextAction: '' },
    { ...advice, question: 'x'.repeat(601) },
  ])('rejects assessment or malformed advice %j', (value) => {
    expect(() => validatePracticeSupportAdvice(value)).toThrow();
  });
  it('requires genuine practice version context for admission', () => {
    const operation = {
      actor: command.actor,
      requestId: id,
      expectedRequestRevision: 1,
      operationId: id,
      operationKind: 'PRACTICE_SUPPORT' as const,
      attempt: 1,
      provider: 'synthetic',
      promptVersion: 'TEST_V1',
      pricingRegistry: [],
      policy: {
        workspaceId: id,
        groupId: id,
        serviceProgramId: id,
        dailyAttemptLimit: 3,
        maxConcurrent: 1,
        model: 'synthetic',
        maxRequestBytes: 1000,
        maxOutputTokens: 100,
        dailyCostLimitUsdMicros: 10000,
      },
    };
    expect(() => validatePersonalLearningTextOperation(operation)).toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({
        ...operation,
        practice: {
          assignmentId: id,
          noteRevision: 0,
          supportRevision: 1,
          supportRequestId: id,
          imageSha256: null,
        },
      }),
    ).not.toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({
        ...operation,
        practice: {
          assignmentId: 'fake',
          noteRevision: 0,
          supportRevision: 1,
          supportRequestId: id,
          imageSha256: null,
        },
      }),
    ).toThrow();
  });
});
