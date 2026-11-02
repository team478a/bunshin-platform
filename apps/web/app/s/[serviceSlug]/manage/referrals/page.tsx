import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { referralManagementTarget } from '../../../../../src/http/service-referral-management';
import { PublicShell } from '../../../../ui/public-shell';
import { ReferralManagementEditor } from './referral-management-editor';

export const dynamic = 'force-dynamic';
function managementNotFound(error: unknown): never {
  if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
    notFound();
  throw error;
}
export default async function ReferralManagementPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/referrals`)}`);
  const db = await import('@bunshin/database');
  const scope = await referralManagementTarget(serviceSlug, actor.userId).catch(managementNotFound);
  const initial = await new db.PrismaServiceReferralManagementRepository()
    .overview(scope)
    .catch(managementNotFound);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>紹介の審査・確定</h1>
          <a href={`/s/${serviceSlug}/manage`}>管理メニューへ戻る</a>
        </header>
        <ReferralManagementEditor serviceSlug={serviceSlug} initial={initial} />
      </main>
    </PublicShell>
  );
}
