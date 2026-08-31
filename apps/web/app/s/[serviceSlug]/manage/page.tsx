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

const sections = [
  {
    title: '参加者と担当者',
    description: '参加者の招待、利用できる機能、運営担当者の役割を管理します。',
    href: 'members',
  },
  {
    title: '公式情報・ナレッジ',
    description: 'PDF、動画、URL、よくある質問などを登録し、投稿づくりに使います。',
    href: 'knowledge',
  },
  {
    title: '商品・活動情報',
    description: '紹介する商品、必須表示、避ける表現、キャンペーンを準備します。',
    href: 'product-packs',
  },
  {
    title: '専用URL',
    description: '参加者別・商品別の紹介URLを登録し、投稿案へ安全に差し込みます。',
    href: 'external-tracking',
  },
  {
    title: '商品投稿の確認',
    description: '商品・キャンペーン投稿を、コピー前に確認するか設定します。',
    href: 'post-approvals',
  },
  {
    title: '公式LINE',
    description: 'このサービス専用の公式LINE、通知時間、接続状態を設定します。',
    href: 'line',
  },
  {
    title: 'ポイントとバッジ',
    description: '投稿の継続を応援するポイント・バッジを設定します。',
    href: 'badges',
  },
  {
    title: '実践プログラム',
    description: '参加者に提供するコースや、選べる支援内容を管理します。',
    href: 'programs',
  },
  {
    title: '動画生成の状況',
    description: 'このサービス内で作られている動画とAI場面の進み具合を確認します。',
    href: 'video-operations',
  },
  {
    title: 'サービスの見た目・登録',
    description: '名前、ロゴ、色、参加方法など、利用者に見える内容を設定します。',
    href: 'settings',
  },
  {
    title: '利用規約・プライバシー',
    description: '参加者が確認する利用規約とプライバシーポリシーを管理します。',
    href: 'legal',
  },
] as const;

export default async function ServiceManagementHome({
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
  const pendingPostApprovalCount = await db.prisma.campaignPostingApprovalRequest.count({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      status: 'PENDING',
    },
  });
  const configuration = service.configuration;
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  const line = group.lineChannelConfigurations[0];
  const readiness = buildServiceLaunchReadiness({
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
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>{configuration.displayName}の開始準備と運営</h1>
          <p>開始準備の確認と、日々の運営に必要な設定をまとめました。</p>
        </header>
        <section className="settings-card">
          <h2>
            {readyCount} / {readiness.length} 項目が準備できています
          </h2>
          <p>
            {readyCount === readiness.length
              ? '必要な設定がそろいました。参加者のテストを始められます。'
              : '「設定する」と表示されている項目を確認してください。'}
          </p>
        </section>
        {pendingPostApprovalCount > 0 ? (
          <section className="settings-card">
            <h2>確認を待っている商品投稿があります</h2>
            <p>{pendingPostApprovalCount}件の投稿案が、参加者のコピー前の確認を待っています。</p>
            <Link
              className="button"
              href={`/s/${configuration.slug}/manage/post-approvals` as Route}
            >
              投稿案を確認する
            </Link>
          </section>
        ) : null}
        <section className="settings-card">
          <h2>開始準備</h2>
          <div className="settings-status-list">
            {readiness.map((item) => (
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
        <section className="settings-card">
          <h2>運営メニュー</h2>
          <ul className="settings-status-list">
            {sections.map((section) => (
              <li className="settings-status-item" key={section.href}>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
                <Link
                  className="button button--secondary"
                  href={`/s/${configuration.slug}/manage/${section.href}`}
                >
                  開く
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <Link href={`/s/${configuration.slug}/home` as Route}>← 参加者向けのホームを見る</Link>
      </main>
    </PublicShell>
  );
}
