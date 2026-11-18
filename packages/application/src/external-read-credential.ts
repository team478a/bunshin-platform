import {
  ExternalReadError,
  type ExternalReadEnvironment,
  type ExternalReadGrant,
  type ExternalReadDependencies,
  type ExternalReadOperation,
  type ExternalReadPrincipal,
} from './external-connection-read';
import { ReadExternalMemberUsage } from './external-member-usage';
import type { MemberUsageAuthorizationPort, MemberUsageSourceRepository } from './member-usage';
/** Verified by a credential adapter, never decoded or supplied by an external caller. */
export interface VerifiedExternalReadCredential {
  issuer: string;
  subject: string;
  sessionId: string;
  clientId: string;
  audience: string;
  environment: ExternalReadEnvironment;
  expiresAt: Date;
}
export interface ExternalReadCredentialVerifier {
  verify(
    authorization: string,
    signal: AbortSignal,
  ): Promise<VerifiedExternalReadCredential | null>;
}
export interface ExternalReadCredentialBindings {
  bind(
    connectionId: string,
    credential: VerifiedExternalReadCredential,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant>;
  resolve(
    connectionId: string,
    credential: VerifiedExternalReadCredential,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant | null>;
  resolveOperation(
    operation: ExternalReadOperation,
    credential: VerifiedExternalReadCredential,
    signal: AbortSignal,
  ): Promise<ExternalReadGrant | null>;
}
async function verified(verifier: ExternalReadCredentialVerifier, header: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const credential = await Promise.race([
      verifier.verify(header, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ExternalReadError('TIMEOUT'));
        }, 10_000);
      }),
    ]);
    if (!credential) throw new ExternalReadError('DENIED');
    return { ...credential, expiresAt: new Date(credential.expiresAt) };
  } catch (error) {
    if (error instanceof ExternalReadError) throw error;
    throw new ExternalReadError('UNAVAILABLE');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
/** Server-only service. Bearer credentials are never accepted as ordinary user sessions. */
export class BindExternalReadCredential {
  constructor(
    private readonly verifier: ExternalReadCredentialVerifier,
    private readonly bindings: ExternalReadCredentialBindings,
  ) {}
  async execute(authorization: string, connectionId: string) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(connectionId))
      throw new ExternalReadError('INVALID');
    const credential = await verified(this.verifier, authorization);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.bindings.bind(connectionId, credential, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ExternalReadError('TIMEOUT'));
          }, 10_000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }
}
export class ReadAuthenticatedExternalMemberUsage {
  constructor(
    private readonly verifier: ExternalReadCredentialVerifier,
    private readonly bindings: ExternalReadCredentialBindings,
    private readonly ports: Omit<ExternalReadDependencies, 'grants'>,
    private readonly memberAuthorization: MemberUsageAuthorizationPort,
    private readonly sources: MemberUsageSourceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async execute(authorization: string, input: unknown) {
    const credential = await verified(this.verifier, authorization);
    const reader = new ReadExternalMemberUsage(
      {
        ...this.ports,
        authorization: {
          permitted: async (grant, operation, at, signal) => {
            if (credential.expiresAt <= this.now()) return false;
            const allowed = await this.ports.authorization.permitted(grant, operation, at, signal);
            return allowed && credential.expiresAt > this.now();
          },
        },
        grants: {
          find: (connectionId, principal, signal) => {
            if (
              principal.clientId !== credential.clientId ||
              principal.environment !== credential.environment ||
              credential.expiresAt <= this.now()
            )
              return Promise.resolve(null);
            return this.bindings.resolve(
              connectionId,
              { ...credential, expiresAt: new Date(credential.expiresAt) },
              signal,
            );
          },
        },
      },
      this.memberAuthorization,
      this.sources,
      this.now,
    );
    return reader.execute(
      { clientId: credential.clientId, environment: credential.environment },
      input,
    );
  }
}

export interface ExternalAuthenticatedReader<T> {
  execute(principal: ExternalReadPrincipal, input: unknown): Promise<T>;
}

/** Resolves the target Grant from the credential and operation; MCP callers cannot name an owner. */
export class ReadAuthenticatedExternalResource<T> {
  constructor(
    private readonly verifier: ExternalReadCredentialVerifier,
    private readonly bindings: ExternalReadCredentialBindings,
    private readonly ports: Omit<ExternalReadDependencies, 'grants'>,
    private readonly operation: ExternalReadOperation,
    private readonly reader: (ports: ExternalReadDependencies) => ExternalAuthenticatedReader<T>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(authorization: string, requestId: string): Promise<T> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) throw new ExternalReadError('INVALID');
    const credential = await verified(this.verifier, authorization);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolved: ExternalReadGrant | null;
    try {
      resolved = await Promise.race([
        this.bindings.resolveOperation(this.operation, credential, controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ExternalReadError('TIMEOUT'));
          }, 10_000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
    if (!resolved) throw new ExternalReadError('DENIED');
    const connectionId = resolved.connectionId;
    const reader = this.reader({
      ...this.ports,
      authorization: {
        permitted: async (grant, operation, at, signal) => {
          if (credential.expiresAt <= this.now()) return false;
          const allowed = await this.ports.authorization.permitted(grant, operation, at, signal);
          return allowed && credential.expiresAt > this.now();
        },
      },
      grants: {
        find: (requestedConnectionId, principal, signal) => {
          if (
            requestedConnectionId !== connectionId ||
            principal.clientId !== credential.clientId ||
            principal.environment !== credential.environment ||
            credential.expiresAt <= this.now()
          )
            return Promise.resolve(null);
          return this.bindings.resolve(requestedConnectionId, credential, signal);
        },
      },
    });
    return reader.execute(
      { clientId: credential.clientId, environment: credential.environment },
      { connectionId, requestId },
    );
  }
}
