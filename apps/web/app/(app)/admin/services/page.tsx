import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ServiceEditor } from './service-editor';
import Link from 'next/link';
import { ServiceLifecycleEditor } from './service-lifecycle-editor';
import { ServiceCommercialSettingEditor } from './service-commercial-setting-editor';
import { ServiceCustomDomainEditor } from './service-custom-domain-editor';
import { isFortunePackageLicenseActive } from '../../../../src/services/fortune-package-license';

export const dynamic = 'force-dynamic';

export default async function ServicesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; groupId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const [workspaces, groups, services] = await Promise.all([
    db.prisma.workspace.findMany({
      where: { type: 'ORGANIZATION' },
      select: {
        id: true,
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
      orderBy: { name: 'asc' },
    }),
    db.prisma.group.findMany({
      where: { status: 'ACTIVE', serviceConfiguration: { is: null } },
      select: { id: true, workspaceId: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.prisma.serviceConfiguration.findMany({
      include: {
        group: { select: { status: true } },
        registration: true,
        commercialSetting: true,
        customDomain: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const query = await searchParams;
  const activeWorkspaces = workspaces
    .filter((workspace) => workspace.status === 'ACTIVE')
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      fortunePackageEnabled: isFortunePackageLicenseActive(workspace.organizationEntitlement),
    }));
  const requestedGroup = groups.find(
    (group) =>
      group.id === query.groupId &&
      activeWorkspaces.some((workspace) => workspace.id === group.workspaceId),
  );
  const defaultWorkspaceId =
    requestedGroup?.workspaceId ??
    activeWorkspaces.find((workspace) => workspace.id === query.workspaceId)?.id;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>プロジェクトの公開設定</h1>
        <p>運営団体の中にあるプロジェクトへ、公開名・登録URL・ブランドを設定します。</p>
        <Link href="/admin/programs">公式プログラムを管理する →</Link>
      </header>
      <section className="settings-card">
        <h2>プロジェクトを公開するまでの順番</h2>
        <ol>
          <li>「運営団体」を作成します。</li>
          <li>「プロジェクト管理」で、対象となるプロジェクトを団体の中に作ります。</li>
          <li>この画面で公開名、登録URL、ブランドを設定します。</li>
          <li>利用規約、プライバシーポリシー、登録方法、LINEなどを設定してから公開します。</li>
        </ol>
      </section>
      {activeWorkspaces.length > 0 ? (
        <ServiceEditor
          workspaces={activeWorkspaces}
          groups={groups}
          {...(defaultWorkspaceId ? { defaultWorkspaceId } : {})}
          {...(requestedGroup ? { defaultGroupId: requestedGroup.id } : {})}
        />
      ) : (
        <section className="settings-card">
          <h2>先に運営団体を作成してください</h2>
          <p>プロジェクトは、運営団体に所属させてから公開設定を作成します。</p>
          <Link className="button" href="/admin/organizations">
            運営団体を作成する
          </Link>
        </section>
      )}
      <section className="settings-card">
        <h2>運営団体ごとの公開プロジェクト</h2>
        {services.length === 0 ? (
          <p>公開設定が作成されたプロジェクトはまだありません。</p>
        ) : (
          <div className="settings-stack">
            {workspaces.map((workspace) => {
              const organizationServices = services.filter(
                (service) => service.workspaceId === workspace.id,
              );
              if (organizationServices.length === 0) return null;
              return (
                <section className="settings-card" key={workspace.id}>
                  <div className="management-section__heading">
                    <div>
                      <p className="management-section__eyebrow">運営団体</p>
                      <h3>{workspace.name}</h3>
                    </div>
                    <span>{organizationServices.length}プロジェクト</span>
                  </div>
                  {organizationServices.map((service) => (
                    <div key={service.id}>
                      <ServiceLifecycleEditor
                        service={{
                          id: service.id,
                          displayName: service.displayName,
                          visibility: service.visibility,
                          status: service.group.status,
                          poweredByEnabled: service.poweredByEnabled,
                          startsAt: service.startsAt?.toISOString() ?? null,
                          endsAt: service.endsAt?.toISOString() ?? null,
                        }}
                      />
                      <ServiceCommercialSettingEditor
                        serviceId={service.id}
                        setting={
                          service.commercialSetting
                            ? {
                                planName: service.commercialSetting.planName,
                                billingMode: service.commercialSetting.billingMode,
                                status: service.commercialSetting.status,
                                monthlyPriceYen: service.commercialSetting.monthlyPriceYen,
                                includedMemberLimit: service.commercialSetting.includedMemberLimit,
                                monthlyAiGenerationLimit:
                                  service.commercialSetting.monthlyAiGenerationLimit,
                                monthlyImageGenerationLimit:
                                  service.commercialSetting.monthlyImageGenerationLimit,
                                monthlyVideoGenerationLimit:
                                  service.commercialSetting.monthlyVideoGenerationLimit,
                                startsAt: service.commercialSetting.startsAt?.toISOString() ?? null,
                                endsAt: service.commercialSetting.endsAt?.toISOString() ?? null,
                              }
                            : null
                        }
                      />
                      <ServiceCustomDomainEditor
                        serviceId={service.id}
                        domain={
                          service.customDomain
                            ? {
                                hostname: service.customDomain.hostname,
                                status: service.customDomain.status,
                                verificationNote: service.customDomain.verificationNote,
                              }
                            : null
                        }
                      />
                      <p>
                        専用URL：<code>/s/{service.slug}</code> ／ 登録方法：
                        {service.registration?.mode ?? '未設定'} ／{' '}
                        <Link href={`/groups/${service.groupId}/legal`}>利用規約を管理</Link>
                      </p>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
