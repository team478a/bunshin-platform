import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';

const officialLineAccountUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    ['lin.ee', 'line.me'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  );
});

const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32).optional(),
    ENCRYPTION_KEY: z.string().min(32).optional(),
    SUPABASE_AUTH_ADMIN_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(32).optional(),
    SUPABASE_AUTH_ADMIN_ENV: z.enum(['development', 'staging', 'production']).optional(),
    ACCOUNT_DELETION_EXECUTION_MODE: z.enum(['disabled', 'dry-run', 'enabled']).default('disabled'),
    ACCOUNT_DELETION_PRODUCTION_APPROVED: z.enum(['true', 'false']).default('false'),
    LINE_CONFIG_KEY_VERSION: z.coerce.number().int().positive().default(1),
    AI_PROVIDER_CONFIG_KEY_VERSION: z.coerce.number().int().positive().default(1),
    ADMIN_EMAIL_CONFIG_KEY_VERSION: z.coerce.number().int().positive().default(1),
    LINE_DEEP_LINK_KEY_VERSION: z.coerce.number().int().positive().default(1),
    LINE_OFFICIAL_ACCOUNT_URL: officialLineAccountUrlSchema.optional(),
    VIDEO_RENDER_WEBHOOK_KEY_VERSION: z.coerce.number().int().positive().default(1),
    LINE_ADMIN_ALERT_WEBHOOK_URL: z.url().optional(),
    LINE_ADMIN_ALERT_WEBHOOK_TOKEN: z.string().min(16).optional(),
    LINE_ADMIN_ALERT_WEBHOOK_ALLOWED_HOSTS: z.string().min(1).optional(),
    RESEND_ADMIN_ALERT_API_KEY: z.string().min(16).optional(),
    RESEND_ADMIN_ALERT_FROM: z.email().optional(),
    RESEND_ADMIN_ALERT_TO: z.string().min(3).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'test' && value.APP_ENV !== 'development') {
      context.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Tests may only use APP_ENV=development',
      });
    }
    if (value.NODE_ENV === 'production' && value.APP_ENV === 'development') {
      context.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Production runtime cannot use development APP_ENV',
      });
    }
    const authAdminValues = [
      value.SUPABASE_AUTH_ADMIN_URL,
      value.SUPABASE_SERVICE_ROLE_KEY,
      value.SUPABASE_AUTH_ADMIN_ENV,
    ];
    if (
      authAdminValues.some((item) => item !== undefined) &&
      authAdminValues.some((item) => item === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_AUTH_ADMIN_URL'],
        message: 'Supabase Auth administration configuration must be provided together',
      });
    }
    if (
      value.SUPABASE_AUTH_ADMIN_ENV !== undefined &&
      value.SUPABASE_AUTH_ADMIN_ENV !== value.APP_ENV
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_AUTH_ADMIN_ENV'],
        message: 'Supabase Auth administration environment must match APP_ENV',
      });
    }
    if (value.SUPABASE_AUTH_ADMIN_URL !== undefined) {
      const url = new URL(value.SUPABASE_AUTH_ADMIN_URL);
      const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'https:' && !(value.APP_ENV === 'development' && localhost)) {
        context.addIssue({
          code: 'custom',
          path: ['SUPABASE_AUTH_ADMIN_URL'],
          message: 'Supabase Auth administration URL must use HTTPS',
        });
      }
      if (localhost && value.APP_ENV !== 'development') {
        context.addIssue({
          code: 'custom',
          path: ['SUPABASE_AUTH_ADMIN_URL'],
          message: 'Supabase Auth administration URL cannot use localhost outside development',
        });
      }
    }
    if (
      value.APP_ENV === 'production' &&
      value.ACCOUNT_DELETION_EXECUTION_MODE === 'enabled' &&
      value.ACCOUNT_DELETION_PRODUCTION_APPROVED !== 'true'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ACCOUNT_DELETION_PRODUCTION_APPROVED'],
        message: 'Production account deletion execution requires explicit approval',
      });
    }
    if (
      value.ACCOUNT_DELETION_EXECUTION_MODE === 'enabled' &&
      authAdminValues.some((item) => item === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_AUTH_ADMIN_URL'],
        message: 'Enabled account deletion requires Auth administration configuration',
      });
    }
    const resendValues = [
      value.RESEND_ADMIN_ALERT_API_KEY,
      value.RESEND_ADMIN_ALERT_FROM,
      value.RESEND_ADMIN_ALERT_TO,
    ];
    if (
      resendValues.some((item) => item !== undefined) &&
      resendValues.some((item) => item === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_ADMIN_ALERT_API_KEY'],
        message: 'Resend administrator alert configuration must be provided together',
      });
    }
    if (value.RESEND_ADMIN_ALERT_TO) {
      const recipients = value.RESEND_ADMIN_ALERT_TO.split(',').map((item) => item.trim());
      if (recipients.length > 10 || recipients.some((item) => !z.email().safeParse(item).success)) {
        context.addIssue({
          code: 'custom',
          path: ['RESEND_ADMIN_ALERT_TO'],
          message: 'Resend administrator alert recipients must be at most 10 valid emails',
        });
      }
    }
  });

export type ServerEnvironment = z.infer<typeof serverSchema>;

export function parseServerEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): ServerEnvironment {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean);
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      `Invalid environment variables: ${[...new Set(names)].join(', ')}`,
    );
  }
  return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

export function getOfficialLineAccountUrl(
  value: string | undefined = process.env.LINE_OFFICIAL_ACCOUNT_URL,
): string | undefined {
  if (!value) return undefined;
  const result = officialLineAccountUrlSchema.safeParse(value);
  if (!result.success)
    throw new ApplicationError('CONFIGURATION_ERROR', 'Invalid LINE_OFFICIAL_ACCOUNT_URL');
  return result.data;
}
