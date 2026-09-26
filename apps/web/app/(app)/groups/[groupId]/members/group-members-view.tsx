import Link from 'next/link';
import { GroupInvitationEditor } from '../../../../ui/group-invitation-editor';
import { approveParticipation, saveMembership, saveServiceRole } from './actions';
import type { GroupMembersPageModel } from './group-members-data';
import { GroupMemberFeatureSettings } from './group-member-feature-settings';

function memberLabel(member: {
  user: { displayName: string; email: string | null };
  serviceMemberBusinessProfile: { businessName: string } | null;
}): string {
  const name = member.user.displayName || member.user.email || '名前未設定';
  const businessName = member.serviceMemberBusinessProfile?.businessName.trim();
  return businessName && businessName !== name ? `${businessName} ／ ${name}` : name;
}

function lastUsedLabel(lastUsedAt: Date | null): string {
  if (!lastUsedAt) return 'まだ利用記録がありません';
  return lastUsedAt.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const roleLabel = { MANAGER: 'グループ管理者', PARTICIPANT: '参加者' } as const;
const serviceRoleLabel = {
  SERVICE_OWNER: 'サービス所有者',
  SERVICE_ADMIN: '運営管理者',
  CONTENT_EDITOR: 'コンテンツ担当者',
  PARTICIPANT: '一般参加者',
} as const;

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
  'staff-invalid': '担当する役割と変更理由を確認してください。変更理由は5文字以上必要です。',
  'staff-forbidden':
    '担当者の役割を変更できません。サービス所有者だけが変更でき、最後の所有者は外せません。',
  'staff-failed': '担当者の役割を保存できませんでした。もう一度お試しください。',
};

export function GroupMembersView({ model }: { model: GroupMembersPageModel }) {
  const {
    group,
    query,
    selectedMember,
    pendingMemberships,
    activeMemberships,
    activeOperators,
    onboardingRequired,
    elevated,
    canManageStaff,
  } = model;
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
      {query.staffSaved === '1' ? (
        <p className="notice notice--success" role="status">
          担当者の役割を保存しました。
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

      <section className="settings-card member-management-overview">
        <div>
          <p className="eyebrow">まずはここを確認</p>
          <h2>参加者と利用権限の状況</h2>
          <p>招待・承認・担当者・利用できる機能を、この画面で順番に管理できます。</p>
        </div>
        <dl className="member-management-overview__stats">
          <div>
            <dt>利用中</dt>
            <dd>{activeMemberships.length}人</dd>
          </div>
          <div>
            <dt>確認待ち</dt>
            <dd>{pendingMemberships.length}人</dd>
          </div>
          <div>
            <dt>運営担当</dt>
            <dd>{activeOperators.length}人</dd>
          </div>
          <div>
            <dt>利用できる機能</dt>
            <dd>{group.featurePolicies.length}件</dd>
          </div>
        </dl>
        <nav aria-label="参加者管理の項目" className="settings-anchor-nav">
          <a href="#member-invitation">1. 招待する</a>
          <a href="#member-requests">2. 参加を承認する</a>
          <a href="#member-settings">3. 担当者・状態を決める</a>
          <a href="#member-features">4. 使える機能を決める</a>
        </nav>
      </section>

      <div id="member-invitation">
        <GroupInvitationEditor
          workspaceId={group.workspaceId}
          groupId={group.id}
          serviceSlug={query.service}
        />
      </div>

      <section className="settings-card" id="member-requests">
        <h2>承認を待っている参加申請</h2>
        {pendingMemberships.length === 0 ? (
          <p>現在、確認が必要な参加申請はありません。</p>
        ) : (
          <div className="admin-list">
            {pendingMemberships.map((membership) => (
              <article className="admin-list__item" key={membership.id}>
                <h3>{memberLabel(membership)}</h3>
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

      <section className="settings-card" id="member-settings">
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
                    {memberLabel(membership)}（
                    {group.serviceConfiguration
                      ? serviceRoleLabel[membership.serviceRole]
                      : roleLabel[membership.role]}
                    {group.serviceConfiguration && onboardingRequired
                      ? `・初回設定${membership.serviceOnboardingResponse ? '完了' : '未完了'}`
                      : ''}
                    ）
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
            <p>選択中：{memberLabel(selectedMember)}</p>
            <dl className="member-management-overview__stats">
              <div>
                <dt>連絡先</dt>
                <dd>{selectedMember.user.email ?? 'メールアドレスなし'}</dd>
              </div>
              <div>
                <dt>最終利用</dt>
                <dd>{lastUsedLabel(selectedMember.lastUsedAt)}</dd>
              </div>
            </dl>
            {group.serviceConfiguration ? (
              <section className="settings-card settings-card--nested">
                <h3>初回設定の状況</h3>
                {!onboardingRequired ? (
                  <p>このサービスには初回質問が設定されていません。</p>
                ) : selectedMember.serviceOnboardingResponse ? (
                  <p>
                    <strong>完了</strong> ／{' '}
                    {selectedMember.serviceOnboardingResponse.completedAt.toLocaleString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                    })}
                  </p>
                ) : (
                  <p>
                    <strong>未完了</strong> — 参加者がサービスを開くと、最初の質問が表示されます。
                  </p>
                )}
                <p>回答内容は本人の投稿パートナー作成だけに使い、この画面には表示しません。</p>
              </section>
            ) : null}
            {group.serviceConfiguration && query.service ? (
              <section className="settings-card settings-card--nested">
                <h3>サービスで担当する役割</h3>
                <p>
                  運営の責任者、日々の管理担当、投稿内容を作る担当、一般参加者を分けて設定します。
                </p>
                <form className="form-stack" action={saveServiceRole}>
                  <input type="hidden" name="serviceSlug" value={query.service} />
                  <input type="hidden" name="workspaceId" value={group.workspaceId} />
                  <input type="hidden" name="groupId" value={group.id} />
                  <input type="hidden" name="groupMembershipId" value={selectedMember.id} />
                  <label className="field">
                    <span className="field__label">担当する役割</span>
                    <select
                      className="field__control"
                      name="serviceRole"
                      defaultValue={selectedMember.serviceRole}
                      disabled={!canManageStaff}
                    >
                      <option value="SERVICE_OWNER">サービス所有者</option>
                      <option value="SERVICE_ADMIN">運営管理者</option>
                      <option value="CONTENT_EDITOR">コンテンツ担当者</option>
                      <option value="PARTICIPANT">一般参加者</option>
                    </select>
                  </label>
                  <p>
                    サービス所有者は担当者の役割を変更できます。運営管理者は日々の運営、コンテンツ担当者は投稿内容の準備を担当します。
                  </p>
                  <label className="field">
                    <span className="field__label">変更理由</span>
                    <textarea
                      className="field__control"
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      placeholder="例：投稿内容を準備する担当になったため"
                      disabled={!canManageStaff}
                    />
                  </label>
                  <button className="button" type="submit" disabled={!canManageStaff}>
                    担当する役割を保存
                  </button>
                  {!canManageStaff ? <p>この設定はサービス所有者だけが変更できます。</p> : null}
                </form>
              </section>
            ) : null}
            <form className="form-stack" action={saveMembership}>
              {query.service && <input type="hidden" name="serviceSlug" value={query.service} />}
              <input type="hidden" name="workspaceId" value={group.workspaceId} />
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="groupMembershipId" value={selectedMember.id} />
              {!group.serviceConfiguration ? (
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
              ) : (
                <input type="hidden" name="role" value={selectedMember.role} />
              )}
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

      <GroupMemberFeatureSettings model={model} />

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
