import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  PrismaCommercialBillingService,
  unresolvedCommercialReminderFailures,
} from '../src/commercial-billing';

describe('unresolvedCommercialReminderFailures', () => {
  const audit = (action: string, occurredAt: string, entityId = 'invoice-a') => ({
    id: `${action}-${occurredAt}`,
    workspaceId: 'workspace-a',
    entityId,
    action,
    occurredAt: new Date(occurredAt),
  });

  it('keeps only the latest unresolved failure for each invoice and reminder kind', () => {
    const failures = unresolvedCommercialReminderFailures([
      audit('PAYMENT_GUIDANCE_FAILED', '2026-09-20T00:00:00.000Z'),
      audit('PAYMENT_GUIDANCE_SENT', '2026-09-20T01:00:00.000Z'),
      audit('OVERDUE_REMINDER_FAILED', '2026-09-21T00:00:00.000Z'),
      audit('OVERDUE_REMINDER_FAILED', '2026-09-20T23:00:00.000Z'),
    ]);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.action).toBe('OVERDUE_REMINDER_FAILED');
    expect(failures[0]?.occurredAt.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('does not mix reminder history between organizations', () => {
    const failure = audit('PAYMENT_GUIDANCE_FAILED', '2026-09-20T00:00:00.000Z');
    const success = {
      ...audit('PAYMENT_GUIDANCE_SENT', '2026-09-20T01:00:00.000Z'),
      workspaceId: 'workspace-b',
    };

    expect(unresolvedCommercialReminderFailures([failure, success])).toEqual([failure]);
  });
});

describe('PrismaCommercialBillingService', () => {
  it('does not activate billing without an OEM entitlement', async () => {
    const client = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'workspace-a',
          organizationEntitlement: { oemEnabled: false },
        }),
      },
    } as unknown as PrismaClient;
    await expect(
      new PrismaCommercialBillingService(client).saveContract({
        workspaceId: 'workspace-a',
        actorUserId: 'actor',
        status: 'ACTIVE',
        billingMode: 'MANUAL_INVOICE',
        billingName: '運営会社A',
        billingEmail: 'billing@example.com',
        paymentTermsDays: 30,
        automaticRemindersEnabled: false,
      }),
    ).rejects.toThrow('OEM entitlement is required');
  });

  it('creates a tenant-scoped draft from one finalized usage snapshot', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'invoice' });
    const rawClient = {
      organizationCommercialContract: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'contract',
          workspaceId: 'workspace-a',
          updatedByUserId: 'actor',
        }),
      },
      tenantMonthlyUsage: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '12345678-1234-4000-8000-123456789abc',
            periodStart: new Date('2026-08-01T00:00:00.000Z'),
            periodEnd: new Date('2026-09-01T00:00:00.000Z'),
            mau: 75,
            pricingTierKey: 'MAU_0_100',
            pricingVersion: 'oem-mau-jpy-v1',
            calculatedPriceYen: 19_800,
          },
        ]),
      },
      tenantInvoice: { create },
      commercialBillingAudit: { create: vi.fn().mockResolvedValue({ id: 'audit' }) },
    };
    const client = {
      ...rawClient,
      $transaction: vi.fn((callback: (tx: typeof rawClient) => unknown) => callback(rawClient)),
    } as unknown as PrismaClient;

    await expect(
      new PrismaCommercialBillingService(client).prepareWorkspaceInvoices('workspace-a'),
    ).resolves.toEqual({ prepared: 1, skippedCustomQuote: 0 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        contractId: 'contract',
        amountYen: 19_800,
      }),
    });
  });

  it('always scopes invoice mutations to the requested organization', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = { tenantInvoice: { findFirst } } as unknown as PrismaClient;
    await expect(
      new PrismaCommercialBillingService(client).transitionInvoice({
        workspaceId: 'workspace-a',
        invoiceId: 'invoice-b',
        actorUserId: 'actor',
        action: 'ISSUE',
      }),
    ).rejects.toThrow('invoice not found');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-b', workspaceId: 'workspace-a' },
      }),
    );
  });

  it('does not create a fixed-price invoice for a custom quote month', async () => {
    const create = vi.fn();
    const rawClient = {
      organizationCommercialContract: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'contract',
          workspaceId: 'workspace-a',
          updatedByUserId: 'actor',
        }),
      },
      tenantMonthlyUsage: {
        findMany: vi.fn().mockResolvedValue([{ calculatedPriceYen: null }]),
      },
      tenantInvoice: { create },
      commercialBillingAudit: { create: vi.fn() },
    };
    const client = {
      ...rawClient,
      $transaction: vi.fn((callback: (tx: typeof rawClient) => unknown) => callback(rawClient)),
    } as unknown as PrismaClient;
    await expect(
      new PrismaCommercialBillingService(client).prepareWorkspaceInvoices('workspace-a'),
    ).resolves.toEqual({ prepared: 0, skippedCustomQuote: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped invoice after an operator sets a custom quote amount', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'invoice-custom', amountYen: 250_000 });
    const rawClient = {
      organizationCommercialContract: {
        findFirst: vi.fn().mockResolvedValue({ id: 'contract', updatedByUserId: 'owner' }),
      },
      tenantMonthlyUsage: {
        findFirst: vi.fn().mockResolvedValue({
          id: '12345678-1234-4000-8000-123456789abc',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-01T00:00:00.000Z'),
          mau: 3_500,
          pricingTierKey: 'CUSTOM',
          pricingVersion: 'oem-mau-jpy-v1',
        }),
      },
      tenantInvoice: { create },
      commercialBillingAudit: { create: vi.fn().mockResolvedValue({ id: 'audit' }) },
    };
    const client = {
      ...rawClient,
      $transaction: vi.fn((callback: (tx: typeof rawClient) => unknown) => callback(rawClient)),
    } as unknown as PrismaClient;

    await new PrismaCommercialBillingService(client).prepareCustomQuoteInvoice({
      workspaceId: 'workspace-a',
      monthlyUsageId: '12345678-1234-4000-8000-123456789abc',
      actorUserId: 'actor',
      amountYen: 250_000,
      notes: '合意済み',
    });
    expect(rawClient.tenantMonthlyUsage.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ workspaceId: 'workspace-a', calculatedPriceYen: null }),
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-a',
        amountYen: 250_000,
        updatedByUserId: 'actor',
      }),
    });
  });

  it('rejects invalid custom quote amounts before querying billing data', async () => {
    const client = {} as PrismaClient;
    await expect(
      new PrismaCommercialBillingService(client).prepareCustomQuoteInvoice({
        workspaceId: 'workspace-a',
        monthlyUsageId: 'usage',
        actorUserId: 'actor',
        amountYen: 0,
      }),
    ).rejects.toThrow('invalid custom quote amount');
  });
});
