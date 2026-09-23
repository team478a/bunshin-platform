export type PaymentAction = (formData: FormData) => Promise<void>;

export type PaymentConfigurationView = {
  status: 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  accountReference: string | null;
  secretKeyMask: string;
  webhookSecretMask: string | null;
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
};

export type RecentPurchaseView = {
  id: string;
  status: string;
  amountYen: number;
  refundedAmountYen: number;
  disputedAmountYen: number;
  disputeStatus: string | null;
  createdAt: Date;
  paidAt: Date | null;
  expiredAt: Date | null;
  refundedAt: Date | null;
  disputedAt: Date | null;
  disputeResolvedAt: Date | null;
  buyer: { displayName: string; email: string | null };
  groupName: string;
};

export type FailedWebhookView = {
  id: string;
  eventType: string;
  errorCategory: string | null;
  receivedAt: Date;
};
