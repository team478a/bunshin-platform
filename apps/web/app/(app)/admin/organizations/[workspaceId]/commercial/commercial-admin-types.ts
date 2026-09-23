import type { CommercialUsageDashboard, PrismaCommercialBillingService } from '@bunshin/database';

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
  reminderSent?: string;
  recipientTestSent?: string;
};

export type CommercialServerAction = (formData: FormData) => Promise<void>;

export type CommercialAdminActions = {
  finalizePreviousMonth: CommercialServerAction;
  saveContract: CommercialServerAction;
  prepareInvoices: CommercialServerAction;
  transitionInvoice: CommercialServerAction;
  prepareCustomQuoteInvoice: CommercialServerAction;
  sendInvoiceReminder: CommercialServerAction;
  sendBillingRecipientTest: CommercialServerAction;
};

export type CommercialAdminDashboardProps = {
  dashboard: CommercialUsageDashboard;
  billing: CommercialBillingDashboard;
  query: CommercialPageQuery;
  reminderFailures: CommercialBillingDashboard['commercialBillingAudits'];
  actions: CommercialAdminActions;
};
