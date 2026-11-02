import type { MemberUsageScope } from './member-usage';

export const EXTERNAL_READ_VERSION = 'external-read-v1';
export type ExternalReadEnvironment = 'test' | 'development' | 'production';
/** Trusted server context, obtained by a future credential-verifying adapter, never JSON input. */
export interface ExternalReadPrincipal {
  clientId: string;
  environment: ExternalReadEnvironment;
}
export interface ExternalReadGrant {
  connectionId: string;
  clientId: string;
  environment: ExternalReadEnvironment;
  revision: number;
  scope: MemberUsageScope;
  operations: readonly string[];
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
export type ExternalReadFailure = 'DENIED' | 'LIMITED' | 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID';
export class ExternalReadError extends Error {
  constructor(public readonly code: ExternalReadFailure) {
    super('external read unavailable');
    this.name = 'ExternalReadError';
  }
}
export interface ExternalReadContext {
  scope: MemberUsageScope;
  asOf: Date;
  signal: AbortSignal;
}
export interface ExternalReadPorts {
  /** Resolve only for this authenticated client and environment; never accept a target user. */
  grants: {
    find(
      connectionId: string,
      principal: ExternalReadPrincipal,
      signal: AbortSignal,
    ): Promise<ExternalReadGrant | null>;
  };
  /** Every call rechecks active owner/member/consent, Capability and current stop switches. */
  authorization: {
    permitted(
      grant: ExternalReadGrant,
      operation: string,
      at: Date,
      signal: AbortSignal,
    ): Promise<boolean>;
  };
  admission: {
    /** Atomically enforce per-client/connection/user rate and concurrency limits. No permit means deny. */
    reserve(grant: ExternalReadGrant, signal: AbortSignal): Promise<{ release(): void } | null>;
  };
  audit: {
    /** No payload, credentials, raw error or response. Must fail closed if unavailable. */
    record(
      event: {
        version: typeof EXTERNAL_READ_VERSION;
        requestId: string;
        connectionId: string;
        clientId: string;
        environment: ExternalReadEnvironment;
        operation: string;
        outcome: 'READ_COMPLETED' | ExternalReadFailure;
        count: number;
      },
      signal: AbortSignal,
    ): Promise<void>;
  };
}
const scopeKeys = ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const;
function fail(code: ExternalReadFailure): never {
  throw new ExternalReadError(code);
}
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
const copyGrant = (g: ExternalReadGrant): ExternalReadGrant => ({
  ...g,
  scope: { ...g.scope },
  operations: [...g.operations],
  grantedAt: new Date(g.grantedAt),
  expiresAt: new Date(g.expiresAt),
  revokedAt: g.revokedAt === null ? null : new Date(g.revokedAt),
});
function validGrant(
  g: ExternalReadGrant,
  id: string,
  p: ExternalReadPrincipal,
  operation: string,
  at: Date,
) {
  return (
    g.connectionId === id &&
    g.clientId === p.clientId &&
    g.environment === p.environment &&
    Number.isSafeInteger(g.revision) &&
    g.revision > 0 &&
    scopeKeys.every((k) => identifier(g.scope[k])) &&
    g.operations.includes(operation) &&
    g.revokedAt === null &&
    Number.isFinite(g.grantedAt.getTime()) &&
    g.grantedAt.getTime() <= at.getTime() &&
    g.expiresAt.getTime() > at.getTime()
  );
}
function sameGrant(a: ExternalReadGrant, b: ExternalReadGrant) {
  return (
    a.revision === b.revision &&
    scopeKeys.every((k) => a.scope[k] === b.scope[k]) &&
    a.grantedAt.getTime() === b.grantedAt.getTime() &&
    a.expiresAt.getTime() === b.expiresAt.getTime() &&
    JSON.stringify([...a.operations].sort()) === JSON.stringify([...b.operations].sort())
  );
}
/** Internal application coordinator. This is neither an authenticator nor a public endpoint. */
export class ExternalConnectionRead<T> {
  constructor(
    private readonly ports: ExternalReadPorts,
    private readonly operation: string,
    private readonly read: (context: ExternalReadContext) => Promise<{ data: T; count: number }>,
    private readonly now: () => Date = () => new Date(),
    private readonly timeoutMs = 5_000,
  ) {
    if (
      !/^[a-z][a-z0-9-]{0,63}:read$/.test(operation) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 5_000
    )
      fail('INVALID');
  }

  async execute(principal: ExternalReadPrincipal, input: unknown): Promise<T> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID');
    const body = input as Record<string, unknown>;
    if (
      Object.keys(body).sort().join(',') !== 'connectionId,requestId' ||
      !identifier(body.connectionId) ||
      !identifier(body.requestId) ||
      !identifier(principal.clientId) ||
      !['test', 'development', 'production'].includes(principal.environment)
    )
      fail('INVALID');
    const connectionId = body.connectionId;
    const requestId = body.requestId;
    const actor = { clientId: principal.clientId, environment: principal.environment };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined;
    const assertRunning = () => {
      if (controller.signal.aborted) fail('TIMEOUT');
    };
    const receipt = (
      outcome: 'READ_COMPLETED' | ExternalReadFailure,
      count: number,
      signal: AbortSignal,
    ) =>
      this.ports.audit.record(
        {
          version: EXTERNAL_READ_VERSION,
          requestId,
          connectionId,
          ...actor,
          operation: this.operation,
          outcome,
          count,
        },
        signal,
      );
    const at = () => {
      const value = new Date(this.now());
      if (!Number.isFinite(value.getTime())) fail('UNAVAILABLE');
      return value;
    };
    const work = async () => {
      const found = await this.ports.grants.find(connectionId, { ...actor }, controller.signal);
      assertRunning();
      if (!found) fail('DENIED');
      const grant = copyGrant(found);
      const startedAt = at();
      if (
        !validGrant(grant, connectionId, actor, this.operation, startedAt) ||
        !(await this.ports.authorization.permitted(
          copyGrant(grant),
          this.operation,
          startedAt,
          controller.signal,
        ))
      )
        fail('DENIED');
      assertRunning();
      const permit = await this.ports.admission.reserve(copyGrant(grant), controller.signal);
      if (!permit) fail('LIMITED');
      // A slow adapter may return after timeout; release its lease without starting a read.
      if (controller.signal.aborted) {
        permit.release();
        fail('TIMEOUT');
      }
      release = () => permit.release();
      const result = await this.read({
        scope: { ...grant.scope },
        asOf: new Date(startedAt),
        signal: controller.signal,
      });
      if (controller.signal.aborted) fail('TIMEOUT');
      if (!Number.isSafeInteger(result.count) || result.count < 0 || result.count > 10)
        fail('UNAVAILABLE');
      const data = structuredClone(result.data);
      const json = JSON.stringify(data);
      if (json === undefined || new TextEncoder().encode(json).byteLength > 16_384)
        fail('UNAVAILABLE');
      await receipt('READ_COMPLETED', result.count, controller.signal);
      assertRunning();
      const current = await this.ports.grants.find(connectionId, { ...actor }, controller.signal);
      const finishedAt = at();
      if (
        !current ||
        !validGrant(current, connectionId, actor, this.operation, finishedAt) ||
        !sameGrant(grant, current) ||
        !(await this.ports.authorization.permitted(
          copyGrant(current),
          this.operation,
          finishedAt,
          controller.signal,
        ))
      )
        fail('DENIED');
      assertRunning();
      if (
        !sameGrant(grant, current) ||
        !validGrant(current, connectionId, actor, this.operation, at())
      )
        fail('DENIED');
      return data;
    };
    let data: T | undefined;
    let failure: ExternalReadFailure | undefined;
    try {
      data = await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ExternalReadError('TIMEOUT'));
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      failure = error instanceof ExternalReadError ? error.code : 'UNAVAILABLE';
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
      try {
        release?.();
      } catch {
        failure = 'UNAVAILABLE';
      }
    }
    // READ_COMPLETED is a read receipt, not proof that authorization allowed delivery.
    // On failure append a fixed denial/error receipt; never include raw exception text.
    if (failure) {
      const auditController = new AbortController();
      let auditTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          receipt(failure, 0, auditController.signal),
          new Promise<never>((_, reject) => {
            auditTimer = setTimeout(() => reject(new ExternalReadError('UNAVAILABLE')), 500);
          }),
        ]);
      } catch {
        fail('UNAVAILABLE');
      } finally {
        if (auditTimer !== undefined) clearTimeout(auditTimer);
        auditController.abort();
      }
    }
    if (failure) fail(failure);
    return data as T;
  }
}
