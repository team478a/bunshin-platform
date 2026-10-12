import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('free wish on smartphone: no inferred environment, preserve wish, save result', async ({
  app,
  screen,
  browser,
}) => {
  let captured: Record<string, unknown> | null = null;
  await browser.route('**/api/services/**', async (route) => {
    const payload = JSON.parse(route.request.postData ?? '{}');
    captured = payload;
    await route.fulfill({
      json: {
        data: {
          ...payload.content,
          id: 'synthetic',
          revision: 1,
          createdAt: '2026-10-12T00:00:00Z',
        },
      },
    });
  });
  await app.open('/?learning-request');
  await expect(screen.getByRole('button', '希望を保存')).toBeDisabled();
  await expect(screen.getByLabel('使う端末（任意）')).toHaveValue('');
  await screen.getByLabel('実現したいこと').fill('AIでホームページを作りたい');
  await screen.getByRole('button', '希望を保存').tap();
  await expect(screen.getByRole('status')).toContainText('希望を保存しました');
  expect(captured).toMatchObject({
    expectedRevision: 0,
    content: {
      originalText: 'AIでホームページを作りたい',
      deviceType: null,
      experienceDescription: null,
    },
  });
});
test('resume saved free wish: environment and position restored, no generation on revisit', async ({
  app,
  screen,
  browser,
}) => {
  let writes = 0;
  let captured: { content: Record<string, unknown>; expectedRevision: number } = {
    content: {},
    expectedRevision: -1,
  };
  await browser.route('**/api/services/**', async (route) => {
    writes++;
    captured = JSON.parse(route.request.postData ?? '{}');
    await route.fulfill({
      status: 409,
      json: { error: { message: '保存内容が更新されています。再読込してから確認してください。' } },
    });
  });
  await app.open('/?learning-request&resume');
  await expect(screen.getByLabel('実現したいこと')).toHaveValue('AIで発表の練習をしたい');
  await expect(screen.getByLabel('使う端末（任意）')).toHaveValue('PC');
  await expect(screen.getByLabel('今どこまでできていますか（任意）')).toHaveValue(
    '発表の資料を作った',
  );
  expect(writes).toBe(0);
  await screen.getByLabel('実現したいこと').fill('AIで発表の質疑応答を練習したい');
  await screen.getByRole('button', '希望を保存').tap();
  await expect(screen.getByRole('status')).toContainText('再読込');
  await expect(screen.getByLabel('実現したいこと')).toHaveValue('AIで発表の質疑応答を練習したい');
  expect(captured).toMatchObject({ expectedRevision: 1 });
  expect(Object.keys(captured.content).sort()).toEqual([
    'currentPosition',
    'deviceType',
    'experienceDescription',
    'originalText',
    'toolDescription',
  ]);
});

test('network failure keeps input and reuses the same operation key', async ({
  app,
  screen,
  browser,
}) => {
  const keys: string[] = [];
  await browser.route('**/api/services/**', async (route) => {
    const payload = JSON.parse(route.request.postData ?? '{}');
    keys.push(payload.idempotencyKey);
    if (keys.length === 1) await route.abort();
    else
      await route.fulfill({
        json: {
          data: {
            ...payload.content,
            id: 'synthetic',
            revision: 1,
            createdAt: '2026-10-12T00:00:00Z',
          },
        },
      });
  });
  await app.open('/?learning-request');
  await screen.getByLabel('実現したいこと').fill('AIで写真の整理を学びたい');
  await screen.getByRole('button', '希望を保存').tap();
  await expect(screen.getByRole('status')).toContainText(/fetch|保存|ネットワーク/i);
  await expect(screen.getByLabel('実現したいこと')).toHaveValue('AIで写真の整理を学びたい');
  await screen.getByRole('button', '希望を保存').tap();
  await expect(screen.getByRole('status')).toContainText('希望を保存しました');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
