import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const database = fileURLToPath(new URL('../', import.meta.url));
const schema = join(database, 'prisma', 'schema.prisma');
const cliPackage = require.resolve('prisma/package.json');
const prismaPackage = require(cliPackage);
const cli = resolve(dirname(cliPackage), prismaPackage.bin.prisma);
const clientPackage = require.resolve('@prisma/client/package.json');
const generated = resolve(dirname(clientPackage), '../../.prisma/client');

const args = process.argv.slice(2);
const reuse = process.env.BUNSHIN_REUSE_CI_PRISMA_CLIENT === '1' && args.length === 0;
const stamp = join(generated, '.bunshin-ci-schema');
const key = reuse
  ? createHash('sha256')
      .update(readFileSync(schema))
      .update(
        JSON.stringify([
          prismaPackage.version,
          require(clientPackage).version,
          process.platform,
          process.arch,
          Object.entries(process.env)
            .filter(([name]) => name.startsWith('PRISMA_'))
            .sort(),
        ]),
      )
      .digest('hex')
  : null;

function hasCurrentClient() {
  if (!key) return false;
  try {
    return (
      readFileSync(stamp, 'utf8') === key &&
      existsSync(join(generated, 'index.js')) &&
      existsSync(join(generated, 'index.d.ts'))
    );
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

if (hasCurrentClient()) {
  console.log('Reusing the Prisma Client for the current schema.');
} else {
  rmSync(stamp, { force: true });
  const result = spawnSync(process.execPath, [cli, 'generate', ...args], {
    cwd: database,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (result.status === 0 && key) writeFileSync(stamp, key);
}
