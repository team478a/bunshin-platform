import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { practiceFixture } from './practice-fixture';
import { lessonCandidate, lessonWish } from './lesson-fixture';
test('confirmed material starts once and records short self report on smartphone', async ({
  app,
  browser,
  screen,
}) => {
  const calls: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/practice', async (route) => {
    const body = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    calls.push(body);
    await route.fulfill({
      json: {
        data: {
          ...practiceFixture,
          note:
            body.action === 'NOTE'
              ? {
                  revision: 1,
                  text: '画面が違う',
                  reportedAt: lessonWish.createdAt,
                  evidenceLevel: 'SELF_REPORT',
                }
              : null,
        },
      },
    });
  });
  await app.open('/?practice');
  await screen.getByRole('button', '希望と教材を確認して実践を始める').tap();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await screen.getByLabel('進めたこと・止まったこと（短く）').fill('画面が違う');
  await screen.getByRole('button', '途中の記録を保存').tap();
  await expect(
    screen.getByText('本人の報告です。提出物による達成確認・独力再現の確認ではありません。'),
  ).toBeVisible();
  expect(calls.map((x) => x.action)).toEqual(['START', 'NOTE']);
  expect(calls[0]).toEqual({
    action: 'START',
    requestId: lessonWish.id,
    requestRevision: 1,
    candidateId: practiceFixture.candidate.id,
  });
  expect(calls[1]).toMatchObject({
    assignmentId: practiceFixture.assignmentId,
    expectedRevision: 0,
    text: '画面が違う',
  });
  expect(calls[1]).not.toHaveProperty('evaluation');
});
test('saving another wish never replaces executing material or work note', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/wish', async (route) => {
    await route.fulfill({
      json: {
        data: {
          ...lessonWish,
          id: '66666666-6666-4666-8666-666666666666',
          revision: 2,
          originalText: 'AIで発表の練習をしたい',
        },
      },
    });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('実現したいこと').fill('AIで発表の練習をしたい');
  await screen.getByRole('button', '希望を保存').tap();
  await expect(screen.getByText('前回保存した希望（版 2）：AIで発表の練習をしたい')).toBeVisible();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByLabel('進めたこと・止まったこと（短く）')).toHaveValue(
    '見出しで止まった',
  );
});
test('revisit retains material and note without regeneration or write', async ({
  app,
  browser,
  screen,
}) => {
  let calls = 0;
  await browser.route('**/api/synthetic/**', async (route) => {
    calls++;
    await route.abort();
  });
  await app.open('/?practice&resume');
  await browser.reload();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByLabel('進めたこと・止まったこと（短く）')).toHaveValue(
    '見出しで止まった',
  );
  expect(calls).toBe(0);
});
test('policy stop preserves readable material but disables writes', async ({ app, screen }) => {
  await app.open('/?practice&resume&stopped');
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByRole('button', '途中の記録を保存')).toBeDisabled();
  await expect(
    screen.getByText('現在は実践の保存を停止しています。保存済みの内容は確認できます。'),
  ).toBeVisible();
});
test('editing a new wish cannot start material for a different displayed wish', async ({
  app,
  screen,
}) => {
  await app.open('/?practice');
  await expect(screen.getByRole('button', '希望と教材を確認して実践を始める')).toBeVisible();
  await screen.getByLabel('実現したいこと').fill('AIで発表の練習をしたい');
  await expect(screen.getByRole('button', '希望と教材を確認して実践を始める')).not.toBeVisible();
  await screen.getByLabel('実現したいこと').fill(lessonWish.originalText);
  await expect(screen.getByRole('button', '希望と教材を確認して実践を始める')).toBeVisible();
});

test('submits typed evidence and shows scoped review without claiming mastery', async ({
  app,
  browser,
  screen,
}) => {
  let submitted: Record<string, unknown> | null = null;
  await browser.route('**/api/synthetic/practice', async (route) => {
    submitted = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    await route.fulfill({
      json: {
        data: {
          allowed: true,
          current: {
            ...practiceFixture,
            submissions: [
              {
                answerId: '99999999-9999-4999-8999-999999999999',
                revision: 1,
                kind: 'TEXT',
                content: '見出しを修正した結果です',
                status: 'READY',
                review: {
                  state: 'FOLLOW_UP',
                  observed: ['見出しの修正結果が提出された'],
                  notEstablished: ['別の文章でも本人が一人で直せること'],
                  feedback: '今回の結果は確認できました。もう一例あると判断しやすくなります。',
                  nextAction: '別の見出しを一か所、自分で直してみてください。',
                },
                createdAt: lessonWish.createdAt,
              },
            ],
          },
        },
      },
    });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('提出内容の種類').selectOption({ value: 'TEXT' });
  await screen.getByLabel('できたこと、または確認してほしい内容').fill('見出しを修正した結果です');
  await screen.getByRole('button', '提出して今回の基準を確認').tap();
  await expect(screen.getByText('追加の確認が必要です。')).toBeVisible();
  await expect(screen.getByRole('button', '次の実践を提案してもらう')).toHaveCount(0);
  await expect(
    screen.getByText('提出文で確認できた点：見出しの修正結果が提出された'),
  ).toBeVisible();
  await expect(screen.getByText(/独力で別の実践ができることは別に扱います/)).toBeVisible();
  expect(submitted).toMatchObject({
    action: 'EVIDENCE',
    assignmentId: practiceFixture.assignmentId,
    candidateId: practiceFixture.candidate.id,
    materialVersion: 1,
    expectedRevision: 0,
    kind: 'TEXT',
    content: '見出しを修正した結果です',
  });
  expect(submitted).toHaveProperty('idempotencyKey');
});

test('verified evidence requires review and learner confirmation before the next task starts', async ({
  app,
  browser,
  screen,
}) => {
  const calls: Record<string, unknown>[] = [];
  const nextCandidate = {
    ...lessonCandidate,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requestRevision: 2,
    confirmedAt: null,
    proposal: {
      ...lessonCandidate.proposal,
      outcome: '見出しの順番を自分で比べられる',
      practice: ['二つの見出し順を比べて本人が選ぶ'],
    },
  };
  const verifiedPractice = {
    ...practiceFixture,
    submissions: [
      {
        answerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        revision: 1,
        kind: 'TEXT' as const,
        content: '見出しを直した結果',
        status: 'READY' as const,
        review: {
          state: 'CURRENT_STEP_EVIDENCE' as const,
          observed: ['提出文で変更を確認'],
          notEstablished: ['別課題での再現'],
          feedback: '今回の基準に沿う提出がありました。',
          nextAction: '見出しの順序を比べてください。',
        },
        createdAt: lessonWish.createdAt,
      },
    ],
  };
  await browser.route('**/api/synthetic/practice', async (route) => {
    const body = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    calls.push(body);
    const confirmed = body.action === 'NEXT_CONFIRM';
    const started = body.action === 'START';
    await route.fulfill({
      json: {
        data: {
          allowed: true,
          current: started
            ? {
                ...practiceFixture,
                assignmentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                planRevision: 2,
                candidate: { ...nextCandidate, confirmedAt: lessonWish.createdAt },
              }
            : {
                ...verifiedPractice,
                nextCandidate: {
                  ...nextCandidate,
                  ...(confirmed ? { confirmedAt: lessonWish.createdAt } : {}),
                },
              },
        },
      },
    });
  });
  await app.open('/?practice&resume&verified');
  await screen.getByRole('button', '次の実践を提案してもらう').tap();
  await expect(screen.getByText('見出しの順番を自分で比べられる')).toBeVisible();
  await expect(screen.getByRole('button', 'この次の課題を始める')).toHaveCount(0);
  await screen.getByRole('button', 'この次の課題案を確認').tap();
  await screen.getByRole('button', 'この次の課題を始める').tap();
  await expect(screen.getByText('二つの見出し順を比べて本人が選ぶ')).toBeVisible();
  expect(calls.map((call) => call.action)).toEqual(['NEXT_PROPOSAL', 'NEXT_CONFIRM', 'START']);
  expect(calls[2]).toMatchObject({
    requestId: nextCandidate.requestId,
    requestRevision: nextCandidate.requestRevision,
    candidateId: nextCandidate.id,
    previousAssignmentId: practiceFixture.assignmentId,
  });
});
