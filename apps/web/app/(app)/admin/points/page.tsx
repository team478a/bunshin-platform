import { InspectPointBalances, RepairPointBalance } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const repairSchema = z.object({
  accountId: z.uuid(),
  workspaceId: z.uuid(),
  userId: z.uuid(),
  expectedStoredBalance: z.coerce.number().int(),
  expectedLedgerBalance: z.coerce.number().int().nonnegative(),
  expectedRevision: z.coerce.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(1000),
});

async function requireSuperAdmin() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: user.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();
  return { user, db };
}

async function repairBalance(formData: FormData) {
  'use server';
  const parsed = repairSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/admin/points?error=invalid');
  const { user, db } = await requireSuperAdmin();
  try {
    await new RepairPointBalance(
      new db.PrismaPointBalanceReconciliationRepository(db.prisma),
    ).execute({ ...parsed.data, actorUserId: user.userId });
  } catch (error) {
    const code = error instanceof ApplicationError ? error.code.toLowerCase() : 'failed';
    redirect(`/admin/points?error=${encodeURIComponent(code)}` as Route);
  }
  revalidatePath('/admin');
  revalidatePath('/admin/points');
  redirect('/admin/points?repaired=1');
}

const date = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(value);

export default async function PointBalanceAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ repaired?: string; error?: string }>;
}) {
  const { db } = await requireSuperAdmin();
  const query = await searchParams;

  const [result, audits] = await Promise.all([
    new InspectPointBalances(new db.PrismaPointBalanceReconciliationRepository(db.prisma)).execute({
      limit: 100,
    }),
    db.prisma.pointBalanceRepairAudit.findMany({
      include: {
        performedBy: { select: { displayName: true } },
        account: { include: { user: { select: { displayName: true } } } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>ポイント残高の確認</h1>
        <p>利用者に表示する残高と、ポイント履歴の合計を照合しました。</p>
      </header>

      {query.repaired ? <p className="notice notice--success">残高を修復しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">
          修復できませんでした。画面を更新し、現在の残高をもう一度確認してください。
        </p>
      ) : null}

      <section className="settings-card" aria-labelledby="point-check-result-title">
        <h2 id="point-check-result-title">確認結果</h2>
        {result.mismatchCount === 0 ? (
          <p>
            <strong className="status-success">
              {result.accountsChecked}件すべて一致しています
            </strong>
          </p>
        ) : (
          <>
            <p>
              <strong className="status-warning">
                {result.accountsChecked}件中、{result.mismatchCount}件が一致していません
              </strong>
            </p>
            <p>原因を確認できた場合だけ、理由を入力して履歴の合計へ修復してください。</p>
            {result.mismatches.map((item) => (
              <article className="settings-card" key={item.accountId}>
                <h3>利用者ID：{item.userId}</h3>
                <p>
                  表示残高：<strong>{item.storedBalance} WP</strong>／履歴の合計：
                  <strong>{item.ledgerBalance} WP</strong>／差：{item.difference} WP
                </p>
                {item.ledgerBalance < 0 ? (
                  <p className="notice notice--danger">
                    履歴の合計がマイナスのため、この画面では修復できません。
                  </p>
                ) : (
                  <form action={repairBalance} className="form-stack">
                    <input type="hidden" name="accountId" value={item.accountId} />
                    <input type="hidden" name="workspaceId" value={item.workspaceId} />
                    <input type="hidden" name="userId" value={item.userId} />
                    <input type="hidden" name="expectedStoredBalance" value={item.storedBalance} />
                    <input type="hidden" name="expectedLedgerBalance" value={item.ledgerBalance} />
                    <input type="hidden" name="expectedRevision" value={item.revision} />
                    <label className="field">
                      <span className="field__label">修復する理由（10文字以上）</span>
                      <textarea
                        className="field__control"
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <button className="button" type="submit">
                      表示残高を{item.ledgerBalance} WPへ修復する
                    </button>
                  </form>
                )}
              </article>
            ))}
            {result.mismatchCount > result.mismatches.length ? (
              <p>最初の{result.mismatches.length}件を表示しています。</p>
            ) : null}
          </>
        )}
      </section>

      <section className="settings-card" aria-labelledby="point-repair-history-title">
        <h2 id="point-repair-history-title">修復履歴</h2>
        {audits.length === 0 ? (
          <p>修復履歴はありません。</p>
        ) : (
          <ul>
            {audits.map((audit) => (
              <li key={audit.id}>
                {date(audit.occurredAt)}／{audit.performedBy.displayName}／
                {audit.account.user.displayName}／{audit.previousBalance} WPから
                {audit.repairedBalance} WP／理由：{audit.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/admin" className="button button--secondary">
        運用設定へ戻る
      </Link>
    </main>
  );
}
