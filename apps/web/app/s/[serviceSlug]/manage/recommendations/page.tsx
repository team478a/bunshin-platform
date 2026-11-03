import { UsageGuidancePolicyEditor } from './usage-policy-editor';
import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { recommendationPolicyTarget } from '../../../../../src/http/social-recommendation-policy';
import { PublicShell } from '../../../../ui/public-shell';
import { RecommendationPolicyEditor } from './policy-editor';
export const dynamic = 'force-dynamic';
export default async function RecommendationPolicyPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/recommendations`)}`);
  const db = await import('@bunshin/database');
  const [initial, guidance] = await recommendationPolicyTarget(serviceSlug, actor.userId)
    .then((scope) =>
      Promise.all([
        new db.PrismaSocialRecommendationPolicyRepository().read(scope),
        new db.PrismaSocialUsageGuidancePolicyRepository().read(scope),
      ]),
    )
    .catch((error) => {
      if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
        notFound();
      throw error;
    });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <h1>SNS支援提案の設定</h1>
          <a href={`/s/${serviceSlug}/manage`}>管理メニューへ戻る</a>
        </header>
        <UsageGuidancePolicyEditor
          endpoint={`/api/services/${encodeURIComponent(serviceSlug)}/usage-guidance-policy`}
          initial={guidance}
        />
        <RecommendationPolicyEditor
          endpoint={`/api/services/${encodeURIComponent(serviceSlug)}/recommendation-policy`}
          initial={initial}
        />
      </main>
    </PublicShell>
  );
}
