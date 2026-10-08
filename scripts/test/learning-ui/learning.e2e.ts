import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { PersonalLearningPilotSnapshot } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-pilot-card';
import type { ConfirmedLearningGoalReference } from '@bunshin/application';
import type { GuidedPracticeCommand } from '@bunshin/capability-training';
import type { TrainingEvaluation } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-types';

const evaluation: TrainingEvaluation = {
  result: 'PASS',
  understanding: 85,
  skills: {
    promptStructure: 85,
    contextSetting: 80,
    constraintSetting: 80,
    outputControl: 80,
    businessApplication: 80,
    revisionSkill: 80,
  },
  evaluatedSkillKeys: ['promptStructure'],
  strengths: ['目的が明確です'],
  weaknesses: [],
  recommendedNextSkill: 'contextSetting',
  nextRecommendation: '背景情報も伝えましょう',
  evaluationRuleVersion: 'SYNTHETIC_V1',
};

function snapshot(): PersonalLearningPilotSnapshot {
  const scope = {
    workspaceId: 'synthetic-workspace',
    groupId: 'synthetic-service',
    userId: 'synthetic-user',
    programEnrollmentId: 'synthetic',
    groupMembershipId: 'synthetic-member',
  };
  const goal: ConfirmedLearningGoalReference = {
    kind: 'CONFIRMED_GOAL_REFERENCE',
    confirmedByUserId: scope.userId,
    reference: {
      kind: 'EXISTING_GOAL_REFERENCE',
      scope,
      programMemberGoalId: 'synthetic-goal',
      goalDefinitionId: null,
      status: 'ACTIVE',
    },
    semanticRef: {
      packageKey: 'AI_TRAINING',
      goalKey: 'USE_AI_IN_DAILY_WORK',
      version: 'SYNTHETIC_V1',
    },
  };
  return {
    state: {
      goals: [{ reference: goal, confirmedAt: '2026-10-08T00:00:00Z' }],
      plans: [
        {
          isCurrent: true,
          goalActive: true,
          createdAt: '2026-10-08T00:00:00Z',
          confirmedAt: '2026-10-08T00:00:00Z',
          plan: {
            contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
            ruleVersion: 'SYNTHETIC_V1',
            planId: 'synthetic-plan',
            revision: 1,
            previousRevision: null,
            revisionReason: 'INITIAL',
            scope,
            goal,
            status: 'CONFIRMED',
            confirmation: {
              planId: 'synthetic-plan',
              revision: 1,
              confirmedByUserId: scope.userId,
            },
            steps: ['PROMPT_STRUCTURE', 'CONTEXT_SETTING', 'CONSTRAINT_SETTING'].map(
              (definitionKey, index, all) => ({
                definition: { packageKey: 'AI_TRAINING', definitionKey, version: 'SYNTHETIC_V1' },
                prerequisites:
                  index === 0
                    ? []
                    : [
                        {
                          packageKey: 'AI_TRAINING',
                          definitionKey: all[index - 1]!,
                          version: 'SYNTHETIC_V1',
                        },
                      ],
                selectionReason: 'SYNTHETIC_TEST',
              }),
            ),
          },
        },
      ],
    },
    readiness: { profileReady: true, approvalReady: true },
    assignment: {
      id: 'assignment-1',
      sequence: 1,
      actionKey: 'PROMPT_BASIC',
      mode: 'WORK',
      status: 'STARTED',
      display: {
        title: 'AIへの指示を作る',
        reason: '目的と背景を伝える練習です',
        task: '安全な題材でAIへの指示を考えてください',
        instructions: ['目的を決める', '相手と背景を伝える', '自分でAIへ入力し結果を確認する'],
        hint: '目的・背景・条件を整理しましょう',
        estimatedMinutes: 5,
      },
      reevaluateAt: null,
      submission: null,
      definitionKey: 'PROMPT_STRUCTURE',
    },
    practice: {
      started: false,
      completed: false,
      supportLevel: null,
      interactions: [],
      firstSuccess: false,
    },
  };
}

async function mockLearning(
  browser: Browser,
  options: {
    restored?: boolean;
    failed?: boolean;
    denied?: boolean;
    pending?: boolean;
    completed?: boolean;
    review?: boolean;
  } = {},
) {
  const value = snapshot();
  const counts = { answers: 0, queue: 0, reads: 0, next: 0 };
  if (options.restored) {
    value.assignment!.submission = {
      answerId: 'answer-1',
      evaluationStatus: options.failed ? 'FAILED' : 'READY',
    };
    value.practice = { ...value.practice!, started: true, supportLevel: 'GUIDED' };
  }
  if (options.completed) value.assignment!.planCompleted = true;
  await browser.route('**/api/services/**', async (route) => {
    if (options.denied) {
      await route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
      return;
    }
    const url = route.request.url;
    const method = route.request.method;
    const body = route.request.postData
      ? (JSON.parse(route.request.postData) as {
          operation?: string;
          command?: GuidedPracticeCommand;
        })
      : null;
    let data: unknown = value;
    if (url.endsWith('/evaluate')) {
      if (method === 'POST') {
        counts.queue += 1;
        value.assignment!.submission!.evaluationStatus = 'PENDING';
        data = { status: 'PENDING' };
      } else {
        counts.reads += 1;
        if (options.pending) data = { status: 'PENDING' };
        else if (options.failed && counts.queue === 0) data = { status: 'FAILED' };
        else if (!options.restored && counts.reads === 1) data = { status: 'PENDING' };
        else {
          value.assignment!.submission!.evaluationStatus = 'READY';
          data = {
            status: 'READY',
            evaluation: options.review ? { ...evaluation, result: 'REVIEW' } : evaluation,
          };
        }
      }
    } else if (url.endsWith('/answers')) {
      counts.answers += 1;
      value.assignment!.submission = { answerId: 'answer-1', evaluationStatus: 'PENDING' };
      data = { answer: { id: 'answer-1' } };
    } else if (method === 'POST' && body?.operation === 'PRACTICE' && body.command) {
      if (body.command.action === 'START')
        value.practice = {
          ...value.practice!,
          started: true,
          supportLevel: body.command.supportLevel,
        };
      if (body.command.action === 'INTERACT')
        value.practice = {
          ...value.practice!,
          interactions: [...value.practice!.interactions, body.command.interaction],
        };
      if (body.command.action === 'COMPLETE')
        value.practice = { ...value.practice!, completed: true, firstSuccess: true };
      data = { saved: true };
    } else if (method === 'POST' && body?.operation === 'NEXT') {
      counts.next += 1;
      value.assignment = {
        ...value.assignment!,
        id: 'assignment-2',
        sequence: 2,
        definitionKey: 'CONTEXT_SETTING',
        submission: null,
        display: { ...value.assignment!.display, title: '背景情報を伝える' },
      };
      value.practice = {
        started: false,
        completed: false,
        supportLevel: null,
        interactions: [],
        firstSuccess: true,
      };
      data = {
        result: {
          status: 'NEXT',
          reason: 'ASSESSMENT_PASSED',
          definition: {
            packageKey: 'AI_TRAINING',
            definitionKey: 'CONTEXT_SETTING',
            version: 'SYNTHETIC_V1',
          },
        },
      };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  return counts;
}

test('learner reads steps, answers, sees async assessment and proceeds to next practice', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser);
  await app.open('/');
  await screen.getByRole('button', 'この方法で実践を始める').tap();
  await expect(screen.getByRole('heading', 'AIへの指示を作る')).toBeVisible();
  await expect(screen.getByText('相手と背景を伝える', { exact: true })).toBeVisible();
  await screen.getByRole('button', 'ヒントを見る').tap();
  await expect(screen.getByText('目的・背景・条件を整理しましょう', { exact: true })).toBeVisible();
  await screen.getByRole('button', '自分でAIへ入力した').tap();
  await screen.getByRole('button', 'AIの結果を自分で確認した').tap();
  await screen
    .getByLabel('あなたの回答')
    .fill('練習用のお知らせを、初めて読む相手へ短く伝えるための指示です。');
  await screen.getByRole('button', '回答を送って確認する').tap();
  await expect(screen.getByRole('heading', 'できています')).toBeVisible();
  await expect(screen.getByText('目的が明確です', { exact: true })).toBeVisible();
  await screen.getByLabel('自分で操作・確認して完成させた').check();
  await screen.getByLabel('自分に役立つ結果が得られた').check();
  await screen.getByRole('button', '本人の実践完了を記録する').tap();
  await expect(screen.getByText(/最初の実践が完了しました/)).toBeVisible();
  await screen.getByRole('button', '次の課題を見る').tap();
  await expect(
    screen.getByText('前回の結果をもとに、次はこちらを学びましょう', { exact: true }),
  ).toBeVisible();
  await screen.getByRole('button', 'この方法で実践を始める').tap();
  await expect(screen.getByRole('heading', '背景情報を伝える')).toBeVisible();
  await expect(screen.getByRole('heading', 'できています')).toBeHidden();
  expect(counts.answers).toBe(1);
  expect(counts.queue).toBe(1);
  expect(counts.next).toBe(1);
});

test('reopening restores a stored assessment without a POST or Provider requeue', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser, { restored: true });
  await app.open('/');
  await expect(screen.getByRole('heading', 'できています')).toBeVisible();
  await browser.reload();
  await expect(screen.getByRole('heading', 'できています')).toBeVisible();
  expect(counts.answers).toBe(0);
  expect(counts.queue).toBe(0);
});

test('FAILED does not advance or retry automatically; learner can explicitly retry', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser, { restored: true, failed: true });
  await app.open('/');
  await expect(screen.getByRole('button', 'AI評価をもう一度試す')).toBeVisible();
  expect(counts.queue).toBe(0);
  await expect(screen.getByRole('button', '次の課題を見る')).toBeHidden();
  await screen.getByRole('button', 'AI評価をもう一度試す').tap();
  await expect(screen.getByRole('heading', 'できています')).toBeVisible();
  expect(counts.answers).toBe(0);
  expect(counts.queue).toBe(1);
});

test('denied Pilot cannot read an assessment or display learning as passed', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser, { denied: true });
  await app.open('/');
  await expect(screen.getByRole('alert')).toContainText('学習状態を確認できませんでした');
  await expect(screen.getByRole('heading', 'できています')).toBeHidden();
  expect(counts.queue).toBe(0);
  expect(counts.reads).toBe(0);
});

test('manual pending status check only reads; it never queues another assessment', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser, { restored: true, pending: true });
  await app.open('/');
  await expect.poll(() => counts.reads).toBeGreaterThan(0);
  await screen.getByRole('button', '評価状況を確認する').tap();
  await expect.poll(() => counts.reads).toBeGreaterThan(1);
  expect(counts.queue).toBe(0);
  expect(counts.answers).toBe(0);
  await expect(screen.getByRole('button', '次の課題を見る')).toBeHidden();
});

test('completed Plan does not restore an old result with another next button', async ({
  app,
  screen,
  browser,
}) => {
  const counts = await mockLearning(browser, { restored: true, completed: true });
  await app.open('/');
  await expect(screen.getByText(/今回の学習プランを完了しました/)).toBeVisible();
  await expect(screen.getByRole('button', '次の課題を見る')).toBeHidden();
  expect(counts.reads).toBe(0);
  expect(counts.next).toBe(0);
});

test('REVIEW provides a retry path but cannot claim practice completion', async ({
  app,
  screen,
  browser,
}) => {
  await mockLearning(browser, { restored: true, review: true });
  await app.open('/');
  await expect(screen.getByRole('heading', 'もう一度、短く復習しましょう')).toBeVisible();
  await expect(screen.getByRole('button', '復習してもう一度回答する')).toBeVisible();
  await expect(screen.getByRole('button', '本人の実践完了を記録する')).toBeHidden();
});
