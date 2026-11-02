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
    provenance: { mode: 'SERVER_V1', reviewedCommitSha: 'c'.repeat(40) },
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

for (const width of [1280, 390, 320]) {
  test(`single approval automatically loads provenance and current state at ${width}px`, async ({
    app,
    screen,
    browser,
  }) => {
    await browser.setViewport({ width, height: 844 });
    const items = data();
    const bodies: Record<string, unknown>[] = [];
    let reads = 0;
    await browser.route('**/api/services/**', async (route) => {
      if (route.request.method === 'GET') {
        reads++;
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
    if (width === 320)
      await browser.evaluate(() => {
        document.body.style.fontSize = '20px';
        return true;
      });
    expect(bodies).toHaveLength(0);
    await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
    await expect(screen.getByRole('button', 'この1件の承認を登録')).toBeDisabled();
    await expect(screen.getByRole('textbox')).toHaveCount(0);
    await expect(screen.getByRole('checkbox')).toHaveCount(7);
    for (const label of Object.values(reviewLabels))
      await screen.getByLabel(`${label}を確認した`).check();
    await screen.getByRole('button', 'この1件の承認を登録').tap();
    await expect(screen.getByRole('status')).toContainText('現在も承認済み');
    expect(reads).toBe(2);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty('reviewEvidenceKey');
    expect(bodies[0]).toMatchObject({
      provenanceMode: 'SERVER_V1',
      reviewedCommitSha: 'c'.repeat(40),
    });
    expect(bodies[0]).toMatchObject({ action: 'APPROVE', definitionKey: 'PROMPT_STRUCTURE' });
    await expect(
      screen.getByText('この版は承認済みです。この画面では撤回・上書きしません。'),
    ).toBeVisible();
    await expect(screen.getByRole('checkbox')).toHaveCount(0);
    expect(
      await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await app.screenshot(`definition-review-approved-${width}`);
  });
}

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
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'CONTEXT_SETTING' });
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('結果が不明');
  await expect(screen.getByRole('button', '状態を再取得')).toBeDisabled();
  await expect(screen.getByRole('combobox')).toHaveCount(0);
  await screen.getByRole('button', '同じ操作を再送して確認').tap();
  await expect(screen.getByRole('status')).toContainText('承認登録の応答を受信しました');
  await expect(screen.getByRole('status')).toContainText('現在は承認済みではありません');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});

test('missing code provenance never enables approval and never asks for a replacement SHA', async ({
  app,
  screen,
  browser,
}) => {
  let writes = 0;
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method !== 'GET') writes++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: data().map((i) => ({
          ...i,
          provenance: { mode: 'SERVER_V1', reviewedCommitSha: null },
        })),
      }),
    });
  });
  await app.open('/?definition-review');
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await expect(screen.getByRole('button', 'この1件の承認を登録')).toBeDisabled();
  await expect(screen.getByRole('textbox')).toHaveCount(0);
  await expect(
    screen.getByText(
      'システムの来歴を取得できないため承認できません。環境担当者に公開コード情報の確認を依頼してください。',
    ),
  ).toBeVisible();
  expect(writes).toBe(0);
});

test('receipt followed by failed GET offers read recovery without resending approval', async ({
  app,
  screen,
  browser,
}) => {
  const items = data();
  let reads = 0;
  let writes = 0;
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      reads++;
      await route.fulfill(
        reads === 2
          ? { status: 503, json: {} }
          : {
              contentType: 'application/json',
              body: JSON.stringify({ data: items }),
            },
      );
      return;
    }
    writes++;
    const command = JSON.parse(route.request.postData ?? '{}') as { operationId: string };
    items[0]!.current = state;
    await route.fulfill({
      json: {
        data: { replayed: false, operationId: command.operationId, stateAtOperation: state },
      },
    });
  });
  await app.open('/?definition-review');
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('承認を再送する必要はありません');
  await expect(screen.getByRole('button', '同じ操作を再送して確認')).toHaveCount(0);
  await screen.getByRole('button', '状態を再取得').tap();
  await expect(screen.getByRole('status')).toContainText('現在の状態を取得しました');
  expect(reads).toBe(3);
  expect(writes).toBe(1);
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
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'PROMPT_STRUCTURE' });
  await screen.getByLabel('学習目的を確認した').check();
  await screen.getByLabel('レビューする学習設計').selectOption({ value: 'CONSTRAINT_SETTING' });
  await expect(screen.getByLabel('学習目的を確認した')).not.toBeChecked();
  for (const label of Object.values(reviewLabels))
    await screen.getByLabel(`${label}を確認した`).check();
  await screen.getByRole('button', 'この1件の承認を登録').tap();
  await expect(screen.getByRole('status')).toContainText('登録は受理されませんでした');
  expect(writes).toBe(1);
  await expect(screen.getByRole('checkbox')).toHaveCount(0);
  await expect(screen.getByRole('button', '同じ操作を再送して確認')).toHaveCount(0);
});
