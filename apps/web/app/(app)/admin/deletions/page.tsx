import { ListAccountDeletionRequests } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { currentUserProvider } from '../../../../src/auth/current-user';
export const dynamic = 'force-dynamic';

async function retryBlocked(formData: FormData) {
  'use server';
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const requestIdValue = formData.get('requestId');
  const reasonValue = formData.get('reason');
  const requestId = typeof requestIdValue === 'string' ? requestIdValue : '';
  const reason = typeof reasonValue === 'string' ? reasonValue : '';
  const { RetryBlockedAccountDeletion } = await import('@bunshin/application');
  const { PrismaAccountDeletionAdminOperationsRepository } = await import('@bunshin/database');
  await new RetryBlockedAccountDeletion(
    new PrismaAccountDeletionAdminOperationsRepository(),
  ).execute({ requestId, actorUserId: user.userId, reason });
  revalidatePath('/admin/deletions');
}

export default async function DeletionAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const values = await new ListAccountDeletionRequests(
      new db.PrismaAccountDeletionRequestRepository(),
    ).execute(user.userId);
    return (
      <main>
        <h1>退会要求管理</h1>
        <p>不可逆削除を直接実行する画面ではありません。BLOCKEDのみ理由付きで再試行できます。</p>
        <table className="validation-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>状態</th>
              <th>要求日時</th>
              <th>予定日</th>
              <th>試行</th>
              <th>分類</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {values.map((item) => (
              <tr key={item.id}>
                <td>{item.userId}</td>
                <td>{item.status}</td>
                <td>{item.requestedAt.toLocaleString('ja-JP')}</td>
                <td>{item.scheduledFor.toLocaleString('ja-JP')}</td>
                <td>{item.attemptCount}</td>
                <td>{item.blockedReason ?? item.lastErrorCategory ?? '-'}</td>
                <td>
                  {item.status === 'BLOCKED' ? (
                    <form action={retryBlocked}>
                      <input type="hidden" name="requestId" value={item.id} />
                      <input
                        name="reason"
                        required
                        minLength={10}
                        maxLength={500}
                        placeholder="再試行する理由（10文字以上）"
                      />
                      <button type="submit">再試行</button>
                    </form>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
