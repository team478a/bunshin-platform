import { GroupFeatureEntitlementService } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const policySchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  featureKey: z.string().trim().min(1).max(120),
  status: z.enum(['ENABLED', 'DISABLED']),
  dailyLimit: z.string().max(20),
  monthlyLimit: z.string().max(20),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40),
  reason: z.string().trim().min(5).max(1000),
});

function optionalLimit(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid limit');
  return parsed;
}

function optionalDate(value: string): Date | null {
  if (value.trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid date');
  return parsed;
}

function policyPath(groupId: string, suffix = ''): Route {
  return `/admin/groups/${groupId}/features${suffix}` as Route;
}

async function saveGroupFeaturePolicy(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = policySchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/groups?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    ).setGroupPolicy({
      ...input.data,
      actorUserId: actor.userId,
      dailyLimit: optionalLimit(input.data.dailyLimit),
      monthlyLimit: optionalLimit(input.data.monthlyLimit),
      startsAt: optionalDate(input.data.startsAt),
      endsAt: optionalDate(input.data.endsAt),
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'forbidden'
          : 'failed';
    redirect(policyPath(input.data.groupId, `?error=${code}`));
  }
  revalidatePath(policyPath(input.data.groupId));
  redirect(policyPath(input.data.groupId, '?saved=1'));
}

const statusLabel = { ENABLED: '利用できる', DISABLED: '利用できない' } as const;

function localDateTime(value: Date | null): string {
  if (!value) return '';
  return value
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

export default async function GroupFeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse((await params).groupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin) notFound();
  const group = await db.prisma.group.findUnique({
    where: { id: groupId.data },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      status: true,
      workspace: { select: { name: true } },
      featurePolicies: true,
      featureAudits: {
        where: { action: 'GROUP_POLICY_SET' },
        include: { performedByUser: { select: { displayName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      },
    },
  });
  if (!group) notFound();
  const definitions = await new db.PrismaGroupFeatureEntitlementRepository().listDefinitions();
  const activeDefinitions = definitions.filter((item) => item.status === 'ACTIVE');
  const query = await searchParams;
  const canChange = admin.role === 'SUPER_ADMIN' || admin.role === 'OPERATOR';
  const policyByKey = new Map(group.featurePolicies.map((item) => [item.featureKey, item]));
  const parentName = new Map(definitions.map((item) => [item.key, item.name]));
  const errors: Record<string, string> = {
    invalid: '入力内容を確認してください。変更理由は5文字以上必要です。',
    forbidden: 'この設定を変更する権限がありません。',
    failed: '設定を保存できませんでした。もう一度お試しください。',
  };

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループの利用機能</p>
        <h1>{group.name}</h1>
        <p>
          このグループで使ってよい機能と利用上限を設定します。新しい機能が増えた場合も、この画面へ自動的に追加されます。
        </p>
        <p>
          団体：{group.workspace.name} ／ グループ状態：
          {group.status === 'ACTIVE' ? '利用中' : '停止中'}
        </p>
        <Link href={`/admin/groups?workspaceId=${group.workspaceId}`}>← グループ一覧へ戻る</Link>
      </header>

      {query.saved === '1' ? (
        <p className="notice notice--success" role="status">
          機能設定を保存しました。
        </p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {errors[query.error] ?? errors.failed}
        </p>
      ) : null}

      <section className="settings-card">
        <h2>設定の考え方</h2>
        <p>
          「SNS」など親の機能と、その下にある「画像を作る」の両方を利用できる設定にしてください。
        </p>
        <p>ここで設定した上限より多い利用回数を、グループ管理者が参加者へ渡すことはできません。</p>
        {!canChange ? (
          <p>現在は確認だけできます。変更は最高管理者または運用担当者が行います。</p>
        ) : null}
      </section>

      {activeDefinitions.map((definition) => {
        const policy = policyByKey.get(definition.key);
        return (
          <section className="settings-card" key={definition.key}>
            <h2>{definition.name}</h2>
            <p>{definition.description}</p>
            {definition.parentKey ? (
              <p>上の機能：{parentName.get(definition.parentKey) ?? definition.parentKey}</p>
            ) : (
              <p>まとめ機能</p>
            )}
            <p>
              現在：
              <strong>{policy ? statusLabel[policy.status] : '未設定（利用できない）'}</strong>
              {policy?.dailyLimit ? ` ／ 1日 ${policy.dailyLimit}回まで` : ''}
              {policy?.monthlyLimit ? ` ／ 1か月 ${policy.monthlyLimit}回まで` : ''}
            </p>
            {canChange ? (
              <form className="form-stack" action={saveGroupFeaturePolicy}>
                <input type="hidden" name="workspaceId" value={group.workspaceId} />
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="featureKey" value={definition.key} />
                <label className="field">
                  <span className="field__label">このグループで</span>
                  <select
                    className="field__control"
                    name="status"
                    defaultValue={policy?.status ?? 'DISABLED'}
                  >
                    <option value="ENABLED">利用できる</option>
                    <option value="DISABLED">利用できない</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">1日の上限（空欄なら上限なし）</span>
                  <input
                    className="field__control"
                    name="dailyLimit"
                    type="number"
                    min="1"
                    max="1000000"
                    defaultValue={policy?.dailyLimit ?? ''}
                  />
                </label>
                <label className="field">
                  <span className="field__label">1か月の上限（空欄なら上限なし）</span>
                  <input
                    className="field__control"
                    name="monthlyLimit"
                    type="number"
                    min="1"
                    max="1000000"
                    defaultValue={policy?.monthlyLimit ?? ''}
                  />
                </label>
                <label className="field">
                  <span className="field__label">利用開始日時（空欄なら今から）</span>
                  <input
                    className="field__control"
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localDateTime(policy?.startsAt ?? null)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">利用終了日時（空欄なら期限なし）</span>
                  <input
                    className="field__control"
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={localDateTime(policy?.endsAt ?? null)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">変更理由</span>
                  <textarea
                    className="field__control"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    placeholder="例：画像生成テストを開始するため"
                  />
                </label>
                <button className="button" type="submit">
                  この機能の設定を保存
                </button>
              </form>
            ) : null}
          </section>
        );
      })}

      <section className="settings-card">
        <h2>最近の変更</h2>
        {group.featureAudits.length === 0 ? <p>変更履歴はまだありません。</p> : null}
        <ul>
          {group.featureAudits.map((audit) => (
            <li key={audit.id}>
              <strong>{parentName.get(audit.featureKey) ?? audit.featureKey}</strong>：
              {audit.reason} ／{audit.performedByUser.displayName} ／{' '}
              {audit.occurredAt.toLocaleString('ja-JP')}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
