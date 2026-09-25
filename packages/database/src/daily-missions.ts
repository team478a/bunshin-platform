import type { DailyMissionRepository } from '@bunshin/capability-social';
import { type PrismaClient, prisma } from './client';
import { PrismaDailyMissionAccessRepository } from './daily-mission-access-repository';
import { PrismaDailyMissionCreationRepository } from './daily-mission-creation-repository';

export class PrismaDailyMissionRepository implements DailyMissionRepository {
  private readonly creation: PrismaDailyMissionCreationRepository;
  private readonly access: PrismaDailyMissionAccessRepository;

  constructor(client: PrismaClient = prisma) {
    this.creation = new PrismaDailyMissionCreationRepository(client);
    this.access = new PrismaDailyMissionAccessRepository(client);
  }

  create(input: Parameters<DailyMissionRepository['create']>[0]) {
    return this.creation.create(input);
  }

  list(input: Parameters<DailyMissionRepository['list']>[0]) {
    return this.access.list(input);
  }

  find(input: Parameters<DailyMissionRepository['find']>[0]) {
    return this.access.find(input);
  }

  authorizeCopy(input: Parameters<DailyMissionRepository['authorizeCopy']>[0]) {
    return this.access.authorizeCopy(input);
  }

  transition(input: Parameters<DailyMissionRepository['transition']>[0]) {
    return this.access.transition(input);
  }
}
