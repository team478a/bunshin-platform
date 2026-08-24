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

  it('requires a second explicit approval before enabling production deletion', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      APP_URL: 'https://app.example.com',
      ACCOUNT_DELETION_EXECUTION_MODE: 'enabled',
      SUPABASE_AUTH_ADMIN_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
      SUPABASE_AUTH_ADMIN_ENV: 'production',
    };
    expect(() => parseServerEnvironment(production)).toThrow(
      'ACCOUNT_DELETION_PRODUCTION_APPROVED',
    );
    expect(
      parseServerEnvironment({
        ...production,
        ACCOUNT_DELETION_PRODUCTION_APPROVED: 'true',
      }).ACCOUNT_DELETION_EXECUTION_MODE,
    ).toBe('enabled');
  });

  it('requires a complete Resend alert configuration and valid recipients', () => {
    expect(() =>
      parseServerEnvironment({ ...valid, RESEND_ADMIN_ALERT_API_KEY: 're_test_secret_key' }),
    ).toThrow('RESEND_ADMIN_ALERT_API_KEY');
    expect(() =>
      parseServerEnvironment({
        ...valid,
        RESEND_ADMIN_ALERT_API_KEY: 're_test_secret_key',
        RESEND_ADMIN_ALERT_FROM: 'alerts@example.com',
        RESEND_ADMIN_ALERT_TO: 'not-an-email',
      }),
    ).toThrow('RESEND_ADMIN_ALERT_TO');
    expect(
      parseServerEnvironment({
        ...valid,
        RESEND_ADMIN_ALERT_API_KEY: 're_test_secret_key',
        RESEND_ADMIN_ALERT_FROM: 'alerts@example.com',
        RESEND_ADMIN_ALERT_TO: 'first@example.com,second@example.com',
      }).RESEND_ADMIN_ALERT_FROM,
    ).toBe('alerts@example.com');
  });
});
