import { ApplicationError } from '@bunshin/shared';
import { NEXT_ACTION_MODES, type NextActionMode } from './program-next-action';

export const PROGRAM_MISSION_ASSIGNMENT_STATUSES = [
  'PRESENTED',
  'STARTED',
  'COMPLETED',
  'SKIPPED',
] as const;
export type ProgramMissionAssignmentStatus = (typeof PROGRAM_MISSION_ASSIGNMENT_STATUSES)[number];

export interface ProgramMissionAssignmentRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  programTemplateVersionId: string;
  sequence: number;
  routeKey: string;
  phaseKey: string;
  missionDefinitionKey: string;
  actionMode: NextActionMode;
  reasonCode: string | null;
  variantKey: string | null;
  targetResourceType: string | null;
  targetResourceId: string | null;
  status: ProgramMissionAssignmentStatus;
  displaySnapshot: unknown;
  ruleVersion: string;
  presentedAt: Date;
  reevaluateAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  skippedAt: Date | null;
}

export interface ProgramActionEventRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  missionAssignmentId: string | null;
  eventType: string;
  sourceResourceType: string | null;
  sourceResourceId: string | null;
  idempotencyKey: string;
  schemaVersion: number;
  metadata: unknown;
  actorUserId: string | null;
  occurredAt: Date;
}

export interface ProgramProgressSnapshotRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  programTemplateVersionId: string;
  currentAssignmentId: string | null;
  routeKey: string;
  phaseKey: string;
  stateKey: string;
  bottleneckKey: string | null;
  completedMissionCount: number;
  revision: number;
  ruleVersion: string;
  lastActionAt: Date | null;
  nextEvaluationAt: Date | null;
  calculatedAt: Date;
}

export interface ProgramRuntimeRepository {
  createAssignment(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    programTemplateVersionId: string;
    sequence: number;
    routeKey: string;
    phaseKey: string;
    missionDefinitionKey: string;
    actionMode: NextActionMode;
    reasonCode: string | null;
    variantKey: string | null;
    targetResourceType: string | null;
    targetResourceId: string | null;
    displaySnapshot: unknown;
    ruleVersion: string;
    presentedAt: Date;
    reevaluateAt: Date | null;
  }): Promise<{ assignment: ProgramMissionAssignmentRecord; created: boolean } | null>;
  transitionAssignment(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    assignmentId: string;
    transition: 'START' | 'COMPLETE' | 'SKIP';
    idempotencyKey: string;
    metadata: unknown;
    occurredAt: Date;
  }): Promise<{
    assignment: ProgramMissionAssignmentRecord;
    event: ProgramActionEventRecord;
    created: boolean;
  } | null>;
  appendEvent(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string | null;
    programEnrollmentId: string;
    missionAssignmentId: string | null;
    eventType: string;
    sourceResourceType: string | null;
    sourceResourceId: string | null;
    idempotencyKey: string;
    schemaVersion: number;
    metadata: unknown;
    occurredAt: Date;
  }): Promise<{ event: ProgramActionEventRecord; created: boolean } | null>;
  saveProgress(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    programTemplateVersionId: string;
    currentAssignmentId: string | null;
    routeKey: string;
    phaseKey: string;
    stateKey: string;
    bottleneckKey: string | null;
    completedMissionCount: number;
    ruleVersion: string;
    lastActionAt: Date | null;
    nextEvaluationAt: Date | null;
    calculatedAt: Date;
  }): Promise<ProgramProgressSnapshotRecord | null>;
  findProgress(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
  }): Promise<ProgramProgressSnapshotRecord | null>;
}

const keyPattern = /^[A-Z][A-Z0-9_]{0,79}$/;
const requiredKey = (value: string, field: string) => {
  const normalized = value.trim();
  if (!keyPattern.test(normalized))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
const requiredText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
const validDate = (value: Date, field: string) => {
  if (Number.isNaN(value.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
};

export class ProgramRuntimeService {
  constructor(private readonly repository: ProgramRuntimeRepository) {}

  async createAssignment(input: Parameters<ProgramRuntimeRepository['createAssignment']>[0]) {
    if (!Number.isInteger(input.sequence) || input.sequence < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid assignment sequence');
    validDate(input.presentedAt, 'presentedAt');
    if ((input.targetResourceType === null) !== (input.targetResourceId === null))
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete assignment target');
    if (!NEXT_ACTION_MODES.includes(input.actionMode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid actionMode');
    if (input.reevaluateAt !== null) validDate(input.reevaluateAt, 'reevaluateAt');
    if (input.actionMode === 'WAIT' && (input.reasonCode === null || input.reevaluateAt === null))
      throw new ApplicationError('VALIDATION_ERROR', 'WAIT requires reasonCode and reevaluateAt');
    if (input.reevaluateAt !== null && input.reevaluateAt < input.presentedAt)
      throw new ApplicationError('VALIDATION_ERROR', 'reevaluateAt precedes presentedAt');
    const result = await this.repository.createAssignment({
      ...input,
      routeKey: requiredKey(input.routeKey, 'routeKey'),
      phaseKey: requiredKey(input.phaseKey, 'phaseKey'),
      missionDefinitionKey: requiredKey(input.missionDefinitionKey, 'missionDefinitionKey'),
      reasonCode: input.reasonCode === null ? null : requiredKey(input.reasonCode, 'reasonCode'),
      variantKey: input.variantKey === null ? null : requiredKey(input.variantKey, 'variantKey'),
      targetResourceType:
        input.targetResourceType === null
          ? null
          : requiredKey(input.targetResourceType, 'targetResourceType'),
      ruleVersion: requiredText(input.ruleVersion, 'ruleVersion', 80),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program assignment denied');
    return result;
  }

  async transitionAssignment(
    input: Parameters<ProgramRuntimeRepository['transitionAssignment']>[0],
  ) {
    validDate(input.occurredAt, 'occurredAt');
    const result = await this.repository.transitionAssignment({
      ...input,
      idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 200),
    });
    if (result === null)
      throw new ApplicationError('CONFLICT', 'program assignment transition denied');
    return result;
  }

  async appendEvent(input: Parameters<ProgramRuntimeRepository['appendEvent']>[0]) {
    validDate(input.occurredAt, 'occurredAt');
    if (input.schemaVersion !== 1)
      throw new ApplicationError('VALIDATION_ERROR', 'unsupported event schema version');
    if ((input.sourceResourceType === null) !== (input.sourceResourceId === null))
      throw new ApplicationError('VALIDATION_ERROR', 'incomplete event source');
    const result = await this.repository.appendEvent({
      ...input,
      eventType: requiredKey(input.eventType, 'eventType'),
      sourceResourceType:
        input.sourceResourceType === null
          ? null
          : requiredKey(input.sourceResourceType, 'sourceResourceType'),
      idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey', 200),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program event denied');
    return result;
  }

  async saveProgress(input: Parameters<ProgramRuntimeRepository['saveProgress']>[0]) {
    validDate(input.calculatedAt, 'calculatedAt');
    if (input.lastActionAt !== null) validDate(input.lastActionAt, 'lastActionAt');
    if (input.nextEvaluationAt !== null) validDate(input.nextEvaluationAt, 'nextEvaluationAt');
    if (!Number.isInteger(input.completedMissionCount) || input.completedMissionCount < 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid completed mission count');
    const result = await this.repository.saveProgress({
      ...input,
      routeKey: requiredKey(input.routeKey, 'routeKey'),
      phaseKey: requiredKey(input.phaseKey, 'phaseKey'),
      stateKey: requiredKey(input.stateKey, 'stateKey'),
      bottleneckKey:
        input.bottleneckKey === null ? null : requiredKey(input.bottleneckKey, 'bottleneckKey'),
      ruleVersion: requiredText(input.ruleVersion, 'ruleVersion', 80),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program progress denied');
    return result;
  }

  async findProgress(input: Parameters<ProgramRuntimeRepository['findProgress']>[0]) {
    const result = await this.repository.findProgress(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'program progress not found');
    return result;
  }
}
