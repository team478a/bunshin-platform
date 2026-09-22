import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';

import type { DailyMissionRepository, DailyMissionScope } from './daily-mission-runtime';

export abstract class DailyMissionMutation {
  constructor(
    protected readonly missions: DailyMissionRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}

  protected requireActive(input: DailyMissionScope) {
    return new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}
