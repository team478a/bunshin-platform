import type {
  CommercialUsageDashboard,
  PrismaCommercialBillingService,
  PrismaOemBillingAdminService,
} from '@bunshin/database';

export type CommercialBillingDashboard = NonNullable<
  Awaited<ReturnType<PrismaCommercialBillingService['dashboard']>>
>;

export type CommercialPageQuery = {
  finalized?: string;
  error?: string;
  contractSaved?: string;
  prepared?: string;
  invoiceUpdated?: string;
  customQuoteSaved?: string;
  setupFeeSaved?: string;
  reminderSent?: string;
  recipientTestSent?: string;
  oemPrepared?: string;
  shadowMonth?: string;
};

export type CommercialServerAction = (formData: FormData) => Promise<void>;

export type CommercialAdminActions = {
  finalizePreviousMonth: CommercialServerAction;
  saveContract: CommercialServerAction;
  prepareInvoices: CommercialServerAction;
  transitionInvoice: CommercialServerAction;
  prepareCustomQuoteInvoice: CommercialServerAction;
  prepareSetupFeeInvoice: CommercialServerAction;
  sendInvoiceReminder: CommercialServerAction;
  sendBillingRecipientTest: CommercialServerAction;
  setOemOffering: CommercialServerAction;
  correctOemOffering: CommercialServerAction;
  reviewOemRegistration: CommercialServerAction;
  correctOemRegistration: CommercialServerAction;
  reviewOemContract: CommercialServerAction;
  correctOemContract: CommercialServerAction;
  scheduleOemCutover: CommercialServerAction;
};

export type OemBillingPreparationDashboard = Awaited<
  ReturnType<PrismaOemBillingAdminService['preparationDashboard']>
>;

export type OemBillingShadow = Awaited<ReturnType<PrismaOemBillingAdminService['shadow']>>;

export type CommercialAdminDashboardProps = {
  dashboard: CommercialUsageDashboard;
  billing: CommercialBillingDashboard;
  query: CommercialPageQuery;
  reminderFailures: CommercialBillingDashboard['commercialBillingAudits'];
  oemPreparation: OemBillingPreparationDashboard;
  oemShadow: OemBillingShadow | null;
  oemShadowReviewRequired: boolean;
  actions: CommercialAdminActions;
};
