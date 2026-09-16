import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  fortuneInventoryHealth,
  fortuneInventoryHealthLabels,
  fortuneLicenseLabels,
  fortuneLicenseState,
} from '../../../../src/fortune/admin-inventory';
import { isFortuneLineReady } from '../../../../src/fortune/launch-readiness';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { FORTUNE_KNOWLEDGE_MEANING_COUNT } from '@bunshin/capability-fortune';
import {
  fortunePackageReleaseStatus,
  isFortuneServicePackage,
} from '../../../../src/services/service-creation-templates';

export const dynamic = 'force-dynamic';

export default async function FortunePackageAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();

  const environment = currentLineEnvironment();
  const [allServices, sharedLineReadyCount] = await Promise.all([
    db.prisma.serviceConfiguration.findMany({
      select: {
        id: true,
        workspaceId: true,
        groupId: true,
        slug: true,
        displayName: true,
        contactEmail: true,
        workspace: {
          select: {
            name: true,
            status: true,
            organizationEntitlement: {
              select: {
                fortunePackageEnabled: true,
                suspended: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        },
        group: { select: { name: true, status: true } },
        registration: { select: { lineEnabled: true, onboardingConfig: true } },
        brand: { select: { logoUrl: true } },
        legalDocuments: {
          where: { status: 'PUBLISHED' },
          select: { type: true },
        },
        commercialSetting: {
          select: { includedMemberLimit: true },
        },
        fortuneSetting: {
          select: {
            enabled: true,
            bunshin: {
              select: {
                status: true,
                capabilityAssignments: {
                  where: { capabilityType: 'FORTUNE', status: 'ACTIVE' },
                  select: { id: true },
                },
              },
            },
            knowledgeVersions: {
              where: { status: 'APPROVED' },
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                version: true,
                _count: { select: { cardMeanings: { where: { safetyReviewed: true } } } },
              },
            },
          },
        },
      },
      orderBy: [{ workspace: { name: 'asc' } }, { displayName: 'asc' }],
    }),
    db.prisma.lineChannelConfiguration.count({
      where: {
        environment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    }),
  ]);
  const services = allServices.filter(
    (service) =>
      Boolean(service.fortuneSetting) ||
      isFortuneServicePackage(service.registration?.onboardingConfig),
  );
  const groupIds = services.map((service) => service.groupId);
  const [routingPolicies, dedicatedLines, participantCounts] = groupIds.length
    ? await Promise.all([
        db.prisma.groupLineRoutingPolicy.findMany({
          where: { environment, groupId: { in: groupIds } },
          select: { groupId: true, mode: true, pilotEnabled: true },
        }),
        db.prisma.groupLineChannelConfiguration.findMany({
          where: { environment, groupId: { in: groupIds }, status: 'ACTIVE' },
          select: {
            groupId: true,
            version: true,
            lastVerifiedAt: true,
            lastErrorCategory: true,
            globallyPaused: true,
          },
          orderBy: { version: 'desc' },
        }),
        db.prisma.groupMembership.groupBy({
          by: ['groupId'],
          where: {
            groupId: { in: groupIds },
            role: 'PARTICIPANT',
            status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const policyByGroup = new Map(routingPolicies.map((policy) => [policy.groupId, policy]));
  const dedicatedLineByGroup = new Map<string, (typeof dedicatedLines)[number]>();
  for (const configuration of dedicatedLines) {
    if (!dedicatedLineByGroup.has(configuration.groupId))
      dedicatedLineByGroup.set(configuration.groupId, configuration);
  }
  const participantsByGroup = new Map(
    participantCounts.map((count) => [count.groupId, count._count._all]),
  );
  const now = new Date();
  const rows = services.map((service) => {
    const release = fortunePackageReleaseStatus(service.registration?.onboardingConfig);
    const policy = policyByGroup.get(service.groupId);
    const dedicatedLine = dedicatedLineByGroup.get(service.groupId);
    const approved = service.fortuneSetting?.knowledgeVersions[0];
    const packageReady = Boolean(
      service.fortuneSetting &&
      service.fortuneSetting.bunshin.status === 'ACTIVE' &&
      service.fortuneSetting.bunshin.capabilityAssignments.length === 1 &&
      approved?._count.cardMeanings === FORTUNE_KNOWLEDGE_MEANING_COUNT,
    );
    const brandReady = Boolean(service.brand?.logoUrl && service.contactEmail);
    const termsReady = service.legalDocuments.some((document) => document.type === 'TERMS');
    const privacyReady = service.legalDocuments.some((document) => document.type === 'PRIVACY');
    const lineReady = isFortuneLineReady({
      registrationLineEnabled: service.registration?.lineEnabled ?? false,
      mode: policy?.mode ?? 'SHARED',
      sharedLineReadyCount,
      dedicatedPilotEnabled: policy?.pilotEnabled ?? false,
      dedicatedLastVerifiedAt: dedicatedLine?.lastVerifiedAt ?? null,
      dedicatedLastErrorCategory: dedicatedLine?.lastErrorCategory ?? null,
      dedicatedGloballyPaused: dedicatedLine?.globallyPaused ?? true,
    });
    const readyCount = [packageReady, brandReady, termsReady, privacyReady, lineReady].filter(
      Boolean,
    ).length;
    const license = fortuneLicenseState(service.workspace.organizationEntitlement, now);
    const health = fortuneInventoryHealth({
      organizationActive: service.workspace.status === 'ACTIVE',
      projectActive: service.group.status === 'ACTIVE',
      configured: Boolean(service.fortuneSetting),
      enabled: service.fortuneSetting?.enabled ?? false,
      readyCount,
      packageReleaseState: release.state,
    });
    return {
      ...service,
      release,
      license,
      health,
      readyCount,
      participants: participantsByGroup.get(service.groupId) ?? 0,
    };
  });
  const liveCount = rows.filter((row) => row.health === 'LIVE').length;
  const attentionCount = rows.filter(
    (row) =>
      ['UPDATE_REQUIRED', 'UNSUPPORTED_VERSION', 'ATTENTION', 'STOPPED'].includes(row.health) ||
      row.license !== 'ACTIVE',
  ).length;
  const licensedOrganizations = new Set(
    rows.filter((row) => row.license === 'ACTIVE').map((row) => row.workspaceId),
  ).size;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>占いパッケージ運用</h1>
        <p>導入先、契約、公開準備、版、参加者数を一画面で確認します。</p>
      </header>
      <section className="settings-card">
        <h2>全体状況</h2>
        <dl>
          <div>
            <dt>導入対象</dt>
            <dd>{rows.length}サービス</dd>
          </div>
          <div>
            <dt>公開中</dt>
            <dd>{liveCount}サービス</dd>
          </div>
          <div>
            <dt>確認が必要</dt>
            <dd>{attentionCount}サービス</dd>
          </div>
          <div>
            <dt>有効契約</dt>
            <dd>{licensedOrganizations}運営団体</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <p className="management-section__eyebrow">導入一覧</p>
            <h2>占いサービス</h2>
          </div>
          <Link href="/admin/services">新しいサービスを作る</Link>
        </div>
        {rows.length === 0 ? (
          <p>占いパッケージを選択したサービスはまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>運営団体・サービス</th>
                  <th>契約</th>
                  <th>状態</th>
                  <th>導入版</th>
                  <th>公開準備</th>
                  <th>参加者</th>
                  <th>設定</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.displayName}</strong>
                      <br />
                      {row.workspace.name} ／ {row.group.name}
                    </td>
                    <td>{fortuneLicenseLabels[row.license]}</td>
                    <td>{fortuneInventoryHealthLabels[row.health]}</td>
                    <td>
                      {row.release.installedVersion === null
                        ? '未導入'
                        : `v${row.release.installedVersion}`}
                      {row.release.state === 'UPDATE_AVAILABLE' &&
                        ` → v${row.release.currentVersion}`}
                    </td>
                    <td>{row.readyCount}/5</td>
                    <td>
                      {row.participants}人
                      {row.commercialSetting?.includedMemberLimit !== null &&
                        row.commercialSetting?.includedMemberLimit !== undefined &&
                        ` / ${row.commercialSetting.includedMemberLimit}人`}
                    </td>
                    <td>
                      <Link href={`/admin/organizations/${row.workspaceId}/limits`}>契約</Link> ／{' '}
                      <Link
                        href={`/admin/services?workspaceId=${row.workspaceId}&groupId=${row.groupId}`}
                      >
                        公開設定
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          公開準備は、パッケージ、ロゴ・問い合わせ先、利用規約、プライバシー、公式LINEの5項目です。
        </p>
      </section>
    </main>
  );
}
