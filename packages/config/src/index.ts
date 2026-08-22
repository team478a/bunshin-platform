import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';

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
    LINE_CONFIG_KEY_VERSION: z.coerce.number().int().positive().default(1),
    LINE_DEEP_LINK_KEY_VERSION: z.coerce.number().int().positive().default(1),
    LINE_ADMIN_ALERT_WEBHOOK_URL: z.url().optional(),
    LINE_ADMIN_ALERT_WEBHOOK_TOKEN: z.string().min(16).optional(),
    LINE_ADMIN_ALERT_WEBHOOK_ALLOWED_HOSTS: z.string().min(1).optional(),
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
