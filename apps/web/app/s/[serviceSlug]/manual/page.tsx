import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { isFortuneServicePackage } from '../../../../src/services/service-creation-templates';
import { FortuneManual } from './fortune-manual';
import { SennokuniManual } from './sennokuni-manual';

export const dynamic = 'force-dynamic';
const SENNOKUNI_SLUG = 'sennokuni-media';

const manualService = cache(async (serviceSlug: string) => {
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) return null;
  if (serviceSlug === SENNOKUNI_SLUG) return { service, kind: 'SENNOKUNI' as const };
  const db = await import('@bunshin/database');
  const hasFortuneSetting = await db.prisma.fortuneServiceSetting.findFirst({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    select: { id: true },
  });
  const fortune =
    isFortuneServicePackage(service.configuration.registration.onboardingConfig) ||
    hasFortuneSetting !== null;
  return fortune ? { service, kind: 'FORTUNE' as const } : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const result = await manualService((await params).serviceSlug);
  if (!result) return { title: 'かんたんマニュアル' };
  return {
    title: `${result.service.configuration.displayName}｜かんたんマニュアル`,
    description:
      result.kind === 'FORTUNE'
        ? 'LINEから占いを始め、今日のカード、履歴、通知設定を使う手順を説明します。'
        : '登録、初期設定、投稿、ポイント確認を順番に説明します。',
  };
}

export default async function ServiceManualPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const result = await manualService((await params).serviceSlug);
  if (!result) notFound();
  if (result.kind === 'SENNOKUNI') return <SennokuniManual />;
  return (
    <FortuneManual
      serviceSlug={result.service.configuration.slug}
      serviceName={result.service.configuration.displayName}
      contactEmail={result.service.configuration.contactEmail}
    />
  );
}
