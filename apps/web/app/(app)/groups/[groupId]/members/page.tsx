import { GroupFeatureEntitlementService, GroupParticipationService } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { serviceManagementReturnPath } from '../../../../../src/services/service-management-return';
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
  serviceSlug: z.string().trim().max(120).optional(),
});

const membershipSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  role: z.enum(['MANAGER', 'PARTICIPANT']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
});

const approvalSchema = z.object({
  workspaceId: z.uuid(),
  groupId: z.uuid(),
  groupMembershipId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
  serviceSlug: z.string().trim().max(120).optional(),
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

async function memberReturnPath(
  groupId: string,
  serviceSlug?: string,
  membershipId?: string,
  suffix = '',
) {
  const query = membershipId ? `?member=${membershipId}${suffix}` : suffix;
  return serviceManagementReturnPath({ groupId, serviceSlug, section: 'members', query });
}

async function saveMemberFeatureAssignment(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(
    input.data.groupId,
    input.data.serviceSlug,
    input.data.groupMembershipId,
  );
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
    redirect(`${returnPath}&error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}&saved=1` as Route);
}

async function saveMembership(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = membershipSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(
    input.data.groupId,
    input.data.serviceSlug,
    input.data.groupMembershipId,
  );
  try {
    const db = await import('@bunshin/database');
    await new GroupParticipationService(
      new db.PrismaGroupParticipationRepository(),
    ).updateMembership({ ...input.data, actorUserId: actor.userId });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'member-invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'member-forbidden'
          : 'member-failed';
    redirect(`${returnPath}&error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}&memberSaved=1` as Route);
}

async function approveParticipation(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = approvalSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const returnPath = await memberReturnPath(input.data.groupId, input.data.serviceSlug);
  try {
    const db = await import('@bunshin/database');
    const { ServiceParticipationService } = await import('@bunshin/application');
    await new ServiceParticipationService(new db.PrismaServiceParticipationRepository()).approve({
      workspaceId: input.data.workspaceId,
      serviceId: input.data.groupId,
      groupMembershipId: input.data.groupMembershipId,
      actorUserId: actor.userId,
      reason: input.data.reason,
    });
  } catch (error) {
    const code =
      error instanceof ApplicationError && error.code === 'VALIDATION_ERROR'
        ? 'approval-invalid'
        : error instanceof ApplicationError && error.code === 'FORBIDDEN'
          ? 'approval-forbidden'
          : 'approval-failed';
    redirect(`${returnPath}?error=${code}` as Route);
  }
  revalidatePath(memberPath(input.data.groupId));
  redirect(`${returnPath}?approved=1` as Route);
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
  searchParams: Promise<{
    member?: string;
    saved?: string;
    memberSaved?: string;
    approved?: string;
    error?: string;
    service?: string;
  }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse((await params).groupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const localDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const localMonth = localDate.slice(0, 7);
  const groupScope = await db.prisma.group.findFirst({
    where: { id: groupId.data, status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    select: { workspaceId: true },
  });
  if (!groupScope) notFound();
  const [manager, workspaceManager, platformAdmin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: { groupId: groupId.data, userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { id: true },
    }),
    db.prisma.workspaceMembership.findFirst({
      where: {
        workspaceId: groupScope.workspaceId,
        userId: actor.userId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: { id: true },
    }),
    db.prisma.platformAdmin.findFirst({
      where: {
        userId: actor.userId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
      },
      select: { id: true },
    }),
  ]);
  if (!manager && !workspaceManager && !platformAdmin) notFound();
  const elevated = Boolean(workspaceManager || platformAdmin);

  const group = await db.prisma.group.findFirst({
    where: { id: groupId.data, workspaceId: groupScope.workspaceId, status: 'ACTIVE' },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      workspace: { select: { name: true } },
      memberships: {
        select: {
          id: true,
          role: true,
          status: true,
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
      membershipAudits: {
        include: {
          groupMembership: { select: { user: { select: { displayName: true } } } },
          performedByUser: { select: { displayName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      },
      featureUsageEvents: {
        where: { localMonth },
        select: { groupMembershipId: true, featureKey: true, localDate: true },
      },
    },
  });
  if (!group) notFound();

  const query = await searchParams;
  const selectedMember =
    group.memberships.find(
      (item) => item.id === query.member && item.status !== 'PENDING_APPROVAL',
    ) ?? group.memberships.find((item) => item.status !== 'PENDING_APPROVAL');
  const pendingMemberships = group.memberships.filter(
    (membership) => membership.status === 'PENDING_APPROVAL',
  );
  const assignments = new Map(
    (selectedMember?.featureAssignments ?? []).map((item) => [item.featureKey, item]),
  );
  const selectedUsage = selectedMember
    ? group.featureUsageEvents.filter((event) => event.groupMembershipId === selectedMember.id)
    : [];
  const errors: Record<string, string> = {
    invalid: '入力内容を確認してください。変更理由は5文字以上必要です。',
    forbidden: 'グループに許可された範囲を超えているため保存できません。',
    failed: '設定を保存できませんでした。もう一度お試しください。',
    'member-invalid': '役割・状態・変更理由を確認してください。変更理由は5文字以上必要です。',
    'member-forbidden':
      'この変更は許可されていません。最後の管理者は停止できず、管理者の任命はシステム管理者が行います。',
    'member-failed': '参加者の状態を保存できませんでした。もう一度お試しください。',
    'approval-invalid': '承認理由を5文字以上で入力してください。',
    'approval-forbidden': 'この参加申請を承認する権限がありません。',
    'approval-failed': '参加申請を承認できませんでした。もう一度お試しください。',
  };

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">参加者の利用機能</p>
        <h1>{group.name}</h1>
        <p>サービスに許可された機能の中から、各参加者が使える機能と上限を設定します。</p>
        <p>団体：{group.workspace.name}</p>
        {query.service ? (
          <a href={`/s/${query.service}/home`}>← サービスのホームへ戻る</a>
        ) : (
          <Link href="/groups">← グループ一覧へ戻る</Link>
        )}
        <br />
        {query.service ? (
          <a href={`/s/${query.service}/manage/legal`}>このサービスの利用規約を管理</a>
        ) : (
          <Link href={`/groups/${group.id}/legal`}>このサービスの利用規約を管理</Link>
        )}
      </header>

      {query.saved === '1' ? (
        <p className="notice notice--success" role="status">
          参加者の機能設定を保存しました。
        </p>
      ) : null}
      {query.memberSaved === '1' ? (
        <p className="notice notice--success" role="status">
          参加者の役割と状態を保存しました。
        </p>
      ) : null}
      {query.approved === '1' ? (
        <p className="notice notice--success" role="status">
          参加申請を承認しました。
        </p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {errors[query.error] ?? errors.failed}
        </p>
      ) : null}

      <GroupInvitationEditor
        workspaceId={group.workspaceId}
        groupId={group.id}
        serviceSlug={query.service}
      />

      <section className="settings-card">
        <h2>承認を待っている参加申請</h2>
        {pendingMemberships.length === 0 ? (
          <p>現在、確認が必要な参加申請はありません。</p>
        ) : (
          <div className="admin-list">
            {pendingMemberships.map((membership) => (
              <article className="admin-list__item" key={membership.id}>
                <h3>{membership.user.displayName}</h3>
                <p>{membership.user.email ?? 'メールアドレスなし'}</p>
                <form className="form-stack" action={approveParticipation}>
                  {query.service && (
                    <input type="hidden" name="serviceSlug" value={query.service} />
                  )}
                  <input type="hidden" name="workspaceId" value={group.workspaceId} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="groupMembershipId" value={membership.id} />
                  <label className="field">
                    <span className="field__label">承認する理由</span>
                    <textarea
                      className="field__control"
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      placeholder="例：登録内容を確認したため承認"
                    />
                  </label>
                  <button className="button" type="submit">
                    この人の参加を承認する
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>設定する参加者</h2>
        {group.memberships.length === pendingMemberships.length ? (
          <p>利用中の参加者はまだいません。</p>
        ) : null}
        <form method="get" className="form-stack">
          {query.service && <input type="hidden" name="service" value={query.service} />}
          <label className="field">
            <span className="field__label">参加者を選ぶ</span>
            <select className="field__control" name="member" defaultValue={selectedMember?.id}>
              {group.memberships
                .filter((membership) => membership.status !== 'PENDING_APPROVAL')
                .map((membership) => (
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
          <>
            <p>
              選択中：{selectedMember.user.displayName} ／{' '}
              {selectedMember.user.email ?? 'メールなし'}
            </p>
            <form className="form-stack" action={saveMembership}>
              {query.service && <input type="hidden" name="serviceSlug" value={query.service} />}
              <input type="hidden" name="workspaceId" value={group.workspaceId} />
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="groupMembershipId" value={selectedMember.id} />
              <label className="field">
                <span className="field__label">役割</span>
                <select
                  className="field__control"
                  name="role"
                  defaultValue={selectedMember.role}
                  disabled={!elevated && selectedMember.role === 'MANAGER'}
                >
                  <option value="PARTICIPANT">参加者</option>
                  <option value="MANAGER" disabled={!elevated}>
                    グループ管理者
                  </option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">現在の状態</span>
                <select
                  className="field__control"
                  name="status"
                  defaultValue={selectedMember.status}
                  disabled={!elevated && selectedMember.role === 'MANAGER'}
                >
                  <option value="ACTIVE">利用中</option>
                  <option value="SUSPENDED">一時停止</option>
                  <option value="REVOKED">参加を終了</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">変更理由</span>
                <textarea
                  className="field__control"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                  placeholder="例：担当変更のため一時停止"
                  disabled={!elevated && selectedMember.role === 'MANAGER'}
                />
              </label>
              <button
                className="button"
                type="submit"
                disabled={!elevated && selectedMember.role === 'MANAGER'}
              >
                役割と状態を保存
              </button>
              {!elevated && selectedMember.role === 'MANAGER' ? (
                <p>管理者の変更は、システム管理者に依頼してください。</p>
              ) : null}
            </form>
          </>
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
            const usage = selectedUsage.filter((event) => event.featureKey === policy.featureKey);
            return (
              <section className="settings-card" key={policy.id}>
                <h2>{policy.feature.name}</h2>
                <p>{policy.feature.description}</p>
                <p>
                  グループ上限：1日 {policy.dailyLimit ?? '上限なし'} ／ 1か月{' '}
                  {policy.monthlyLimit ?? '上限なし'}
                </p>
                <p>
                  利用回数：今日 {usage.filter((event) => event.localDate === localDate).length}回
                  ／ 今月 {usage.length}回
                </p>
                <p>
                  この参加者：
                  <strong>
                    {assignment ? statusLabel[assignment.status] : '未設定（利用できない）'}
                  </strong>
                </p>
                <form className="form-stack" action={saveMemberFeatureAssignment}>
                  {query.service && (
                    <input type="hidden" name="serviceSlug" value={query.service} />
                  )}
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
        <h2>参加者の最近の変更</h2>
        {group.membershipAudits.length === 0 ? <p>変更履歴はまだありません。</p> : null}
        <ul>
          {group.membershipAudits.map((audit) => (
            <li key={audit.id}>
              <strong>{audit.groupMembership?.user.displayName ?? '退会済み参加者'}</strong>
              <br />
              {audit.reason} ／ 操作：{audit.performedByUser.displayName} ／{' '}
              {audit.occurredAt.toLocaleString('ja-JP')}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-card">
        <h2>機能設定の最近の変更</h2>
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
