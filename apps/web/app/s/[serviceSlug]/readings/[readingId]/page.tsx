import { FortunePolicyError } from '@bunshin/capability-fortune';
import { notFound } from 'next/navigation';
import { PublicShell } from '../../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../../src/fortune/runtime';
import { resolveFortunePage } from '../../../../../src/fortune/page-context';
import { FortuneDeleteButton } from '../../fortune-actions';
import { FortuneNav, ReadingCard } from '../../fortune-ui';

export const dynamic = 'force-dynamic';
export default async function FortuneReadingPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; readingId: string }>;
}) {
  const { serviceSlug, readingId } = await params;
  const { actor } = await resolveFortunePage(
    serviceSlug,
    `/s/${serviceSlug}/readings/${readingId}`,
  );
  let reading;
  try {
    reading = await (
      await fortuneDailyReadingService()
    ).reading({ serviceSlug, actorUserId: actor.userId, readingId });
  } catch (error) {
    if (error instanceof FortunePolicyError && error.code === 'READING_NOT_FOUND') notFound();
    throw error;
  }
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>占い結果</h1>
        </header>
        <ReadingCard reading={reading} serviceSlug={serviceSlug} />
        <FortuneDeleteButton serviceSlug={serviceSlug} readingId={readingId} />
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
}
