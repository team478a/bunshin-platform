import {
  ActivateActivityContinuityRule,
  CreateActivityContinuityRule,
  DEFAULT_ACTIVITY_CONTINUITY_RULE,
  ListActivityContinuityRules,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';
const numberField = z.coerce.number().int();
const createSchema = z.object({
  weeklyGoal: numberField.min(1).max(7),
  dormancyDays: numberField.min(1).max(90),
  stepBuildingDays: numberField.min(1).max(365),
  stepContinuingDays: numberField.min(2).max(365),
  stepEstablishedDays: numberField.min(3).max(365),
  firstConfirmation: numberField.min(1).max(365),
  firstPreparation: numberField.min(1).max(365),
  firstPost: numberField.min(1).max(365),
  activeDays: numberField.min(1).max(365),
  changeReason: z.string().trim().min(5).max(1000),
});
const activateSchema = z.object({ ruleId: z.uuid(), reason: z.string().trim().min(5).max(1000) });

async function createRule(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/activity-rules?error=invalid');
  const value = parsed.data;
  const badges = DEFAULT_ACTIVITY_CONTINUITY_RULE.badges.map((badge) => ({
    ...badge,
    threshold:
      badge.badgeKey === 'FIRST_CONFIRMATION'
        ? value.firstConfirmation
        : badge.badgeKey === 'FIRST_PREPARATION'
          ? value.firstPreparation
          : badge.badgeKey === 'FIRST_POST'
            ? value.firstPost
            : value.activeDays,
  }));
  try {
    const db = await import('@bunshin/database');
    await new CreateActivityContinuityRule(new db.PrismaActivityContinuityRuleRepository()).execute(
      {
        actorUserId: actor.userId,
        environment: currentLineEnvironment(),
        weeklyGoal: value.weeklyGoal,
        dormancyDays: value.dormancyDays,
        stepBuildingDays: value.stepBuildingDays,
        stepContinuingDays: value.stepContinuingDays,
        stepEstablishedDays: value.stepEstablishedDays,
        badges,
        changeReason: value.changeReason,
      },
    );
  } catch {
    redirect('/admin/activity-rules?error=save');
  }
  revalidatePath('/admin/activity-rules');
  redirect('/admin/activity-rules?saved=1');
}

async function activateRule(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = activateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/activity-rules?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new ActivateActivityContinuityRule(
      new db.PrismaActivityContinuityRuleRepository(),
    ).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      ...parsed.data,
    });
  } catch {
    redirect('/admin/activity-rules?error=activate');
  }
  revalidatePath('/admin/activity-rules');
  redirect('/admin/activity-rules?activated=1');
}

export default async function ActivityRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; activated?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const environment = currentLineEnvironment();
  let rules;
  try {
    rules = await new ListActivityContinuityRules(
      new db.PrismaActivityContinuityRuleRepository(),
    ).execute(actor.userId, environment);
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const current = rules.find((rule) => rule.status === 'ACTIVE') ?? {
    ...DEFAULT_ACTIVITY_CONTINUITY_RULE,
    environment,
  };
  const query = await searchParams;
  const threshold = (key: string) =>
    current.badges.find((badge) => badge.badgeKey === key)?.threshold ?? 1;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>続けやすさのルール</h1>
        <p>
          目標回数、しばらく利用していないと判断する日数、成長の段階、バッジ条件を版として管理します。
        </p>
      </header>
      {query.saved ? <p className="notice notice--success">新しい下書きを保存しました。</p> : null}
      {query.activated ? (
        <p className="notice notice--success">新しいルールを使用中にしました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。数値の順番と変更理由を確認してください。
        </p>
      ) : null}
      <section className="settings-card">
        <h2>現在使用中</h2>
        <p>
          <strong>
            {environment}・第{current.version}版
          </strong>
        </p>
        <p>
          1週間の目標：{current.weeklyGoal}回 ／ 利用が止まったと判断：{current.dormancyDays}日
        </p>
        <p>
          成長段階：{current.stepBuildingDays}日 → {current.stepContinuingDays}日 →{' '}
          {current.stepEstablishedDays}日
        </p>
      </section>
      <section className="settings-card">
        <h2>新しい版を準備</h2>
        <p>
          保存しただけでは利用者へ反映されません。内容を確認してから「この版を使用する」を押してください。
        </p>
        <form action={createRule} className="form-stack">
          <label className="field">
            <span className="field__label">1週間の目標回数</span>
            <input
              className="field__control"
              type="number"
              name="weeklyGoal"
              min="1"
              max="7"
              defaultValue={current.weeklyGoal}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">利用が止まったと判断する日数</span>
            <input
              className="field__control"
              type="number"
              name="dormancyDays"
              min="1"
              max="90"
              defaultValue={current.dormancyDays}
              required
            />
          </label>
          <h3>発信の成長段階（日数は小さい順）</h3>
          <label className="field">
            <span className="field__label">準備が整ってきた</span>
            <input
              className="field__control"
              type="number"
              name="stepBuildingDays"
              defaultValue={current.stepBuildingDays}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">発信を続けている</span>
            <input
              className="field__control"
              type="number"
              name="stepContinuingDays"
              defaultValue={current.stepContinuingDays}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">発信が習慣になった</span>
            <input
              className="field__control"
              type="number"
              name="stepEstablishedDays"
              defaultValue={current.stepEstablishedDays}
              required
            />
          </label>
          <h3>バッジをもらえる回数・日数</h3>
          <label className="field">
            <span className="field__label">はじめて確認</span>
            <input
              className="field__control"
              type="number"
              name="firstConfirmation"
              defaultValue={threshold('FIRST_CONFIRMATION')}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">はじめて準備</span>
            <input
              className="field__control"
              type="number"
              name="firstPreparation"
              defaultValue={threshold('FIRST_PREPARATION')}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">はじめて投稿</span>
            <input
              className="field__control"
              type="number"
              name="firstPost"
              defaultValue={threshold('FIRST_POST')}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">活動日数</span>
            <input
              className="field__control"
              type="number"
              name="activeDays"
              defaultValue={threshold('THREE_ACTIVE_DAYS')}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">変更理由（必須）</span>
            <textarea
              className="field__control"
              name="changeReason"
              minLength={5}
              maxLength={1000}
              required
            />
          </label>
          <button className="button" type="submit">
            新しい版を下書き保存
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した版</h2>
        {rules.length ? (
          rules.map((rule) => (
            <article key={rule.id}>
              <h3>
                第{rule.version}版・
                {rule.status === 'ACTIVE'
                  ? '使用中'
                  : rule.status === 'DRAFT'
                    ? '下書き'
                    : '過去の版'}
              </h3>
              <p>作成理由：{rule.changeReason}</p>
              {rule.activationReason ? <p>使用開始理由：{rule.activationReason}</p> : null}
              {rule.status === 'DRAFT' ? (
                <form action={activateRule} className="form-stack">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <label className="field">
                    <span className="field__label">使用を始める理由（必須）</span>
                    <textarea className="field__control" name="reason" minLength={5} required />
                  </label>
                  <button className="button button--secondary" type="submit">
                    この版を使用する
                  </button>
                </form>
              ) : null}
            </article>
          ))
        ) : (
          <p>DBに保存した版はまだありません。組み込みの第1版を使用しています。</p>
        )}
      </section>
    </main>
  );
}
