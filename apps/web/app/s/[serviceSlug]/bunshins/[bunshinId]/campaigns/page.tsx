import { CampaignService } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CampaignParticipationEditor } from '../../../../../(app)/bunshins/[bunshinId]/campaigns/campaign-participation-editor';
import { PublicShell } from '../../../../../ui/public-shell';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { memberServiceMetadata } from '../../../../../../src/services/member-service-metadata';
import { resolveMemberServiceContext } from '../../../../../../src/services/public-service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}): Promise<Metadata> {
  return memberServiceMetadata((await params).serviceSlug, 'グループの企画');
}

/** 企業Serviceの参加者が、自分の投稿パートナーで参加する企画を選ぶ画面。 */
export default async function ServiceCampaignParticipationPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/bunshins/${bunshinId}/campaigns`)}`,
    );
  const service = await resolveMemberServiceContext(serviceSlug, user.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return null;
      throw error;
    },
  );
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const bunshin = await db.prisma.bunshin.findFirst({
    where: {
      id: bunshinId,
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      ownerUserId: user.userId,
    },
    select: { id: true },
  });
  if (!bunshin) notFound();
  const campaigns = await new CampaignService(new db.PrismaCampaignRepository())
    .listAvailable({ workspaceId: service.workspaceId, actorUserId: user.userId, bunshinId })
    .catch((error: unknown) => {
      if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return null;
      throw error;
    });
  if (!campaigns) notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">{service.configuration.displayName}</p>
          <h1>グループの企画</h1>
          <p>
            参加するかどうかは自分で決められます。あとで決めることも、参加を取り消すこともできます。
          </p>
        </header>
        <CampaignParticipationEditor
          workspaceId={service.workspaceId}
          bunshinId={bunshinId}
          initialCampaigns={JSON.parse(JSON.stringify(campaigns)) as never[]}
          productConsentRequired
        />
        <a href={`/s/${serviceSlug}/bunshins/${bunshinId}`}>投稿パートナーへ戻る</a>
      </main>
    </PublicShell>
  );
}
