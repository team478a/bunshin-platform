import type { Job } from '@bunshin/application';
import type * as BunshinDatabase from '@bunshin/database';

export type ServiceLineBroadcastDatabase = typeof BunshinDatabase;

export interface ServiceLineBroadcastDeliveryRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  message: string;
  segmentCriteria: unknown;
  updatedByUserId: string;
}

export interface ServiceLineBroadcastRecipientRecord {
  id: string;
  groupMembershipId: string;
  userId: string;
  message: string | null;
}

export interface ServiceLineBroadcastConfiguration {
  id: string;
  encryptedAccessToken: string;
}

export interface ServiceLineBroadcastBatch {
  db: ServiceLineBroadcastDatabase;
  job: Job;
  broadcast: ServiceLineBroadcastDeliveryRecord;
  configuration: ServiceLineBroadcastConfiguration;
  recipients: ServiceLineBroadcastRecipientRecord[];
  recipientIds: Map<string, string>;
}
