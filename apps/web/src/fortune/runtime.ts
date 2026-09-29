import 'server-only';
import { randomInt } from 'node:crypto';
import { FortuneDailyReadingService } from '@bunshin/capability-fortune';
import { getServerEnvironment } from '@bunshin/config';
import { OpenAiFortuneReadingGenerator } from '../providers/openai-fortune-reading-generator';

export async function fortuneDailyReadingService() {
  const db = await import('@bunshin/database');
  const environment = getServerEnvironment();
  const jobEnvironment = {
    development: 'DEVELOPMENT',
    staging: 'STAGING',
    production: 'PRODUCTION',
  } as const;
  return new FortuneDailyReadingService(
    new db.PrismaFortuneRepository(db.prisma),
    {
      nextInt: (maxExclusive) => randomInt(maxExclusive),
    },
    new OpenAiFortuneReadingGenerator(),
    environment.FORTUNE_ASYNC_GENERATION_ENABLED === 'true'
      ? new db.PrismaFortuneGenerationQueue(db.prisma, jobEnvironment[environment.APP_ENV])
      : undefined,
  );
}
