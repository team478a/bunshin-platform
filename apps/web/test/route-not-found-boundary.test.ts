import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { isRouteNotFound } from '../src/navigation/route-not-found';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('route not-found boundary', () => {
  it('maps only expected access and absence errors to not found', () => {
    expect(isRouteNotFound(new ApplicationError('NOT_FOUND', 'missing'))).toBe(true);
    expect(isRouteNotFound(new ApplicationError('FORBIDDEN', 'hidden'))).toBe(true);
    expect(isRouteNotFound(new ApplicationError('DATABASE_UNAVAILABLE', 'offline'))).toBe(false);
    expect(isRouteNotFound(new Error('unexpected'))).toBe(false);
  });

  it('does not allow an unclassified catch block to hide an error as 404', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(join(process.cwd(), 'app'))) {
      const source = readFileSync(path, 'utf8');
      const catches = source.matchAll(/catch\s*(?:\([^)]*\))?\s*\{[\s\S]{0,350}?notFound\(/g);
      for (const match of catches) {
        const body = match[0];
        if (!body.includes('.code') && !body.includes('isRouteNotFound(')) {
          const line = source.slice(0, match.index).split('\n').length;
          violations.push(`${path}:${line}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
