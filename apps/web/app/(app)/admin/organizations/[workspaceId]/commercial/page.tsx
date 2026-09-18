import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const workspaceSchema = z.object({ workspaceId: z.uuid() });

const EVENT_LABELS: Record<string, string> = {
  POST_VIEW: '投稿案を表示',
  POST_GENERATE: '投稿案を生成',
  POST_REGENERATE: '投稿案を再生成',
  DAILY_MISSION_VIEW: '今日やることを確認',
  WEEKLY_PLAN_VIEW: '週間計画を確認',
  CONTENT_APPROVE: '投稿内容を採用',
};

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

async function requireSuperAdmin() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  return { actor, db };
}

async function finalizePreviousMonth(formData: FormData) {
  'use server';
  const input = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialUsageService().finalizePreviousMonth(input.data.workspaceId);
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=finalize`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?finalized=1`);
}

export default async function OrganizationCommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ finalized?: string; error?: string }>;
}) {
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const [{ db }, query] = await Promise.all([requireSuperAdmin(), searchParams]);
  const dashboard = await new db.PrismaCommercialUsageService().dashboard(workspaceId.data);
  if (!dashboard) notFound();
  const { current } = dashboard;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>{dashboard.workspace.name}の利用量・料金</h1>
        <p>参加者が実際にサービスを使った人数を、運営団体単位で月ごとに集計します。</p>
        <Link href="/admin/organizations">← 運営団体一覧へ戻る</Link>
      </header>

      {!dashboard.workspace.oemEnabled ? (
        <p className="notice notice--danger">
          OEM利用が許可されていません。「契約・利用上限」でOEMを有効にすると請求対象として運用できます。
        </p>
      ) : null}
      {query.finalized === '1' ? (
        <p className="notice notice--success">前月の利用人数と料金を確定しました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          前月を確定できませんでした。時間を置いて再度お試しください。
        </p>
      ) : null}

      <section className="operations-overview" aria-label="今月の商用利用状況">
        <div>
          <span>対象月</span>
          <strong>{current.month}</strong>
        </div>
        <div>
          <span>今月のMAU</span>
          <strong>
            {current.mau} / {current.pricing.upperLimit ?? '見積'}人
          </strong>
        </div>
        <div>
          <span>現在の月額</span>
          <strong>{yen(current.pricing.priceYen)}</strong>
        </div>
        <div>
          <span>次の料金帯まで</span>
          <strong>
            {current.pricing.remainingToNextTier === null
              ? '個別見積'
              : `あと${current.pricing.remainingToNextTier}人`}
          </strong>
        </div>
      </section>

      <section className="settings-card">
        <h2>MAUに含める利用</h2>
        <p>
          単なる登録やログインは含めません。参加者が次の機能を利用した月だけ、1人として数えます。同じ人が何度使っても月内は1人です。
        </p>
        {current.eventCounts.length === 0 ? (
          <p>今月は対象となる利用がまだありません。</p>
        ) : (
          <ul className="summary-list">
            {current.eventCounts.map((event) => (
              <li key={event.eventType}>
                <span>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                <strong>{event.count.toLocaleString('ja-JP')}回</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="field__hint">運営者、スタッフ、システム管理者の操作は除外されます。</p>
      </section>

      <section className="settings-card">
        <h2>前月を請求用に確定</h2>
        <p>
          月末を過ぎた利用人数を保存します。一度確定した月は、後から利用履歴や権限が変わっても金額を変更しません。
        </p>
        <form action={finalizePreviousMonth}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <button className="button" type="submit">
            前月のMAUと料金を確定する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>確定履歴</h2>
        {dashboard.history.length === 0 ? (
          <p>確定済みの月はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>MAU</th>
                  <th>料金</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.mau.toLocaleString('ja-JP')}人</td>
                    <td>{yen(row.priceYen)}</td>
                    <td>{row.status === 'FINALIZED' ? '確定' : '集計中'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
