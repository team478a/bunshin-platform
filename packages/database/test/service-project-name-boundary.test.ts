import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositorySource = readFileSync(
  fileURLToPath(new URL('../src/service-foundation-save.ts', import.meta.url)),
  'utf8',
);

describe('service and project name boundary', () => {
  it('does not rename the parent project when public service settings are saved', () => {
    expect(repositorySource).toContain('export async function saveServiceFoundation');
    expect(repositorySource).toContain('tx.serviceConfiguration.upsert');
    expect(repositorySource).not.toContain('tx.group.update');
  });
});
