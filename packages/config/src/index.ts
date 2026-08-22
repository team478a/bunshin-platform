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
    LINE_CONFIG_KEY_VERSION: z.coerce.number().int().positive().default(1),
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
