import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const issueLabels: Record<string, string> = {
  PRODUCT_PACK_REQUIRED: '商品情報なし',
  PERSONAL_EVIDENCE_REQUIRED: '本人根拠なし',
  UNKNOWN_OFFICIAL_FACT: '未登録の公式事実',
  OFFICIAL_FACT_MISMATCH: '公式事実と不一致',
  FORBIDDEN_EXPRESSION: '禁止表現あり',
  CONDITIONAL_DISCLOSURE_MISSING: '条件付き表記なし',
  REQUIRED_DISCLOSURE_MISSING: '必須表記なし',
};
const issueLabel = (code: string) => issueLabels[code] ?? '確認不能';

export default async function AdvertisingSafetyAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  if (!(await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(user.userId)))
    notFound();
  const memberships = await db.prisma.workspaceMembership.findMany({
    where: {
      userId: user.userId,
      status: 'ACTIVE',
      role: { in: ['OWNER', 'ADMIN'] },
      workspace: { type: 'ORGANIZATION', status: 'ACTIVE' },
    },
    select: { workspace: { select: { id: true, name: true } } },
    orderBy: { workspace: { name: 'asc' } },
  });
  const requested = (await searchParams).workspaceId;
  const workspace =
    memberships.find((item) => item.workspace.id === requested)?.workspace ??
    memberships[0]?.workspace;
  const reviews = workspace
    ? await db.prisma.advertisingSafetyReview.findMany({
        where: { productPackVersion: { productPack: { workspaceId: workspace.id } } },
        select: {
          id: true,
          classification: true,
          verdict: true,
          issueCodes: true,
          requiredDisclosures: true,
          reviewedAt: true,
          productPackVersion: {
            select: { version: true, productPack: { select: { name: true } } },
          },
        },
        orderBy: { reviewedAt: 'desc' },
        take: 200,
      })
    : [];
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">本部管理</p>
        <h1>広告の安全確認</h1>
        <p>
          公式商品を使った確認結果だけを表示します。投稿文や個人の根拠内容は本部へ表示しません。
        </p>
      </header>
      {workspace ? (
        <>
          <form method="get" className="settings-card">
            <label>
              管理する団体
              <select name="workspaceId" defaultValue={workspace.id}>
                {memberships.map(({ workspace: item }) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">切り替える</button>
          </form>
          <section className="settings-card">
            <h2>最近の確認結果</h2>
            {reviews.length === 0 ? (
              <p>まだ確認記録はありません。</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>分類</th>
                    <th>結果</th>
                    <th>理由</th>
                    <th>日時</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        {review.productPackVersion?.productPack.name} 第
                        {review.productPackVersion?.version}版
                      </td>
                      <td>{review.classification}</td>
                      <td>{review.verdict === 'PASS' ? '使用可' : '修正必要'}</td>
                      <td>{review.issueCodes.map(issueLabel).join('、') || 'なし'}</td>
                      <td>{review.reviewedAt.toLocaleString('ja-JP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <p>管理できる団体の作業場所がありません。</p>
      )}
    </main>
  );
}
