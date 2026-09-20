import { createHash, randomBytes } from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const schema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(200).optional(),
  operatorEmail: z.string().trim().email().max(320),
  serviceName: z.string().trim().min(1).max(120),
  serviceSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  contactEmail: z.string().trim().email().max(320),
});

async function provisionOem(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = schema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/oem-onboarding?error=invalid');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  try {
    const result = await db.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: input.data.organizationName,
          legalName: input.data.legalName || null,
          contactEmail: input.data.contactEmail,
          type: 'ORGANIZATION',
          status: 'ACTIVE',
        },
      });
      await tx.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: actor.userId, role: 'OWNER', status: 'ACTIVE' },
      });
      const entitlement = {
        maxGroups: 1,
        maxOperators: 5,
        maxMembers: 100,
        maxServices: 1,
        monthlyAiGenerationLimit: 10_000,
        monthlyImageGenerationLimit: 1_000,
        monthlyVideoGenerationLimit: 100,
        dedicatedLineEnabled: true,
        oemEnabled: true,
        customDomainEnabled: true,
        fortunePackageEnabled: false,
        suspended: false,
      };
      await tx.organizationEntitlement.create({
        data: { workspaceId: workspace.id, updatedByUserId: actor.userId, ...entitlement },
      });
      await tx.organizationEntitlementAudit.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: actor.userId,
          afterData: entitlement,
          reason: 'OEM標準環境の初期作成',
        },
      });
      const group = await tx.group.create({
        data: {
          workspaceId: workspace.id,
          name: input.data.serviceName,
          memberships: {
            create: {
              workspaceId: workspace.id,
              userId: actor.userId,
              role: 'MANAGER',
              serviceRole: 'SERVICE_OWNER',
              status: 'ACTIVE',
              consentedAt: new Date(),
            },
          },
        },
      });
      const service = await tx.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: input.data.serviceSlug,
          displayName: input.data.serviceName,
          description: `${input.data.serviceName}の投稿支援サービス`,
          operatorName: input.data.organizationName,
          contactEmail: input.data.contactEmail,
          visibility: 'PRIVATE',
          poweredByEnabled: false,
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
      await tx.serviceBrand.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          configurationId: service.id,
          logoUrl: null,
          iconUrl: null,
          faviconUrl: null,
          primaryColor: '#0b356a',
          secondaryColor: '#ff3b30',
          fontFamily: 'system-ui',
        },
      });
      await tx.serviceRegistrationPolicy.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          configurationId: service.id,
          mode: 'INVITATION_ONLY',
          emailEnabled: true,
          lineEnabled: true,
          inviteCodeEnabled: true,
          referralEnabled: false,
          onboardingConfig: {
            templateKey: 'ENTERPRISE_PROGRAM',
            welcomeTitle: 'あなたの活動に合った投稿を考えるために、少し教えてください',
          },
          surveyConfig: { questions: [] },
        },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          configurationId: service.id,
          action: 'CREATED',
          afterData: {
            slug: service.slug,
            displayName: service.displayName,
            visibility: 'PRIVATE',
          },
          reason: 'OEM標準環境の初期作成',
          performedByUserId: actor.userId,
        },
      });
      await tx.organizationCommercialContract.create({
        data: {
          workspaceId: workspace.id,
          status: 'DRAFT',
          billingMode: 'MANUAL_INVOICE',
          billingName: input.data.legalName || input.data.organizationName,
          billingEmail: input.data.contactEmail,
          updatedByUserId: actor.userId,
        },
      });
      await tx.workspaceInvitation.create({
        data: {
          workspaceId: workspace.id,
          inviteeEmail: input.data.operatorEmail,
          tokenHash,
          role: 'ADMIN',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          maxUses: 1,
          createdByUserId: actor.userId,
        },
      });
      return { workspaceId: workspace.id };
    });
    const { getServerEnvironment } = await import('@bunshin/config');
    const invitationUrl = new URL(
      `/organizations/invitations/${token}`,
      getServerEnvironment().APP_URL,
    ).toString();
    redirect(
      `/organizations/${result.workspaceId}/manage?setup=oem&invitation=${encodeURIComponent(invitationUrl)}&delivery=manual`,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    redirect('/admin/oem-onboarding?error=conflict');
  }
}

export default async function OemOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const query = await searchParams;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM導入</p>
        <h1>標準OEM環境をまとめて作る</h1>
        <p>運営団体、非公開サービス、利用上限、下書き契約、運営者招待を一度に準備します。</p>
      </header>
      {query.error ? (
        <p className="notice notice--danger">入力内容または専用URLを確認してください。</p>
      ) : null}
      <section className="settings-card">
        <h2>安全な初期状態</h2>
        <p>作成直後は非公開です。規約、LINE、決済、ブランドを確認した後に公開してください。</p>
      </section>
      <form action={provisionOem} className="settings-card form-stack">
        <label>
          運営団体名
          <input name="organizationName" required maxLength={120} />
        </label>
        <label>
          法人名・正式名称
          <input name="legalName" maxLength={200} />
        </label>
        <label>
          先方の運営管理者メール
          <input name="operatorEmail" type="email" required />
        </label>
        <label>
          サービス名
          <input name="serviceName" required maxLength={120} />
        </label>
        <label>
          専用URL名
          <input
            name="serviceSlug"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="example-sns-support"
          />
        </label>
        <label>
          問い合わせ・請求先メール
          <input name="contactEmail" type="email" required />
        </label>
        <button className="button" type="submit">
          非公開のOEM環境を作成する
        </button>
      </form>
      <Link href="/admin/organizations">運営団体一覧へ戻る</Link>
    </main>
  );
}
