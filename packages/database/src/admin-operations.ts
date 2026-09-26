import type {
  AdminOperationsRepository,
  AdminOperationsSnapshot,
  AdminUserDetail,
} from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import {
  createAdminSupportCase,
  listAdminSupportCases,
  updateAdminSupportCase,
} from './admin-support-cases';
import { setAdminMetricExclusion, setAdminUserStatus } from './admin-user-operations';
import { createAdminOperationsSnapshot } from './admin-operations-snapshot';
import { getAdminUserDetail } from './admin-user-detail';

export class PrismaAdminOperationsRepository implements AdminOperationsRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  private async authorized(actorUserId: string) {
    return Boolean(
      await this.client.platformAdmin.findFirst({
        where: { userId: actorUserId, status: 'ACTIVE' },
        select: { id: true },
      }),
    );
  }

  async snapshot(
    input: Parameters<AdminOperationsRepository['snapshot']>[0],
  ): Promise<AdminOperationsSnapshot | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    return createAdminOperationsSnapshot(this.client, input);
  }
  async userDetail(
    input: Parameters<AdminOperationsRepository['userDetail']>[0],
  ): Promise<AdminUserDetail | null> {
    if (!(await this.authorized(input.actorUserId))) return null;
    return getAdminUserDetail(this.client, input);
  }
  async setUserStatus(
    input: Parameters<AdminOperationsRepository['setUserStatus']>[0],
  ): Promise<boolean | null> {
    return setAdminUserStatus(this.client, input);
  }

  async setMetricExclusion(
    input: Parameters<AdminOperationsRepository['setMetricExclusion']>[0],
  ): Promise<boolean | null> {
    return setAdminMetricExclusion(this.client, input);
  }

  async createSupportCase(
    input: Parameters<AdminOperationsRepository['createSupportCase']>[0],
  ): Promise<boolean | null> {
    return createAdminSupportCase(this.client, input);
  }

  async updateSupportCase(
    input: Parameters<AdminOperationsRepository['updateSupportCase']>[0],
  ): Promise<boolean | null> {
    return updateAdminSupportCase(this.client, input);
  }

  async listSupportCases(input: Parameters<AdminOperationsRepository['listSupportCases']>[0]) {
    return listAdminSupportCases(this.client, input);
  }
}
