import {
  nextTenantInvoiceStatus,
  summarizeCommercialInvoices,
  tenantInvoiceDueAt,
  tenantInvoiceNumber,
} from '@bunshin/application';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import {
  invoiceDocumentSnapshot,
  jsonSnapshot,
  optionalText,
  requiredText,
  unresolvedCommercialReminderFailures,
  type PrepareCustomQuoteInvoiceInput,
  type SaveOrganizationCommercialContractInput,
  type TransitionTenantInvoiceInput,
} from './commercial-billing-support';

export class PrismaCommercialBillingService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async dashboard(workspaceId: string) {
    return this.client.workspace.findFirst({
      where: { id: workspaceId, type: 'ORGANIZATION' },
      select: {
        id: true,
        name: true,
        legalName: true,
        contactEmail: true,
        organizationCommercialContract: true,
        tenantInvoices: {
          orderBy: { periodStart: 'desc' },
          take: 24,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            periodStart: true,
            mau: true,
            amountYen: true,
            externalInvoiceReference: true,
            paymentReference: true,
            paymentProvider: true,
            providerCheckoutSessionId: true,
            checkoutExpiresAt: true,
            paymentFailedAt: true,
            paymentFailureCategory: true,
            notes: true,
            documentSnapshot: true,
            issuedAt: true,
            dueAt: true,
            paidAt: true,
          },
        },
        commercialBillingAudits: {
          orderBy: { occurredAt: 'desc' },
          take: 20,
          select: { id: true, entityType: true, entityId: true, action: true, occurredAt: true },
        },
        tenantMonthlyUsage: {
          where: { status: 'FINALIZED', calculatedPriceYen: null, invoice: null },
          orderBy: { periodStart: 'asc' },
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            mau: true,
            pricingTierKey: true,
            pricingVersion: true,
          },
        },
      },
    });
  }

  async operationsDashboard(now = new Date()) {
    const [activeContracts, invoices] = await Promise.all([
      this.client.organizationCommercialContract.count({ where: { status: 'ACTIVE' } }),
      this.client.tenantInvoice.findMany({
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          workspaceId: true,
          invoiceNumber: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          mau: true,
          pricingTierKey: true,
          pricingVersion: true,
          amountYen: true,
          externalInvoiceReference: true,
          paymentReference: true,
          notes: true,
          issuedAt: true,
          dueAt: true,
          paidAt: true,
          createdAt: true,
          workspace: { select: { name: true, legalName: true } },
          contract: {
            select: { billingName: true, billingEmail: true, externalCustomerReference: true },
          },
        },
      }),
    ]);
    const issuedInvoiceIds = invoices
      .filter((invoice) => invoice.status === 'ISSUED')
      .map((invoice) => invoice.id);
    const reminderAudits = issuedInvoiceIds.length
      ? await this.client.commercialBillingAudit.findMany({
          where: {
            entityType: 'INVOICE',
            entityId: { in: issuedInvoiceIds },
            action: {
              in: [
                'PAYMENT_GUIDANCE_SENT',
                'OVERDUE_REMINDER_SENT',
                'PAYMENT_GUIDANCE_FAILED',
                'OVERDUE_REMINDER_FAILED',
              ],
            },
          },
          orderBy: { occurredAt: 'desc' },
          take: 5000,
          select: {
            id: true,
            workspaceId: true,
            entityId: true,
            action: true,
            occurredAt: true,
          },
        })
      : [];
    return {
      activeContracts,
      summary: summarizeCommercialInvoices(invoices, now),
      invoices,
      reminderFailures: unresolvedCommercialReminderFailures(reminderAudits),
    };
  }

  async prepareCustomQuoteInvoice(input: PrepareCustomQuoteInvoiceInput) {
    if (
      !Number.isSafeInteger(input.amountYen) ||
      input.amountYen <= 0 ||
      input.amountYen > 1_000_000_000
    )
      throw new Error('invalid custom quote amount');
    const now = new Date();
    const [contract, usage] = await Promise.all([
      this.client.organizationCommercialContract.findFirst({
        where: {
          workspaceId: input.workspaceId,
          status: 'ACTIVE',
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
      }),
      this.client.tenantMonthlyUsage.findFirst({
        where: {
          id: input.monthlyUsageId,
          workspaceId: input.workspaceId,
          status: 'FINALIZED',
          calculatedPriceYen: null,
          invoice: null,
        },
      }),
    ]);
    if (!contract) throw new Error('active contract not found');
    if (!usage) throw new Error('custom quote usage not found');
    return this.client.$transaction(async (tx) => {
      const invoice = await tx.tenantInvoice.create({
        data: {
          workspaceId: input.workspaceId,
          contractId: contract.id,
          monthlyUsageId: usage.id,
          invoiceNumber: tenantInvoiceNumber(usage.periodStart, usage.id),
          periodStart: usage.periodStart,
          periodEnd: usage.periodEnd,
          mau: usage.mau,
          pricingTierKey: usage.pricingTierKey,
          pricingVersion: usage.pricingVersion,
          amountYen: input.amountYen,
          notes: optionalText(input.notes, 1000),
          updatedByUserId: input.actorUserId,
        },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'INVOICE',
          entityId: invoice.id,
          action: 'CUSTOM_CREATED',
          afterData: jsonSnapshot(invoice),
        },
      });
      return invoice;
    });
  }

  async saveContract(input: SaveOrganizationCommercialContractInput) {
    if (
      !Number.isInteger(input.paymentTermsDays) ||
      input.paymentTermsDays < 0 ||
      input.paymentTermsDays > 365
    )
      throw new Error('invalid payment terms');
    if (
      !Number.isInteger(input.reminderLeadDays) ||
      input.reminderLeadDays < 0 ||
      input.reminderLeadDays > 30 ||
      !Number.isInteger(input.overdueReminderIntervalDays) ||
      input.overdueReminderIntervalDays < 1 ||
      input.overdueReminderIntervalDays > 30
    )
      throw new Error('invalid reminder schedule');
    if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt)
      throw new Error('invalid contract period');
    const workspace = await this.client.workspace.findFirst({
      where: { id: input.workspaceId, type: 'ORGANIZATION' },
      select: { id: true, organizationEntitlement: { select: { oemEnabled: true } } },
    });
    if (!workspace) throw new Error('organization not found');
    if (input.status === 'ACTIVE' && !workspace.organizationEntitlement?.oemEnabled)
      throw new Error('OEM entitlement is required');
    const contractData = {
      status: input.status,
      billingMode: input.billingMode,
      billingName: requiredText(input.billingName, 200),
      billingEmail: requiredText(input.billingEmail, 320),
      paymentTermsDays: input.paymentTermsDays,
      automaticRemindersEnabled: input.automaticRemindersEnabled,
      reminderLeadDays: input.reminderLeadDays,
      overdueReminderIntervalDays: input.overdueReminderIntervalDays,
      automaticCollectionEnabled: input.automaticCollectionEnabled,
      externalCustomerReference: optionalText(input.externalCustomerReference, 200),
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      updatedByUserId: input.actorUserId,
    };
    return this.client.$transaction(async (tx) => {
      const before = await tx.organizationCommercialContract.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      const consentData = {
        automaticCollectionConsentAt: input.automaticCollectionEnabled
          ? (before?.automaticCollectionConsentAt ?? new Date())
          : null,
      };
      const saved = await tx.organizationCommercialContract.upsert({
        where: { workspaceId: input.workspaceId },
        create: { workspaceId: input.workspaceId, ...contractData, ...consentData },
        update: { ...contractData, ...consentData },
      });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'CONTRACT',
          entityId: saved.id,
          action: before ? 'UPDATED' : 'CREATED',
          beforeData: before ? jsonSnapshot(before) : Prisma.JsonNull,
          afterData: jsonSnapshot(saved),
        },
      });
      return saved;
    });
  }

  async prepareWorkspaceInvoices(workspaceId: string, now = new Date()) {
    const contract = await this.client.organizationCommercialContract.findFirst({
      where: {
        workspaceId,
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
    });
    if (!contract) return { prepared: 0, skippedCustomQuote: 0 };
    const usages = await this.client.tenantMonthlyUsage.findMany({
      where: { workspaceId, status: 'FINALIZED', invoice: null },
      orderBy: { periodStart: 'asc' },
    });
    let prepared = 0;
    let skippedCustomQuote = 0;
    for (const usage of usages) {
      if (usage.calculatedPriceYen === null) {
        skippedCustomQuote += 1;
        continue;
      }
      const amountYen = usage.calculatedPriceYen;
      try {
        await this.client.$transaction(async (tx) => {
          const invoice = await tx.tenantInvoice.create({
            data: {
              workspaceId,
              contractId: contract.id,
              monthlyUsageId: usage.id,
              invoiceNumber: tenantInvoiceNumber(usage.periodStart, usage.id),
              periodStart: usage.periodStart,
              periodEnd: usage.periodEnd,
              mau: usage.mau,
              pricingTierKey: usage.pricingTierKey,
              pricingVersion: usage.pricingVersion,
              amountYen,
              updatedByUserId: contract.updatedByUserId,
            },
          });
          await tx.commercialBillingAudit.create({
            data: {
              workspaceId,
              actorUserId: contract.updatedByUserId,
              entityType: 'INVOICE',
              entityId: invoice.id,
              action: 'AUTO_CREATED',
              afterData: jsonSnapshot(invoice),
            },
          });
        });
        prepared += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
          throw error;
      }
    }
    return { prepared, skippedCustomQuote };
  }

  async prepareAllFinalizedInvoices(now = new Date()) {
    const contracts = await this.client.organizationCommercialContract.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      select: { workspaceId: true },
    });
    let prepared = 0;
    let skippedCustomQuote = 0;
    for (const contract of contracts) {
      const result = await this.prepareWorkspaceInvoices(contract.workspaceId, now);
      prepared += result.prepared;
      skippedCustomQuote += result.skippedCustomQuote;
    }
    return { organizations: contracts.length, prepared, skippedCustomQuote };
  }

  async transitionInvoice(input: TransitionTenantInvoiceInput) {
    const invoice = await this.client.tenantInvoice.findFirst({
      where: { id: input.invoiceId, workspaceId: input.workspaceId },
      include: {
        workspace: { select: { name: true, legalName: true, address: true } },
        contract: {
          select: { billingName: true, billingEmail: true, paymentTermsDays: true },
        },
      },
    });
    if (!invoice) throw new Error('invoice not found');
    const status = nextTenantInvoiceStatus(invoice.status, input.action);
    const now = input.now ?? new Date();
    const common = {
      status,
      updatedByUserId: input.actorUserId,
      externalInvoiceReference:
        optionalText(input.externalInvoiceReference, 200) ?? invoice.externalInvoiceReference,
      paymentReference: optionalText(input.paymentReference, 200) ?? invoice.paymentReference,
      notes: optionalText(input.notes, 1000) ?? invoice.notes,
    };
    if (input.action === 'ISSUE' && !input.documentIssuer)
      throw new Error('invoice document issuer is required');
    const data =
      input.action === 'ISSUE' && input.documentIssuer
        ? {
            ...common,
            issuedAt: now,
            dueAt: tenantInvoiceDueAt(now, invoice.contract.paymentTermsDays),
            documentSnapshot: invoiceDocumentSnapshot(invoice, input.documentIssuer, now),
          }
        : input.action === 'MARK_PAID'
          ? { ...common, paidAt: now }
          : { ...common, voidedAt: now };
    return this.client.$transaction(async (tx) => {
      const updated = await tx.tenantInvoice.update({ where: { id: invoice.id }, data });
      await tx.commercialBillingAudit.create({
        data: {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          entityType: 'INVOICE',
          entityId: invoice.id,
          action: input.action,
          beforeData: jsonSnapshot(invoice),
          afterData: jsonSnapshot(updated),
        },
      });
      return updated;
    });
  }
}
