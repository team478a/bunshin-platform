import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

describe('OEM support candidate email boundary', () => {
  it('認証済みcronから専用workerを起動する', () => {
    expect(source('src/http/oem-support-candidate-email-worker.ts')).toContain(
      'authorizeCronRequest',
    );
    expect(source('vercel.json')).toContain('/api/internal/oem-support-candidate-emails/run');
  });

  it('配送はサービスメール設定を再利用し、回数上限と冪等キーを持つ', () => {
    const worker = source('src/services/oem-support-candidate-email-worker.ts');
    expect(worker).toContain('attemptCount: { lt: 3 }');
    expect(worker).toContain('serviceEmailApiKey');
    expect(worker).toContain('oem-support-candidate:${delivery.id}');
    expect(worker).toContain('isSocialActivityOemSupportCandidateEmailDeliveryEligible');
    expect(worker).toContain('NOTIFICATION_NO_LONGER_ELIGIBLE');
  });
});
