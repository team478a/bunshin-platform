import type { PointLedgerRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { consumePoints } from './point-consume';
import { getPointAccount, getPointUserDashboard } from './point-dashboard';
import { grantPoints } from './point-grant';
import { refundPoints } from './point-refund';

export class PrismaPointLedgerRepository implements PointLedgerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async getAccount(input: Parameters<PointLedgerRepository['getAccount']>[0]) {
    return getPointAccount(this.client, input);
  }

  async getUserDashboard(input: Parameters<PointLedgerRepository['getUserDashboard']>[0]) {
    return getPointUserDashboard(this.client, input);
  }

  async grant(input: Parameters<PointLedgerRepository['grant']>[0]) {
    return grantPoints(this.client, input);
  }

  async consume(input: Parameters<PointLedgerRepository['consume']>[0]) {
    return consumePoints(this.client, input);
  }

  async refund(input: Parameters<PointLedgerRepository['refund']>[0]) {
    return refundPoints(this.client, input);
  }
}
