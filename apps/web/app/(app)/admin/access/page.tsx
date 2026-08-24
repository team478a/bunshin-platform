import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const grantSchema = z.object({
  email: z.email().max(320),
  role: z.enum(['SUPER_ADMIN', 'OPERATOR', 'SUPPORT']),
  reason: z.string().trim().min(5).max(1000),
});
const revokeSchema = z.object({
  adminId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
});

function errorRedirect(error: unknown): never {
  const code =
    error instanceof ApplicationError && error.code === 'CONFLICT'
      ? 'last-admin'
      : error instanceof ApplicationError && error.code === 'NOT_FOUND'
        ? 'user-not-found'
        : 'failed';
  redirect(`/admin/access?error=${code}`);
}

async function grantAdmin(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = grantSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/access?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new db.PrismaPlatformAdminRepository().grantOrUpdate({
      actorUserId: actor.userId,
      ...input.data,
    });
  } catch (error) {
    errorRedirect(error);
  }
  revalidatePath('/admin/access');
  redirect('/admin/access?saved=1');
}

async function revokeAdmin(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = revokeSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/access?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new db.PrismaPlatformAdminRepository().revoke({
      actorUserId: actor.userId,
      ...input.data,
    });
  } catch (error) {
    errorRedirect(error);
  }
  revalidatePath('/admin/access');
  redirect('/admin/access?saved=1');
}

const roleLabels = {
  SUPER_ADMIN: '最高管理者',
  OPERATOR: '運用担当者',
  SUPPORT: 'サポート担当者',
  READ_ONLY: '閲覧担当者',
} as const;

const actionLabels = {
  GRANTED: '管理者に追加',
  ROLE_CHANGED: '役割を変更',
  REACTIVATED: '利用を再開',
  REVOKED: '管理権限を停止',
} as const;

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const data = await new db.PrismaPlatformAdminRepository().listForManagement(actor.userId);
  if (!data) notFound();
  const query = await searchParams;
  const canChange = data.actorRole === 'SUPER_ADMIN';
  const errorMessages: Record<string, string> = {
    invalid: '入力内容を確認してください。変更理由は5文字以上必要です。',
    'user-not-found': 'そのメールアドレスの利用中ユーザーを確認できませんでした。',
    'last-admin': '最後の最高管理者、または自分自身の権限は停止・降格できません。',
    failed: '変更を保存できませんでした。もう一度お試しください。',
  };

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>管理者と権限</h1>
        <p>サーバーやデータベースを触らず、管理画面を使える人と役割を管理します。</p>
      </header>

      {query.saved === '1' ? <p className="notice notice--success">変更を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {errorMessages[query.error] ?? errorMessages.failed}
        </p>
      ) : null}

      <section className="settings-card">
        <h2>管理者を追加・変更</h2>
        {canChange ? (
          <form className="form-stack" action={grantAdmin}>
            <label className="field">
              <span className="field__label">登録済みユーザーのメールアドレス</span>
              <input
                className="field__control"
                name="email"
                type="email"
                required
                maxLength={320}
              />
            </label>
            <label className="field">
              <span className="field__label">役割</span>
              <select className="field__control" name="role" defaultValue="OPERATOR">
                <option value="SUPER_ADMIN">最高管理者（すべて変更可能）</option>
                <option value="OPERATOR">運用担当者（確認・接続テスト）</option>
                <option value="SUPPORT">サポート担当者（利用状況の確認）</option>
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
              />
            </label>
            <button className="button" type="submit">
              保存する
            </button>
          </form>
        ) : (
          <p>変更できるのは最高管理者だけです。</p>
        )}
      </section>

      <section className="settings-card">
        <h2>現在の管理者</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>役割</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.admins.map((admin) => (
                <tr key={admin.id}>
                  <td>
                    <strong>{admin.user.displayName}</strong>
                    <br />
                    <small>{admin.user.email ?? 'メールなし'}</small>
                  </td>
                  <td>{roleLabels[admin.role]}</td>
                  <td>{admin.status === 'ACTIVE' ? '利用中' : '停止中'}</td>
                  <td>
                    {canChange && admin.status === 'ACTIVE' && admin.userId !== actor.userId ? (
                      <form action={revokeAdmin} className="form-stack">
                        <input type="hidden" name="adminId" value={admin.id} />
                        <input
                          name="reason"
                          aria-label="停止理由"
                          placeholder="停止理由（5文字以上）"
                          required
                          minLength={5}
                          maxLength={1000}
                        />
                        <button className="button button--secondary" type="submit">
                          権限を停止
                        </button>
                      </form>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="settings-card">
        <h2>変更履歴</h2>
        <ul>
          {data.audits.map((audit) => (
            <li key={audit.id}>
              <strong>
                {actionLabels[audit.action]}：{audit.target.displayName}
              </strong>
              <p>
                {audit.reason} ／ 操作：{audit.actor.displayName} ／{' '}
                {audit.occurredAt.toLocaleString('ja-JP')}
              </p>
            </li>
          ))}
        </ul>
        {data.audits.length === 0 ? <p>変更履歴はまだありません。</p> : null}
      </section>
    </main>
  );
}
