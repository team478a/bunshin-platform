import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { ServiceEditor } from './service-editor';
import Link from 'next/link';
import { ServiceLifecycleEditor } from './service-lifecycle-editor';
import { ServiceCommercialSettingEditor } from './service-commercial-setting-editor';
import { ServiceCustomDomainEditor } from './service-custom-domain-editor';

export const dynamic = 'force-dynamic';

export default async function ServicesAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const [workspaces, groups, services] = await Promise.all([
    db.prisma.workspace.findMany({
      where: { type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true, name: true },
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
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>サービス管理</h1>
        <p>独立した名前・登録URL・ブランドを持つサービスを作成します。</p>
        <Link href="/admin/programs">公式プログラムを管理する →</Link>
      </header>
      <section className="settings-card">
        <h2>サービスを公開するまでの順番</h2>
        <ol>
          <li>「運営団体」を作成します。</li>
          <li>「グループ管理」で対象となる参加者グループを作ります。</li>
          <li>この画面でサービス名、登録URL、ブランドを設定します。</li>
          <li>利用規約、プライバシーポリシー、登録方法、LINEなどを設定してから公開します。</li>
        </ol>
      </section>
      {workspaces.length > 0 ? (
        <ServiceEditor workspaces={workspaces} groups={groups} />
      ) : (
        <section className="settings-card">
          <h2>先に運営団体を作成してください</h2>
          <p>サービスは、運営団体に所属させてから作成します。</p>
          <Link className="button" href="/admin/organizations">
            運営団体を作成する
          </Link>
        </section>
      )}
      <section className="settings-card">
        <h2>作成済みのサービス</h2>
        {services.length === 0 ? (
          <p>まだサービスはありません。</p>
        ) : (
          <div className="settings-stack">
            {services.map((service) => (
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
          </div>
        )}
      </section>
    </main>
  );
}
