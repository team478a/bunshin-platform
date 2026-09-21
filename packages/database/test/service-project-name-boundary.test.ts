import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositorySource = readFileSync(
  fileURLToPath(new URL('../src/service-foundation.ts', import.meta.url)),
  'utf8',
);

describe('service and project name boundary', () => {
  it('does not rename the parent project when public service settings are saved', () => {
    const saveStart = repositorySource.indexOf(
      "async save(input: Parameters<ServiceFoundationRepository['save']>[0])",
    );
    const saveEnd = repositorySource.indexOf(
      "async findByGroup(input: Parameters<ServiceFoundationRepository['findByGroup']>[0])",
      saveStart,
    );
    const saveSource = repositorySource.slice(saveStart, saveEnd);

    expect(saveStart).toBeGreaterThan(-1);
    expect(saveEnd).toBeGreaterThan(saveStart);
    expect(saveSource).toContain('tx.serviceConfiguration.upsert');
    expect(saveSource).not.toContain('tx.group.update');
  });
});
