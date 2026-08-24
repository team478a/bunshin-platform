import {
  CreateAdminSupportCase,
  GetAdminUserDetail,
  SetAdminUserStatus,
  UpdateAdminSupportCase,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import { dateTime, stageLabels } from '../view-model';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(5).max(1000),
});
const createCaseSchema = z.object({
  userId: z.uuid(),
  subject: z.string().trim().min(3).max(200),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  note: z.string().trim().min(5).max(2000),
});
const updateCaseSchema = z.object({
  userId: z.uuid(),
  supportCaseId: z.uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  assigneeUserId: z.union([z.uuid(), z.literal('')]).transform((value) => value || null),
  note: z.string().trim().min(5).max(2000),
});

function operationError(error: unknown, userId: string): never {
  const code =
    error instanceof ApplicationError && error.code === 'CONFLICT'
      ? 'protected'
      : error instanceof ApplicationError && error.code === 'FORBIDDEN'
        ? 'forbidden'
        : 'failed';
  redirect(`/admin/users/${userId}?error=${code}`);
}

async function setUserStatus(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = statusSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new SetAdminUserStatus(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

async function createSupportCase(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = createCaseSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new CreateAdminSupportCase(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

async function updateSupportCase(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = updateCaseSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/users?error=invalid');
  try {
    const db = await import('@bunshin/database');
    await new UpdateAdminSupportCase(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      ...input.data,
    });
  } catch (error) {
    operationError(error, input.data.userId);
  }
  revalidatePath(`/admin/users/${input.data.userId}`);
  redirect(`/admin/users/${input.data.userId}?saved=1`);
}

const activityLabels: Record<string, string> = {
  VIEWED: '投稿案を確認',
  ACCEPTED: '投稿案を採用',
  REJECTED: '投稿案を見送り',
  COPIED_TEXT: '投稿文をコピー',
  COPIED_SLIDE: 'スライドをコピー',
  COPIED_IMAGE_INSTRUCTION: '画像作成の説明をコピー',
  COPIED_VIDEO_PROMPT: '動画作成の説明をコピー',
  COPIED_SCRIPT: '撮影台本をコピー',
  POSTED: '投稿完了',
  FEEDBACK_GOOD: '「自分らしい」と回答',
  FEEDBACK_NEUTRAL: '「普通」と回答',
  FEEDBACK_BAD: '「違う」と回答',
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  let detail;
  let administrators;
  try {
    detail = await new GetAdminUserDetail(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      userId: (await params).userId,
      environment: currentLineEnvironment(),
    });
    const management = await new db.PrismaPlatformAdminRepository().listForManagement(actor.userId);
    administrators =
      management?.admins
        .filter((item) => item.status === 'ACTIVE')
        .map((item) => ({
          userId: item.userId,
          displayName: item.user.displayName,
        })) ?? [];
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const user = detail.user;
  const query = await searchParams;
  return (
    <main className="app-page">
      <p>
        <Link href="/admin/users">← ユーザー一覧へ戻る</Link>
      </p>
      <header className="app-page__heading">
        <p className="eyebrow">ユーザー詳細</p>
        <h1>{user.displayName}</h1>
        <p>{user.email ?? 'メールアドレスなし'}</p>
      </header>
      {query.saved === '1' ? <p className="notice notice--success">変更を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {query.error === 'protected'
            ? '管理者、退会済みユーザー、または現在と同じ状態は変更できません。'
            : query.error === 'forbidden'
              ? 'この操作を行う権限がありません。'
              : '変更を保存できませんでした。入力内容を確認してください。'}
        </p>
      ) : null}
      <section>
        <h2>利用状況</h2>
        <dl>
          <div>
            <dt>状態</dt>
            <dd>{user.status}</dd>
          </div>
          <div>
            <dt>現在の段階</dt>
            <dd>{stageLabels[user.stage]}</dd>
          </div>
          <div>
            <dt>登録日</dt>
            <dd>{dateTime(user.createdAt)}</dd>
          </div>
          <div>
            <dt>最終利用</dt>
            <dd>{dateTime(user.lastActiveAt)}</dd>
          </div>
          <div>
            <dt>LINE</dt>
            <dd>
              {user.lineConnected
                ? user.lineFollowing
                  ? '接続・友だち確認済み'
                  : '接続済み・友だち未確認'
                : '未接続'}
            </dd>
          </div>
          <div>
            <dt>確認事項</dt>
            <dd>{user.attentionReason ?? 'なし'}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card">
        <h2>利用を停止・再開</h2>
        <p>
          停止するとログインできなくなり、LINE通知も停止します。再開後の通知は本人が設定し直します。
        </p>
        <form action={setUserStatus} className="form-stack">
          <input type="hidden" name="userId" value={user.id} />
          <input
            type="hidden"
            name="status"
            value={user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
          />
          <label className="field">
            <span className="field__label">変更理由（必須）</span>
            <textarea
              className="field__control"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
          <button
            className="button button--secondary"
            type="submit"
            disabled={user.status === 'DELETED'}
          >
            {user.status === 'ACTIVE' ? 'このユーザーの利用を停止' : 'このユーザーの利用を再開'}
          </button>
        </form>
        <h3>変更履歴</h3>
        {detail.operationAudits.length ? (
          <ul>
            {detail.operationAudits.map((audit) => (
              <li key={audit.id}>
                <strong>{audit.action === 'SUSPENDED' ? '利用停止' : '利用再開'}</strong>：
                {audit.reason}
                <br />
                <small>
                  {audit.actorDisplayName} ／ {dateTime(audit.occurredAt)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>変更履歴はありません。</p>
        )}
      </section>

      <section className="settings-card">
        <h2>問い合わせ対応</h2>
        <p>パスワード、APIキー、投稿本文などの秘密情報・個人情報は記入しないでください。</p>
        <form action={createSupportCase} className="form-stack">
          <input type="hidden" name="userId" value={user.id} />
          <label className="field">
            <span className="field__label">件名</span>
            <input
              className="field__control"
              name="subject"
              required
              minLength={3}
              maxLength={200}
            />
          </label>
          <label className="field">
            <span className="field__label">優先度</span>
            <select className="field__control" name="priority" defaultValue="NORMAL">
              <option value="LOW">低</option>
              <option value="NORMAL">通常</option>
              <option value="HIGH">高</option>
              <option value="URGENT">緊急</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">最初の対応メモ</span>
            <textarea
              className="field__control"
              name="note"
              required
              minLength={5}
              maxLength={2000}
            />
          </label>
          <button className="button" type="submit">
            問い合わせ記録を作成
          </button>
        </form>
        {detail.supportCases.map((supportCase) => (
          <article className="settings-card" key={supportCase.id}>
            <h3>{supportCase.subject}</h3>
            <p>
              状態：
              {supportCase.status === 'OPEN'
                ? '未対応'
                : supportCase.status === 'IN_PROGRESS'
                  ? '対応中'
                  : '解決済み'}{' '}
              ／ 担当：{supportCase.assigneeDisplayName ?? '未割当'}
            </p>
            <ol>
              {supportCase.notes.map((note) => (
                <li key={note.id}>
                  {note.content}
                  <br />
                  <small>
                    {note.authorDisplayName} ／ {dateTime(note.createdAt)}
                  </small>
                </li>
              ))}
            </ol>
            <form action={updateSupportCase} className="form-stack">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="supportCaseId" value={supportCase.id} />
              <label className="field">
                <span className="field__label">状態</span>
                <select className="field__control" name="status" defaultValue={supportCase.status}>
                  <option value="OPEN">未対応</option>
                  <option value="IN_PROGRESS">対応中</option>
                  <option value="RESOLVED">解決済み</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">優先度</span>
                <select
                  className="field__control"
                  name="priority"
                  defaultValue={supportCase.priority}
                >
                  <option value="LOW">低</option>
                  <option value="NORMAL">通常</option>
                  <option value="HIGH">高</option>
                  <option value="URGENT">緊急</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">担当者</span>
                <select
                  className="field__control"
                  name="assigneeUserId"
                  defaultValue={supportCase.assigneeUserId ?? ''}
                >
                  <option value="">未割当</option>
                  {administrators.map((admin) => (
                    <option key={admin.userId} value={admin.userId}>
                      {admin.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">対応メモ（必須）</span>
                <textarea
                  className="field__control"
                  name="note"
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </label>
              <button className="button button--secondary" type="submit">
                対応を更新
              </button>
            </form>
          </article>
        ))}
      </section>
      <section>
        <h2>BUNSHIN</h2>
        {detail.bunshins.length ? (
          <ul>
            {detail.bunshins.map((item) => (
              <li key={item.id}>
                {item.name} ／ {item.status} ／ {dateTime(item.createdAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだ作成されていません。</p>
        )}
      </section>
      <section>
        <h2>最近の利用履歴</h2>
        <p>投稿本文や秘密情報は表示しません。</p>
        {detail.timeline.length ? (
          <ol>
            {detail.timeline.map((item, index) => (
              <li key={`${item.occurredAt.toISOString()}-${index}`}>
                <time>{dateTime(item.occurredAt)}</time> {activityLabels[item.type] ?? item.label}
              </li>
            ))}
          </ol>
        ) : (
          <p>利用履歴はありません。</p>
        )}
      </section>
    </main>
  );
}
