import Link from 'next/link';
import {
  createGroup,
  createOperatorInvitation,
  reissueOperatorInvitation,
  revokeOperatorInvitation,
  saveProfile,
} from './organization-manage-actions';
import type { OrganizationManagePageModel } from './organization-manage-data';

function invitationStatus(invitation: {
  status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED';
  expiresAt: Date;
}) {
  if (invitation.status === 'REVOKED') return '取り消し済み';
  if (invitation.status === 'EXHAUSTED') return '参加済み';
  if (invitation.expiresAt <= new Date()) return '期限切れ';
  return '招待中';
}

function invitationRecipient(email: string) {
  return email.endsWith('@invitation.local') ? '手動招待（宛先未記録）' : email;
}

export function OrganizationManageView({ model }: { model: OrganizationManagePageModel }) {
  const { organization, query } = model;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">運営団体の管理</p>
        <h1>{organization.name}</h1>
        <p>運営団体の基本情報、運営者、この団体に所属するプロジェクトを管理します。</p>
        <Link href={`/organizations/${organization.id}/usage`}>
          今月の利用人数・料金を確認する →
        </Link>
        <br />
        <Link href={`/organizations/${organization.id}/payment`}>自社の決済先を設定する →</Link>
      </header>
      <section className="operations-overview" aria-label="団体の設定状況">
        <div>
          <span>運営者</span>
          <strong>{organization.memberships.length}人</strong>
        </div>
        <div>
          <span>招待中</span>
          <strong>
            {
              organization.invitations.filter(
                (invitation) => invitation.status === 'ACTIVE' && invitation.expiresAt > new Date(),
              ).length
            }
            件
          </strong>
        </div>
        <div>
          <span>プロジェクト</span>
          <strong>{organization.groups.length}件</strong>
        </div>
      </section>
      {query.saved === 'profile' ? (
        <p className="notice notice--success">団体情報を保存しました。</p>
      ) : null}
      {query.invitation ? (
        <section className="settings-card">
          <h2>運営者の招待リンクを作成しました</h2>
          <p>
            {query.delivery === 'sent'
              ? '招待メールを送信しました。届かない場合だけ、下のリンクを安全な方法で送ってください。'
              : 'メール送信の設定がないため、下のリンクを招待する本人へ安全な方法で送ってください。'}
          </p>
          <input
            className="field__control"
            value={query.invitation}
            readOnly
            aria-label="運営者招待リンク"
          />
        </section>
      ) : null}
      {query.invitationAction === 'revoked' ? (
        <p className="notice notice--success">招待を取り消しました。</p>
      ) : null}
      {query.invitationAction === 'manual-link' ? (
        <p className="notice">
          以前の手動招待リンクは再送できません。新しい招待を作成してください。
        </p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {query.error === 'operator-limit'
            ? '契約で許可された運営者数の上限に達しています。システム管理者へお問い合わせください。'
            : query.error === 'group-limit'
              ? '契約で許可されたプロジェクト数の上限に達しているか、団体が利用期間外です。システム管理者へお問い合わせください。'
              : '団体の新規設定は現在停止されています。システム管理者へお問い合わせください。'}
        </p>
      ) : null}
      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <p className="management-section__eyebrow">1. 基本情報</p>
            <h2>団体の情報</h2>
          </div>
          <span>あとから変更できます</span>
        </div>
        <p>請求・連絡・プロジェクト設定の基準になる情報です。あとからいつでも変更できます。</p>
        <form className="form-stack" action={saveProfile}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">表示する団体名</span>
            <input
              className="field__control"
              name="name"
              defaultValue={organization.name}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">法人名・正式名称（任意）</span>
            <input
              className="field__control"
              name="legalName"
              defaultValue={organization.legalName ?? ''}
              maxLength={200}
            />
          </label>
          <label className="field">
            <span className="field__label">団体の説明（任意）</span>
            <textarea
              className="field__control"
              name="description"
              defaultValue={organization.description ?? ''}
              maxLength={2000}
              rows={3}
            />
          </label>
          <label className="field">
            <span className="field__label">担当者名（任意）</span>
            <input
              className="field__control"
              name="contactName"
              defaultValue={organization.contactName ?? ''}
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="field__label">連絡用メールアドレス（任意）</span>
            <input
              className="field__control"
              name="contactEmail"
              type="email"
              defaultValue={organization.contactEmail ?? ''}
              maxLength={320}
            />
          </label>
          <label className="field">
            <span className="field__label">電話番号（任意）</span>
            <input
              className="field__control"
              name="contactPhone"
              defaultValue={organization.contactPhone ?? ''}
              maxLength={40}
            />
          </label>
          <label className="field">
            <span className="field__label">Webサイト（任意）</span>
            <input
              className="field__control"
              name="websiteUrl"
              type="url"
              defaultValue={organization.websiteUrl ?? ''}
              maxLength={2048}
              placeholder="https://example.com"
            />
          </label>
          <label className="field">
            <span className="field__label">所在地（任意）</span>
            <input
              className="field__control"
              name="address"
              defaultValue={organization.address ?? ''}
              maxLength={500}
            />
          </label>
          <label className="field">
            <span className="field__label">変更理由</span>
            <input
              className="field__control"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              placeholder="例：クライアント情報を更新"
            />
          </label>
          <button className="button" type="submit">
            団体情報を保存する
          </button>
        </form>
      </section>
      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <p className="management-section__eyebrow">2. 運営する人</p>
            <h2>運営者を招待する</h2>
          </div>
          <span>{organization.memberships.length}人が参加中</span>
        </div>
        <p>運営管理者は、団体内のプロジェクトを作成し、参加者・LINE・利用機能を管理できます。</p>
        <form className="form-stack" action={createOperatorInvitation}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">招待するメールアドレス</span>
            <input
              className="field__control"
              name="inviteeEmail"
              type="email"
              required
              maxLength={320}
              placeholder="operator@example.com"
            />
          </label>
          <label className="field">
            <span className="field__label">招待する役割</span>
            <select className="field__control" name="role" defaultValue="ADMIN">
              <option value="ADMIN">運営管理者</option>
              <option value="MEMBER">閲覧・参加者</option>
            </select>
          </label>
          <button className="button" type="submit">
            招待を作成して送る
          </button>
        </form>
        <p className="hint">
          メール配信が未設定の場合も、招待リンクを表示して手動で渡せます。リンクは7日間・1回だけ有効です。
        </p>
        <h3>現在の運営者</h3>
        <ul className="operator-list">
          {organization.memberships.map((member) => (
            <li key={member.id}>
              <strong>{member.user.displayName}</strong>（
              {member.role === 'OWNER'
                ? '団体所有者'
                : member.role === 'ADMIN'
                  ? '運営管理者'
                  : '参加者'}
              ）{member.user.email ? ` — ${member.user.email}` : ''}
            </li>
          ))}
        </ul>
        <h3>招待の状況</h3>
        {organization.invitations.length ? (
          <ul className="list-stack">
            {organization.invitations.map((invitation) => (
              <li key={invitation.id} className="settings-card settings-card--nested">
                <strong>{invitationRecipient(invitation.inviteeEmail)}</strong> —{' '}
                {invitation.role === 'ADMIN' ? '運営管理者' : '参加者'}／
                {invitationStatus(invitation)}
                <br />
                <span className="hint">
                  作成: {invitation.createdAt.toLocaleString('ja-JP')} ／ 有効期限:{' '}
                  {invitation.expiresAt.toLocaleString('ja-JP')}
                  {invitation.lastSentAt
                    ? ` ／ メール送信: ${invitation.lastSentAt.toLocaleString('ja-JP')}`
                    : ''}
                </span>
                {invitation.status === 'ACTIVE' && invitation.expiresAt > new Date() ? (
                  <div className="button-row">
                    <form action={reissueOperatorInvitation}>
                      <input type="hidden" name="workspaceId" value={organization.id} />
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button className="button button--secondary" type="submit">
                        招待を再発行する
                      </button>
                    </form>
                    <form action={revokeOperatorInvitation}>
                      <input type="hidden" name="workspaceId" value={organization.id} />
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button className="button button--secondary" type="submit">
                        招待を取り消す
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだ招待はありません。</p>
        )}
      </section>
      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <p className="management-section__eyebrow">3. 日々の運用</p>
            <h2>プロジェクトを作る</h2>
          </div>
          <span>{organization.groups.length}件を運用中</span>
        </div>
        <p>
          参加者・商品・LINE・投稿運用をまとめる単位です。作成した人は、そのプロジェクトの運営者になります。
        </p>
        <form className="form-stack" action={createGroup}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <label className="field">
            <span className="field__label">プロジェクト名</span>
            <input
              className="field__control"
              name="name"
              required
              maxLength={120}
              placeholder="例：代理店SNS支援"
            />
          </label>
          <button className="button" type="submit">
            プロジェクトを作成する
          </button>
        </form>
        {organization.groups.length ? (
          <ul className="organization-group-list">
            {organization.groups.map((group) => (
              <li key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <span>参加者・公式情報・LINE設定を管理</span>
                </div>
                <Link className="button button--secondary" href={`/groups/${group.id}/members`}>
                  開く
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>まだプロジェクトはありません。</p>
        )}
      </section>
    </main>
  );
}
