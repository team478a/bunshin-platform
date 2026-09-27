import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

describe('OEM support candidate LINE boundary', () => {
  it('認証済みcronから専用workerを起動する', () => {
    expect(source('src/http/oem-support-candidate-line-worker.ts')).toContain(
      'authorizeCronRequest',
    );
    expect(source('vercel.json')).toContain('/api/internal/oem-support-candidate-lines/run');
  });

  it('既存broadcast workerへ冪等なjobを渡す', () => {
    const worker = source('src/services/oem-support-candidate-line-worker.ts');
    expect(worker).toContain("jobType: 'SERVICE_LINE_BROADCAST_DELIVER'");
    expect(worker).toContain('oem-support-candidate-line:${broadcast.broadcastId}');
    expect(worker).toContain('PrismaJobRepository');
  });
});
