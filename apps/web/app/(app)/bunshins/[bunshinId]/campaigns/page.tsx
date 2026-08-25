import { CampaignService } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { CampaignParticipationEditor } from './campaign-participation-editor';

export const dynamic = 'force-dynamic';

export default async function CampaignParticipationPage({
  params,
  searchParams,
}: {
  params: Promise<{ bunshinId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const bunshinId = (await params).bunshinId;
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  const db = await import('@bunshin/database');
  const campaigns = await new CampaignService(new db.PrismaCampaignRepository())
    .listAvailable({ workspaceId, actorUserId: user.userId, bunshinId })
    .catch(() => null);
  if (!campaigns) notFound();
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">自由参加</p>
        <h1>参加できる募集</h1>
        <p>参加するかどうかは自分で決められます。保留や取り消しもできます。</p>
      </header>
      <CampaignParticipationEditor
        workspaceId={workspaceId}
        bunshinId={bunshinId}
        initialCampaigns={JSON.parse(JSON.stringify(campaigns)) as never[]}
      />
    </main>
  );
}
