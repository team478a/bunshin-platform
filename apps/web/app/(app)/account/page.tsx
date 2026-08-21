import { GetAccountDeletionRequest } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const request = await new GetAccountDeletionRequest(
    new db.PrismaAccountDeletionRequestRepository(),
  ).execute(user.userId);
  return (
    <main>
      <h1>アカウント設定</h1>
      <section className="danger-zone">
        <h2>退会</h2>
        {request ? (
          <>
            <p>
              退会要求を受け付けました。処理予定: {request.scheduledFor.toLocaleString('ja-JP')}
            </p>
            <p>処理前であれば取り消せます。</p>
            <form action="/account/deletion/cancel" method="post">
              <button type="submit">退会要求を取り消す</button>
            </form>
          </>
        ) : (
          <>
            <p>退会を要求すると14日間の猶予期間に入ります。この段階ではデータは削除されません。</p>
            <form action="/account/deletion/request" method="post">
              <label>
                <input name="confirmation" value="DELETE" type="checkbox" required />
                退会要求の内容を確認しました
              </label>
              <button type="submit">退会を要求する</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
