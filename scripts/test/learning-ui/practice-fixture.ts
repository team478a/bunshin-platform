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
} satisfies PersonalLearningPractice;
