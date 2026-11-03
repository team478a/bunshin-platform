export const productionManaberuAuditQueries: Readonly<
  Record<'service' | 'programs' | 'offerings' | 'participation' | 'provider', string>
>;

type AuditTransaction = {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  $queryRawUnsafe(sql: string): Promise<unknown>;
};

type AuditClient = {
  $transaction<T>(callback: (transaction: AuditTransaction) => Promise<T>): Promise<T>;
  $disconnect(): Promise<void>;
};

export function runProductionManaberuAudit(
  environment?: Record<string, string | undefined>,
  connect?: (connectionUrl: string) => Promise<AuditClient>,
): Promise<number>;
