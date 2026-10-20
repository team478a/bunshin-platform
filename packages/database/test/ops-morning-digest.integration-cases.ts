import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client/index';
import { describe, expect, it } from 'vitest';
import { PrismaOpsMorningDigestCollector } from '../src/ops-morning-digest';
import {
  integrationDatabaseTarget,
  verifyIntegrationDatabase,
} from './integration-database-preflight';

/** Called only after the enclosing integration suite's isolated database preflight. */
export function registerOpsMorningDigestIntegrationCases() {
  describe('morning digest read-only collectors', () => {
    it('keeps broadcasts separated by service and does not select private or invoice amount fields', async () => {
      const target = integrationDatabaseTarget(process.env);
      const queryClient = new PrismaClient({
        log: [{ emit: 'event', level: 'query' }],
        datasources: { db: { url: process.env['DATABASE_URL']! } },
      });
      const statements: string[] = [];
      queryClient.$on('query', (event) => statements.push(event.query.toLowerCase()));
      let actorId: string | undefined;
      let workspaceId: string | undefined;
      try {
        await verifyIntegrationDatabase(
          target,
          () =>
            queryClient.$queryRaw`
          SELECT datname AS database, shobj_description(oid, 'pg_database') AS marker
          FROM pg_database WHERE datname = current_database()
        `,
        );
        const actor = await queryClient.user.create({
          data: { displayName: 'Synthetic digest actor' },
        });
        actorId = actor.id;
        const workspace = await queryClient.workspace.create({
          data: { name: `digest-${randomUUID()}`, type: 'ORGANIZATION' },
        });
        workspaceId = workspace.id;
        const groupA = await queryClient.group.create({
          data: { workspaceId: workspace.id, name: `digest-a-${randomUUID()}` },
        });
        const groupB = await queryClient.group.create({
          data: { workspaceId: workspace.id, name: `digest-b-${randomUUID()}` },
        });
        const serviceA = await queryClient.serviceConfiguration.create({
          data: {
            workspaceId: workspace.id,
            groupId: groupA.id,
            slug: `digest-a-${randomUUID()}`,
            displayName: 'Synthetic Digest Service A',
            description: 'synthetic',
            operatorName: 'synthetic operator',
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
        });
        const serviceB = await queryClient.serviceConfiguration.create({
          data: {
            workspaceId: workspace.id,
            groupId: groupB.id,
            slug: `digest-b-${randomUUID()}`,
            displayName: 'Synthetic Digest Service B',
            description: 'synthetic',
            operatorName: 'synthetic operator',
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
        });
        const from = new Date('2026-10-18T15:00:00.000Z');
        const to = new Date('2026-10-19T15:00:00.000Z');
        const contract = await queryClient.organizationCommercialContract.create({
          data: {
            workspaceId: workspace.id,
            status: 'ACTIVE',
            billingMode: 'MANUAL_INVOICE',
            billingName: 'Synthetic billing name must not be read',
            billingEmail: 'private@example.invalid',
            updatedByUserId: actor.id,
          },
        });
        const invoicesBefore = await queryClient.tenantInvoice.groupBy({
          by: ['status'],
          _count: { _all: true },
        });
        const monthlyUsage = await queryClient.tenantMonthlyUsage.create({
          data: {
            workspaceId: workspace.id,
            periodStart: new Date('2026-10-01T00:00:00.000Z'),
            periodEnd: new Date('2026-10-31T00:00:00.000Z'),
            mau: 1,
            pricingTierKey: 'SYNTHETIC',
            pricingVersion: 'test-v1',
          },
        });
        await queryClient.tenantInvoice.create({
          data: {
            workspaceId: workspace.id,
            contractId: contract.id,
            kind: 'MONTHLY_USAGE',
            monthlyUsageId: monthlyUsage.id,
            invoiceNumber: `DIGEST-${randomUUID()}`,
            status: 'ISSUED',
            issuedAt: new Date('2026-10-19T01:00:00.000Z'),
            periodStart: new Date('2026-10-01T00:00:00.000Z'),
            periodEnd: new Date('2026-10-31T00:00:00.000Z'),
            mau: 1,
            pricingTierKey: 'SYNTHETIC',
            pricingVersion: 'test-v1',
            amountYen: 12345,
            updatedByUserId: actor.id,
          },
        });
        await queryClient.serviceLineBroadcast.createMany({
          data: [
            {
              workspaceId: workspace.id,
              groupId: groupA.id,
              title: 'private title not selected',
              message: 'private@example.invalid U1234567890abcdef1234567890abcdef 12,345円',
              status: 'SCHEDULED',
              scheduledAt: from,
              createdByUserId: actor.id,
              updatedByUserId: actor.id,
            },
            {
              workspaceId: workspace.id,
              groupId: groupA.id,
              title: 'completed title not selected',
              message: 'message body not selected',
              status: 'COMPLETED',
              scheduledAt: new Date(from.getTime() + 60_000),
              completedAt: new Date(from.getTime() + 120_000),
              createdByUserId: actor.id,
              updatedByUserId: actor.id,
            },
            {
              workspaceId: workspace.id,
              groupId: groupB.id,
              title: 'another service title not selected',
              message: 'another service message not selected',
              status: 'SCHEDULED',
              scheduledAt: new Date(from.getTime() + 180_000),
              createdByUserId: actor.id,
              updatedByUserId: actor.id,
            },
            {
              workspaceId: workspace.id,
              groupId: groupA.id,
              title: 'outside target date',
              message: 'outside target date',
              status: 'SCHEDULED',
              scheduledAt: to,
              createdByUserId: actor.id,
              updatedByUserId: actor.id,
            },
          ],
        });

        const collector = new PrismaOpsMorningDigestCollector(queryClient);
        const [broadcasts, invoices] = await Promise.all([
          collector.serviceLineBroadcasts({ targetDate: '2026-10-19', from, to }),
          collector.tenantInvoiceStatuses(),
        ]);

        expect(broadcasts.serviceBroadcasts).toEqual({
          status: 'OK',
          value: [
            { serviceName: serviceA.displayName, status: 'COMPLETED', count: 1 },
            { serviceName: serviceA.displayName, status: 'SCHEDULED', count: 1 },
            { serviceName: serviceB.displayName, status: 'SCHEDULED', count: 1 },
          ],
        });
        expect(broadcasts.fortuneWeeklyBroadcasts.status).toBe('NOT_APPLICABLE');
        const expectedInvoiceCounts = new Map(
          invoicesBefore.map((row) => [row.status, row._count._all]),
        );
        expectedInvoiceCounts.set('ISSUED', (expectedInvoiceCounts.get('ISSUED') ?? 0) + 1);
        expect(invoices.status).toBe('OK');
        if (invoices.status === 'OK') {
          expect(
            [...invoices.value].sort((left, right) => left.status.localeCompare(right.status)),
          ).toEqual(
            [...expectedInvoiceCounts]
              .map(([status, count]) => ({ status, count }))
              .sort((left, right) => left.status.localeCompare(right.status)),
          );
        }

        const readStatements = statements.filter((sql) => sql.trimStart().startsWith('select'));
        const broadcastReads = readStatements.filter((sql) =>
          sql.includes('service_line_broadcasts'),
        );
        const invoiceReads = readStatements.filter((sql) => sql.includes('tenant_invoices'));
        const serviceNameReads = readStatements.filter((sql) =>
          sql.includes('service_configurations'),
        );
        const selectedColumns = (sql: string) => {
          const selectStart = sql.indexOf('select ') + 'select '.length;
          const fromStart = sql.indexOf(' from ', selectStart);
          return fromStart < 0 ? sql : sql.slice(selectStart, fromStart);
        };
        expect(broadcastReads.length).toBeGreaterThan(0);
        expect(invoiceReads.length).toBeGreaterThan(0);
        expect(serviceNameReads.length).toBeGreaterThan(0);
        expect(broadcastReads.map(selectedColumns).join('\n')).not.toMatch(
          /"(title|message|workspace_id|created_by_user_id)"/,
        );
        expect(invoiceReads.map(selectedColumns).join('\n')).not.toMatch(
          /"(amount_yen|invoice_number|contract_id|workspace_id)"/,
        );
        expect(serviceNameReads.map(selectedColumns).join('\n')).not.toMatch(
          /"(operator_name|contact_email|description|workspace_id)"/,
        );
      } finally {
        if (workspaceId) {
          await queryClient.tenantInvoice.deleteMany({ where: { workspaceId } });
          await queryClient.tenantMonthlyUsage.deleteMany({ where: { workspaceId } });
          await queryClient.organizationCommercialContract.deleteMany({
            where: { workspaceId },
          });
          await queryClient.serviceLineBroadcast.deleteMany({ where: { workspaceId } });
          await queryClient.serviceConfiguration.deleteMany({ where: { workspaceId } });
          await queryClient.group.deleteMany({ where: { workspaceId } });
          await queryClient.workspace.delete({ where: { id: workspaceId } });
        }
        if (actorId) await queryClient.user.delete({ where: { id: actorId } });
        await queryClient.$disconnect();
      }
    });
  });
}
