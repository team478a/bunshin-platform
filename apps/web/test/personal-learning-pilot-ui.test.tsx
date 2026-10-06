import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  PersonalLearningPilotCard,
  personalLearningRouterMessage,
} from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import { readFileSync } from 'node:fs';
describe('Personal Learning pilot presentation', () => {
  it('shows one learning choice, no chat/provider/unsupported theme offers', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPilotCard
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialSnapshot={{
          state: { goals: [], plans: [] },
          assignment: null,
          readiness: { profileReady: true, approvalReady: true },
        }}
      />,
    );
    expect(html).toContain('今日は何を学びたいですか');
    expect(html).toContain('プロンプトを学びたい');
    expect(html).not.toContain('画像生成を学ぶ');
    expect(html).not.toContain('30日コース');
    expect(html).toContain('textarea');
    expect(html).toContain('button--full');
    expect(html).toContain('業務秘密や個人情報');
  });
  it('never initializes an unknown learner as a beginner', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPilotCard
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialSnapshot={{
          state: { goals: [], plans: [] },
          assignment: null,
          readiness: { profileReady: false, approvalReady: false },
        }}
      />,
    );
    expect(html).toContain('学習設定を準備中');
    expect(html).not.toContain('textarea');
  });
  it('restores Plan completion from a version-scoped Router audit, without repeating the last Mission', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPilotCard
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialSnapshot={{
          state: { goals: [], plans: [] },
          readiness: { profileReady: true, approvalReady: true },
          assignment: {
            id: 'synthetic',
            sequence: 3,
            actionKey: 'PROMPT_CONDITION',
            mode: 'WORK',
            status: 'STARTED',
            display: {
              title: 'last-mission',
              reason: '',
              task: '',
              instructions: [],
              estimatedMinutes: null,
            },
            reevaluateAt: null,
            submission: { answerId: 'synthetic', evaluationStatus: 'READY' },
            definitionKey: 'CONSTRAINT_SETTING',
            planCompleted: true,
          },
        }}
      />,
    );
    expect(html).toContain('今回の学習プランを完了しました');
    expect(html).not.toContain('last-mission');
    expect(html).toContain('契約終了ではありません');
  });
  it.each(['REVIEW', 'RETRY', 'BLOCKED', 'UNKNOWN', 'PLAN_COMPLETED'])(
    'maps %s without exposing internal reason/key or inventing graduation',
    (status) => {
      const text = personalLearningRouterMessage(status);
      expect(text).not.toContain(status);
      expect(text).not.toContain('研修修了しました');
      if (status === 'PLAN_COMPLETED') expect(text).toContain('契約終了ではありません');
    },
  );
  it('I/J: reserves Pilot before legacy current and reuses existing Mission/answer/evaluation flow', () => {
    const page = readFileSync(
      new URL('../app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx', import.meta.url),
      'utf8',
    );
    const card = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(page.indexOf('isPersonalLearningPilotProgram(program.settings)')).toBeLessThan(
      page.indexOf('new AiTrainingParticipantService'),
    );
    expect(page).toContain('resolvePersonalLearningPilot');
    expect(page).toContain('AiTrainingCard');
    expect(card).toContain('AiTrainingMissionCard');
    expect(card).toContain('AiTrainingEvaluationCard');
    expect(card).toContain('`${base}/answers`');
    expect(card).toContain('/evaluate');
    expect(card).not.toMatch(/localStorage|sessionStorage|console\./);
  });
});
