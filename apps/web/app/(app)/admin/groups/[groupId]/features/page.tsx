import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { GroupInvitationEditor } from '../../../../../ui/group-invitation-editor';

export const dynamic = 'force-dynamic';

const statusLabel = { ENABLED: '利用できる', DISABLED: '利用できない' } as const;

function currentPolicyState(
  policy:
    | {
        status: 'ENABLED' | 'DISABLED';
        startsAt: Date | null;
        endsAt: Date | null;
        dailyLimit: number | null;
        monthlyLimit: number | null;
      }
    | null
    | undefined,
  usage: { daily: number; monthly: number },
  now: Date,
): string {
  if (!policy) return '未設定のため利用できません';
  if (policy.status === 'DISABLED') return '停止中です';
  if (policy.startsAt && policy.startsAt > now) return '開始日時前です';
  if (policy.endsAt && policy.endsAt <= now) return '期限切れです';
  if (policy.dailyLimit !== null && usage.daily >= policy.dailyLimit)
    return '今日の上限に達しました';
  if (policy.monthlyLimit !== null && usage.monthly >= policy.monthlyLimit)
    return '今月の上限に達しました';
  return '現在利用できます';
}

function featurePath(groupId: string, featureKey: string): Route {
  return `/admin/groups/${groupId}/features/${featureKey}` as Route;
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
  const localDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const localMonth = localDate.slice(0, 7);
  const now = new Date();
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
      featureUsageEvents: {
        where: { localMonth },
        select: { featureKey: true, localDate: true },
      },
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
  const policyByKey = new Map(group.featurePolicies.map((item) => [item.featureKey, item]));
  const parentName = new Map(definitions.map((item) => [item.key, item.name]));
  const canChange = admin.role === 'SUPER_ADMIN' || admin.role === 'OPERATOR';
  const query = await searchParams;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">グループの利用機能</p>
        <h1>{group.name}</h1>
        <p>機能の利用状況を一覧で確認し、変更したい機能だけ個別に設定します。</p>
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
          設定を保存できませんでした。入力内容と変更理由を確認してください。
        </p>
      ) : null}

      <section className="settings-card">
        <details>
          <summary>初めて設定する場合の手順</summary>
          <ol>
            <li>下の一覧で、使いたい機能の状態を確認します。</li>
            <li>「設定する」を押して、その機能を利用できる状態にします。</li>
            <li>必要な場合だけ、1日・1か月の利用上限を入力します。</li>
            <li>親の機能と、その下にある機能の両方を利用できる設定にします。</li>
          </ol>
        </details>
        {!canChange ? (
          <p>現在は確認だけできます。変更は最高管理者または運用担当者が行います。</p>
        ) : null}
      </section>

      <section className="settings-card" aria-labelledby="feature-settings-list-title">
        <h2 id="feature-settings-list-title">機能の設定一覧</h2>
        <p>「未設定」と「停止中」の機能は、参加者は利用できません。</p>
        <div className="settings-status-list feature-settings-list">
          {activeDefinitions.map((definition) => {
            const policy = policyByKey.get(definition.key);
            const events = group.featureUsageEvents.filter(
              (event) => event.featureKey === definition.key,
            );
            const usage = {
              daily: events.filter((event) => event.localDate === localDate).length,
              monthly: events.length,
            };
            return (
              <article className="settings-status-item" key={definition.key}>
                <h3>{definition.name}</h3>
                <p>{definition.description}</p>
                <p>
                  状態：<strong>{policy ? statusLabel[policy.status] : '未設定'}</strong> ／{' '}
                  {currentPolicyState(policy, usage, now)}
                </p>
                <p>
                  上限：
                  {policy?.dailyLimit ? `1日 ${policy.dailyLimit}回` : '1日 上限なし'} ／
                  {policy?.monthlyLimit ? `1か月 ${policy.monthlyLimit}回` : '1か月 上限なし'}
                </p>
                <p>
                  利用回数：今日 {usage.daily}回 ／ 今月 {usage.monthly}回
                  {definition.parentKey
                    ? ` ／ 上の機能：${parentName.get(definition.parentKey) ?? definition.parentKey}`
                    : ''}
                </p>
                <Link
                  className="button button--secondary"
                  href={featurePath(group.id, definition.key)}
                >
                  {canChange ? '設定する' : '設定を確認する'}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {canChange ? (
        <GroupInvitationEditor workspaceId={group.workspaceId} groupId={group.id} />
      ) : null}

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
