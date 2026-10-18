import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { resolve } from 'node:path';
import { practiceFixture, supportedPracticeFixture } from './practice-fixture';
const testImagePath = resolve(process.cwd(), '../../../apps/web/public/hassy-icon.jpg');

test('practice consultation continues in the learning chat using current task and note versions', async ({
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
  await expect(screen.getByText('紹介文の見出しを一緒に考えましょう。')).toBeVisible();
  await screen.getByLabel('相談内容').fill('画面が違う');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(
    screen.getByText('次の一歩：いま表示されている内容を一つ教えてください'),
  ).toBeVisible();
  await expect(screen.getByText('画面が違う')).toBeVisible();
  await expect(screen.getByText('紹介ページの見出しを自分で直せる')).toBeVisible();
  await expect(screen.getByLabel('進めたこと・止まったこと（短く）')).toHaveValue(
    '見出しで止まった',
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    assignmentId: practiceFixture.assignmentId,
    expectedNoteRevision: 1,
    expectedSupportRevision: 0,
    reason: 'UNKNOWN',
    text: '画面が違う',
  });
  expect(calls[0]).not.toHaveProperty('model');
  expect(calls[0]).not.toHaveProperty('evaluation');
});
test('revisit restores the same learning chat and practice support without provider call or write', async ({
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
  await expect(screen.getByText('画面が違う')).toBeVisible();
  await expect(screen.getByText('紹介文の見出しを一緒に考えましょう。')).toBeVisible();
  await expect(
    screen.getByText('支援であり、達成・合格・独力再現の評価ではありません。'),
  ).toBeVisible();
  expect(calls).toBe(0);
});
test('one screenshot can be selected, previewed, removed, and attached to the same support request', async ({
  app,
  browser,
  screen,
}) => {
  const posted: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/practice/support', async (route) => {
    posted.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      json: {
        data: {
          ...supportedPracticeFixture,
          support: {
            ...supportedPracticeFixture.support,
            history: supportedPracticeFixture.support.history.map((entry) => ({
              ...entry,
              image: { mimeType: 'image/jpeg', sha256: 'a'.repeat(64), sizeBytes: 4 },
            })),
          },
        },
      },
    });
  });
  await app.open('/?practice&resume');
  const picker = screen.getByRole('button', '画面画像（任意・1枚、3MBまで）');
  await picker.setInputFiles([testImagePath]);
  await expect(screen.getByRole('img', '相談に添付する画像のプレビュー')).toBeVisible();
  await screen.getByRole('button', '画像を削除').tap();
  await expect(screen.getByRole('img', '相談に添付する画像のプレビュー')).not.toBeVisible();
  await picker.setInputFiles([testImagePath]);
  await screen.getByLabel('相談内容').fill('ボタンが見つかりません');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(screen.getByRole('img', '相談に添付したスクリーンショット')).toBeVisible();
  expect(posted[0]).toMatchObject({
    assignmentId: practiceFixture.assignmentId,
    text: 'ボタンが見つかりません',
  });
  expect(String(posted[0]?.imageDataUrl)).toMatch(/^data:image\/jpeg;base64,/);
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
  await screen.getByLabel('相談内容').fill('説明が分からない');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(screen.getByText('支援を取得できませんでした。')).toBeVisible();
  await expect(screen.getByLabel('相談内容')).toHaveValue('説明が分からない');
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
  await screen.getByLabel('相談内容').fill('少しヒントがほしい');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(screen.getByRole('button', 'チャットに送信')).toBeDisabled();
  await expect(screen.getByText('返信を確認中です。')).toBeVisible();
  await app.open('/?practice&resume&support&stopped');
  await screen.getByLabel('相談内容').fill('続けたい');
  await expect(screen.getByRole('button', 'チャットに送信')).toBeDisabled();
  await expect(screen.getByText('画面が違う')).toBeVisible();
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
  await screen.getByLabel('相談内容').fill('止まった');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(screen.getByText('確認したいこと：どの作業で止まりましたか')).toBeVisible();
  await screen.getByLabel('相談内容').fill('見出しの長さも悩んでいます');
  await screen.getByRole('button', 'チャットに送信').tap();
  await expect(
    screen.getByText('作業記録が変わったため、この助言は適用していません。'),
  ).toBeVisible();
  await expect(screen.getByText('確認したいこと：どの作業で止まりましたか')).not.toBeVisible();
});
