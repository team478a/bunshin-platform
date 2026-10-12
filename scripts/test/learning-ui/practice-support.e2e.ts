import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { practiceFixture, supportedPracticeFixture } from './practice-fixture';

test('smartphone consultation uses current task and note versions, not a new material', async ({
  app,
  browser,
  screen,
}) => {
  const calls: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/practice/support', async (route) => {
    calls.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
    await route.fulfill({ json: { data: supportedPracticeFixture } });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('いま困っていること').selectOption({ value: 'ENVIRONMENT_MISMATCH' });
  await screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）').fill('画面が違う');
  await screen.getByRole('button', 'この課題の続きを相談').tap();
  await expect(
    screen.getByText('次の一歩：いま表示されている内容を一つ教えてください'),
  ).toBeVisible();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByLabel('進めたこと・止まったこと（短く）')).toHaveValue(
    '見出しで止まった',
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    assignmentId: practiceFixture.assignmentId,
    expectedNoteRevision: 1,
    expectedSupportRevision: 0,
    reason: 'ENVIRONMENT_MISMATCH',
    text: '画面が違う',
  });
  expect(calls[0]).not.toHaveProperty('model');
  expect(calls[0]).not.toHaveProperty('evaluation');
});
test('revisit restores support with no provider call or write', async ({
  app,
  browser,
  screen,
}) => {
  let calls = 0;
  await browser.route('**/api/synthetic/**', async (route) => {
    calls++;
    await route.abort();
  });
  await app.open('/?practice&resume&support');
  await browser.reload();
  await expect(screen.getByText('相談：画面が違う')).toBeVisible();
  await expect(
    screen.getByText('支援であり、達成・合格・独力再現の評価ではありません。'),
  ).toBeVisible();
  expect(calls).toBe(0);
});
test('AI failure retains input, work note and original task then reads durable status only', async ({
  app,
  browser,
  screen,
}) => {
  let post = 0;
  let read = 0;
  await browser.route('**/api/synthetic/practice/support', async (route) => {
    post++;
    await route.fulfill({
      status: 503,
      json: { error: { message: '支援を取得できませんでした。' } },
    });
  });
  await browser.route('**/api/synthetic/practice', async (route) => {
    read++;
    await route.fulfill({
      json: {
        data: {
          allowed: true,
          current: {
            ...supportedPracticeFixture,
            support: {
              revision: 1,
              history: supportedPracticeFixture.support.history.map((r) => ({
                ...r,
                status: 'FAILED',
                advice: null,
                promptVersion: null,
                usageKey: null,
              })),
            },
          },
        },
      },
    });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）').fill('説明が分からない');
  await screen.getByRole('button', 'この課題の続きを相談').tap();
  await expect(
    screen.getByText('支援を取得できませんでした。課題と作業記録は残っています。'),
  ).toBeVisible();
  await expect(screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）')).toHaveValue(
    '説明が分からない',
  );
  await expect(screen.getByLabel('進めたこと・止まったこと（短く）')).toHaveValue(
    '見出しで止まった',
  );
  expect(post).toBe(1);
  expect(read).toBe(1);
});
test('pending consultation prevents duplicate send and stopped policy prevents new AI', async ({
  app,
  browser,
  screen,
}) => {
  await browser.route('**/api/synthetic/practice/support', async (route) => {
    await route.fulfill({
      json: {
        data: {
          ...supportedPracticeFixture,
          support: {
            revision: 1,
            history: supportedPracticeFixture.support.history.map((r) => ({
              ...r,
              status: 'PENDING',
              advice: null,
              promptVersion: null,
              usageKey: null,
            })),
          },
        },
      },
    });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）').fill('少しヒントがほしい');
  await screen.getByRole('button', 'この課題の続きを相談').tap();
  await expect(screen.getByRole('button', 'この課題の続きを相談')).toBeDisabled();
  await expect(screen.getByText('相談を保存済み・応答は未確認です。')).toBeVisible();
  await app.open('/?practice&resume&support&stopped');
  await screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）').fill('続けたい');
  await expect(screen.getByRole('button', 'この課題の続きを相談')).toBeDisabled();
  await expect(screen.getByText('相談：画面が違う')).toBeVisible();
});
test('unknown cause is a question and stale advice never becomes a current next step', async ({
  app,
  browser,
  screen,
}) => {
  let count = 0;
  await browser.route('**/api/synthetic/practice/support', async (route) => {
    count++;
    await route.fulfill({
      json: {
        data: {
          ...supportedPracticeFixture,
          support: {
            revision: 1,
            history: supportedPracticeFixture.support.history.map((r) =>
              count === 1
                ? {
                    ...r,
                    advice: {
                      cause: 'UNKNOWN',
                      explanation: '状況を確認します',
                      nextAction: '',
                      question: 'どの作業で止まりましたか',
                    },
                  }
                : { ...r, status: 'STALE', advice: null, promptVersion: null, usageKey: null },
            ),
          },
        },
      },
    });
  });
  await app.open('/?practice&resume');
  await screen.getByLabel('どこまで進めたか・何を聞きたいか（短く）').fill('止まった');
  await screen.getByRole('button', 'この課題の続きを相談').tap();
  await expect(screen.getByText('確認したいこと：どの作業で止まりましたか')).toBeVisible();
  await screen.getByRole('button', 'この課題の続きを相談').tap();
  await expect(screen.getByText('記録が変わったため、古い助言は適用していません。')).toBeVisible();
  await expect(screen.getByText('確認したいこと：どの作業で止まりましたか')).not.toBeVisible();
});
