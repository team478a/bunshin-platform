import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { InternalSnapshot } from '../../../apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/internal-client';

const member = '11111111-1111-4111-8111-111111111111';
const offering = '22222222-2222-4222-8222-222222222222';
const enrollment = '33333333-3333-4333-8333-333333333333';
function initial(): InternalSnapshot {
  return {
    operation: { exists: true, status: 'SUSPENDED', enabled: false, stateToken: 'a'.repeat(64) },
    policy: null,
    groupMembershipId: member,
    programOfferingId: offering,
    programEnrollmentId: null,
    enrollmentReady: false,
    seatStatus: 'ABSENT',
  };
}
test('mobile own preparation requires three separate reviewed operations', async ({
  app,
  screen,
  browser,
}) => {
  const state = initial();
  const commands: Record<string, unknown>[] = [];
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({ json: { data: state } });
      return;
    }
    const c = JSON.parse(route.request.postData ?? '{}') as Record<string, unknown>;
    commands.push(c);
    if (c.action === 'CONFIGURE') {
      state.policy = {
        version: 'PILOT_PARTICIPANT_CAP_V1',
        revision: 1,
        externalParticipantCap: 100,
        internalParticipantCap: 1,
        currentWave: 0,
        currentWaveCap: 0,
      };
      await route.fulfill({ json: { data: { revision: 1, reason: 'PILOT_WAVE_CONFIGURED' } } });
    } else if (c.action === 'PREPARE_ENROLLMENT') {
      state.programEnrollmentId = enrollment;
      state.enrollmentReady = true;
      state.operation.stateToken = 'b'.repeat(64);
      await route.fulfill({
        json: { data: { ...state.operation, programEnrollmentId: enrollment } },
      });
    } else if (c.action === 'ADMIT') {
      state.seatStatus = 'INTERNAL';
      state.policy = { ...state.policy!, revision: 2 };
      await route.fulfill({ json: { data: { revision: 2, reason: 'PARTICIPANT_ADMITTED' } } });
    } else {
      await route.fulfill({ status: 403, json: {} });
    }
  });
  await app.open('/?internal-preparation');
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await expect(screen.getByRole('button', '内部人数を設定')).toBeDisabled();
  await screen.getByLabel('内部テスター人数上限').selectOption({ value: '1' });
  const review = screen.getByLabel('人間レビュー記録の識別子（本文・秘密情報は入力しない）');
  const confirm = screen.getByRole('checkbox');
  await review.fill('synthetic-review');
  await confirm.check();
  await screen.getByRole('button', '内部人数を設定').tap();
  await expect(screen.getByRole('status')).toContainText('操作を確認しました');
  expect(commands).toHaveLength(1);
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await expect(screen.getByRole('button', '本人Enrollmentを準備')).toBeDisabled();
  await confirm.check();
  await screen.getByRole('button', '本人Enrollmentを準備').tap();
  await expect(screen.getByRole('status')).toContainText('操作を確認しました');
  expect(commands[1]).toMatchObject({
    action: 'PREPARE_ENROLLMENT',
    groupMembershipId: member,
    programOfferingId: offering,
  });
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await expect(screen.getByRole('button', '本人の内部参加権を付与')).toBeDisabled();
  await confirm.check();
  await screen.getByRole('button', '本人の内部参加権を付与').tap();
  await expect(screen.getByRole('status')).toContainText('操作を確認しました');
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await expect(screen.getByRole('link', '本人の学習準備画面へ')).toBeVisible();
  expect(commands).toHaveLength(3);
  expect(commands[2]).toMatchObject({
    action: 'ADMIT',
    programEnrollmentId: enrollment,
    kind: 'INTERNAL',
    expectedRevision: 1,
  });
  expect(state.operation.enabled).toBe(false);
});
test('lost response only replays identical body and does not expose new controls', async ({
  app,
  screen,
  browser,
}) => {
  const bodies: string[] = [];
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method === 'GET') {
      await route.fulfill({ json: { data: initial() } });
      return;
    }
    bodies.push(route.request.postData ?? '');
    await route.fulfill(
      bodies.length === 1
        ? { status: 503, json: {} }
        : { json: { data: { revision: 1, reason: 'PILOT_WAVE_CONFIGURED' } } },
    );
  });
  await app.open('/?internal-preparation');
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await screen.getByLabel('内部テスター人数上限').selectOption({ value: '2' });
  await screen
    .getByLabel('人間レビュー記録の識別子（本文・秘密情報は入力しない）')
    .fill('synthetic-review');
  await screen.getByRole('checkbox').check();
  await screen.getByRole('button', '内部人数を設定').tap();
  await expect(screen.getByRole('button', '本人の準備状態を確認')).toBeDisabled();
  await expect(screen.getByRole('combobox')).toHaveCount(0);
  await screen.getByRole('button', '同じ操作を再送して確認').tap();
  await expect(screen.getByRole('status')).toContainText('操作を確認しました');
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
});
test('revoked own seat cannot be re-admitted or repurposed', async ({ app, screen, browser }) => {
  let writes = 0;
  await browser.route('**/api/services/**', async (route) => {
    if (route.request.method !== 'GET') writes++;
    await route.fulfill({ json: { data: { ...initial(), seatStatus: 'REVOKED' } } });
  });
  await app.open('/?internal-preparation');
  await screen.getByRole('button', '本人の準備状態を確認').tap();
  await expect(screen.getByRole('status')).toContainText('この画面では準備できません');
  await expect(screen.getByRole('checkbox')).toHaveCount(0);
  expect(writes).toBe(0);
});
