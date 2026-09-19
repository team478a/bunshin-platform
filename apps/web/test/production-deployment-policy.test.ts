import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('Vercel deployment policy', () => {
  it('deploys only the production branch automatically', () => {
    const path = fileURLToPath(new URL('../vercel.json', import.meta.url));
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    const deploymentEnabled = config.git?.deploymentEnabled;

    expect(deploymentEnabled).toEqual({
      '**': false,
      production: true,
    });
    expect(deploymentEnabled?.main).not.toBe(true);
  });
});
