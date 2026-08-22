import { describe, expect, it } from 'vitest';
import { parseServerEnvironment } from '../src';

const valid = {
  NODE_ENV: 'development',
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://pooled.example/test',
  DIRECT_URL: 'postgresql://direct.example/test',
  SESSION_SECRET: 'x'.repeat(32),
  LOG_LEVEL: 'info',
};

describe('environment validation', () => {
  it('accepts separated runtime and direct database URLs', () => {
    expect(parseServerEnvironment(valid)).toMatchObject({
      APP_ENV: 'development',
      LOG_LEVEL: 'info',
    });
  });

  it('reports variable names without secret values', () => {
    expect(() => parseServerEnvironment({ ...valid, SESSION_SECRET: 'secret' })).toThrow(
      'SESSION_SECRET',
    );
    try {
      parseServerEnvironment({ ...valid, SESSION_SECRET: 'secret' });
    } catch (error) {
      expect(String(error)).not.toContain('postgresql://');
      expect(String(error)).not.toContain('secret');
    }
  });

  it('rejects staging or production configuration in tests', () => {
    expect(() =>
      parseServerEnvironment({ ...valid, NODE_ENV: 'test', APP_ENV: 'production' }),
    ).toThrow('APP_ENV');
  });

  it('accepts an omitted CRON secret but validates it when configured', () => {
    expect(parseServerEnvironment(valid).CRON_SECRET).toBeUndefined();
    expect(() => parseServerEnvironment({ ...valid, CRON_SECRET: 'short' })).toThrow('CRON_SECRET');
    expect(parseServerEnvironment({ ...valid, CRON_SECRET: 'c'.repeat(32) }).CRON_SECRET).toBe(
      'c'.repeat(32),
    );
  });

  it('requires complete, environment-matched Supabase Auth administration configuration', () => {
    expect(() =>
      parseServerEnvironment({ ...valid, SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40) }),
    ).toThrow('SUPABASE_AUTH_ADMIN_URL');
    expect(() =>
      parseServerEnvironment({
        ...valid,
        SUPABASE_AUTH_ADMIN_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
        SUPABASE_AUTH_ADMIN_ENV: 'production',
      }),
    ).toThrow('SUPABASE_AUTH_ADMIN_ENV');
    expect(
      parseServerEnvironment({
        ...valid,
        SUPABASE_AUTH_ADMIN_URL: 'http://localhost:54321',
        SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
        SUPABASE_AUTH_ADMIN_ENV: 'development',
      }).SUPABASE_AUTH_ADMIN_ENV,
    ).toBe('development');
  });
});
