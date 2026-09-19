import { notFound } from 'next/navigation';
import { parseProgramProductTerms } from '@bunshin/application';
import { resolveAuthenticatedMemberServicePage } from '../../../../src/services/member-service-page';
import { currentPaymentEnvironment } from '../../../../src/payments/secure-configuration';
import { PublicShell } from '../../../ui/public-shell';
import { MemberProgramsEditor } from './member-programs-editor';
import { ProgramProductCatalog } from './program-product-catalog';

export const dynamic = 'force-dynamic';
export default async function MemberProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs`,
  );
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  if (!membership) notFound();
  const allEnrollments = await db.prisma.programEnrollment.findMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: membership.id,
    },
  });
  const enrollments = allEnrollments.filter((item) => item.status === 'ACTIVE');
  const programIds = enrollments.map((item) => item.serviceProgramId);
  const [
    programs,
    policies,
    definitions,
    preferences,
    goals,
    productOfferings,
    paymentConfiguration,
    commerceDocuments,
    purchases,
  ] = await Promise.all([
    db.prisma.serviceProgram.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        id: { in: programIds },
      },
    }),
    db.prisma.serviceProgramSupportPolicy.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        serviceProgramId: { in: programIds },
        status: 'ACTIVE',
      },
    }),
    db.prisma.programGoalDefinition.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        serviceProgramId: { in: programIds },
        status: 'ACTIVE',
      },
      orderBy: { sortOrder: 'asc' },
    }),
    db.prisma.programMemberPreference.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
      },
    }),
    db.prisma.programMemberGoal.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
      },
    }),
    db.prisma.programOffering.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        isFree: false,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }],
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    }),
    db.prisma.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: service.workspaceId,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
      select: { status: true, lastVerifiedAt: true, encryptedWebhookSecret: true },
    }),
    db.prisma.serviceLegalDocument.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        type: { in: ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] },
        status: 'PUBLISHED',
        effectiveAt: { lte: new Date() },
      },
      select: { type: true },
    }),
    db.prisma.programPurchase.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        buyerUserId: actor.userId,
        sourceEnrollmentId: null,
        OR: [
          { status: { in: ['CREATED', 'PAID'] } },
          { status: 'CHECKOUT_OPEN', checkoutExpiresAt: { gt: new Date() } },
        ],
      },
      select: { programOfferingId: true },
    }),
  ]);
  const ownedProgramIds = new Set(allEnrollments.map((item) => item.serviceProgramId));
  const pendingOfferingIds = new Set(purchases.map((item) => item.programOfferingId));
  const parsedProducts = productOfferings.flatMap((offering) => {
    const terms = parseProgramProductTerms(offering.termsSnapshot);
    return terms &&
      !ownedProgramIds.has(offering.serviceProgramId) &&
      !pendingOfferingIds.has(offering.id)
      ? [{ offering, terms }]
      : [];
  });
  const productPrograms =
    parsedProducts.length === 0
      ? []
      : await db.prisma.serviceProgram.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            id: { in: parsedProducts.map(({ offering }) => offering.serviceProgramId) },
            status: 'ACTIVE',
          },
        });
  const products = parsedProducts.flatMap(({ offering, terms }) => {
    const program = productPrograms.find((item) => item.id === offering.serviceProgramId);
    return program
      ? [
          {
            offeringId: offering.id,
            name: program.displayName,
            description: program.description,
            amountYen: terms.amountYen,
            durationDays: terms.durationDays,
          },
        ]
      : [];
  });
  const paymentEnabled =
    paymentConfiguration?.status === 'ACTIVE' &&
    paymentConfiguration.lastVerifiedAt !== null &&
    paymentConfiguration.encryptedWebhookSecret !== null;
  const legalReady = new Set(commerceDocuments.map(({ type }) => type)).size === 3;
  const paymentResult = (await searchParams).payment;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">あなたの活動</p>
          <h1>参加中のプログラム</h1>
          <p>欲しいサポートと、今の目標を自分で選べます。</p>
          <a href={`/s/${serviceSlug}/home`}>← ホームへ戻る</a>
        </header>
        {paymentResult === 'success' ? (
          <p className="notice notice--success" role="status">
            お支払いを受け付けました。確認後にプログラムが自動で始まります。再登録は必要ありません。
          </p>
        ) : null}
        {paymentResult === 'cancelled' ? (
          <p className="notice notice--warning" role="status">
            お支払いは完了していません。開いていた決済の有効期限後に、もう一度お試しください。
          </p>
        ) : null}
        <MemberProgramsEditor
          serviceSlug={serviceSlug}
          items={enrollments.map((enrollment) => {
            const program = programs.find((item) => item.id === enrollment.serviceProgramId)!;
            const policy = policies.find(
              (item) => item.serviceProgramId === enrollment.serviceProgramId,
            );
            const preference = preferences.find(
              (item) => item.programEnrollmentId === enrollment.id,
            );
            const goal = goals.find((item) => item.programEnrollmentId === enrollment.id);
            return {
              enrollmentId: enrollment.id,
              name: program?.displayName ?? '実践プログラム',
              guidance: policy?.guidance ?? '',
              modes: (policy?.allowedSupportModes as string[] | undefined) ?? [
                enrollment.supportMode,
              ],
              memberMayChoose: policy?.memberMayChoose ?? false,
              preferredMode: preference?.preferredSupportMode ?? enrollment.supportMode,
              notes: preference?.notes ?? '',
              actionHref:
                program?.settings &&
                typeof program.settings === 'object' &&
                !Array.isArray(program.settings) &&
                program.settings['moduleKey'] === 'AI_RESALE_V1'
                  ? `/s/${serviceSlug}/programs/${enrollment.id}`
                  : null,
              currentGoal: goal
                ? `${goal.title}：${goal.targetValue.toString()} ${goal.unit}`
                : null,
              definitions: definitions
                .filter((item) => item.serviceProgramId === enrollment.serviceProgramId)
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  metricType: item.metricType,
                  unit: item.unit,
                  target: item.suggestedTarget?.toString() ?? '',
                })),
            };
          })}
        />
        <ProgramProductCatalog
          serviceSlug={serviceSlug}
          paymentEnabled={paymentEnabled}
          legalReady={legalReady}
          products={products}
        />
      </main>
    </PublicShell>
  );
}
