import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { resolveManagedServiceContext } from '../../../../src/services/public-service';
import { buildServiceLaunchReadiness } from '../../../../src/services/service-launch-readiness';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ServiceManagementPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: {
      workspaceId: service.workspaceId,
      id: service.serviceId,
      status: 'ACTIVE',
    },
    select: {
      memberships: {
        where: { status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
        select: { id: true },
      },
      serviceLegalDocuments: {
        where: { status: 'PUBLISHED' },
        select: { type: true },
      },
      featurePolicies: {
        where: { status: 'ENABLED', feature: { status: 'ACTIVE' } },
        select: { id: true },
      },
      knowledgeSources: {
        where: { status: 'ACTIVE', productPackVersionId: null },
        select: { id: true },
      },
      lineChannelConfigurations: {
        where: { environment: currentLineEnvironment(), status: 'ACTIVE' },
        select: { lastVerifiedAt: true, globallyPaused: true },
        take: 1,
      },
    },
  });
  if (!group) notFound();
  const configuration = service.configuration;
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const line = group.lineChannelConfigurations[0];
  const items = buildServiceLaunchReadiness({
    serviceSlug: configuration.slug,
    operatorName: configuration.operatorName,
    contactEmail: configuration.contactEmail,
    registrationMode: configuration.registration.mode,
    emailEnabled: configuration.registration.emailEnabled,
    lineEnabled: configuration.registration.lineEnabled,
    onboardingQuestionCount: onboarding.questions.length,
    publishedLegalTypes: group.serviceLegalDocuments.map((item) => item.type),
    activeFeatureCount: group.featurePolicies.length,
    activeParticipantCount: group.memberships.length,
    activeKnowledgeCount: group.knowledgeSources.length,
    lineConfigurationReady: Boolean(line?.lastVerifiedAt && !line.globallyPaused),
  });
  const readyCount = items.filter((item) => item.ready).length;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>開始準備を確認</h1>
          <p>上から順番に確認すると、サーバーを触らずにサービスの準備を進められます。</p>
        </header>

        <section className="settings-card">
          <h2>
            {readyCount} / {items.length} 項目が準備できています
          </h2>
          <p>
            {readyCount === items.length
              ? '必要な設定がそろいました。参加者のテストを始められます。'
              : '「設定する」と表示されている項目を確認してください。'}
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-status-list">
            {items.map((item) => (
              <article className="settings-status-item" key={item.key}>
                <div>
                  <p>{item.ready ? '✓ 準備できています' : '● 設定が必要です'}</p>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
                <Link className="button button--secondary" href={item.path as Route}>
                  {item.ready ? '確認する' : '設定する'}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <Link href={`/s/${configuration.slug}/home` as Route}>← サービスのホームへ戻る</Link>
      </main>
    </PublicShell>
  );
}
