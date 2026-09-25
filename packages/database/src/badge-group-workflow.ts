import type { PrismaClient } from '@prisma/client';
import type { BadgeGroupWorkflowRepository } from '@bunshin/application';
import { PrismaBadgeGroupAwardWorkflow } from './badge-group-award-workflow';
import { PrismaBadgeGroupDefinitionWorkflow } from './badge-group-definition-workflow';

export class PrismaBadgeGroupWorkflowRepository implements BadgeGroupWorkflowRepository {
  private readonly awards: PrismaBadgeGroupAwardWorkflow;
  private readonly definitions: PrismaBadgeGroupDefinitionWorkflow;

  constructor(client: PrismaClient) {
    this.awards = new PrismaBadgeGroupAwardWorkflow(client);
    this.definitions = new PrismaBadgeGroupDefinitionWorkflow(client);
  }

  createAndSubmit(input: Parameters<BadgeGroupWorkflowRepository['createAndSubmit']>[0]) {
    return this.definitions.createAndSubmit(input);
  }
  setDefinitionStatus(input: Parameters<BadgeGroupWorkflowRepository['setDefinitionStatus']>[0]) {
    return this.definitions.setDefinitionStatus(input);
  }
  reviseDefinition(input: Parameters<BadgeGroupWorkflowRepository['reviseDefinition']>[0]) {
    return this.definitions.reviseDefinition(input);
  }
  submit(input: Parameters<BadgeGroupWorkflowRepository['submit']>[0]) {
    return this.definitions.submit(input);
  }
  review(input: Parameters<BadgeGroupWorkflowRepository['review']>[0]) {
    return this.definitions.review(input);
  }
  nominate(input: Parameters<BadgeGroupWorkflowRepository['nominate']>[0]) {
    return this.awards.nominate(input);
  }
  reviewCandidate(input: Parameters<BadgeGroupWorkflowRepository['reviewCandidate']>[0]) {
    return this.awards.reviewCandidate(input);
  }
  revokeAward(input: Parameters<BadgeGroupWorkflowRepository['revokeAward']>[0]) {
    return this.awards.revokeAward(input);
  }
}
