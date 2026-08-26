import { GroupFeatureEntitlementService } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { GroupInvitationEditor } from '../../../../ui/group-invitation-editor';

export const dynamic = 'force-dynamic';

const assignmentSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
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

function memberPath(groupId: string, membershipId?: string, suffix = ''): Route {
  const query = membershipId ? `?member=${membershipId}${suffix}` : suffix;
  return `/groups/${groupId}/members${query}` as Route;
}

async function saveMemberFeatureAssignment(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  try {
    const db = await import('@bunshin/database');
    await new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    ).setMemberAssignment({
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
    redirect(memberPath(input.data.groupId, input.data.groupMembershipId, `&error=${code}`));
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(memberPath(input.data.groupId, input.data.groupMembershipId, '&saved=1'));
}

function localDateTime(value: Date | null): string {
  if (!value) return '';
  return value
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

const roleLabel = { MANAGER: 'グループ管理者', PARTICIPANT: '参加者' } as const;
const statusLabel = { ENABLED: '利用できる', DISABLED: '利用できない' } as const;

export default async function GroupMemberFeaturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ member?: string; saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse((await params).groupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const manager = await db.prisma.groupMembership.findFirst({
    where: {
      groupId: groupId.data,
      userId: actor.userId,
      role: 'MANAGER',
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { workspaceId: true },
  });
  if (!manager) notFound();

  const group = await db.prisma.group.findFirst({
    where: { id: groupId.data, workspaceId: manager.workspaceId, status: 'ACTIVE' },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      workspace: { select: { name: true } },
      memberships: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          role: true,
          user: { select: { displayName: true, email: true } },
          featureAssignments: true,
        },
        orderBy: { user: { displayName: 'asc' } },
      },
      featurePolicies: {
        where: { status: 'ENABLED', feature: { status: 'ACTIVE' } },
        include: { feature: true },
        orderBy: { featureKey: 'asc' },
      },
      featureAudits: {
        where: { action: 'MEMBER_ASSIGNMENT_SET' },
        include: {
          groupMembership: { select: { user: { select: { displayName: true } } } },
          performedByUser: { select: { displayName: true } },
          feature: { select: { name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      },
    },
  });
  if (!group) notFound();

  const query = await searchParams;
  const selectedMember =
    group.memberships.find((item) => item.id === query.member) ?? group.memberships[0];
  const assignments = new Map(
    (selectedMember?.featureAssignments ?? []).map((item) => [item.featureKey, item]),
  );
  const errors: Record<string, string> = {
    invalid: '入力内容を確認してください。変更理由は5文字以上必要です。',
    forbidden: 'グループに許可された範囲を超えているため保存できません。',
    failed: '設定を保存できませんでした。もう一度お試しください。',
  };

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">参加者の利用機能</p>
        <h1>{group.name}</h1>
        <p>グループに許可された機能の中から、各参加者が使える機能と上限を設定します。</p>
        <p>団体：{group.workspace.name}</p>
        <Link href="/groups">← グループ一覧へ戻る</Link>
      </header>

      {query.saved === '1' ? (
        <p className="notice notice--success" role="status">
          参加者の機能設定を保存しました。
        </p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {errors[query.error] ?? errors.failed}
        </p>
      ) : null}

      <GroupInvitationEditor workspaceId={group.workspaceId} groupId={group.id} />

      <section className="settings-card">
        <h2>設定する参加者</h2>
        {group.memberships.length === 0 ? <p>参加者がまだいません。</p> : null}
        <form method="get" className="form-stack">
          <label className="field">
            <span className="field__label">参加者を選ぶ</span>
            <select className="field__control" name="member" defaultValue={selectedMember?.id}>
              {group.memberships.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.user.displayName}（{roleLabel[membership.role]}）
                </option>
              ))}
            </select>
          </label>
          <button className="button button--secondary" type="submit">
            表示する
          </button>
        </form>
        {selectedMember ? (
          <p>
            選択中：{selectedMember.user.displayName} ／ {selectedMember.user.email ?? 'メールなし'}
          </p>
        ) : null}
      </section>

      {selectedMember && group.featurePolicies.length === 0 ? (
        <section className="settings-card">
          <h2>設定できる機能がありません</h2>
          <p>システム管理者が、このグループで使える機能を許可すると表示されます。</p>
        </section>
      ) : null}

      {selectedMember
        ? group.featurePolicies.map((policy) => {
            const assignment = assignments.get(policy.featureKey);
            return (
              <section className="settings-card" key={policy.id}>
                <h2>{policy.feature.name}</h2>
                <p>{policy.feature.description}</p>
                <p>
                  グループ上限：1日 {policy.dailyLimit ?? '上限なし'} ／ 1か月{' '}
                  {policy.monthlyLimit ?? '上限なし'}
                </p>
                <p>
                  この参加者：
                  <strong>
                    {assignment ? statusLabel[assignment.status] : '未設定（利用できない）'}
                  </strong>
                </p>
                <form className="form-stack" action={saveMemberFeatureAssignment}>
                  <input type="hidden" name="workspaceId" value={group.workspaceId} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="groupMembershipId" value={selectedMember.id} />
                  <input type="hidden" name="featureKey" value={policy.featureKey} />
                  <label className="field">
                    <span className="field__label">この参加者が</span>
                    <select
                      className="field__control"
                      name="status"
                      defaultValue={assignment?.status ?? 'DISABLED'}
                    >
                      <option value="ENABLED">利用できる</option>
                      <option value="DISABLED">利用できない</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">1日の上限（空欄ならグループ上限と同じ）</span>
                    <input
                      className="field__control"
                      name="dailyLimit"
                      type="number"
                      min="1"
                      max={policy.dailyLimit ?? 1_000_000}
                      defaultValue={assignment?.dailyLimit ?? ''}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">1か月の上限（空欄ならグループ上限と同じ）</span>
                    <input
                      className="field__control"
                      name="monthlyLimit"
                      type="number"
                      min="1"
                      max={policy.monthlyLimit ?? 1_000_000}
                      defaultValue={assignment?.monthlyLimit ?? ''}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">利用開始日時（空欄なら今から）</span>
                    <input
                      className="field__control"
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={localDateTime(assignment?.startsAt ?? null)}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">利用終了日時（空欄なら期限なし）</span>
                    <input
                      className="field__control"
                      name="endsAt"
                      type="datetime-local"
                      defaultValue={localDateTime(assignment?.endsAt ?? null)}
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
                      placeholder="例：画像作成を担当してもらうため"
                    />
                  </label>
                  <button className="button" type="submit">
                    この参加者の設定を保存
                  </button>
                </form>
              </section>
            );
          })
        : null}

      <section className="settings-card">
        <h2>最近の変更</h2>
        {group.featureAudits.length === 0 ? <p>変更履歴はまだありません。</p> : null}
        <ul>
          {group.featureAudits.map((audit) => (
            <li key={audit.id}>
              <strong>
                {audit.groupMembership?.user.displayName ?? '退会済み参加者'}：{audit.feature.name}
              </strong>
              <br />
              {audit.reason} ／ 操作：{audit.performedByUser.displayName} ／{' '}
              {audit.occurredAt.toLocaleString('ja-JP')}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
