import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../scripts/deploy-migrations-for-vercel.mjs', import.meta.url),
);

function runScript(environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...environment,
    },
  });
}

describe('Vercel production migrations', () => {
  it.each(['preview', 'development'])(
    'does not migrate the %s environment',
    (vercelEnvironment) => {
      const result = runScript({ VERCEL_ENV: vercelEnvironment });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Skipping migrations');
    },
  );

  it('stops a production build when database credentials are missing', () => {
    const result = runScript({
      VERCEL_ENV: 'production',
      DATABASE_URL: '',
      DIRECT_URL: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production migrations require: DATABASE_URL, DIRECT_URL');
  });
});
