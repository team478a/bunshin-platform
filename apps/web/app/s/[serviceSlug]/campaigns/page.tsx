import { ApplicationError } from '@bunshin/shared';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolveMemberServiceContext } from '../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

/**
 * LINEのリッチメニュー「グループの企画」「公式素材」の入口。
 * 本人の投稿パートナーが1つならその企画画面へ、複数なら選択画面へ、未作成なら作成画面へ移る。
 */
export default async function ServiceCampaignEntryPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/campaigns`)}` as Route);
  const service = await resolveMemberServiceContext(serviceSlug, user.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return null;
      throw error;
    },
  );
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const bunshins = await db.prisma.bunshin.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: user.userId,
      status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
    },
    select: { id: true },
    take: 2,
  });
  if (bunshins.length === 1)
    redirect(`/s/${serviceSlug}/bunshins/${bunshins[0]!.id}/campaigns` as Route);
  redirect(`/s/${serviceSlug}/bunshins${bunshins.length === 0 ? '/new' : ''}` as Route);
}
