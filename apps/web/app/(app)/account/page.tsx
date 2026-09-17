import { GetAccountDeletionRequest } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { PendingSubmitButton } from '../../ui/pending-submit-button';

export const dynamic = 'force-dynamic';
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedService =
    typeof query.service === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query.service)
      ? query.service
      : null;
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) {
    const returnTo = requestedService
      ? `/account?service=${encodeURIComponent(requestedService)}`
      : '/account';
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const db = await import('@bunshin/database');
  const scopedMembership = requestedService
    ? await db.prisma.groupMembership.findFirst({
        where: {
          userId: user.userId,
          status: 'ACTIVE',
          group: {
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
            serviceConfiguration: { is: { slug: requestedService } },
          },
        },
        select: {
          group: {
            select: {
              name: true,
              workspaceId: true,
              serviceConfiguration: {
                select: {
                  slug: true,
                  displayName: true,
                  termsUrl: true,
                  privacyUrl: true,
                },
              },
            },
          },
        },
      })
    : null;
  if (requestedService && !scopedMembership) redirect(`/s/${requestedService}`);
  const scopedService = scopedMembership?.group.serviceConfiguration ?? null;
  const scopedWorkspaceId = scopedMembership?.group.workspaceId ?? null;
  const [request, managedOrganizationCount, managedServices] = await Promise.all([
    new GetAccountDeletionRequest(new db.PrismaAccountDeletionRequestRepository()).execute(
      user.userId,
    ),
    scopedService
      ? Promise.resolve(0)
      : db.prisma.workspaceMembership.count({
          where: {
            userId: user.userId,
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
            workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
          },
        }),
    scopedService
      ? Promise.resolve([])
      : db.prisma.groupMembership.findMany({
          where: {
            userId: user.userId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            group: {
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              serviceConfiguration: { isNot: null },
            },
          },
          select: {
            group: {
              select: {
                name: true,
                serviceConfiguration: { select: { slug: true, displayName: true } },
              },
            },
          },
          orderBy: { group: { name: 'asc' } },
        }),
  ]);
  return (
    <main className="app-page account-page">
      <header className="app-page__heading">
        <p className="eyebrow">アカウント</p>
        <h1>{scopedService ? `${scopedService.displayName}のアカウント` : 'アカウント'}</h1>
        <p>
          {scopedService
            ? `${scopedService.displayName}で使う情報と設定を確認できます。`
            : '利用情報や通知、セキュリティに関する設定を確認できます。'}
        </p>
      </header>

      {!scopedService && (managedOrganizationCount > 0 || managedServices.length > 0) ? (
        <section className="settings-card" aria-labelledby="operator-settings-title">
          <h2 id="operator-settings-title">運営者メニュー</h2>
          <nav className="settings-list" aria-label="運営者メニュー">
            {managedServices.map(({ group }) => {
              const service = group.serviceConfiguration;
              if (!service) return null;
              return (
                <Link
                  href={`/s/${service.slug}/manage` as Route}
                  className="settings-row"
                  key={service.slug}
                >
                  <span>
                    <strong>{service.displayName || group.name}を運営する</strong>
                    <small>参加者、ポイント、バッジ、LINEなどを管理</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              );
            })}
            {managedOrganizationCount > 0 ? (
              <Link href="/organizations" className="settings-row">
                <span>
                  <strong>運営団体・サービスを管理</strong>
                  <small>{managedOrganizationCount}件の運営団体を管理できます</small>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ) : null}
          </nav>
        </section>
      ) : null}

      <section className="settings-card" aria-labelledby="content-settings-title">
        <h2 id="content-settings-title">
          {scopedService ? `${scopedService.displayName}の設定` : '投稿パートナーの設定'}
        </h2>
        <nav className="settings-list" aria-label="投稿パートナーの設定">
          {scopedService ? (
            <Link href={`/s/${scopedService.slug}/home` as Route} className="settings-row">
              <span>
                <strong>ホーム</strong>
                <small>このサービスで今日やることを確認</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ) : null}
          <Link
            href={scopedService ? `/s/${scopedService.slug}/bunshins` : '/bunshins'}
            className="settings-row"
          >
            <span>
              <strong>投稿パートナー</strong>
              <small>投稿パートナーの選択・編集</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          {!scopedService ? (
            <Link href="/knowledge" className="settings-row">
              <span>
                <strong>知識</strong>
                <small>発信に活用する情報</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ) : null}
          {!scopedService ? (
            <Link href="/groups" className="settings-row">
              <span>
                <strong>グループ</strong>
                <small>参加中のグループと、管理できる機能</small>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ) : null}
          <Link
            href={
              scopedService
                ? `/points?workspaceId=${scopedWorkspaceId}&serviceSlug=${scopedService.slug}`
                : '/points'
            }
            className="settings-row"
          >
            <span>
              <strong>ワタシポイント</strong>
              <small>残高・ため方・最近の履歴</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>

      <section className="settings-card" aria-labelledby="support-settings-title">
        <h2 id="support-settings-title">サービス情報</h2>
        <nav className="settings-list" aria-label="サービス情報">
          <Link
            href={scopedService ? `/s/${scopedService.slug}/terms` : '/terms'}
            className="settings-row"
          >
            <span>
              <strong>利用規約</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href={scopedService ? `/s/${scopedService.slug}/privacy` : '/privacy'}
            className="settings-row"
          >
            <span>
              <strong>プライバシーポリシー</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>

      <form action="/auth/logout" method="post">
        <PendingSubmitButton
          className="button button--secondary button--full"
          pendingLabel="ログアウトしています…"
        >
          ログアウト
        </PendingSubmitButton>
      </form>

      <section className="danger-zone account-danger-zone" aria-labelledby="danger-zone-title">
        <h2 id="danger-zone-title">退会</h2>
        {request ? (
          <>
            <p>
              退会要求を受け付けました。処理予定: {request.scheduledFor.toLocaleString('ja-JP')}
            </p>
            <p>処理前であれば取り消せます。</p>
            <form action="/account/deletion/cancel" method="post">
              <PendingSubmitButton
                className="button button--secondary"
                pendingLabel="取り消しています…"
              >
                退会要求を取り消す
              </PendingSubmitButton>
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
              <PendingSubmitButton
                className="button button--danger"
                pendingLabel="退会要求を送信しています…"
              >
                退会を要求する
              </PendingSubmitButton>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
