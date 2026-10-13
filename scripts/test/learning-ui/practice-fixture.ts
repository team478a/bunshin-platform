import type { PersonalLearningPractice } from '@bunshin/application';
import { lessonCandidate, lessonWish } from './lesson-fixture';
export const practiceFixture = {
  assignmentId: '33333333-3333-4333-8333-333333333333',
  goalId: '44444444-4444-4444-8444-444444444444',
  planId: '55555555-5555-4555-8555-555555555555',
  planRevision: 1,
  startedAt: lessonWish.createdAt,
  candidate: { ...lessonCandidate, confirmedAt: lessonWish.createdAt },
  environment: {
    deviceType: lessonWish.deviceType,
    toolDescription: lessonWish.toolDescription,
    experienceDescription: null,
    currentPosition: null,
  },
  note: {
    revision: 1,
    text: '見出しで止まった',
    reportedAt: lessonWish.createdAt,
    evidenceLevel: 'SELF_REPORT',
  },
  support: { revision: 0, history: [] },
  submissions: [],
} satisfies PersonalLearningPractice;
export const supportedPracticeFixture = {
  ...practiceFixture,
  support: {
    revision: 1,
    history: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        operationId: '88888888-8888-4888-8888-888888888888',
        revision: 1,
        noteRevision: 1,
        candidateId: practiceFixture.candidate.id,
        materialVersion: 1,
        reason: 'ENVIRONMENT_MISMATCH',
        text: '画面が違う',
        requestedAt: lessonWish.createdAt,
        status: 'READY',
        advice: {
          cause: 'ENVIRONMENT_MISMATCH',
          explanation: '画面の違いを確認します。能力の評価ではありません。',
          nextAction: 'いま表示されている内容を一つ教えてください',
          question: '',
        },
        promptVersion: 'synthetic-support-v1',
        usageKey: 'synthetic-support-usage',
      },
    ],
  },
} satisfies PersonalLearningPractice;
