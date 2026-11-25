import { expect, it } from 'vitest';
import { validateLearningIntentAnalysis } from '../src/personal-learning-intent';
import { validateLearningLessonProposal } from '../src/personal-learning-lesson-candidate';

const environment = {
  device: 'PC',
  os: null,
  client: null,
  plan: null,
  language: '日本語',
  experience: null,
  channel: 'browser',
};

const analysis = {
  kind: 'multi-service',
  goal: '商品紹介の素材を整える',
  environment,
  prerequisites: [],
  steps: [
    {
      objective: '紹介文の下書きを作る',
      service: 'ChatGPT',
      feature: '文章の下書き',
      deliverable: '紹介文の下書き',
      success: { kind: 'visible', expected: '商品紹介文を画面で確認できる' },
    },
    {
      objective: '掲載用の画像に文字を入れる',
      service: 'Canva',
      feature: '文字編集',
      deliverable: '商品画像',
      success: { kind: 'artifact', expected: '紹介文が載った商品画像' },
    },
  ],
  questions: [],
};

const oldCandidate = {
  status: 'NEEDS_CONTEXT',
  reason: '利用環境を確認する',
  outcome: '',
  explanation: '',
  example: '',
  practice: [],
  evidence: [],
  criteria: [],
  questions: ['普段使う端末は何ですか？'],
};

it('retains legacy candidates and validates structured learning objectives in the same proposal', () => {
  expect(validateLearningLessonProposal(oldCandidate)).toEqual(oldCandidate);
  expect(validateLearningLessonProposal({ ...oldCandidate, intentAnalysis: analysis })).toEqual({
    ...oldCandidate,
    intentAnalysis: analysis,
  });
});

it('preserves unknown conditions and supports a single focused clarification before planning', () => {
  expect(
    validateLearningIntentAnalysis({
      ...analysis,
      kind: 'practice',
      environment: { ...environment, channel: 'unknown' },
      steps: [],
      questions: ['ブラウザ版とスマートフォンアプリのどちらで操作しますか？'],
    }),
  ).toMatchObject({ environment: { os: null, channel: 'unknown' }, steps: [] });
});

it('rejects unsupported conditions, executable fields and an unbounded plan', () => {
  const [step] = analysis.steps;
  for (const candidate of [
    { ...analysis, kind: 'automate' },
    { ...analysis, steps: [{ ...step, selector: '#submit' }] },
    { ...analysis, steps: [{ ...step, success: { kind: 'execute-js', expected: 'true' } }] },
    { ...analysis, steps: Array(7).fill(step) },
    { ...analysis, steps: [], questions: [] },
  ]) {
    expect(() => validateLearningIntentAnalysis(candidate)).toThrow(
      'invalid learning intent analysis',
    );
  }
});
