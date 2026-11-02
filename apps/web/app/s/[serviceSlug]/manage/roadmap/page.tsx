import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { managedFeaturePolicyTarget } from '../../../../../src/http/managed-feature-policy';
import { hassyRoadmapPolicyRepository } from '../../../../../src/services/hassy-roadmap-policy-store';
import { PublicShell } from '../../../../ui/public-shell';
import { RoadmapPolicyEditor } from './policy-editor';
export const dynamic = 'force-dynamic';
export default async function RoadmapPolicyPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/roadmap`)}`);
  const initial = await managedFeaturePolicyTarget(serviceSlug, actor.userId)
    .then((scope) => hassyRoadmapPolicyRepository().read(scope))
    .catch((error) => {
      if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
        notFound();
      throw error;
    });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <h1>成長ロードマップの達成条件</h1>
          <a href={`/s/${serviceSlug}/manage`}>管理メニューへ戻る</a>
        </header>
        <RoadmapPolicyEditor
          endpoint={`/api/services/${encodeURIComponent(serviceSlug)}/roadmap-policy`}
          initial={initial}
        />
      </main>
    </PublicShell>
  );
}
