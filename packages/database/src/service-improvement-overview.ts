import {
  BuildServiceImprovementOverview,
  SOCIAL_PROGRESS_OBSERVATION_DEFINITION,
  TRAINING_PROGRESS_OBSERVATION_DEFINITION,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION,
  type ServiceImprovementReadRequest,
  type ServiceImprovementSource,
} from '@bunshin/application';
import {
  HASSY_SUPPORT_IMPROVEMENT_DEFINITION,
  HASSY_PHOTO_QUALITY_DEFINITION,
} from '@bunshin/capability-social';
import type { ImprovementAdapterDefinition } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';
import { PrismaImprovementFeedbackObservationAdapter } from './improvement-feedback-observation-adapter';
import { PrismaHassySupportImprovementAdapter } from './hassy-improvement-support-adapter';
import { PrismaHassyPhotoQualityImprovementAdapter } from './hassy-improvement-photo-quality-adapter';
import {
  PrismaSocialProgressImprovementAdapter,
  PrismaTrainingProgressImprovementAdapter,
} from './service-improvement-progress';

/** Trusted composition only. No default DB, Runtime/UI/HTTP registration or brand branching. */
export class PrismaServiceImprovementOverviewReader {
  private readonly scope: ServiceImprovementReadRequest['scope'];
  constructor(
    private readonly client: PrismaClient,
    scope: ServiceImprovementReadRequest['scope'],
  ) {
    this.scope = { ...scope };
  }
  async read(input: ServiceImprovementReadRequest, packageKey: 'SOCIAL' | 'TRAINING') {
    if (
      !['SOCIAL', 'TRAINING'].includes(packageKey) ||
      (['tenantRef', 'workspaceId', 'serviceId', 'environment'] as const).some(
        (key) => input.scope[key] !== this.scope[key],
      )
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    const scoped = (d: ImprovementAdapterDefinition) => ({
      ...this.scope,
      packageKey: d.packageKey,
      adapterKey: d.key,
    });
    const social = SOCIAL_PROGRESS_OBSERVATION_DEFINITION;
    const training = TRAINING_PROGRESS_OBSERVATION_DEFINITION;
    const feedback = IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION;
    const support = HASSY_SUPPORT_IMPROVEMENT_DEFINITION;
    const photo = HASSY_PHOTO_QUALITY_DEFINITION;
    const sources: ServiceImprovementSource[] =
      packageKey === 'SOCIAL'
        ? [
            {
              definition: social,
              adapter: new PrismaSocialProgressImprovementAdapter(this.client, scoped(social)),
              metrics: ['accepted', 'rejected', 'posted'].map((key) => ({ key, flag: key })),
              uncertainFlags: ['uncertain'],
            },
            {
              definition: feedback,
              adapter: new PrismaImprovementFeedbackObservationAdapter(
                this.client,
                scoped(feedback),
              ),
              metrics: [],
              uncertainFlags: [],
              privacyDimensions: ['reportedCategory', 'reportedSurface', 'reportedImpact'],
            },
            {
              definition: support,
              adapter: new PrismaHassySupportImprovementAdapter(this.client, scoped(support)),
              metrics: ['acceptedByCutoff', 'completedByCutoff', 'skippedByCutoff'].map((key) => ({
                key,
                flag: key,
              })),
              uncertainFlags: ['timestampMissing'],
              privacyDimensions: ['goalBucket'],
              uncertainCodes: [
                {
                  field: 'goalBucket',
                  known:
                    support.metadataRules['goalBucket']?.kind === 'CODE'
                      ? support.metadataRules['goalBucket'].values.filter(
                          (v) => !['LEGACY', 'INVALID'].includes(v),
                        )
                      : [],
                },
              ],
            },
            {
              definition: photo,
              adapter: new PrismaHassyPhotoQualityImprovementAdapter(this.client, scoped(photo)),
              metrics: ['unconfirmedFact', 'hadIssues'].map((key) => ({ key, flag: key })),
              uncertainFlags: [],
              privacyDimensions: ['attribution', 'qualityState'],
              uncertainCodes: [
                {
                  field: 'qualityState',
                  known: ['PASS', 'REPAIRED_PASS', 'FINAL_REVISE', 'FINAL_REJECT'],
                },
              ],
            },
          ]
        : [
            {
              definition: training,
              adapter: new PrismaTrainingProgressImprovementAdapter(this.client, scoped(training)),
              metrics: [
                'started',
                'completed',
                'submitted',
                'evaluationReady',
                'evaluationFailed',
              ].map((key) => ({ key, flag: key })),
              uncertainFlags: ['uncertain'],
            },
          ];
    return new BuildServiceImprovementOverview(
      {
        authorize: (request) =>
          Promise.resolve(
            (['tenantRef', 'workspaceId', 'serviceId', 'environment'] as const).every(
              (key) => request.scope[key] === this.scope[key],
            ),
          ),
      },
      sources,
    ).execute(input);
  }
}
