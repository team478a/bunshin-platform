import type { PrismaClient } from '@prisma/client/index';
import { describe, expect, it } from 'vitest';
import { PrismaAiProviderConfigurationRepository } from '../src/provider-configurations';

export function registerAiProviderCallAdmissionIntegrationCases(client: PrismaClient) {
  describe('AI provider call admission persistence', () => {
    it('serializes concurrent reservations against the same remaining provider budget', async () => {
      await client.aiProviderCallAdmission.deleteMany({
        where: { environment: 'DEVELOPMENT', provider: 'FIRECRAWL' },
      });
      await client.aiProviderConfiguration.deleteMany({
        where: { environment: 'DEVELOPMENT', provider: 'FIRECRAWL' },
      });
      const configuration = await client.aiProviderConfiguration.create({
        data: {
          environment: 'DEVELOPMENT',
          provider: 'FIRECRAWL',
          version: 1,
          status: 'ACTIVE',
          encryptedApiKey: 'synthetic-sealed-key',
          apiKeyMask: '••••test',
          model: null,
          dailyBudgetUsdMicros: 250,
          monthlyBudgetUsdMicros: 250,
          requestCostUsdMicros: 250,
          globallyPaused: false,
          lastVerifiedAt: new Date(),
          lastErrorCategory: null,
        },
      });
      const repository = new PrismaAiProviderConfigurationRepository(client);
      const results = await Promise.allSettled([
        repository.reserveActiveForRuntime({
          environment: 'DEVELOPMENT',
          provider: 'FIRECRAWL',
          operationKey: 'synthetic-trend-week-a',
        }),
        repository.reserveActiveForRuntime({
          environment: 'DEVELOPMENT',
          provider: 'FIRECRAWL',
          operationKey: 'synthetic-trend-week-b',
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(
        await client.aiProviderCallAdmission.count({
          where: { configurationId: configuration.id, settledAt: null },
        }),
      ).toBe(1);

      const successful = results.find((result) => result.status === 'fulfilled');
      if (!successful || successful.status !== 'fulfilled' || successful.value === null)
        throw new Error('synthetic reservation missing');
      await expect(repository.settleRuntimeAdmission(successful.value.admission)).resolves.toBe(
        true,
      );
      await client.aiProviderCallAdmission.deleteMany({
        where: { configurationId: configuration.id },
      });
      await client.aiProviderConfiguration.delete({ where: { id: configuration.id } });
    });
  });
}
