import { ListAccountDeletionRequests } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
export const dynamic = 'force-dynamic';
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
        <p>確認専用です。この画面から削除は実行できません。</p>
        <table className="validation-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>状態</th>
              <th>要求日時</th>
              <th>予定日</th>
            </tr>
          </thead>
          <tbody>
            {values.map((item) => (
              <tr key={item.id}>
                <td>{item.userId}</td>
                <td>{item.status}</td>
                <td>{item.requestedAt.toLocaleString('ja-JP')}</td>
                <td>{item.scheduledFor.toLocaleString('ja-JP')}</td>
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
