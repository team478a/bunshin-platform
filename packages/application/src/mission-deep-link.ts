import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

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
    // LINE notifications are often opened after the original 10-minute authentication window.
    // The signed state remains actor-bound and can safely recover the same day's mission.
    private readonly accessGraceMilliseconds = 24 * 60 * 60_000,
  ) {}

  async execute(input: {
    token: string;
    environment: LineConfigurationEnvironment;
    actorUserId: string;
  }) {
    const claims = await this.signer.verify(input.token);
    const now = this.now();
    if (this.accessGraceMilliseconds < 0 || this.accessGraceMilliseconds > 7 * 24 * 60 * 60_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid Mission deep link access grace');
    if (!uuid.test(claims.stateId) || claims.environment !== input.environment)
      throw new ApplicationError('FORBIDDEN', 'invalid Mission deep link state');
    if (claims.expiresAtEpochSeconds * 1_000 + this.accessGraceMilliseconds < now.getTime())
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
