import type { PrismaClient } from '@prisma/client';
import type { CommonBadgeProcessorRepository } from '@bunshin/application';
import { PrismaCommonBadgeAwardProcessor } from './badge-common-award-processor';
import { PrismaCommonBadgeCatalogRepository } from './badge-common-catalog-repository';
import { PrismaCommonBadgeLegacyMigrator } from './badge-common-legacy-migrator';

export class PrismaCommonBadgeProcessorRepository implements CommonBadgeProcessorRepository {
  private readonly awards: PrismaCommonBadgeAwardProcessor;
  private readonly catalog: PrismaCommonBadgeCatalogRepository;
  private readonly legacy: PrismaCommonBadgeLegacyMigrator;

  constructor(client: PrismaClient) {
    this.awards = new PrismaCommonBadgeAwardProcessor(client);
    this.catalog = new PrismaCommonBadgeCatalogRepository(client);
    this.legacy = new PrismaCommonBadgeLegacyMigrator(client);
  }

  ensureCatalog(input: Parameters<CommonBadgeProcessorRepository['ensureCatalog']>[0]) {
    return this.catalog.ensureCatalog(input);
  }
  listCandidates(input: Parameters<CommonBadgeProcessorRepository['listCandidates']>[0]) {
    return this.catalog.listCandidates(input);
  }
  process(input: Parameters<CommonBadgeProcessorRepository['process']>[0]) {
    return this.awards.process(input);
  }
  recalculate(input: Parameters<CommonBadgeProcessorRepository['recalculate']>[0]) {
    return this.awards.recalculate(input);
  }
  migrateLegacy(input: Parameters<CommonBadgeProcessorRepository['migrateLegacy']>[0]) {
    return this.legacy.migrateLegacy(input);
  }
}
