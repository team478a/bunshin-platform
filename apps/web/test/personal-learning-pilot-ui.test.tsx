import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  PersonalLearningPilotCard,
  PersonalLearningCompletionReminder,
  personalLearningRouterMessage,
} from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import { readFileSync } from 'node:fs';
import { resolvePersonalLearningFocus } from '../src/services/personal-learning-focus';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES as definitions } from '@bunshin/capability-training';
describe('Personal Learning pilot presentation', () => {
  it('invites a truthful completion record without claiming mastery or changing NEXT', () => {
    const practice = {
      started: true,
      completed: false,
      supportLevel: 'GUIDED' as const,
      interactions: [],
      firstSuccess: false,
    };
    const render = (assessmentPassed: boolean, value = practice) =>
      renderToStaticMarkup(
        <PersonalLearningCompletionReminder assessmentPassed={assessmentPassed} practice={value} />,
      );
    expect(render(true)).toContain('自分で操作・確認できた場合');
    expect(render(true)).toContain('能力レベルの認定にはなりません');
    expect(render(true)).not.toContain('<button');
    expect(render(false)).toBe('');
    expect(render(true, { ...practice, completed: true })).toBe('');
    expect(render(true, { ...practice, started: false })).toBe('');
  });
  it.each(definitions)(
    'shows server-selected focus for $reference.definitionKey with safe practice guidance',
    (definition) => {
      const plan = {
        status: 'CONFIRMED' as const,
        steps: [
          {
            definition: definition.reference,
            prerequisites: definition.prerequisites,
            selectionReason: 'GOAL_ALIGNMENT',
          },
        ],
      };
      const learningFocus = resolvePersonalLearningFocus(plan, {
        definitionReference: definition.reference,
        actionKey: definition.legacyMissionRef.actionKey,
      })!;
      const html = renderToStaticMarkup(
        <PersonalLearningPilotCard
          serviceSlug="synthetic"
          enrollmentId="synthetic"
          initialSnapshot={{
            learningFocus,
            state: { goals: [], plans: [] },
            readiness: { profileReady: true, approvalReady: true },
            assignment: {
              id: 'synthetic',
              sequence: 1,
              actionKey: definition.legacyMissionRef.actionKey,
              mode: 'WORK',
              status: 'STARTED',
              display: {
                title: 'legacy title',
                reason: '',
                task: 'legacy task',
                instructions: [],
                estimatedMinutes: 5,
              },
              reevaluateAt: null,
              submission: null,
              definitionKey: definition.reference.definitionKey,
            },
            practice: {
              started: true,
              completed: false,
              supportLevel: 'GUIDED',
              interactions: [],
              firstSuccess: false,
            },
          }}
        />,
      );
      expect(html).toContain(learningFocus.title);
      expect(html).toContain(learningFocus.focus);
      expect(html).toContain('架空の勉強会');
      expect(html).toContain('会社の秘密は入力しない');
      expect(html).toContain('外部AIの完成した回答は貼り付けない');
      expect(html).toContain('legacy task');
      expect(html).not.toContain(definition.reference.version);
      expect(html).not.toContain('<table');
    },
  );
  it('does not invent focus from a key-only Assignment', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPilotCard
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialSnapshot={{
          state: { goals: [], plans: [] },
          readiness: { profileReady: true, approvalReady: true },
          assignment: {
            id: 'synthetic',
            sequence: 1,
            actionKey: 'PROMPT_BASIC',
            mode: 'WORK',
            status: 'STARTED',
            display: { title: '', reason: '', task: '', instructions: [], estimatedMinutes: 5 },
            reevaluateAt: null,
            submission: null,
            definitionKey: 'CONTEXT_SETTING',
          },
        }}
      />,
    );
    expect(html).toContain('学習の焦点を確認できません');
    expect(html).not.toContain('前と同じ課題を使い');
  });
  it('explains the learner-created outcome and bounds First Success claims', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningPilotCard
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialSnapshot={{
          state: { goals: [], plans: [] },
          assignment: null,
          readiness: { profileReady: true, approvalReady: true },
          practice: {
            started: false,
            completed: false,
            supportLevel: null,
            interactions: [],
            firstSuccess: true,
          },
        }}
      />,
    );
    expect(html).toContain('マナベルスタイル');
    expect(html).toContain('本人の完了申告');
    expect(html).toContain('最初の実践');
  });
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
