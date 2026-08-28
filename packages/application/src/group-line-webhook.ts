import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';
import type { LineWebhookEventOutcome, LineWebhookEventType } from './line-connection-core';

export interface GroupLineConnectionRepository {
  connectVerified(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    groupMembershipId: string;
    actorUserId: string;
    verifiedProviderUserId: string;
    consentGranted: boolean;
  }): Promise<boolean>;
  applyWebhook(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    providerEventId: string;
    providerUserId: string | null;
    type: LineWebhookEventType;
    occurredAt: Date;
    processedAt: Date;
  }): Promise<LineWebhookEventOutcome>;
}

const providerValue = /^[\x21-\x7e]{1,255}$/;

export class ConnectGroupLineMessagingAccount {
  constructor(private readonly repository: GroupLineConnectionRepository) {}
  async execute(input: Parameters<GroupLineConnectionRepository['connectVerified']>[0]) {
    if (!providerValue.test(input.verifiedProviderUserId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid verified LINE identity');
    if (!(await this.repository.connectVerified(input)))
      throw new ApplicationError('NOT_FOUND', 'group LINE connection scope not found');
  }
}

export class ProcessGroupLineWebhookEvents {
  constructor(
    private readonly repository: GroupLineConnectionRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    configurationId: string;
    events: Array<{
      providerEventId: string;
      providerUserId: string | null;
      type: LineWebhookEventType;
      occurredAt: Date;
    }>;
  }) {
    if (input.events.length > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'too many LINE webhook events');
    const outcomes: Record<LineWebhookEventOutcome, number> = {
      APPLIED: 0,
      DUPLICATE: 0,
      IDENTITY_NOT_FOUND: 0,
      CONNECTION_NOT_FOUND: 0,
      IGNORED: 0,
    };
    for (const event of input.events) {
      if (!providerValue.test(event.providerEventId))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook event id');
      if (event.providerUserId !== null && !providerValue.test(event.providerUserId))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook source');
      if (Number.isNaN(event.occurredAt.getTime()))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE webhook timestamp');
      const outcome = await this.repository.applyWebhook({
        ...event,
        environment: input.environment,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        configurationId: input.configurationId,
        processedAt: this.now(),
      });
      outcomes[outcome] += 1;
    }
    return { processed: input.events.length, outcomes };
  }
}
