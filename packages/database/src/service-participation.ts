import type { ServiceParticipationRepository } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { PrismaServiceParticipationMembershipRepository } from './service-participation-membership-repository';
import { PrismaServiceParticipationRegistrationRepository } from './service-participation-registration-repository';

export class PrismaServiceParticipationRepository implements ServiceParticipationRepository {
  private readonly registration: PrismaServiceParticipationRegistrationRepository;
  private readonly membership: PrismaServiceParticipationMembershipRepository;

  constructor(client: PrismaClient = prisma) {
    this.registration = new PrismaServiceParticipationRegistrationRepository(client);
    this.membership = new PrismaServiceParticipationMembershipRepository(client);
  }

  findView(input: Parameters<ServiceParticipationRepository['findView']>[0]) {
    return this.registration.findView(input);
  }

  findLegalConsentView(
    input: Parameters<ServiceParticipationRepository['findLegalConsentView']>[0],
  ) {
    return this.membership.findLegalConsentView(input);
  }

  acceptLegalDocuments(
    input: Parameters<ServiceParticipationRepository['acceptLegalDocuments']>[0],
  ) {
    return this.membership.acceptLegalDocuments(input);
  }

  request(input: Parameters<ServiceParticipationRepository['request']>[0]) {
    return this.registration.request(input);
  }

  recordUse(input: Parameters<ServiceParticipationRepository['recordUse']>[0]) {
    return this.membership.recordUse(input);
  }

  withdraw(input: Parameters<ServiceParticipationRepository['withdraw']>[0]) {
    return this.membership.withdraw(input);
  }

  approve(input: Parameters<ServiceParticipationRepository['approve']>[0]) {
    return this.membership.approve(input);
  }
}
