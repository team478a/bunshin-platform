import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { PersonalLearningToolFeatureAdmin } from './tool-features-admin';

export const dynamic = 'force-dynamic';

type ToolKey = 'CHATGPT' | 'CLAUDE' | 'GEMINI' | 'CANVA';
function parseToolKey(value: string): ToolKey {
  if (value === 'CHATGPT' || value === 'CLAUDE' || value === 'GEMINI' || value === 'CANVA')
    return value;
  throw new Error('invalid stored AI tool key');
}

export default async function PersonalLearningToolFeaturesPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) notFound();
  const features = await db.prisma.personalLearningToolFeatureUpdate.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      creator: { select: { displayName: true } },
      reviewer: { select: { displayName: true } },
      audits: {
        orderBy: { occurredAt: 'desc' },
        take: 10,
        include: { actor: { select: { displayName: true } } },
      },
    },
  });
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">プラットフォーム管理者</p>
        <h1>AIツールの更新情報</h1>
        <p>公式情報の登録・確認・承認を行います。承認しても、このPRでは受講者へ配信されません。</p>
      </header>
      <PersonalLearningToolFeatureAdmin
        canReview={admin.role === 'SUPER_ADMIN'}
        initialItems={features.map((item) => ({
          id: item.id,
          toolKey: parseToolKey(item.toolKey),
          title: item.title,
          summary: item.summary,
          sourceUrl: item.sourceUrl,
          sourceTitle: item.sourceTitle,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          expiresAt: item.expiresAt?.toISOString() ?? null,
          creatorName: item.creator.displayName,
          reviewerName: item.reviewer?.displayName ?? null,
          reviewedAt: item.reviewedAt?.toISOString() ?? null,
          audits: item.audits.map((audit) => ({
            action: audit.action,
            reason: audit.reason,
            occurredAt: audit.occurredAt.toISOString(),
            actorName: audit.actor.displayName,
          })),
        }))}
      />
    </main>
  );
}
