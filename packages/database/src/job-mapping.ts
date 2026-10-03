import { FEEDBACK_PURGE_JOB_TYPE, type Job } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from './client';

export function platformJob(row: Prisma.JobGetPayload<object>): Job {
  if (row.jobType === FEEDBACK_PURGE_JOB_TYPE) {
    if (row.requestedBy !== null || row.bunshinId !== null || row.capabilityType !== null)
      throw new ApplicationError('CONFLICT', 'invalid maintenance job identity');
    return {
      ...row,
      requestedBy: null,
      jobType: FEEDBACK_PURGE_JOB_TYPE,
      bunshinId: null,
      capabilityType: null,
    };
  }
  if (!row.requestedBy) throw new ApplicationError('CONFLICT', 'stored user job actor is required');
  return { ...row, requestedBy: row.requestedBy };
}
