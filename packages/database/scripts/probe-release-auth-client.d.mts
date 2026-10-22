type ProbeTransaction = {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe(query: string): Promise<Array<{ verified: boolean }>>;
};
export type ProbeClient = {
  $transaction(
    work: (transaction: ProbeTransaction) => Promise<boolean>,
    options: { maxWait: number; timeout: number },
  ): Promise<boolean>;
  $disconnect(): Promise<void>;
};
export function probeReleaseAuth(
  environment?: NodeJS.ProcessEnv,
  createClient?: (connection: string) => ProbeClient,
): Promise<number>;
