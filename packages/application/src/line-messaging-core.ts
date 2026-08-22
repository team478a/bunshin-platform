import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export type LineMessageKind = 'DAILY_MISSION' | 'REMINDER';
export type LineMessageDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type LineMessageAttemptStatus = 'SUCCESS' | 'FAILED';

export interface LineMessageDelivery {
  id: string;
  environment: LineConfigurationEnvironment;
  workspaceId: string;
  bunshinId: string;
  userId: string;
  dailyMissionId: string;
  kind: LineMessageKind;
  status: LineMessageDeliveryStatus;
  idempotencyKey: string;
  scheduledAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
  lastErrorCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineMessageDeliveryRepository {
  prepare(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    kind: LineMessageKind;
    idempotencyKey: string;
    scheduledAt: Date;
  }): Promise<LineMessageDelivery | null>;
  recordAttempt(input: {
    deliveryId: string;
    environment: LineConfigurationEnvironment;
    attemptNumber: number;
    status: LineMessageAttemptStatus;
    errorCategory: string | null;
    latencyMs: number;
    attemptedAt: Date;
  }): Promise<void>;
}

export class PrepareLineMissionDelivery {
  constructor(private readonly repository: LineMessageDeliveryRepository) {}
  async execute(
    input: Parameters<LineMessageDeliveryRepository['prepare']>[0],
  ): Promise<LineMessageDelivery> {
    if (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery idempotency key');
    if (Number.isNaN(input.scheduledAt.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery schedule');
    const value = await this.repository.prepare(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'Mission delivery scope not found');
    return value;
  }
}

export interface MissionDeepLinkState {
  id: string;
  environment: LineConfigurationEnvironment;
  workspaceId: string;
  bunshinId: string;
  userId: string;
  dailyMissionId: string;
  keyVersion: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface MissionDeepLinkClaims {
  stateId: string;
  environment: LineConfigurationEnvironment;
  keyVersion: number;
  expiresAtEpochSeconds: number;
}

export interface MissionDeepLinkSignerPort {
  sign(claims: MissionDeepLinkClaims): Promise<string>;
  verify(token: string): Promise<MissionDeepLinkClaims>;
}

export interface MissionDeepLinkStateRepository {
  create(input: {
    id: string;
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    keyVersion: number;
    expiresAt: Date;
  }): Promise<MissionDeepLinkState | null>;
  consume(input: {
    id: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
    keyVersion: number;
    expiresAt: Date;
    now: Date;
  }): Promise<MissionDeepLinkState | null>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class IssueMissionDeepLinkState {
  constructor(
    private readonly repository: MissionDeepLinkStateRepository,
    private readonly signer: MissionDeepLinkSignerPort,
    private readonly now = () => new Date(),
    private readonly ttlMilliseconds = 10 * 60_000,
  ) {}

  async execute(input: {
    stateId: string;
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
    keyVersion: number;
  }) {
    if (!uuid.test(input.stateId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid deep link state id');
    if (!Number.isInteger(input.keyVersion) || input.keyVersion < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid deep link key version');
    if (this.ttlMilliseconds < 60_000 || this.ttlMilliseconds > 15 * 60_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid deep link state ttl');
    const expiresAt = new Date(
      Math.floor((this.now().getTime() + this.ttlMilliseconds) / 1_000) * 1_000,
    );
    const { stateId: id, ...scope } = input;
    const state = await this.repository.create({ ...scope, id, expiresAt });
    if (!state) throw new ApplicationError('NOT_FOUND', 'Mission deep link scope not found');
    const token = await this.signer.sign({
      stateId: state.id,
      environment: state.environment,
      keyVersion: state.keyVersion,
      expiresAtEpochSeconds: Math.floor(state.expiresAt.getTime() / 1_000),
    });
    return { token, expiresAt: state.expiresAt };
  }
}

export class ConsumeMissionDeepLinkState {
  constructor(
    private readonly repository: MissionDeepLinkStateRepository,
    private readonly signer: MissionDeepLinkSignerPort,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: {
    token: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
  }) {
    const claims = await this.signer.verify(input.token);
    const now = this.now();
    if (!uuid.test(claims.stateId) || claims.environment !== input.environment)
      throw new ApplicationError('FORBIDDEN', 'invalid Mission deep link state');
    if (claims.expiresAtEpochSeconds * 1_000 < now.getTime())
      throw new ApplicationError('FORBIDDEN', 'Mission deep link state expired');
    const state = await this.repository.consume({
      id: claims.stateId,
      environment: input.environment,
      actorUserId: input.actorUserId,
      keyVersion: claims.keyVersion,
      expiresAt: new Date(claims.expiresAtEpochSeconds * 1_000),
      now,
    });
    if (!state) throw new ApplicationError('FORBIDDEN', 'Mission deep link state is not usable');
    return state;
  }
}
