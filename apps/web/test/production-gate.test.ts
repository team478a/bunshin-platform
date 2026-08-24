import { describe, expect, it } from 'vitest';
import { productionGateChecklist } from '../app/(app)/admin/production-gate';

const readyInput = {
  environment: 'production' as const,
  operationsReady: true,
  legalReady: true,
  authReady: true,
  accountDeletionMode: 'enabled' as const,
  accountDeletionApproved: true,
};

describe('production gate checklist', () => {
  it('keeps human checks pending even when every automatic check passes', () => {
    expect(productionGateChecklist(readyInput)).toMatchObject({
      automaticReady: true,
      actionRequired: 0,
      launchReady: false,
    });
  });

  it('becomes ready only when every check for the current commit is recorded', () => {
    const recordedManualChecks = new Set([
      'BACKUP_RESTORE',
      'MIGRATION_HEALTH',
      'AUTH_SMOKE',
      'FREE_MVP_SMOKE',
      'ACCOUNT_DELETION_DRY_RUN',
      'LINE_GO_NO_GO',
      'FINAL_APPROVAL',
    ]);
    expect(productionGateChecklist({ ...readyInput, recordedManualChecks }).launchReady).toBe(true);
    recordedManualChecks.delete('AUTH_SMOKE');
    expect(productionGateChecklist({ ...readyInput, recordedManualChecks }).launchReady).toBe(
      false,
    );
  });

  it('does not allow a Preview or Staging environment to look production-ready', () => {
    const value = productionGateChecklist({ ...readyInput, environment: 'staging' });
    expect(value.automaticReady).toBe(false);
    expect(value.automatic).toContainEqual(
      expect.objectContaining({ code: 'PRODUCTION_ENVIRONMENT', status: 'ACTION_REQUIRED' }),
    );
  });

  it('shows legal, authentication and deletion blockers separately', () => {
    const value = productionGateChecklist({
      ...readyInput,
      legalReady: false,
      authReady: false,
      accountDeletionMode: 'dry-run',
      accountDeletionApproved: false,
    });
    expect(value.actionRequired).toBe(3);
    expect(
      value.automatic.filter((item) => item.status === 'ACTION_REQUIRED').map((item) => item.code),
    ).toEqual(['LEGAL_DOCUMENTS', 'AUTH_ADMINISTRATION', 'ACCOUNT_DELETION_EXECUTION']);
  });
});
