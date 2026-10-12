import type {
  SavedLearningLessonCandidate,
  SavedPersonalLearningRequest,
} from '@bunshin/application';
export const lessonWish: SavedPersonalLearningRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  createdAt: '2026-10-13T00:00:00Z',
  originalText: 'AIでお店のホームページを作りたい',
  deviceType: 'SMARTPHONE',
  toolDescription: 'AIチャット',
  experienceDescription: null,
  currentPosition: null,
};
export const lessonCandidate = {
  id: '22222222-2222-4222-8222-222222222222',
  requestId: lessonWish.id,
  requestRevision: 1,
  originalText: lessonWish.originalText,
  policyVersion: 'LEARNER_PRACTICE_TOOL_INDEPENDENT_V1',
  materialVersion: 1,
  promptVersion: 'synthetic',
  usageKey: 'synthetic',
  createdAt: lessonWish.createdAt,
  confirmedAt: null,
  proposal: {
    status: 'READY',
    reason: '自分のお店の紹介を練習します',
    questions: [],
    outcome: '紹介ページの見出しを自分で直せる',
    explanation: 'AIへお店の特徴を伝え、出力の見出しを比べます',
    example: 'お店の特徴を短く紹介してください',
    practice: ['本人がAIで紹介ページの案を作り、見出しを一か所修正する'],
    evidence: ['修正前後の見出し'],
    criteria: ['希望に合う変更を説明できる'],
  },
} satisfies SavedLearningLessonCandidate;
