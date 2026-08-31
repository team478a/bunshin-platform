import { ApplicationError } from '@bunshin/shared';
import type { ProgramSupportMode } from './program-core';

export type ProgramGoalMetricType = 'ACTION' | 'TRAFFIC' | 'BUSINESS';

export interface ProgramGoalsRepository {
  setSupportPolicy(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    serviceProgramId: string;
    allowedSupportModes: ProgramSupportMode[];
    defaultSupportMode: ProgramSupportMode;
    memberMayChoose: boolean;
    guidance: string;
  }): Promise<{ id: string; version: number } | null>;
  saveMemberPreference(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    preferredSupportMode: ProgramSupportMode;
    notes: string;
  }): Promise<{ id: string } | null>;
  createGoalDefinition(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    serviceProgramId: string;
    name: string;
    description: string;
    metricType: ProgramGoalMetricType;
    unit: string;
    suggestedTarget: number | null;
    sortOrder: number;
  }): Promise<{ id: string } | null>;
  setMemberGoal(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    goalDefinitionId: string | null;
    title: string;
    metricType: ProgramGoalMetricType;
    targetValue: number;
    unit: string;
    startsAt: Date;
    dueAt: Date | null;
  }): Promise<{ id: string } | null>;
}

const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class ProgramGoalsService {
  constructor(private readonly repository: ProgramGoalsRepository) {}

  async setSupportPolicy(input: Parameters<ProgramGoalsRepository['setSupportPolicy']>[0]) {
    const modes = [...new Set(input.allowedSupportModes)];
    if (modes.length === 0 || !modes.includes(input.defaultSupportMode))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid support policy');
    const result = await this.repository.setSupportPolicy({
      ...input,
      allowedSupportModes: modes,
      guidance: text(input.guidance, 'guidance', 1000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'support policy denied');
    return result;
  }

  async saveMemberPreference(input: Parameters<ProgramGoalsRepository['saveMemberPreference']>[0]) {
    const result = await this.repository.saveMemberPreference({
      ...input,
      notes: input.notes.trim().slice(0, 500),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'member preference denied');
    return result;
  }

  async createGoalDefinition(input: Parameters<ProgramGoalsRepository['createGoalDefinition']>[0]) {
    if (input.suggestedTarget !== null && input.suggestedTarget <= 0)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid suggested target');
    const result = await this.repository.createGoalDefinition({
      ...input,
      name: text(input.name, 'name', 160),
      description: text(input.description, 'description', 1000),
      unit: text(input.unit, 'unit', 40),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'goal definition denied');
    return result;
  }

  async setMemberGoal(input: Parameters<ProgramGoalsRepository['setMemberGoal']>[0]) {
    if (input.targetValue <= 0 || (input.dueAt !== null && input.startsAt >= input.dueAt))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid member goal');
    const result = await this.repository.setMemberGoal({
      ...input,
      title: text(input.title, 'title', 160),
      unit: text(input.unit, 'unit', 40),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'member goal denied');
    return result;
  }
}
