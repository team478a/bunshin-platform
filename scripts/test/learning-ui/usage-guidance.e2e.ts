import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { usagePolicyFixture } from './usage-guidance-policy-fixture';
test('visible question records its own scoped receipt once and remains answerable', async ({
  app,
  browser,
  screen,
}) => {
  const calls: Record<string, unknown>[] = [];
  const answers: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/activity-support', async (route) => {
    answers.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
    await route.fulfill({
      body: JSON.stringify({
        data: {
          supportProgress: {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'OFFERED',
            support: {
              key: 'IMAGE_CREDIT_REVIEW',
              title: '画像作成の利用枠を確認する',
              reason: '無料の確認ガイド',
              steps: ['残り回数を確認する'],
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
  });
  let finish: (() => void) | undefined;
  const seen = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await browser.route('**/api/synthetic/activity-support/question-exposure', async (route) => {
    calls.push(JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>);
    await route.fulfill({ json: { data: { recorded: true } } });
    finish?.();
  });
  await app.open('/?activity-support&usage=image&hidden');
  await expect(screen.getByRole('radio', '画像の利用枠と残り回数を確認したい')).not.toBeVisible();
  expect(calls).toHaveLength(0);
  await screen.getByText('サポートを開く', { exact: true }).tap();
  await expect(
    screen.getByRole('heading', '今の利用状況に合わせた案内を確認しますか？'),
  ).toBeVisible();
  await screen.getByRole('radio', '画像の利用枠と残り回数を確認したい').tap();
  await expect(screen.getByRole('button', '回答してサポートを見る')).toBeEnabled();
  await seen;
  expect(calls).toEqual([
    {
      caseIds: ['22222222-2222-4222-8222-222222222222'],
      evidenceKey: 'synthetic-usage-evidence-v1',
    },
  ]);
  await screen.getByText('サポートを開く', { exact: true }).tap();
  await screen.getByText('サポートを開く', { exact: true }).tap();
  expect(calls).toHaveLength(1);
  await screen.getByRole('button', '回答してサポートを見る').tap();
  await expect(screen.getByRole('heading', '画像作成の利用枠を確認する')).toBeVisible();
  expect(answers[0]?.['evidenceKey']).toBe('synthetic-usage-evidence-v1');
  expect(answers[0]?.['userId']).toBeUndefined();
});
for (const [kind, title, link, hash] of [
  ['image', '画像作成の利用枠を確認する', '画像作成回数を確認する', '#credits'],
  ['multi', '複数SNSの投稿準備をまとめる', '投稿の準備を進める', '#today-post'],
  ['referral', '紹介の状況と特典を確認する', '紹介状況を確認する', '#referrals'],
] as const)
  test(`accepted ${kind} guide has a manual next action without automatic external execution`, async ({
    app,
    browser,
    screen,
  }) => {
    await browser.route('**/api/synthetic/activity-support/exposure', async (route) => {
      await route.fulfill({ json: { data: { recorded: true } } });
    });
    await app.open(`/?activity-support&usage=${kind}&offered&accepted`);
    await expect(screen.getByRole('heading', title)).toBeVisible();
    await screen.getByRole('link', link).tap();
    expect(await browser.evaluate(() => location.hash)).toBe(hash);
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (kind === 'image') await app.screenshot('usage-guidance-mobile');
  });
test('OEM saves bounded usage thresholds and unanswered interval on mobile', async ({
  app,
  browser,
  screen,
}) => {
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/synthetic/usage-guidance-policy', async (route) => {
    const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(command);
    const value = usagePolicyFixture();
    value.revision = 2;
    value.service = { ...value.effective, imageMinimum: 9, questionIntervalDays: 14 };
    value.effective = value.service;
    await route.fulfill({
      body: JSON.stringify({ data: value }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?usage-guidance-policy');
  await screen.getByRole('spinbutton', '画像作成成功の依頼数').fill('9');
  await screen.getByRole('spinbutton', '未回答の質問を再表示する間隔（日）').fill('14');
  await screen.getByRole('textbox', '利用案内の変更理由').fill('利用状況に合わせて調整');
  await screen.getByRole('button', '利用案内の条件を保存').tap();
  await expect(screen.getByRole('status')).toContainText('設定を保存しました');
  expect(commands).toHaveLength(1);
  expect(commands[0]?.['expectedRevision']).toBe(1);
  expect(commands[0]?.['authority']).toBe('SERVICE');
  expect(commands[0]?.['workspaceId']).toBeUndefined();
  expect(commands[0]?.['settings']).toEqual({
    enabled: true,
    imageMinimum: 9,
    platformMinimum: 2,
    referralMinimum: 3,
    questionIntervalDays: 14,
  });
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await browser.evaluate(() => {
    window.scrollTo(0, 0);
    return null;
  });
  await app.screenshot('usage-guidance-settings-mobile');
});
