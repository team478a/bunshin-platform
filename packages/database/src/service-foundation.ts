import type { ServiceFoundationRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { createServiceFoundation } from './service-foundation-create';
import {
  findMemberServiceFoundationBySlug,
  findPublicServiceFoundationBySlug,
  findServiceFoundationByGroup,
} from './service-foundation-read';
import { saveServiceFoundation } from './service-foundation-save';

export { PrismaServiceStaffRoleRepository } from './service-staff-role';

export class PrismaServiceFoundationRepository implements ServiceFoundationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async create(input: Parameters<ServiceFoundationRepository['create']>[0]) {
    return createServiceFoundation(this.client, input);
  }

  async save(input: Parameters<ServiceFoundationRepository['save']>[0]) {
    return saveServiceFoundation(this.client, input);
  }

  async findByGroup(input: Parameters<ServiceFoundationRepository['findByGroup']>[0]) {
    return findServiceFoundationByGroup(this.client, input);
  }

  async findPublicBySlug(input: Parameters<ServiceFoundationRepository['findPublicBySlug']>[0]) {
    return findPublicServiceFoundationBySlug(this.client, input);
  }

  async findMemberBySlug(input: Parameters<ServiceFoundationRepository['findMemberBySlug']>[0]) {
    return findMemberServiceFoundationBySlug(this.client, input);
  }
}
