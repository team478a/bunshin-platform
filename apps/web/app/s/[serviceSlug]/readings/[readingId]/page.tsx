import { resolveFortunePageAppearance } from '../../../../../src/fortune/appearance';
import { FortunePolicyError } from '@bunshin/capability-fortune';
import { notFound } from 'next/navigation';
import { FortuneAppearance } from '../../fortune-appearance';
import { PublicShell } from '../../../../ui/public-shell';
import { fortuneDailyReadingService } from '../../../../../src/fortune/runtime';
import { resolveFortuneSummoningMode } from '../../../../../src/fortune/appearance';
import { resolveFortuneGuidanceSettings } from '../../../../../src/fortune/guidance-settings';
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
  const { actor, service, setting } = await resolveFortunePage(
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
  const { characters, appearance } = resolveFortuneGuidanceSettings(setting.guidanceSettings);
  const content = (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>占い結果</h1>
        </header>
        <ReadingCard
          reading={reading}
          {...(characters ? { characters } : {})}
          serviceSlug={serviceSlug}
          showFollowUps={setting.aiEnabled && setting.personalProfileEnabled}
          oracleBook={resolveFortuneSummoningMode(appearance) === 'cinematic'}
        />
        <FortuneDeleteButton serviceSlug={serviceSlug} readingId={readingId} />
        <FortuneNav serviceSlug={serviceSlug} />
      </main>
    </PublicShell>
  );
  return (
    <FortuneAppearance
      settings={resolveFortunePageAppearance(appearance)}
      brand={service.configuration.brand}
    >
      {content}
    </FortuneAppearance>
  );
}
