import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { practiceFixture } from './practice-fixture';
import { lessonWish } from './lesson-fixture';
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
