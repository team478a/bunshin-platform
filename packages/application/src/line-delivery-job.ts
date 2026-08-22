import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, FailJob, Job } from './index';
import type { LineDeliveryExecutionResult } from './line-messaging-core';

export const LINE_DELIVERY_JOB_TYPE = 'LINE_MISSION_DELIVER';

export interface LineDeliveryJobHandler {
  execute(input: {
    job: Job;
    deliveryId: string;
    workerId: string;
  }): Promise<LineDeliveryExecutionResult>;
}

const deliveryReference =
  /^line-delivery:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export class ExecuteLineDeliveryJob {
  constructor(
    private readonly handler: LineDeliveryJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const reference = deliveryReference.exec(job.payloadReference);
    if (
      job.jobType !== LINE_DELIVERY_JOB_TYPE ||
      !job.bunshinId ||
      job.capabilityType !== 'SOCIAL' ||
      !reference?.[1]
    )
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_LINE_DELIVERY_JOB',
        retryable: false,
      });
    try {
      const result = await this.handler.execute({
        job,
        deliveryId: reference[1],
        workerId,
      });
      if (result.status === 'SENT' || (result.status !== 'BUSY' && !result.retryable))
        return this.complete.execute(job.id, workerId);
      return this.fail.execute(job, workerId, {
        errorCategory: result.category ?? 'LINE_DELIVERY_BUSY',
        retryable: true,
      });
    } catch (error) {
      const category =
        error instanceof ApplicationError
          ? `LINE_DELIVERY_${error.code}`
          : 'LINE_DELIVERY_UNEXPECTED';
      const retryable =
        !(error instanceof ApplicationError) ||
        !['NOT_FOUND', 'FORBIDDEN', 'VALIDATION_ERROR'].includes(error.code);
      return this.fail.execute(job, workerId, { errorCategory: category, retryable });
    }
  }
}
