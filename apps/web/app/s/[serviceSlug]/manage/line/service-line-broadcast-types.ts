export type ServiceLineBroadcastOperationalStatus =
  'HEALTHY' | 'SCHEDULED' | 'STALLED' | 'NEEDS_ATTENTION' | 'RECOVERED' | 'CANCELLED';

export type ServiceLineBroadcastView = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  recipients: Record<string, number>;
  operationalStatus: ServiceLineBroadcastOperationalStatus;
  failureRate: number;
  totalRecipients: number;
  recoveryAttempts: number;
};

export type ServiceLineBroadcastHealth = {
  totalBroadcasts: number;
  stalledBroadcasts: number;
  broadcastsWithFailures: number;
  deliveredRecipients: number;
  failedRecipients: number;
  recoveryAttempts: number;
  failureRate: number;
};
