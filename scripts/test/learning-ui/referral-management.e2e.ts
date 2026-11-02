import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { referralFixture } from './referral-fixture';
test('mobile review then confirmation uses current revisions and records explicit reason', async ({
  app,
  screen,
  browser,
}) => {
  const fixture = referralFixture();
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/services/synthetic/referral-management', async (route) => {
    if (route.request.method === 'POST') {
      const command = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
      commands.push(command);
      if (command['kind'] === 'REVIEW') {
        fixture.referrals[0]!.review = 'CLEAR';
        fixture.referrals[0]!.revision = 1;
      } else if (command['kind'] === 'CONFIRM') {
        fixture.referrals[0]!.state = 'CONFIRMED';
        fixture.referrals[0]!.revision = 2;
      }
    }
    await route.fulfill({
      body: JSON.stringify({ data: fixture }),
      headers: { 'content-type': 'application/json' },
    });
  });
  await app.open('/?referral-management');
  await expect(screen.getByRole('button', '条件を検証して確定')).toBeDisabled();
  await screen.getByRole('textbox', '操作の理由').fill('合成アカウントの重複確認済み');
  await screen.getByRole('button', '審査：問題なし', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('保存しました');
  await expect(screen.getByRole('button', '条件を検証して確定')).toBeDisabled();
  await screen.getByRole('textbox', '操作の理由').fill('条件を満たしたため確定');
  await screen.getByRole('button', '条件を検証して確定').tap();
  await expect(screen.getByRole('button', '有効紹介の確定を取り消す')).toBeVisible();
  expect(commands.map((c) => c['expectedRevision'])).toEqual([0, 1]);
  expect(commands[1]?.['expectedPolicyVersionId']).toBe(fixture.policy!.id);
  expect(commands.every((c) => !('proof' in c) && !('scope' in c))).toBe(true);
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(
    await browser.evaluate(() =>
      Array.from(
        document.querySelectorAll('.referral-management button, .referral-management a'),
      ).every((element) => element.getBoundingClientRect().height >= 44),
    ),
  ).toBe(true);
  await app.screenshot('referral-management-mobile');
});
test('mobile conflicts do not display a successful confirmation', async ({
  app,
  screen,
  browser,
}) => {
  await browser.route('**/api/services/synthetic/referral-management', async (route) => {
    await route.fulfill({ status: 409, json: { error: { code: 'CONFLICT' } } });
  });
  await app.open('/?referral-management');
  await screen.getByRole('textbox', '操作の理由').fill('合成の確認');
  await screen.getByRole('button', '審査：問題なし', { exact: true }).tap();
  await expect(screen.getByRole('status')).toContainText('再読み込み');
  await expect(screen.getByRole('button', '条件を検証して確定')).toBeDisabled();
  await expect(screen.getByRole('button', '有効紹介の確定を取り消す')).toHaveCount(0);
});
test('OEM without headquarters approval cannot activate policy or confirm', async ({
  app,
  screen,
}) => {
  await app.open('/?referral-management&oem');
  await screen.getByRole('textbox', '操作の理由').fill('合成の条件');
  await expect(screen.getByRole('button', '条件を新しい版で保存')).toBeDisabled();
  await expect(screen.getByRole('button', '条件を検証して確定')).toBeDisabled();
  await expect(screen.getByRole('heading', '有効紹介の条件')).toBeVisible();
});
