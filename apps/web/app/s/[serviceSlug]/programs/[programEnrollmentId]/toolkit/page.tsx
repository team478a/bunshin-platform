import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import { PublicShell } from '../../../../../ui/public-shell';
import { ToolkitList } from './toolkit-list';

export const dynamic = 'force-dynamic';

export default async function TrainingToolkitPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/toolkit`,
  );
  const db = await import('@bunshin/database');
  const items = await new db.PrismaTrainingToolkitRepository(db.prisma).list({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
    programEnrollmentId,
  });
  if (!items) notFound();
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry resale-action-page training-page" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">研修で作った、あなた専用の実務資産</p>
          <h1>My AI Toolkit</h1>
          <p>保存した回答をコピーして、日々の仕事で繰り返し使えます。</p>
        </header>
        <ToolkitList
          items={items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))}
        />
        <a
          className="button button--secondary button--full"
          href={`/s/${serviceSlug}/programs/${programEnrollmentId}`}
        >
          今日のトレーニングへ戻る
        </a>
      </main>
    </PublicShell>
  );
}
