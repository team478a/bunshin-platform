import { describe, expect, it, vi } from 'vitest';
import { projectSocialActivityOemSupportCandidates } from '../src/social-activity-oem-support-candidates';

const detectedAt = new Date('2026-09-27T00:00:00.000Z');

function database(category = 'MEDIA', incidentDays = 0, mode = 'INTERNAL_ESCALATION') {
  const upsert = vi.fn().mockResolvedValue({ id: 'candidate-1' });
  return {
    client: {
      socialActivitySupportIntervention: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'support-1',
            completedAt: new Date('2026-09-01T00:00:00.000Z'),
            barrierCase: {
              id: 'case-1',
              category,
              groupMembership: {
                group: { serviceConfiguration: { supportAlertPolicy: { mode } } },
              },
              evidenceSnapshots: [
                {
                  id: 'evidence-1',
                  observationFrom: new Date('2026-09-02T00:00:00.000Z'),
                  observationTo: new Date('2026-09-20T00:00:00.000Z'),
                  eligibleDays: 18,
                  excludedSystemIncidentDays: incidentDays,
                },
              ],
            },
          },
        ]),
      },
      socialActivityOemSupportCandidate: { upsert },
    },
    upsert,
  };
}

describe('projectSocialActivityOemSupportCandidates', () => {
  it('creates an idempotent candidate from confirmed persistence after completed free support', async () => {
    const db = database();
    await expect(
      projectSocialActivityOemSupportCandidates(db.client as never, { detectedAt }),
    ).resolves.toMatchObject({ scanned: 1, created: 1, skipped: 0, failures: 0 });
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supportInterventionId: 'support-1' },
        create: expect.objectContaining({
          caseId: 'case-1',
          evidenceId: 'evidence-1',
          recommendationKey: 'MEDIA_PRODUCTION_SUPPORT',
          recommendationSnapshot: expect.objectContaining({
            handlingMode: 'INTERNAL_ESCALATION',
          }),
        }),
      }),
    );
  });

  it('does not create a candidate when the service disables support alerts', async () => {
    const db = database('MEDIA', 0, 'DISABLED');
    await expect(
      projectSocialActivityOemSupportCandidates(db.client as never, { detectedAt }),
    ).resolves.toMatchObject({ created: 0, skipped: 1 });
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['CONTENT quality must be reviewed', 'CONTENT', 0],
    ['a system incident exists', 'MEDIA', 1],
  ])('does not create a commercial candidate when %s', async (_label, category, incidentDays) => {
    const db = database(category, incidentDays);
    await expect(
      projectSocialActivityOemSupportCandidates(db.client as never, { detectedAt }),
    ).resolves.toMatchObject({ created: 0, skipped: 1 });
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
