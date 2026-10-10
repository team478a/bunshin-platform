import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  getAiTrainingMissionQuality,
  AI_TRAINING_LEARNING_ROUTER_VERSION,
} from '@bunshin/capability-training';
import { reviewLabels } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/client';

const data = () =>
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
    definition,
    mission: getAiTrainingMissionQuality(definition.legacyMissionRef.actionKey),
    current: null as null | { approvalStatus: string; approvedAt: string },
    revision: 'a'.repeat(64),
    reviewDigest: 'b'.repeat(64),
    routerRuleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
  }));
const state = {
  approvalStatus: 'APPROVED',
  approvedAt: '2026-10-10T00:00:00.000Z',
  approvedByUserId: '11111111-1111-4111-8111-111111111111',
};

test('mobile single approval requires all human checks; response is followed by current-state GET', async ({
  app,
  screen,
  browser,
}) => {
  const items = data();
  const bodies: Record<string, unknown>[] = [];
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: items }),
      });
      return;
    }
    const c = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    bodies.push(c);
    items[0]!.current = state;
    await route.fulfill({
      json: {
        data: { replayed: false, operationId: String(c.operationId), stateAtOperation: state },
      },
    });
  });
  await app.open('/?definition-review');
  expect(bodies).toHaveLength(0);
  await screen.getByRole('button', '現在の定義と承認状態を確認').tap();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  await expect(screen.getByRole('button', 'この1件の承認を登録')).toBeDisabled();
  await screen.getByLabel('レビュー対象の公開commit SHA（40桁）').fill('c'.repeat(40));
  await screen
    .getByLabel('人間レビュー証跡キー（本文・秘密情報は入力しない）')
    .fill('synthetic-review');
  await screen.getByLabel('この1件・対象版の承認登録を確認しました').check();
  await expect(screen.getByRole('button', 'この1件の承認を登録')).toBeDisabled();
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await expect(screen.getByRole('button', 'この1件の承認を登録')).toBeDisabled();
  await screen.getByLabel('この1件・対象版の承認登録を確認しました').check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('承認登録の応答を受信しました');
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ action: 'APPROVE', definitionKey: 'PROMPT_STRUCTURE' });
  await screen.getByRole('button', '現在の定義と承認状態を確認').tap();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  await expect(
    screen.getByText('この版は承認済みです。この画面では撤回・上書きしません。'),
  ).toBeVisible();
  await expect(screen.getByRole('checkbox')).toHaveCount(0);
  expect(
    await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await app.screenshot('definition-review-approved');
});

test('uncertain response freezes other operations and replays identical body', async ({
  app,
  screen,
  browser,
}) => {
  const bodies: string[] = [];
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: data() }),
      });
      return;
    }
    bodies.push(route.request.postData ?? '');
    const c = JSON.parse(bodies[0]!) as { operationId: string };
    await route.fulfill(
      bodies.length === 1
        ? { status: 503, json: {} }
        : {
            json: { data: { replayed: true, operationId: c.operationId, stateAtOperation: state } },
          },
    );
  });
  await app.open('/?definition-review');
  await screen.getByRole('button', '現在の定義と承認状態を確認').tap();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'CONTEXT_SETTING' });
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await screen.getByLabel('レビュー対象の公開commit SHA（40桁）').fill('c'.repeat(40));
  await screen
    .getByLabel('人間レビュー証跡キー（本文・秘密情報は入力しない）')
    .fill('synthetic-review');
  await screen.getByLabel('この1件・対象版の承認登録を確認しました').check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('結果が不明');
  await expect(screen.getByRole('button', '現在の定義と承認状態を確認')).toBeDisabled();
  await expect(screen.getByRole('combobox')).toHaveCount(0);
  await screen.getByRole('button', '同じ操作を再送して確認').tap();
  await expect(screen.getByRole('status')).toContainText('承認登録の応答を受信しました');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});

test('switching definition resets checks and conflict requires new review', async ({
  app,
  screen,
  browser,
}) => {
  let writes = 0;
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: data() }),
      });
      return;
    }
    writes++;
    await route.fulfill({ status: 409, json: { error: 'private' } });
  });
  await app.open('/?definition-review');
  await screen.getByRole('button', '現在の定義と承認状態を確認').tap();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  await screen.getByLabel('学習目的を確認した').check();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'CONSTRAINT_SETTING' });
  await expect(screen.getByLabel('学習目的を確認した')).not.toBeChecked();
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await screen.getByLabel('レビュー対象の公開commit SHA（40桁）').fill('c'.repeat(40));
  await screen
    .getByLabel('人間レビュー証跡キー（本文・秘密情報は入力しない）')
    .fill('synthetic-review');
  await screen.getByLabel('この1件・対象版の承認登録を確認しました').check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('登録は受理されませんでした');
  expect(writes).toBe(1);
  await expect(screen.getByRole('checkbox')).toHaveCount(0);
  await expect(screen.getByRole('button', '同じ操作を再送して確認')).toHaveCount(0);
});
